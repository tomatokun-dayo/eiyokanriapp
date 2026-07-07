const elements = {
  myFoodCount: document.querySelector("#my-food-count"),
  categoryFilter: document.querySelector("#category-filter"),
  masterSearch: document.querySelector("#master-search"),
  masterList: document.querySelector("#master-list"),
  exportButton: document.querySelector("#export-button"),
  importInput: document.querySelector("#import-input"),
  backupStatus: document.querySelector("#backup-status"),
};

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

  elements.exportButton.addEventListener("click", exportBackup);

  elements.importInput.addEventListener("change", () => {
    const file = elements.importInput.files?.[0];
    if (file) {
      importBackup(file);
    }
    elements.importInput.value = "";
  });
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
