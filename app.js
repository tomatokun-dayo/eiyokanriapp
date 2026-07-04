const MEALS = [
  { id: "morning", label: "朝" },
  { id: "lunch", label: "昼" },
  { id: "dinner", label: "夜" },
  { id: "snack", label: "間食" },
];

const INITIAL_BATCH_ROW_COUNT = 3;
const MIN_BATCH_ROW_COUNT = 1;

const elements = {
  todayLabel: document.querySelector("#today-label"),
  summaryStats: document.querySelector("#summary-stats"),
  summaryMessage: document.querySelector("#summary-message"),
  trendDetails: document.querySelector("#trend-details"),
  ageStage: document.querySelector("#age-stage"),
  form: document.querySelector("#entry-form"),
  batchRows: document.querySelector("#batch-rows"),
  addBatchRow: document.querySelector("#add-batch-row"),
  mealOptions: document.querySelector("#meal-options"),
  quickPicks: document.querySelector("#quick-picks"),
  totalsList: document.querySelector("#totals-list"),
  suggestions: document.querySelector("#suggestions"),
  entryCount: document.querySelector("#entry-count"),
  mainBalance: document.querySelector("#main-balance"),
  subBalance: document.querySelector("#sub-balance"),
  chartNutrients: document.querySelector("#chart-nutrients"),
  trendGrid: document.querySelector("#trend-grid"),
  plateCanvas: document.querySelector("#plate-canvas"),
  logList: document.querySelector("#log-list"),
  masterList: document.querySelector("#master-list"),
  masterSearch: document.querySelector("#master-search"),
  categoryFilter: document.querySelector("#category-filter"),
  resetButton: document.querySelector("#reset-button"),
  copyPreviousButton: document.querySelector("#copy-previous-button"),
  copyPreviousStatus: document.querySelector("#copy-previous-status"),
  mealTemplatesList: document.querySelector("#meal-templates-list"),
  saveTemplateButton: document.querySelector("#save-template-button"),
  mealTemplatesStatus: document.querySelector("#meal-templates-status"),
  exportButton: document.querySelector("#export-button"),
  importInput: document.querySelector("#import-input"),
  backupStatus: document.querySelector("#backup-status"),
  milkForm: document.querySelector("#milk-form"),
  milkInput: document.querySelector("#milk-input"),
  milkList: document.querySelector("#milk-list"),
  milkTotal: document.querySelector("#milk-total"),
};

let todayKey = toDateKey(new Date());

function syncToday() {
  todayKey = toDateKey(new Date());

  if (elements.todayLabel) {
    elements.todayLabel.textContent = new Intl.DateTimeFormat("ja-JP", {
      month: "numeric",
      day: "numeric",
      weekday: "short",
    }).format(new Date());
  }
}

let selectedChartNutrients = new Set(["energy", "protein", "iron", "calcium"]);
let selectedAgeTargetId = "7-8";
let activeBatchRowIndex = null;

function init() {
  applyStoredFoodStates();
  renderFormOptions();
  renderCategoryFilter();
  renderMealTemplates();
  bindEvents();
  render();
}

function renderFormOptions() {
  elements.ageStage.innerHTML = AGE_TARGETS.map(
    (target) => `<option value="${target.id}" ${target.id === selectedAgeTargetId ? "selected" : ""}>${target.label}</option>`,
  ).join("");

  elements.mealOptions.innerHTML = MEALS.map(
    (meal, index) => `
      <label>
        <input type="radio" name="meal" value="${meal.id}" ${index === 0 ? "checked" : ""} />
        <span>${meal.label}</span>
      </label>
    `,
  ).join("");

  elements.chartNutrients.innerHTML = NUTRIENTS.map(
    (nutrient) => `
      <label class="nutrient-toggle" style="--toggle-color: ${nutrient.color}">
        <input
          type="checkbox"
          value="${nutrient.key}"
          ${selectedChartNutrients.has(nutrient.key) ? "checked" : ""}
        />
        <span>${nutrient.label}</span>
      </label>
    `,
  ).join("");

  renderBatchRows(INITIAL_BATCH_ROW_COUNT);
}

