// 夫婦データ同期エンジン（Supabase）。
//
// 方針: localStorage を「正」とし、その背後で sync_items テーブルと突き合わせる。
// - SYNC_CONFIG（URL/KEY）が未設定なら全機能休眠（ローカル専用アプリとして動作）。
// - 各ストアの書き込みは store.js / custom-foods.js から notifySyncChange() で通知され、
//   ローカルの変更キュー（eiyokanri.sync.v1）へ積まれる。
// - syncNow() が pull → merge(LWW) → push を1サイクル実行する。
// - 競合解決は updated_at による Last-Write-Wins。記録/ミルクは追記型で実質衝突しない。
//
// 自動同期（Phase 2）の起動条件:
// - 送信: 変更から FLUSH_DELAY_MS 後にまとめて（Realtime健在なら push のみ）
// - 受信: sync_items の Realtime購読。相手の変更が無操作で届く
// - 追いつき: ログイン直後 / タブ復帰 / オンライン復帰 / Realtime再接続 で全件同期
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
    // ログイン中は少し待ってまとめて送る。未ログインなら溜まっていることだけ示す。
    if (currentUser) scheduleFlush();
    else setStatus("pending", "未同期の変更があります");
  }

  // localStorage を一括で書き換えた後（バックアップ復元など）に呼ぶ。
  // 個別の書き込みフックが通らないため、ローカル全行を送信キューへ積み直す。
  function queueLocalSnapshot() {
    if (!HAS_CONFIG) return;
    enqueueAll();
    if (currentUser) syncNow();
    else setStatus("pending", "未同期の変更があります");
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
  // 比較ユーティリティ
  // ------------------------------------------------------------------
  // jsonb はキーの並び順を保存しないため、リモートから戻った data のキー順は
  // ローカルのオブジェクトと一致しない。JSON.stringify の素朴な比較では
  // 「中身は同じなのに違う」と誤判定するので、キーを揃えてから比較する。
  function stableStringify(value) {
    if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }

  function sameData(a, b) {
    if (a === b) return true;
    if (!a || !b) return false;
    return stableStringify(a) === stableStringify(b);
  }

  // 同じ時刻でも経路によって表記が違う。ローカルは "…T10:00:00.000Z"、
  // REST は "…T10:00:00+00:00"、Realtime(WAL) は "… 10:00:00+00" と空白区切りで来る。
  // 空白(0x20)は "T"(0x54) より小さいので、文字列比較ではRealtimeの行が常に古い扱いになり、
  // 保留中の変更がある行のリモート更新を取りこぼす。必ず時刻に直して比べる。
  function toMillis(value) {
    const time = Date.parse(value);
    return Number.isNaN(time) ? 0 : time;
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
      if (pending && toMillis(pending.updatedAt) >= toMillis(row.updated_at)) continue;
      // リモート行の形状を最低限検証する。追加・更新の data は必ずオブジェクト。
      // 壊れた行や悪意ある行（プリミティブ等）をそのまま localStorage へ流し込まない。
      // 各ストア固有の妥当性は writeAll 側（例: replaceAllCustomFoods の isValidCustomFood）で担保。
      if (!row.deleted && (!row.data || typeof row.data !== "object")) continue;

      if (!maps[row.store]) maps[row.store] = ADAPTERS[row.store].read();
      const map = maps[row.store];
      if (row.deleted) {
        if (map.delete(row.id)) changedStores.add(row.store);
      } else if (!sameData(map.get(row.id), row.data)) {
        // 中身が同じなら書き戻さない。自動同期では「自分が送った行が
        // Realtimeで返ってくる」「復帰のたびに全件pullする」が日常的に起きるため、
        // ここで差分を見ないと毎回 localStorage 全書き換え＋再描画になる。
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
    const sent = new Map(); // key -> 送信した updatedAt
    const dropped = []; // 未知ストア: 送らずに捨てる

    for (const key of keys) {
      const q = meta.queue[key];
      if (!ADAPTERS[q.store]) {
        dropped.push(key);
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
      sent.set(key, q.updatedAt);
      rows.push({
        store: q.store,
        id: q.id,
        data,
        deleted,
        updated_at: q.updatedAt,
        updated_by: user.email,
      });
    }

    if (rows.length) {
      const { error } = await getClient().from("sync_items").upsert(rows, { onConflict: "store,id" });
      if (error) throw error;
    }

    // 送信の最中も notifySyncChange はキューへ書き込む。await 前に読んだ meta を
    // そのまま保存すると、その間の変更を巻き戻して消してしまう。必ず読み直す。
    const latest = loadMeta();
    for (const key of dropped) delete latest.queue[key];
    for (const [key, updatedAt] of sent) {
      // 送信後に更新された行は残し、次のサイクルで新しい内容を送る。
      if (latest.queue[key] && latest.queue[key].updatedAt === updatedAt) delete latest.queue[key];
    }
    saveMeta(latest);
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

  // 適用結果を画面に反映する。render() は記録ページ・食材ページの双方が持つ。
  function rerender() {
    if (typeof render === "function") render();
  }

  let syncing = false;
  // options.pushOnly: 送信だけ行い全件pullを省く。Realtimeが生きている間は
  // 相手の変更が勝手に届くので、記録のたびに全件取得する必要がない。
  async function syncNow(options) {
    const pushOnly = Boolean(options && options.pushOnly);
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
      const firstSync = !meta.everLoggedIn;
      if (firstSync) enqueueAll(); // 初回は既存データを全件投入

      let changed = false;
      // 初回だけは pushOnly でも必ず全件取り込む（相手の既存データと合流するため）。
      if (!pushOnly || firstSync) {
        const rows = await readAllRemote();
        changed = applyRemoteRows(rows);
      }
      const { pushed } = await pushQueue(user);

      if (changed) rerender();
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
  // Realtime購読: 相手の端末の変更を、こちらが何も操作しなくても受け取る
  // ------------------------------------------------------------------
  let channel = null;
  let realtimeReady = false;
  let missedWhileDisconnected = false;

  function startRealtime() {
    if (!CONFIGURED || channel) return;
    channel = getClient()
      .channel("sync-items")
      .on("postgres_changes", { event: "*", schema: "public", table: "sync_items" }, (payload) => {
        const row = payload && payload.new;
        // 削除は墓標（deleted=true のUPDATE）で表すため、new が無い通知は想定外。無視する。
        if (!row || typeof row.store !== "string" || typeof row.id !== "string") return;
        if (applyRemoteRows([row])) rerender();
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          realtimeReady = true;
          // 切断中の変更は通知が来ない。復帰したら全件同期で取りこぼしを埋める。
          if (missedWhileDisconnected) {
            missedWhileDisconnected = false;
            syncNow();
          }
          return;
        }
        if (realtimeReady) missedWhileDisconnected = true;
        realtimeReady = false;
      });
  }

  function stopRealtime() {
    if (!channel) return;
    try {
      getClient().removeChannel(channel);
    } catch (error) {
      /* 破棄に失敗しても購読参照は捨てる */
    }
    channel = null;
    realtimeReady = false;
    missedWhileDisconnected = false;
  }

  // ------------------------------------------------------------------
  // 自動送信: 変更が落ち着いてからまとめて送る
  // ------------------------------------------------------------------
  const FLUSH_DELAY_MS = 1500;
  let flushTimer = null;

  function scheduleFlush() {
    if (!CONFIGURED || !currentUser) return;
    if (flushTimer) clearTimeout(flushTimer);
    flushTimer = setTimeout(() => {
      flushTimer = null;
      syncNow({ pushOnly: realtimeReady });
    }, FLUSH_DELAY_MS);
  }

  // 復帰系のトリガー。Realtimeが切れていた間の変更をここでも拾う。
  function initTriggers() {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && currentUser) syncNow();
    });
    window.addEventListener("online", () => {
      if (currentUser) syncNow();
    });
    window.addEventListener("offline", () => {
      setStatus("offline", "オフライン（復帰後に再試行）");
    });
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
  let initialized = false;
  function init() {
    if (!CONFIGURED || initialized) return;
    initialized = true;
    getClient().auth.onAuthStateChange((_event, session) => {
      const user = (session && session.user) || null;
      const wasLoggedIn = Boolean(currentUser);
      notifyAuth(user);
      if (!user) {
        stopRealtime();
        return;
      }
      startRealtime();
      // ページを開いた直後とログイン直後だけ追いつく。
      // トークン更新でもこのイベントは飛ぶため、状態が変わった時に限る。
      if (!wasLoggedIn) syncNow();
    });
    initTriggers();
  }

  window.EiyoSync = {
    CONFIGURED,
    init,
    getUser,
    signIn,
    signOut,
    syncNow,
    queueLocalSnapshot,
    onAuth,
    onStatus,
  };
})();
