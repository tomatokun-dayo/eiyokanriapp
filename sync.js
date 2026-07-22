// 夫婦データ同期エンジン（Supabase）。
//
// 方針: localStorage を「正」とし、その背後で sync_items テーブルと突き合わせる。
// - SYNC_CONFIG（URL/KEY）が未設定なら全機能休眠（ローカル専用アプリとして動作）。
// - 各ストアの書き込みは store.js / custom-foods.js から notifySyncChange() で通知され、
//   ローカルの変更キュー（eiyokanri.sync.v1）へ積まれる。
// - syncNow() が pull → merge(LWW) → push を1サイクル実行する（Phase 1 は手動トリガー）。
// - 競合解決は updated_at による Last-Write-Wins。記録/ミルクは追記型で実質衝突しない。
(function () {
  const config = window.SYNC_CONFIG || {};
  const SUPABASE_URL = config.SUPABASE_URL || "";
  const SUPABASE_KEY = config.SUPABASE_KEY || "";

  // 変更キューへの記録は接続情報さえあれば行う（SDK未読込のページでも積める）。
  const HAS_CONFIG = Boolean(SUPABASE_URL && SUPABASE_KEY);
  // 実際のネットワーク同期には SDK（vendor/supabase.js）が必要。
  const HAS_SDK = typeof supabase !== "undefined" && typeof supabase.createClient === "function";
  const CONFIGURED = HAS_CONFIG && HAS_SDK;

  const SYNC_META_KEY = "eiyokanri.sync.v1";

  // リモート適用中は、ローカル書き込みフックを無視する（同期ループ防止）。
  let syncApplying = false;

  // ------------------------------------------------------------------
  // ストアアダプタ: localStorage の各キーを {id -> data} の Map として読み書きする
  // ------------------------------------------------------------------
  function arrayAdapter(lsKey, replaceAll) {
    return {
      read() {
        const map = new Map();
        try {
          const arr = JSON.parse(window.localStorage.getItem(lsKey) || "[]");
          if (Array.isArray(arr)) {
            for (const item of arr) {
              if (item && typeof item.id === "string") map.set(item.id, item);
            }
          }
        } catch (error) {
          /* 壊れたJSONは空扱い */
        }
        return map;
      },
      writeAll(map) {
        replaceAll([...map.values()]);
      },
    };
  }

  const ADAPTERS = {
    entries: arrayAdapter(ENTRY_STORAGE_KEY, (arr) => memoryStore.replaceAllEntries(arr)),
    milk: arrayAdapter(MILK_STORAGE_KEY, (arr) => milkStore.replaceAllFeeds(arr)),
    mealTemplates: arrayAdapter(MEAL_TEMPLATE_STORAGE_KEY, (arr) => mealTemplateStore.replaceAllTemplates(arr)),
    customFoods: arrayAdapter(CUSTOM_FOOD_STORAGE_KEY, (arr) => replaceAllCustomFoods(arr)),
    foodStates: {
      read() {
        const map = new Map();
        try {
          const obj = JSON.parse(window.localStorage.getItem(FOOD_STATE_STORAGE_KEY) || "{}");
          if (obj && typeof obj === "object") {
            for (const [id, state] of Object.entries(obj)) {
              if (typeof state === "string") map.set(id, { state });
            }
          }
        } catch (error) {
          /* 空扱い */
        }
        return map;
      },
      writeAll(map) {
        for (const key of Object.keys(foodStateOverrides)) delete foodStateOverrides[key];
        for (const [id, data] of map) {
          if (data && typeof data.state === "string") foodStateOverrides[id] = data.state;
        }
        persistFoodStates();
        applyStoredFoodStates();
      },
    },
    foodPrefs: {
      read() {
        const map = new Map();
        try {
          const obj = JSON.parse(window.localStorage.getItem(FOOD_PREF_STORAGE_KEY) || "{}");
          if (obj && typeof obj === "object") {
            for (const [id, pref] of Object.entries(obj)) {
              if (pref && typeof pref === "object") map.set(id, pref);
            }
          }
        } catch (error) {
          /* 空扱い */
        }
        return map;
      },
      writeAll(map) {
        const obj = {};
        for (const [id, data] of map) obj[id] = data;
        foodPreferenceStore.replaceAllPreferences(obj);
      },
    },
  };

  // ------------------------------------------------------------------
  // 同期メタデータ（変更キュー・初回ログイン済みフラグ・端末ID）
  // ------------------------------------------------------------------
  function loadMeta() {
    try {
      const raw = window.localStorage.getItem(SYNC_META_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          return {
            queue: parsed.queue && typeof parsed.queue === "object" ? parsed.queue : {},
            everLoggedIn: Boolean(parsed.everLoggedIn),
            deviceId: typeof parsed.deviceId === "string" ? parsed.deviceId : makeDeviceId(),
          };
        }
      }
    } catch (error) {
      /* 壊れていれば初期化 */
    }
    return { queue: {}, everLoggedIn: false, deviceId: makeDeviceId() };
  }

  function saveMeta(meta) {
    try {
      window.localStorage.setItem(SYNC_META_KEY, JSON.stringify(meta));
    } catch (error) {
      /* 保存不能でもメモリ上は動作継続 */
    }
  }

  function makeDeviceId() {
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  // ------------------------------------------------------------------
  // ローカル書き込みフック（store.js / custom-foods.js から呼ばれる）
  // data === null は削除（墓標）を意味する。
  // ------------------------------------------------------------------
  function notifySyncChange(store, id, data) {
    if (!HAS_CONFIG || syncApplying) return;
    if (!ADAPTERS[store]) return;
    const meta = loadMeta();
    // 初回ログイン前は個別追跡しない（初回 syncNow で全件を一括投入するため）。
    if (!meta.everLoggedIn) return;
    meta.queue[`${store}|${id}`] = {
      store,
      id,
      deleted: data === null,
      updatedAt: new Date().toISOString(),
    };
    saveMeta(meta);
    setStatus("pending", "未同期の変更があります");
  }
  // 他スクリプトから参照できるよう明示的にグローバル化。
  window.notifySyncChange = notifySyncChange;

  // ------------------------------------------------------------------
  // Supabase クライアント・認証
  // ------------------------------------------------------------------
  let client = null;
  function getClient() {
    if (!CONFIGURED) return null;
    if (!client) client = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    return client;
  }

  async function getUser() {
    if (!CONFIGURED) return null;
    try {
      const { data } = await getClient().auth.getSession();
      return (data && data.session && data.session.user) || null;
    } catch (error) {
      return null;
    }
  }

  async function signIn() {
    if (!CONFIGURED) return;
    const { error } = await getClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.href },
    });
    if (error) setStatus("error", `ログイン開始エラー: ${error.message}`);
  }

  async function signOut() {
    if (!CONFIGURED) return;
    await getClient().auth.signOut();
    notifyAuth(null);
    setStatus("idle", "ログアウトしました");
  }

  // ------------------------------------------------------------------
  // 同期サイクル: pull → merge(LWW) → push
  // ------------------------------------------------------------------
  async function readAllRemote() {
    const { data, error } = await getClient().from("sync_items").select("*");
    if (error) throw error;
    return data || [];
  }

  function applyRemoteRows(rows) {
    const meta = loadMeta();
    const maps = {};
    const changedStores = new Set();

    for (const row of rows) {
      if (!ADAPTERS[row.store]) continue; // 未知のストア（旧テスト行など）は無視
      const key = `${row.store}|${row.id}`;
      const pending = meta.queue[key];
      // ローカルに新しい（以上の）保留変更があればローカルを優先し、リモートを捨てる。
      if (pending && pending.updatedAt >= row.updated_at) continue;
      // リモート行の形状を最低限検証する。追加・更新の data は必ずオブジェクト。
      // 壊れた行や悪意ある行（プリミティブ等）をそのまま localStorage へ流し込まない。
      // 各ストア固有の妥当性は writeAll 側（例: replaceAllCustomFoods の isValidCustomFood）で担保。
      if (!row.deleted && (!row.data || typeof row.data !== "object")) continue;

      if (!maps[row.store]) maps[row.store] = ADAPTERS[row.store].read();
      const map = maps[row.store];
      if (row.deleted) {
        if (map.delete(row.id)) changedStores.add(row.store);
      } else {
        map.set(row.id, row.data);
        changedStores.add(row.store);
      }
      // リモートが勝ったので、対応する保留変更は破棄する。
      if (pending) delete meta.queue[key];
    }

    if (changedStores.size) {
      syncApplying = true;
      try {
        for (const store of changedStores) ADAPTERS[store].writeAll(maps[store]);
      } finally {
        syncApplying = false;
      }
    }
    saveMeta(meta);
    return changedStores.size > 0;
  }

  async function pushQueue(user) {
    const meta = loadMeta();
    const keys = Object.keys(meta.queue);
    if (!keys.length) return { pushed: 0 };

    const maps = {};
    const rows = [];
    for (const key of keys) {
      const q = meta.queue[key];
      if (!ADAPTERS[q.store]) {
        delete meta.queue[key];
        continue;
      }
      let data = null;
      let deleted = q.deleted;
      if (!deleted) {
        if (!maps[q.store]) maps[q.store] = ADAPTERS[q.store].read();
        data = maps[q.store].get(q.id);
        if (data === undefined) {
          // ローカルに実体が無い＝削除として送る。
          deleted = true;
          data = null;
        }
      }
      rows.push({
        store: q.store,
        id: q.id,
        data,
        deleted,
        updated_at: q.updatedAt,
        updated_by: user.email,
      });
    }

    if (!rows.length) {
      saveMeta(meta);
      return { pushed: 0 };
    }

    const { error } = await getClient().from("sync_items").upsert(rows, { onConflict: "store,id" });
    if (error) throw error;

    // 送信成功 → キューを空にする。
    for (const key of keys) delete meta.queue[key];
    saveMeta(meta);
    return { pushed: rows.length };
  }

  // 初回同期: 既存のローカルデータを全件キューに投入する（端末をまたいだ和集合化）。
  function enqueueAll() {
    const meta = loadMeta();
    const now = new Date().toISOString();
    for (const store of Object.keys(ADAPTERS)) {
      const map = ADAPTERS[store].read();
      for (const id of map.keys()) {
        meta.queue[`${store}|${id}`] = { store, id, deleted: false, updatedAt: now };
      }
    }
    meta.everLoggedIn = true;
    saveMeta(meta);
  }

  let syncing = false;
  async function syncNow() {
    if (!CONFIGURED) return { ok: false, message: "同期は未設定です" };
    if (syncing) return { ok: false, message: "同期中です" };
    const user = await getUser();
    if (!user) {
      setStatus("idle", "ログインしてください");
      return { ok: false, message: "未ログイン" };
    }

    syncing = true;
    setStatus("syncing", "同期中…");
    try {
      const meta = loadMeta();
      if (!meta.everLoggedIn) enqueueAll(); // 初回は既存データを全件投入

      const rows = await readAllRemote();
      const changed = applyRemoteRows(rows);
      const { pushed } = await pushQueue(user);

      if (changed && typeof render === "function") render();
      setStatus("ok", `同期済み ${formatTime(new Date())}`);
      return { ok: true, changed, pushed };
    } catch (error) {
      const message = (error && error.message) || String(error);
      const offline = !navigator.onLine || /fetch|network/i.test(message);
      setStatus(offline ? "offline" : "error", offline ? "オフライン（復帰後に再試行）" : `同期エラー: ${message}`);
      return { ok: false, message };
    } finally {
      syncing = false;
    }
  }

  // ------------------------------------------------------------------
  // 状態・認証の購読（UI が購読する）
  // ------------------------------------------------------------------
  let currentStatus = { state: "idle", message: "", at: null };
  const statusSubs = [];
  function setStatus(state, message) {
    currentStatus = { state, message, at: new Date() };
    for (const cb of statusSubs) {
      try {
        cb(currentStatus);
      } catch (error) {
        /* 購読者のエラーは無視 */
      }
    }
  }
  function onStatus(cb) {
    statusSubs.push(cb);
    cb(currentStatus);
  }

  let currentUser = null;
  const authSubs = [];
  function notifyAuth(user) {
    currentUser = user;
    for (const cb of authSubs) {
      try {
        cb(user);
      } catch (error) {
        /* 無視 */
      }
    }
  }
  function onAuth(cb) {
    authSubs.push(cb);
    cb(currentUser);
  }

  function formatTime(date) {
    const h = String(date.getHours()).padStart(2, "0");
    const m = String(date.getMinutes()).padStart(2, "0");
    return `${h}:${m}`;
  }

  // クライアント初期化＋認証状態の監視を開始する（UIページから呼ぶ）。
  function init() {
    if (!CONFIGURED) return;
    getClient().auth.onAuthStateChange((_event, session) => {
      notifyAuth((session && session.user) || null);
    });
  }

  window.EiyoSync = {
    CONFIGURED,
    init,
    getUser,
    signIn,
    signOut,
    syncNow,
    onAuth,
    onStatus,
  };
})();