function renderBatchRow(row, index) {
  const selectedFood = foodById.get(row.foodId);
  const defaultAmount = selectedFood?.defaultAmount ?? "";
  const options = [
    `<option value="">未選択</option>`,
    ...FOOD_MASTER.map(
      (food) => `<option value="${food.id}" ${food.id === row.foodId ? "selected" : ""}>${food.name}</option>`,
    ),
  ].join("");

  return `
    <div class="batch-row" data-batch-row="${index}">
      <span class="batch-index">${row.label}</span>
      <label class="batch-field batch-food-field">
        <span>食材</span>
        <select class="batch-food-select" name="food-${index}">
          ${options}
        </select>
      </label>
      <label class="batch-field batch-amount-field">
        <span>量</span>
        <span class="batch-amount-control">
          <input
            class="batch-amount-input"
            name="amount-${index}"
            type="number"
            min="${AMOUNT_UNITS[0].min}"
            max="${AMOUNT_UNITS[0].max}"
            step="${AMOUNT_UNITS[0].step}"
            value="${defaultAmount}"
          />
          <select class="batch-unit-select" name="unit-${index}" aria-label="${row.label}の単位" data-current-unit="g">
            ${AMOUNT_UNITS.map((unit) => `<option value="${unit.key}">${unit.label}</option>`).join("")}
          </select>
        </span>
      </label>
      <button class="batch-remove-button" type="button" data-remove-batch-row aria-label="${row.label}を削除">×</button>
    </div>
  `;
}

function getBatchRowLabel(index) {
  return `${index + 1}品目`;
}

function getBatchRowElements() {
  return [...elements.batchRows.querySelectorAll("[data-batch-row]")];
}

function renderBatchRows(rowCount) {
  activeBatchRowIndex = null;
  elements.batchRows.innerHTML = Array.from({ length: rowCount }, (_, index) =>
    renderBatchRow({ label: getBatchRowLabel(index) }, index),
  ).join("");
  updateBatchRowRemoveButtons();
}

function appendBatchRow() {
  const activeRow = getActiveBatchRow();
  const index = getBatchRowElements().length;
  elements.batchRows.insertAdjacentHTML("beforeend", renderBatchRow({ label: getBatchRowLabel(index) }, index));
  renumberBatchRows(activeRow);
}

function removeBatchRow(row) {
  const rows = getBatchRowElements();
  if (!row || rows.length <= MIN_BATCH_ROW_COUNT) return;

  const activeRow = getActiveBatchRow();
  row.remove();
  renumberBatchRows(activeRow === row ? null : activeRow);
}

function getActiveBatchRow() {
  if (activeBatchRowIndex === null) return null;
  return getBatchRowElements().find((row) => Number(row.dataset.batchRow) === activeBatchRowIndex) ?? null;
}

function renumberBatchRows(activeRow = getActiveBatchRow()) {
  const rows = getBatchRowElements();
  rows.forEach((row, index) => {
    const label = getBatchRowLabel(index);
    row.dataset.batchRow = String(index);
    row.querySelector(".batch-index").textContent = label;
    row.querySelector(".batch-food-select").name = `food-${index}`;
    row.querySelector(".batch-amount-input").name = `amount-${index}`;

    const unitSelect = row.querySelector(".batch-unit-select");
    unitSelect.name = `unit-${index}`;
    unitSelect.setAttribute("aria-label", `${label}の単位`);

    const removeButton = row.querySelector("[data-remove-batch-row]");
    removeButton.setAttribute("aria-label", `${label}を削除`);
  });

  updateBatchRowRemoveButtons(rows);
  activeBatchRowIndex = activeRow && elements.batchRows.contains(activeRow) ? Number(activeRow.dataset.batchRow) : null;
}

function updateBatchRowRemoveButtons(rows = getBatchRowElements()) {
  const shouldDisable = rows.length <= MIN_BATCH_ROW_COUNT;
  rows.forEach((row) => {
    const removeButton = row.querySelector("[data-remove-batch-row]");
    removeButton.disabled = shouldDisable;
  });
}

function renderCategoryFilter() {
  const categories = [...new Set(FOOD_MASTER.map((food) => food.category))];
  elements.categoryFilter.innerHTML += categories
    .map((category) => `<option value="${category}">${category}</option>`)
    .join("");
}

