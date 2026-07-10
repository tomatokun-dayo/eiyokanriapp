const elements = {
  myFoodCount: document.querySelector("#my-food-count"),
  categoryFilter: document.querySelector("#category-filter"),
  masterSearch: document.querySelector("#master-search"),
  masterList: document.querySelector("#master-list"),
  dbSearch: document.querySelector("#db-search"),
  dbStatus: document.querySelector("#db-status"),
  dbResults: document.querySelector("#db-results"),
  customForm: document.querySelector("#custom-food-form"),
  customName: document.querySelector("#custom-name"),
  customCategory: document.querySelector("#custom-category"),
  customStatus: document.querySelector("#custom-status"),
  exportButton: document.querySelector("#export-button"),
  importInput: document.querySelector("#import-input"),
  backupStatus: document.querySelector("#backup-status"),
};

// 成分表の食品群コード → アプリの分類
const DB_GROUP_TO_CATEGORY = {
  1: "主食", 2: "主食", 3: "その他", 4: "たんぱく", 5: "その他",
  6: "野菜", 7: "果物", 8: "野菜", 9: "野菜", 10: "たんぱく",
  11: "たんぱく", 12: "たんぱく", 13: "乳製品", 14: "その他", 15: "その他",
  16: "その他", 17: "その他", 18: "その他",
};

const CUSTOM_FOOD_COLORS = [
  "#da6f50", "#24786a", "#d99f32", "#657fb4", "#8b6ba8",
  "#7e9b51", "#c85f5f", "#4f7a3f", "#b58a4a", "#8fb3c8",
];

const DB_RESULT_LIMIT = 30;

function init() {
  applyStoredFoodStates();
  renderCategoryFilter();
  bindEvents();
  render();
}

function render() {
  if (elements.myFoodCount) {
    elements.myFoodCount.textContent = String(FOOD_MASTER.length);
  }
  renderMasterList();
}

function renderCategoryFilter() {
  const categories = [...new Set(FOOD_MASTER.map((food) => food.category))];
  for (const category of categories) {
    const option = document.createElement("option");
    option.value = category;
    option.textContent = category;
    elements.categoryFilter.appendChild(option);
  }
}

function bindEvents() {
  elements.categoryFilter.addEventListener("change", renderMasterList);

  elements.masterSearch.addEventListener("input", renderMasterList);

  elements.dbSearch.addEventListener("input", renderDbResults);

  elements.customForm.addEventListener("submit", (event) => {
    event.preventDefault();
    addCustomFoodFromForm();
  });

  elements.exportButton.addEventListener("click", exportBackup);

  elements.importInput.addEventListener("change", () => {
    const file = elements.importInput.files?.[0];
    if (file) {
      importBackup(file);
    }
    elements.importInput.value = "";
  });
}

// 成分表の表記に合わせるための言い換え（かな入力 → 成分表でよく使われる表記）
const DB_QUERY_ALIASES = {
  とうふ: "豆腐",
  トウフ: "豆腐",
  たまご: "鶏卵",
  タマゴ: "鶏卵",
  ぎゅうにゅう: "牛乳",
  ごはん: "めし",
  おかゆ: "かゆ",
  おさかな: "魚",
  ひきにく: "ひき肉",
};

function buildQueryVariants(query) {
  const variants = new Set([foldKana(query.toLowerCase())]);
  for (const [from, to] of Object.entries(DB_QUERY_ALIASES)) {
    if (query.includes(from)) {
      variants.add(foldKana(query.replaceAll(from, to).toLowerCase()));
    }
  }
  return [...variants];
}

// 成分表の食品名から＜魚類＞（にんじん類）などの注記を外し、表示用に整える
function cleanDbName(rawName) {
  const cleaned = rawName
    .replace(/＜[^＞]*＞/g, "")
    .replace(/（[^）]*）/g, "")
    .replace(/［[^］]*］/g, "")
    .replace(/[\s　]+/g, " ")
    .trim();
  return cleaned || rawName;
}