function bindEvents() {
  elements.ageStage.addEventListener("change", () => {
    selectedAgeTargetId = elements.ageStage.value;
    render();
  });

  elements.form.addEventListener("submit", (event) => {
    event.preventDefault();

    const meal = new FormData(elements.form).get("meal") || "morning";
    const rows = getBatchEntries();

    if (rows.length === 0) {
      return;
    }

    const createdAt = new Date();
    const entries = rows.map((row, index) => {
      const rowTime = new Date(createdAt.getTime() + index * 1000);
      return createEntry({
        foodId: row.foodId,
        amount: row.grams,
        inputAmount: row.amount,
        inputUnit: row.unit,
        meal,
        createdAt: rowTime,
      });
    });

    for (const row of rows) {
      foodPreferenceStore.remember(row.foodId, row.unit, row.amount);
    }

    memoryStore.addEntries(entries);
    clearBatchRows();
    render();
  });

  elements.addBatchRow.addEventListener("click", appendBatchRow);

  elements.copyPreviousButton.addEventListener("click", copyPreviousMeal);

  elements.saveTemplateButton.addEventListener("click", saveMealTemplateFromBatch);

  elements.batchRows.addEventListener("click", (event) => {
    const button = event.target.closest("[data-remove-batch-row]");
    if (!button) return;
    removeBatchRow(button.closest("[data-batch-row]"));
  });

  elements.batchRows.addEventListener("change", (event) => {
    const select = event.target.closest(".batch-food-select");
    const unitSelect = event.target.closest(".batch-unit-select");
    if (!select && !unitSelect) return;

    const row = event.target.closest("[data-batch-row]");
    const input = row?.querySelector(".batch-amount-input");
    const foodSelect = row?.querySelector(".batch-food-select");
    const food = foodById.get(foodSelect?.value);

    if (unitSelect) {
      convertAmountInputUnit(row, unitSelect);
      updateAmountInputForUnit(row);
      return;
    }

    if (food) {
      applyFoodPreferenceToRow(row, food);
    } else if (input) {
      input.value = "";
    }
  });

  elements.batchRows.addEventListener("focusin", (event) => {
    const row = event.target.closest("[data-batch-row]");
    if (!row) return;
    activeBatchRowIndex = Number(row.dataset.batchRow);
  });

  elements.chartNutrients.addEventListener("change", (event) => {
    const input = event.target.closest("input[type='checkbox']");
    if (!input) return;

    if (input.checked) {
      selectedChartNutrients.add(input.value);
    } else {
      selectedChartNutrients.delete(input.value);
    }

    renderTrendCharts(buildTrendData(memoryStore.getAllEntries()));
  });

  elements.categoryFilter.addEventListener("change", renderMasterList);

  elements.masterSearch.addEventListener("input", renderMasterList);

  elements.trendDetails.addEventListener("toggle", () => {
    if (elements.trendDetails.open) {
      renderTrendCharts(buildTrendData(memoryStore.getAllEntries()));
    }
  });

  elements.resetButton.addEventListener("click", () => {
    memoryStore.resetToday();
    render();
  });

  elements.milkForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const ml = Number(elements.milkInput.value);
    if (!Number.isFinite(ml) || ml <= 0 || ml > 1000) return;
    milkStore.addFeed(ml);
    elements.milkInput.value = "";
    render();
  });

  elements.exportButton.addEventListener("click", exportBackup);

  elements.importInput.addEventListener("change", () => {
    const file = elements.importInput.files?.[0];
    if (file) {
      importBackup(file);
    }
    elements.importInput.value = "";
  });

  elements.logList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-remove-entry]");
    if (!button) return;
    memoryStore.removeEntry(button.dataset.removeEntry);
    render();
  });

  window.addEventListener("resize", () => {
    renderTrendCharts(buildTrendData(memoryStore.getAllEntries()));
    renderPlate(memoryStore.getTodayEntries());
  });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && todayKey !== toDateKey(new Date())) {
      render();
    }
  });

  window.setInterval(() => {
    if (todayKey !== toDateKey(new Date())) {
      render();
    }
  }, 60000);
}

function getBatchEntries() {
  return [...elements.batchRows.querySelectorAll("[data-batch-row]")]
    .map((row) => {
      const foodId = row.querySelector(".batch-food-select")?.value;
      const amount = Number(row.querySelector(".batch-amount-input")?.value);
      const unit = row.querySelector(".batch-unit-select")?.value || "g";
      const grams = amountToGrams(amount, unit, foodById.get(foodId));

      return { foodId, amount, unit, grams };
    })
    .filter((row) => foodById.has(row.foodId) && Number.isFinite(row.grams) && row.grams > 0);
}

function clearBatchRows() {
  renderBatchRows(INITIAL_BATCH_ROW_COUNT);
}

function findPreviousMealEntries(mealId) {
  const candidates = memoryStore
    .getAllEntries()
    .filter((entry) => entry.meal === mealId && entry.date !== todayKey && foodById.has(entry.foodId));

  if (candidates.length === 0) return { date: null, entries: [] };

  const mostRecentDate = candidates.reduce(
    (latest, entry) => (entry.date > latest ? entry.date : latest),
    candidates[0].date,
  );

  const entries = candidates
    .filter((entry) => entry.date === mostRecentDate)
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

  return { date: mostRecentDate, entries };
}

function setCopyPreviousStatus(text) {
  if (elements.copyPreviousStatus) {
    elements.copyPreviousStatus.textContent = text;
  }
}

function fillBatchRowsFromItems(items) {
  renderBatchRows(Math.max(items.length, MIN_BATCH_ROW_COUNT));

  getBatchRowElements().forEach((row, index) => {
    const item = items[index];
    if (!item) return;

    const foodSelect = row.querySelector(".batch-food-select");
    const amountInput = row.querySelector(".batch-amount-input");
    const unitSelect = row.querySelector(".batch-unit-select");

    foodSelect.value = item.foodId;
    unitSelect.value = item.unit || "g";
    unitSelect.dataset.currentUnit = unitSelect.value;
    updateAmountInputForUnit(row);
    amountInput.value = item.amount;
  });
}

function copyPreviousMeal() {
  const mealId = new FormData(elements.form).get("meal") || "morning";
  const mealLabel = MEALS.find((meal) => meal.id === mealId)?.label ?? "";
  const { date, entries } = findPreviousMealEntries(mealId);

  if (entries.length === 0) {
    setCopyPreviousStatus(`前回の${mealLabel}の記録が見つかりませんでした。`);
    return;
  }

  fillBatchRowsFromItems(
    entries.map((entry) => ({
      foodId: entry.foodId,
      amount: entry.inputAmount ?? entry.amount,
      unit: entry.inputUnit || "g",
    })),
  );

  setCopyPreviousStatus(`前回の${mealLabel}（${formatShortDate(date)}）から${entries.length}品をコピーしました。`);
}

function setTemplateStatus(text) {
  if (elements.mealTemplatesStatus) {
    elements.mealTemplatesStatus.textContent = text;
  }
}

function saveMealTemplateFromBatch() {
  const rows = getBatchEntries();

  if (rows.length === 0) {
    setTemplateStatus("食材を入力してから保存してください。");
    return;
  }

  const rawName = window.prompt("献立セットの名前を入力してください", "");
  if (rawName === null) return;

  const name = rawName.trim();
  if (!name) {
    setTemplateStatus("名前を入力してください。");
    return;
  }

  const template = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name,
    items: rows.map((row) => ({ foodId: row.foodId, amount: row.amount, unit: row.unit })),
  };

  mealTemplateStore.addTemplate(template);
  renderMealTemplates();
  setTemplateStatus(`「${template.name}」を保存しました。`);
}

function applyMealTemplate(template) {
  fillBatchRowsFromItems(template.items);
  setTemplateStatus(`「${template.name}」を反映しました。`);
}

function renderMealTemplates() {
  const container = elements.mealTemplatesList;
  if (!container) return;

  const templates = mealTemplateStore.getAllTemplates();
  container.replaceChildren();

  if (templates.length === 0) {
    const empty = document.createElement("p");
    empty.className = "meal-templates-empty";
    empty.textContent = "献立セットはまだありません。";
    container.appendChild(empty);
    return;
  }

  for (const template of templates) {
    const chip = document.createElement("span");
    chip.className = "meal-template-chip";

    const applyButton = document.createElement("button");
    applyButton.type = "button";
    applyButton.className = "meal-template-apply";
    applyButton.textContent = template.name;
    applyButton.addEventListener("click", () => applyMealTemplate(template));

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "meal-template-remove";
    removeButton.setAttribute("aria-label", `${template.name}を削除`);
    removeButton.textContent = "×";
    removeButton.addEventListener("click", () => {
      mealTemplateStore.removeTemplate(template.id);
      renderMealTemplates();
      setTemplateStatus(`「${template.name}」を削除しました。`);
    });

    chip.append(applyButton, removeButton);
    container.appendChild(chip);
  }
}

function convertAmountInputUnit(row, unitSelect) {
  const input = row?.querySelector(".batch-amount-input");
  const previousUnit = unitSelect.dataset.currentUnit || "g";
  const nextUnit = unitSelect.value || "g";
  const amount = Number(input?.value);
  const food = foodById.get(row?.querySelector(".batch-food-select")?.value);

  if (input && Number.isFinite(amount) && amount > 0 && previousUnit !== nextUnit) {
    const grams = amountToGrams(amount, previousUnit, food);
    input.value = formatPlainNumber(grams / gramsPerUnit(nextUnit, food));
  }

  unitSelect.dataset.currentUnit = nextUnit;
}

function formatEntryAmount(entry) {
  const unit = unitByKey.get(entry.inputUnit || "g") ?? unitByKey.get("g");
  const inputAmount = entry.inputAmount ?? entry.amount;

  if (unit.key === "g") {
    return `${formatPlainNumber(inputAmount)}g`;
  }

  return `${unit.label}${formatPlainNumber(inputAmount)}（約${formatPlainNumber(entry.amount)}g）`;
}

function updateAmountInputForUnit(row) {
  const input = row?.querySelector(".batch-amount-input");
  const unitSelect = row?.querySelector(".batch-unit-select");
  const unit = unitByKey.get(unitSelect?.value || "g") ?? unitByKey.get("g");
  if (!input) return;

  input.step = unit.step;
  input.min = unit.min;
  input.max = unit.max;
}