function colorForFoodNo(foodNo) {
  let hash = 0;
  for (const ch of foodNo) hash = (hash * 31 + ch.charCodeAt(0)) % 997;
  return CUSTOM_FOOD_COLORS[hash % CUSTOM_FOOD_COLORS.length];
}

function setDbStatus(text) {
  if (elements.dbStatus) elements.dbStatus.textContent = text;
}

function renderDbResults() {
  const query = (elements.dbSearch?.value ?? "").trim();
  elements.dbResults.replaceChildren();

  if (query.length === 0) {
    setDbStatus("");
    return;
  }

  const variants = buildQueryVariants(query);
  const matches = FOOD_DB.filter((record) => {
    const folded = foldKana(record[1].toLowerCase());
    return variants.some((variant) => folded.includes(variant));
  });

  if (matches.length === 0) {
    setDbStatus("見つかりませんでした。漢字・ひらがななど表記を変えて試してみてください（例: とうふ→豆腐）。");
    return;
  }

  setDbStatus(
    matches.length > DB_RESULT_LIMIT
      ? `${matches.length}件見つかりました（先頭${DB_RESULT_LIMIT}件を表示）`
      : `${matches.length}件見つかりました`,
  );

  for (const record of matches.slice(0, DB_RESULT_LIMIT)) {
    const [foodNo, rawName, group, energy] = record;
    const foodId = `db_${foodNo}`;

    const row = document.createElement("div");
    row.className = "db-item";

    const info = document.createElement("div");
    info.className = "db-item-info";

    const name = document.createElement("span");
    name.className = "db-item-name";
    name.textContent = cleanDbName(rawName);

    const meta = document.createElement("span");
    meta.className = "db-item-meta";
    meta.textContent = `${FOOD_DB_GROUPS[group] ?? ""} / 100gあたり${energy}kcal / ${rawName}`;

    info.append(name, meta);

    const addButton = document.createElement("button");
    addButton.type = "button";
    addButton.className = "ghost-button db-add";
    if (foodById.has(foodId)) {
      addButton.textContent = "追加済み";
      addButton.disabled = true;
    } else {
      addButton.textContent = "＋追加";
      addButton.addEventListener("click", () => addFoodFromDb(record));
    }

    row.append(info, addButton);
    elements.dbResults.appendChild(row);
  }
}

function addFoodFromDb(record) {
  const [foodNo, rawName, group, energy, protein, fat, carbs, iron, calcium] = record;
  const food = {
    id: `db_${foodNo}`,
    name: cleanDbName(rawName),
    category: DB_GROUP_TO_CATEGORY[group] ?? "その他",
    defaultAmount: 15,
    color: colorForFoodNo(foodNo),
    state: "introduced",
    spoonGrams: { tsp: 5, tbsp: 15 },
    source: {
      db: "文部科学省 日本食品標準成分表（八訂）増補2023年",
      foodNo,
      url: "https://www.mext.go.jp/a_menu/syokuhinseibun/mext_00001.html",
      referencedAt: toDateKey(new Date()),
      note: `成分表食品名: ${rawName}`,
    },
    per100: { energy, protein, fat, carbs, iron, calcium },
  };

  if (addCustomFood(food)) {
    render();
    renderDbResults();
    setDbStatus(`「${food.name}」をマイ食材に追加しました。記録ページの食材リストに出ます。`);
  } else {
    setDbStatus("この食品はすでにマイ食材にあります。");
  }
}