function fillNextBatchRow(food) {
  const rows = [...elements.batchRows.querySelectorAll("[data-batch-row]")];
  const emptyRow = rows.find((row) => !row.querySelector(".batch-food-select")?.value);
  const activeRow = rows.find((row) => Number(row.dataset.batchRow) === activeBatchRowIndex);
  const activeRowIsEmpty = activeRow && !activeRow.querySelector(".batch-food-select")?.value;
  const targetRow = activeRowIsEmpty ? activeRow : emptyRow ?? activeRow ?? rows[0];
  if (!targetRow) return;

  const select = targetRow.querySelector(".batch-food-select");
  const input = targetRow.querySelector(".batch-amount-input");
  select.value = food.id;
  applyFoodPreferenceToRow(targetRow, food);
  activeBatchRowIndex = Number(targetRow.dataset.batchRow);
  input.focus();
  input.select();
}

function applyFoodPreferenceToRow(row, food) {
  const input = row.querySelector(".batch-amount-input");
  const unitSelect = row.querySelector(".batch-unit-select");
  const preference = foodPreferenceStore.getPreference(food.id);

  const unit = preference && unitByKey.has(preference.unit) ? preference.unit : "g";
  const amount =
    preference && Number.isFinite(preference.amount) && preference.amount > 0
      ? preference.amount
      : food.defaultAmount;

  unitSelect.value = unit;
  unitSelect.dataset.currentUnit = unit;
  updateAmountInputForUnit(row);
  input.value = amount;
}

function render() {
  syncToday();

  const entries = memoryStore.getTodayEntries();
  const allEntries = memoryStore.getAllEntries();
  const totals = calculateTotals(entries);

  elements.entryCount.textContent = String(entries.length);
  renderSummary(totals, entries);
  renderQuickPicks();
  renderTotals(totals, entries);
  renderSuggestions(totals, entries);
  renderMilk();
  renderLog(entries);
  renderMasterList();
  renderTrendCharts(buildTrendData(allEntries));
  renderPlate(entries);
}

function renderSummary(totals, entries) {
  if (!elements.summaryStats || !elements.summaryMessage) return;

  const milkTotal = milkStore.getTodayFeeds().reduce((sum, feed) => sum + feed.ml, 0);
  const percentOf = (key) => {
    const target = getTargetValue(key);
    if (target <= 0) return 0;
    return Math.round(((totals[key] ?? 0) / target) * 100);
  };

  const stats = [
    { label: "記録", value: `${entries.length}品` },
    { label: "エネルギー", value: `${percentOf("energy")}%` },
    { label: "鉄", value: `${percentOf("iron")}%` },
    { label: "ミルク", value: `${milkTotal}ml` },
  ];

  elements.summaryStats.replaceChildren();
  for (const stat of stats) {
    const item = document.createElement("div");
    item.className = "summary-stat";
    const value = document.createElement("strong");
    value.textContent = stat.value;
    const label = document.createElement("span");
    label.textContent = stat.label;
    item.append(value, label);
    elements.summaryStats.appendChild(item);
  }

  let message;
  if (entries.length === 0) {
    message = "今日はまだ記録がありません。1品から気軽に記録してみましょう。";
  } else {
    const deficits = buildSuggestions(totals);
    if (deficits.length === 0) {
      message = "対象の栄養素はバランスよく摂れています。";
    } else {
      const top = nutrientByKey.get(deficits[0].key);
      message = `次は${top.label}を足せるとよさそうです。詳しくは「補うとよい栄養素」をどうぞ。`;
    }
  }
  elements.summaryMessage.textContent = message;
}

function getActiveAgeTarget() {
  return ageTargetById.get(selectedAgeTargetId) ?? ageTargetById.get("7-8");
}

function getTargetValue(nutrientKey) {
  const ageTarget = getActiveAgeTarget();
  return ageTarget.targets[nutrientKey] ?? nutrientByKey.get(nutrientKey)?.target ?? 0;
}

function createSuggestionMessage(text) {
  const message = document.createElement("p");
  message.className = "suggestion-empty";
  message.textContent = text;
  return message;
}

function renderSuggestions(totals, entries) {
  const container = elements.suggestions;
  if (!container) return;
  container.replaceChildren();

  if (entries.length === 0) {
    container.appendChild(createSuggestionMessage("食材を記録すると、補うとよい栄養素を提案します。"));
    return;
  }

  const deficits = buildSuggestions(totals);

  if (deficits.length === 0) {
    container.appendChild(createSuggestionMessage("今日は対象の栄養素がバランスよく摂れています。"));
    return;
  }

  for (const item of deficits) {
    const nutrient = nutrientByKey.get(item.key);
    const percent = Math.round(item.ratio * 100);
    const foods = findFoodSuggestions(item.key);

    const row = document.createElement("div");
    row.className = "suggestion-row";

    const dot = document.createElement("span");
    dot.className = "suggestion-dot";
    dot.style.setProperty("--dot", nutrient.color);
    row.appendChild(dot);

    const body = document.createElement("div");
    body.className = "suggestion-body";

    const lead = document.createElement("p");
    lead.className = "suggestion-lead";
    lead.textContent = foods.length
      ? `${nutrient.label}が目安の約${percent}%。次の食材を足すと近づきます。`
      : `${nutrient.label}が目安の約${percent}%。`;
    body.appendChild(lead);

    const foodsWrap = document.createElement("div");
    foodsWrap.className = "suggestion-foods";

    if (foods.length) {
      for (const food of foods) {
        const tag = document.createElement("span");
        tag.className = "suggestion-food";
        tag.style.setProperty("--swatch", food.color);
        tag.textContent = food.name;
        foodsWrap.appendChild(tag);
      }
    } else {
      const tag = document.createElement("span");
      tag.className = "suggestion-food suggestion-food-empty";
      tag.textContent = "候補食材は未導入のためなし";
      foodsWrap.appendChild(tag);
    }

    body.appendChild(foodsWrap);
    row.appendChild(body);
    container.appendChild(row);
  }
}

function renderTotals(totals, entries) {
  const ageTarget = getActiveAgeTarget();

  elements.totalsList.innerHTML = NUTRIENTS.map((nutrient) => {
    const value = totals[nutrient.key];
    const target = getTargetValue(nutrient.key);
    const percentage = Math.min((value / target) * 100, 120);
    const width = Math.min(percentage, 100);

    return `
      <div class="nutrient-row">
        <div class="nutrient-topline">
          <span class="nutrient-name">${nutrient.label}</span>
          <span class="nutrient-value">${formatValue(value, nutrient)} / 目安${formatValue(target, nutrient)}</span>
        </div>
        <div
          class="progress-track"
          role="progressbar"
          aria-label="${nutrient.label}"
          aria-valuemin="0"
          aria-valuemax="100"
          aria-valuenow="${Math.round(width)}"
        >
          <div class="progress-fill" style="width: ${width}%; --bar-color: ${nutrient.color}"></div>
        </div>
      </div>
    `;
  }).join("");

  if (entries.length === 0) {
    elements.mainBalance.textContent = "まだ記録がありません";
    elements.subBalance.textContent = `${ageTarget.label}（${ageTarget.note}）が離乳食から取りたい分の目安を表示中。食材を追加すると合計が更新されます。`;
    return;
  }

  const protein = totals.protein;
  const energy = totals.energy;
  elements.mainBalance.textContent = `${entries.length}品を集計中`;
  elements.subBalance.textContent = `${ageTarget.label}（${ageTarget.note}）の離乳食からの目安と比較中。エネルギー ${formatValue(energy, nutrientByKey.get("energy"))}、たんぱく質 ${formatValue(protein, nutrientByKey.get("protein"))}。`;
}

function renderQuickPicks() {
  elements.quickPicks.innerHTML = FOOD_MASTER.slice(0, 6)
    .map(
      (food) => `
        <button class="quick-pick" type="button" data-pick-food="${food.id}">
          <span class="swatch" style="--swatch: ${food.color}"></span>
          <span>${food.name}</span>
        </button>
      `,
    )
    .join("");

  elements.quickPicks.querySelectorAll("[data-pick-food]").forEach((button) => {
    button.addEventListener("click", () => {
      const food = foodById.get(button.dataset.pickFood);
      if (!food) return;
      fillNextBatchRow(food);
    });
  });
}