function addCustomFoodFromForm() {
  const name = elements.customName.value.trim();
  if (!name) return;

  const numberOf = (id) => {
    const value = Number(document.querySelector(id)?.value);
    return Number.isFinite(value) && value >= 0 ? value : 0;
  };

  const food = {
    id: `custom_${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name,
    category: elements.customCategory.value,
    defaultAmount: 15,
    color: colorForFoodNo(name),
    state: "introduced",
    spoonGrams: { tsp: 5, tbsp: 15 },
    source: {
      db: "手入力（パッケージ表示など）",
      foodNo: "",
      url: "",
      referencedAt: toDateKey(new Date()),
    },
    per100: {
      energy: numberOf("#custom-energy"),
      protein: numberOf("#custom-protein"),
      fat: numberOf("#custom-fat"),
      carbs: numberOf("#custom-carbs"),
      iron: numberOf("#custom-iron"),
      calcium: numberOf("#custom-calcium"),
    },
  };

  if (addCustomFood(food)) {
    elements.customForm.reset();
    render();
    if (elements.customStatus) {
      elements.customStatus.textContent = `「${food.name}」をマイ食材に追加しました。`;
    }
  }
}

function renderMasterList() {
  const category = elements.categoryFilter.value;
  const query = (elements.masterSearch?.value ?? "").trim().toLowerCase();
  const foods = FOOD_MASTER.filter((food) => {
    const matchesCategory = category === "all" || food.category === category;
    const matchesQuery =
      query === "" ||
      food.name.toLowerCase().includes(query) ||
      food.category.toLowerCase().includes(query);
    return matchesCategory && matchesQuery;
  });

  elements.masterList.replaceChildren();

  if (foods.length === 0) {
    const empty = document.createElement("p");
    empty.className = "master-empty";
    empty.textContent = "該当する食材がありません。";
    elements.masterList.appendChild(empty);
    return;
  }

  for (const food of foods) {
    const stateInfo = foodStateByKey.get(food.state) ?? foodStateByKey.get("introduced");

    const item = document.createElement("div");
    item.className = "master-item";
    item.dataset.state = food.state;
    item.style.setProperty("--state-color", stateInfo.color);

    const swatch = document.createElement("span");
    swatch.className = "swatch";
    swatch.style.setProperty("--swatch", food.color);
    item.appendChild(swatch);

    const main = document.createElement("div");
    main.className = "master-main";

    const info = document.createElement("div");
    info.className = "master-info";

    const nameRow = document.createElement("span");
    nameRow.className = "master-name";
    const nameText = document.createElement("span");
    nameText.textContent = food.name;
    const categoryText = document.createElement("small");
    categoryText.textContent = food.category;
    nameRow.append(nameText, categoryText);

    const nutrients = document.createElement("span");
    nutrients.className = "master-nutrients";
    nutrients.textContent = `100gあたり ${formatValue(food.per100.energy, nutrientByKey.get("energy"))} / ${formatValue(food.per100.protein, nutrientByKey.get("protein"))} / 鉄${formatValue(food.per100.iron, nutrientByKey.get("iron"))}`;

    info.append(nameRow, nutrients);
    main.appendChild(info);

    const stateField = document.createElement("label");
    stateField.className = "master-state-field";
    const stateLabel = document.createElement("span");
    stateLabel.className = "master-state-label";
    stateLabel.textContent = "状態";
    const select = document.createElement("select");
    select.className = "master-state-select";
    select.setAttribute("aria-label", `${food.name}の状態`);
    for (const state of FOOD_STATES) {
      const option = document.createElement("option");
      option.value = state.key;
      option.textContent = state.label;
      if (state.key === food.state) option.selected = true;
      select.appendChild(option);
    }
    select.addEventListener("change", () => setFoodState(food.id, select.value));
    stateField.append(stateLabel, select);
    main.appendChild(stateField);

    if (isCustomFood(food.id)) {
      const removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.className = "delete-button master-remove";
      removeButton.textContent = "マイ食材から削除";
      removeButton.addEventListener("click", () => {
        const confirmed = window.confirm(
          `「${food.name}」をマイ食材から削除します。過去の記録は残りますが、栄養の集計に含まれなくなります。よろしいですか？`,
        );
        if (!confirmed) return;
        removeCustomFood(food.id);
        render();
        renderDbResults();
      });
      main.appendChild(removeButton);
    }

    item.appendChild(main);
    elements.masterList.appendChild(item);
  }
}

function setBackupStatus(text) {
  if (elements.backupStatus) {
    elements.backupStatus.textContent = text;
  }
}

function exportBackup() {
  const payload = {
    app: "eiyokanri",
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    entries: memoryStore.getAllEntries(),
    foodStates: { ...foodStateOverrides },
    milk: milkStore.getAllFeeds(),
    mealTemplates: mealTemplateStore.getAllTemplates(),
    foodPrefs: foodPreferenceStore.getAllPreferences(),
    customFoods: [...customFoods],
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `eiyokanri-backup-${todayKey}.json`;
  link.click();
  URL.revokeObjectURL(url);
  setBackupStatus(`書き出しました（記録 ${payload.entries.length}件）。`);
}

function isValidBackupEntry(entry) {
  return (
    entry !== null &&
    typeof entry === "object" &&
    typeof entry.id === "string" &&
    typeof entry.foodId === "string" &&
    Number.isFinite(entry.amount) &&
    typeof entry.date === "string"
  );
}

function isValidBackupTemplate(template) {
  return (
    template !== null &&
    typeof template === "object" &&
    typeof template.id === "string" &&
    typeof template.name === "string" &&
    template.name.length > 0 &&
    Array.isArray(template.items) &&
    template.items.length > 0 &&
    template.items.every(
      (item) =>
        item !== null &&
        typeof item === "object" &&
        typeof item.foodId === "string" &&
        Number.isFinite(item.amount) &&
        typeof item.unit === "string",
    )
  );
}

function importBackup(file) {
  const reader = new FileReader();

  reader.onerror = () => {
    setBackupStatus("ファイルを読み込めませんでした。");
  };

  reader.onload = () => {
    let payload;
    try {
      payload = JSON.parse(String(reader.result));
    } catch (error) {
      setBackupStatus("読み込めませんでした。バックアップファイルか確認してください。");
      return;
    }

    if (!Array.isArray(payload?.entries)) {
      setBackupStatus("読み込めませんでした。バックアップファイルか確認してください。");
      return;
    }

    const entries = payload.entries.filter(isValidBackupEntry);
    const confirmed = window.confirm(
      `バックアップの記録 ${entries.length}件を読み込み、今の記録と置き換えます。よろしいですか？`,
    );

    if (!confirmed) {
      setBackupStatus("読み込みを取り消しました。");
      return;
    }

    // カスタム食材を先に復元する（後続の食材状態・単位記憶の検証が食材の存在を前提とするため）
    replaceAllCustomFoods(Array.isArray(payload.customFoods) ? payload.customFoods : []);

    memoryStore.replaceAllEntries(entries);

    for (const key of Object.keys(foodStateOverrides)) {
      delete foodStateOverrides[key];
    }
    if (payload.foodStates && typeof payload.foodStates === "object") {
      for (const [foodId, stateKey] of Object.entries(payload.foodStates)) {
        if (foodById.has(foodId) && foodStateByKey.has(stateKey)) {
          foodStateOverrides[foodId] = stateKey;
        }
      }
    }
    persistFoodStates();
    applyStoredFoodStates();

    const milkFeeds = Array.isArray(payload.milk)
      ? payload.milk.filter(
          (feed) =>
            feed !== null &&
            typeof feed === "object" &&
            typeof feed.id === "string" &&
            typeof feed.date === "string" &&
            Number.isFinite(feed.ml) &&
            feed.ml > 0,
        )
      : [];
    milkStore.replaceAllFeeds(milkFeeds);

    const mealTemplates = Array.isArray(payload.mealTemplates)
      ? payload.mealTemplates.filter(isValidBackupTemplate)
      : [];
    mealTemplateStore.replaceAllTemplates(mealTemplates);

    const foodPrefs = {};
    if (payload.foodPrefs && typeof payload.foodPrefs === "object" && !Array.isArray(payload.foodPrefs)) {
      for (const [foodId, pref] of Object.entries(payload.foodPrefs)) {
        if (
          foodById.has(foodId) &&
          pref !== null &&
          typeof pref === "object" &&
          unitByKey.has(pref.unit) &&
          Number.isFinite(pref.amount) &&
          pref.amount > 0
        ) {
          foodPrefs[foodId] = { unit: pref.unit, amount: pref.amount };
        }
      }
    }
    foodPreferenceStore.replaceAllPreferences(foodPrefs);

    render();
    setBackupStatus(
      `読み込みました（記録 ${entries.length}件・ミルク ${milkFeeds.length}件・献立セット ${mealTemplates.length}件）。`,
    );
  };

  reader.readAsText(file);
}

init();