function renderLog(entries) {
  if (entries.length === 0) {
    elements.logList.innerHTML = `<div class="empty-state">今日の記録は空です</div>`;
    return;
  }

  elements.logList.innerHTML = entries
    .map((entry) => {
      const food = foodById.get(entry.foodId);
      const meal = MEALS.find((item) => item.id === entry.meal);
      const time = new Intl.DateTimeFormat("ja-JP", {
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(entry.createdAt));
      const energy = (food.per100.energy * entry.amount) / 100;
      const protein = (food.per100.protein * entry.amount) / 100;

      return `
        <article class="log-item">
          <div>
            <div class="log-title">
              <span>${food.name}</span>
              <span class="meal-badge">${meal?.label ?? ""}</span>
            </div>
            <div class="log-meta">${formatEntryAmount(entry)} / ${time} / ${formatValue(energy, nutrientByKey.get("energy"))} / ${formatValue(protein, nutrientByKey.get("protein"))}</div>
          </div>
          <button class="delete-button" type="button" data-remove-entry="${entry.id}">削除</button>
        </article>
      `;
    })
    .join("");
}

function renderMilk() {
  if (!elements.milkList || !elements.milkTotal) return;

  const feeds = milkStore.getTodayFeeds();
  const totalMl = feeds.reduce((sum, feed) => sum + feed.ml, 0);

  elements.milkTotal.textContent = String(totalMl);
  elements.milkList.replaceChildren();

  if (feeds.length === 0) {
    const empty = document.createElement("p");
    empty.className = "milk-empty";
    empty.textContent = "今日のミルクはまだ記録がありません。";
    elements.milkList.appendChild(empty);
    return;
  }

  for (const feed of feeds) {
    const row = document.createElement("div");
    row.className = "milk-item";

    const meta = document.createElement("span");
    meta.className = "milk-meta";
    const time = new Intl.DateTimeFormat("ja-JP", { hour: "2-digit", minute: "2-digit" }).format(
      new Date(feed.createdAt),
    );
    meta.textContent = `${time} / ${feed.ml}ml`;

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "delete-button";
    remove.textContent = "削除";
    remove.addEventListener("click", () => {
      milkStore.removeFeed(feed.id);
      render();
    });

    row.append(meta, remove);
    elements.milkList.appendChild(row);
  }

  const summary = document.createElement("p");
  summary.className = "milk-summary";
  summary.textContent = `推定: 約${formatValue(milkNutrient(totalMl, "energy"), nutrientByKey.get("energy"))} / たんぱく質${formatValue(milkNutrient(totalMl, "protein"), nutrientByKey.get("protein"))} / 鉄${formatValue(milkNutrient(totalMl, "iron"), nutrientByKey.get("iron"))} / カルシウム${formatValue(milkNutrient(totalMl, "calcium"), nutrientByKey.get("calcium"))}`;
  elements.milkList.appendChild(summary);
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
    renderMealTemplates();

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

    const addButton = document.createElement("button");
    addButton.type = "button";
    addButton.className = "master-add";
    addButton.addEventListener("click", () => fillNextBatchRow(food));

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

    addButton.append(nameRow, nutrients);
    main.appendChild(addButton);

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

function buildTrendData(entries) {
  const [year, month, day] = todayKey.split("-").map(Number);
  const today = new Date(year, month - 1, day);

  return Array.from({ length: 7 }, (_, index) => {
    const date = toDateKey(addDays(today, index - 6));
    const entriesForDate = entries.filter((entry) => entry.date === date);

    return {
      date,
      totals: calculateTotals(entriesForDate),
    };
  });
}

function renderTrendCharts(data) {
  const selected = NUTRIENTS.filter((nutrient) => selectedChartNutrients.has(nutrient.key));

  if (selected.length === 0) {
    elements.trendGrid.innerHTML = `<div class="empty-state">表示する栄養素を選んでください</div>`;
    return;
  }

  elements.trendGrid.innerHTML = selected
    .map((nutrient) => {
      const todayValue = data[data.length - 1]?.totals[nutrient.key] || 0;
      const target = getTargetValue(nutrient.key);

      return `
        <article class="trend-card">
          <div class="trend-card-head">
            <span class="trend-name" style="--trend-color: ${nutrient.color}">${nutrient.label}</span>
            <span class="trend-values">
              <strong>${formatValue(todayValue, nutrient)}</strong>
              <small>目安${formatValue(target, nutrient)}</small>
            </span>
          </div>
          <canvas
            class="trend-canvas"
            data-trend="${nutrient.key}"
            width="420"
            height="220"
            aria-label="${nutrient.label}の7日間推移"
          ></canvas>
        </article>
      `;
    })
    .join("");

  elements.trendGrid.querySelectorAll("[data-trend]").forEach((canvas) => {
    renderTrendChart(canvas, data, canvas.dataset.trend);
  });
}

function renderTrendChart(canvas, data, nutrientKey) {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(240, Math.floor(rect.width * dpr));
  const height = Math.max(160, Math.floor(rect.height * dpr));

  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);

  const cssWidth = width / dpr;
  const cssHeight = height / dpr;
  const nutrient = nutrientByKey.get(nutrientKey);
  const values = data.map((day) => day.totals[nutrientKey] || 0);
  const target = getTargetValue(nutrientKey);
  const maxValue = Math.max(target, ...values) * 1.18;
  const chart = {
    left: 58,
    right: 12,
    top: 18,
    bottom: 36,
  };
  chart.width = cssWidth - chart.left - chart.right;
  chart.height = cssHeight - chart.top - chart.bottom;

  ctx.clearRect(0, 0, cssWidth, cssHeight);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, cssWidth, cssHeight);

  drawGrid(ctx, chart, cssWidth, nutrient, maxValue, target);

  const barWidth = Math.max(12, chart.width / data.length - 12);
  const points = data.map((day, index) => {
    const x = chart.left + (chart.width / data.length) * index + chart.width / data.length / 2;
    const barHeight = (values[index] / maxValue) * chart.height;
    const y = chart.top + chart.height - barHeight;

    ctx.fillStyle = day.date === todayKey ? nutrient.color : "rgba(36, 120, 106, 0.28)";
    roundRect(ctx, x - barWidth / 2, y, barWidth, barHeight, 6);
    ctx.fill();

    const label = day.date === todayKey ? "今日" : formatShortDate(day.date);
    ctx.fillStyle = "#68746c";
    ctx.font = "12px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(label, x, chart.top + chart.height + 24);

    return { x, y };
  });

  ctx.beginPath();
  points.forEach((point, index) => {
    if (index === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  });
  ctx.strokeStyle = nutrient.color;
  ctx.lineWidth = 3;
  ctx.stroke();

  for (const point of points) {
    ctx.beginPath();
    ctx.arc(point.x, point.y, 4, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.strokeStyle = nutrient.color;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

function drawGrid(ctx, chart, cssWidth, nutrient, maxValue, target) {
  ctx.strokeStyle = "#e2e9e3";
  ctx.lineWidth = 1;
  ctx.fillStyle = "#68746c";
  ctx.font = "12px system-ui, sans-serif";
  ctx.textAlign = "right";

  for (let index = 0; index <= 3; index += 1) {
    const value = (maxValue / 3) * index;
    const y = chart.top + chart.height - (value / maxValue) * chart.height;
    ctx.beginPath();
    ctx.moveTo(chart.left, y);
    ctx.lineTo(cssWidth - chart.right, y);
    ctx.stroke();
    ctx.fillText(formatValue(value, nutrient), chart.left - 8, y + 4);
  }

  const targetY = chart.top + chart.height - (target / maxValue) * chart.height;
  ctx.setLineDash([5, 5]);
  ctx.strokeStyle = "rgba(218, 111, 80, 0.48)";
  ctx.beginPath();
  ctx.moveTo(chart.left, targetY);
  ctx.lineTo(cssWidth - chart.right, targetY);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = "#b65d43";
  ctx.font = "11px system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("目安ライン", chart.left + 5, Math.max(chart.top + 12, targetY - 6));
}

function formatShortDate(dateKey) {
  const [, month, day] = dateKey.split("-");
  return `${Number(month)}/${Number(day)}`;
}

function renderPlate(entries) {
  const canvas = elements.plateCanvas;
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(320, Math.floor(rect.width * dpr));
  const height = Math.max(150, Math.floor(rect.height * dpr));

  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);

  const cssWidth = width / dpr;
  const cssHeight = height / dpr;
  ctx.clearRect(0, 0, cssWidth, cssHeight);

  const gradient = ctx.createLinearGradient(0, 0, cssWidth, cssHeight);
  gradient.addColorStop(0, "#fafdf8");
  gradient.addColorStop(1, "#eef6f2");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, cssWidth, cssHeight);

  const centerX = cssWidth * 0.52;
  const centerY = cssHeight * 0.55;
  const bowlWidth = cssWidth * 0.62;
  const bowlHeight = cssHeight * 0.46;

  ctx.fillStyle = "rgba(32, 39, 34, 0.08)";
  ctx.beginPath();
  ctx.ellipse(centerX, centerY + bowlHeight * 0.35, bowlWidth * 0.45, bowlHeight * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "#dce4dd";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(centerX, centerY, bowlWidth * 0.48, bowlHeight * 0.45, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  const visibleFoods = entries.slice(0, 9);
  const radiusBase = Math.min(cssWidth, cssHeight) * 0.055;

  visibleFoods.forEach((entry, index) => {
    const food = foodById.get(entry.foodId);
    if (!food) return;

    const angle = (Math.PI * 2 * index) / Math.max(visibleFoods.length, 5);
    const spreadX = Math.cos(angle) * bowlWidth * 0.18;
    const spreadY = Math.sin(angle) * bowlHeight * 0.16;
    const radius = radiusBase + Math.min(entry.amount, 70) * 0.08;

    ctx.fillStyle = food.color;
    ctx.strokeStyle = "rgba(32, 39, 34, 0.12)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(centerX + spreadX, centerY + spreadY, radius * 1.25, radius, angle * 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  });

  ctx.fillStyle = "#202722";
  ctx.font = "700 14px system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("今日の器", 18, 30);

  ctx.fillStyle = "#68746c";
  ctx.font = "12px system-ui, sans-serif";
  ctx.fillText(entries.length > 0 ? `${entries.length}品の食材` : "未記録", 18, 50);
}

function roundRect(ctx, x, y, width, height, radius) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + safeRadius, y);
  ctx.arcTo(x + width, y, x + width, y + height, safeRadius);
  ctx.arcTo(x + width, y + height, x, y + height, safeRadius);
  ctx.arcTo(x, y + height, x, y, safeRadius);
  ctx.arcTo(x, y, x + width, y, safeRadius);
  ctx.closePath();
}

init();
