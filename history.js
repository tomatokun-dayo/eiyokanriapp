// 履歴ページ。週／月の期間を選び、その期間の1日平均・日ごとの推移・よく食べた食材を見る。
//
// 集計の考え方（logic/history.js と揃えている）:
//   - 目安ラインは「1日の総摂取量」なので、ミルクを合流させた合計で比較する
//   - 平均は記録がある日だけで割る。母数（記録◯日）を必ず画面に出す
//   - 目安は「いま選んでいる月齢」の値。過去の月齢に遡って切り替えたりはしない（生年月日を持たないため）

const elements = {
  todayLabel: document.querySelector("#today-label"),
  ageStage: document.querySelector("#age-stage"),
  periodTypeOptions: document.querySelector("#period-type-options"),
  periodPrev: document.querySelector("#period-prev"),
  periodNext: document.querySelector("#period-next"),
  periodLabel: document.querySelector("#period-label"),
  periodRelation: document.querySelector("#period-relation"),
  periodStats: document.querySelector("#period-stats"),
  periodMessage: document.querySelector("#period-message"),
  periodNote: document.querySelector("#period-note"),
  recordedDays: document.querySelector("#recorded-days"),
  averagesList: document.querySelector("#averages-list"),
  chartNutrients: document.querySelector("#chart-nutrients"),
  trendGrid: document.querySelector("#history-trend-grid"),
  foodRanking: document.querySelector("#food-ranking"),
  periodList: document.querySelector("#period-list"),
  syncBar: document.querySelector("#sync-bar"),
  syncBarButton: document.querySelector("#sync-bar-button"),
  syncBarIcon: document.querySelector("#sync-bar-icon"),
  syncBarLabel: document.querySelector("#sync-bar-label"),
  syncBarStatus: document.querySelector("#sync-bar-status"),
};

const CONTRIBUTOR_LIMIT = 6;
const RANKING_LIMIT = 12;

let selectedChartNutrients = new Set(["energy", "protein", "iron", "calcium"]);
let selectedAgeTargetId = settingsStore.getAgeTargetId("6-8");
let periodType = "week";
let selectedAnchorKey = null;
// 内訳の開閉は再描画をまたいで保持する（記録ページの栄養素行と同じ挙動）。
const expandedNutrients = new Set();

function init() {
  applyStoredFoodStates();
  renderControls();
  bindEvents();
  render();
  initSyncBar();
}

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

function getActiveAgeTarget() {
  return ageTargetById.get(selectedAgeTargetId) ?? ageTargetById.get("6-8");
}

function getTargetValue(nutrientKey) {
  const ageTarget = getActiveAgeTarget();
  return ageTarget.targets[nutrientKey] ?? nutrientByKey.get(nutrientKey)?.target ?? 0;
}

function renderControls() {
  elements.ageStage.replaceChildren();
  for (const target of AGE_TARGETS) {
    const option = document.createElement("option");
    option.value = target.id;
    option.textContent = target.label;
    option.selected = target.id === selectedAgeTargetId;
    elements.ageStage.appendChild(option);
  }

  elements.periodTypeOptions.replaceChildren();
  for (const type of HISTORY_PERIOD_TYPES) {
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "radio";
    input.name = "period-type";
    input.value = type.id;
    input.checked = type.id === periodType;
    const text = document.createElement("span");
    text.textContent = `${type.label}ごと`;
    label.append(input, text);
    elements.periodTypeOptions.appendChild(label);
  }

  elements.chartNutrients.replaceChildren();
  for (const nutrient of NUTRIENTS) {
    const label = document.createElement("label");
    label.className = "nutrient-toggle";
    label.style.setProperty("--toggle-color", nutrient.color);
    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = nutrient.key;
    input.checked = selectedChartNutrients.has(nutrient.key);
    const text = document.createElement("span");
    text.textContent = nutrient.label;
    label.append(input, text);
    elements.chartNutrients.appendChild(label);
  }
}

function bindEvents() {
  elements.ageStage.addEventListener("change", () => {
    selectedAgeTargetId = elements.ageStage.value;
    settingsStore.setAgeTargetId(selectedAgeTargetId);
    render();
  });

  elements.periodTypeOptions.addEventListener("change", (event) => {
    const value = event.target.value;
    if (!HISTORY_PERIOD_TYPES.some((type) => type.id === value)) return;
    // 見ていた日付の近くに留まるよう、いまの期間を新しい単位で読み替える。
    selectedAnchorKey = periodAnchorOf(value, selectedAnchorKey ?? todayKey);
    periodType = value;
    render();
  });

  elements.periodPrev.addEventListener("click", () => stepPeriod(-1));
  elements.periodNext.addEventListener("click", () => stepPeriod(1));

  elements.chartNutrients.addEventListener("change", (event) => {
    const key = event.target.value;
    if (event.target.checked) selectedChartNutrients.add(key);
    else selectedChartNutrients.delete(key);
    render();
  });

  window.addEventListener("resize", () => renderTrend(buildCurrentDays()));

  // 日付が変わったら「今週／今月」の位置がずれるので開き直したときに合わせ直す。
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && todayKey !== toDateKey(new Date())) render();
  });
}

function stepPeriod(delta) {
  selectedAnchorKey = shiftPeriod(periodType, selectedAnchorKey ?? todayKey, delta);
  render();
}

function buildCurrentDays() {
  const anchor = selectedAnchorKey ?? periodAnchorOf(periodType, todayKey);
  return elapsedDaysOf(
    buildDailySummaries(periodDateKeys(periodType, anchor), memoryStore.getAllEntries(), milkStore.getAllFeeds()),
  );
}

// 進行中の期間では、まだ来ていない日を落とす。
// 未来の日は「摂取0の日」ではないので、グラフでは谷に、母数では未記録日に見えてしまう。
function elapsedDaysOf(days) {
  return days.filter((day) => day.date <= todayKey);
}

// sync.js は受信した変更をこの render() で画面に反映する（記録・食材ページと同じ約束）。
function render() {
  syncToday();

  const entries = memoryStore.getAllEntries();
  const feeds = milkStore.getAllFeeds();
  const oldestRecordKey = findOldestRecordDate(entries, feeds);
  const currentAnchor = periodAnchorOf(periodType, todayKey);

  if (!selectedAnchorKey) selectedAnchorKey = currentAnchor;
  // 未来の期間は見せない（記録が入りようがないため）。
  if (selectedAnchorKey > currentAnchor) selectedAnchorKey = currentAnchor;

  const days = elapsedDaysOf(buildDailySummaries(periodDateKeys(periodType, selectedAnchorKey), entries, feeds));
  const summary = summarizePeriod(days, getActiveAgeTarget().targets);

  renderPeriodHeader(currentAnchor, oldestRecordKey);
  renderPeriodSummary(summary);
  renderAverages(summary, days);
  renderTrend(days);
  renderRanking(days);
  renderPeriodList(entries, feeds, currentAnchor, oldestRecordKey);
}

function renderPeriodHeader(currentAnchor, oldestRecordKey) {
  elements.periodLabel.textContent = formatPeriodLabel(periodType, selectedAnchorKey);
  elements.periodRelation.textContent = formatPeriodRelation(periodType, selectedAnchorKey, todayKey);

  const oldestAnchor = periodAnchorOf(periodType, oldestRecordKey || todayKey);
  elements.periodPrev.disabled = selectedAnchorKey <= oldestAnchor;
  elements.periodNext.disabled = selectedAnchorKey >= currentAnchor;
}

function renderPeriodSummary(summary) {
  const percentOf = (key) => {
    const target = getTargetValue(key);
    if (target <= 0) return 0;
    return Math.round(((summary.averageTotals[key] ?? 0) / target) * 100);
  };

  const stats = [
    { label: "記録した日", value: `${summary.recordedDays}/${summary.totalDays}日` },
    { label: "エネルギー", value: `${percentOf("energy")}%` },
    { label: "鉄", value: `${percentOf("iron")}%` },
    { label: "ミルク", value: `${Math.round(summary.averageMilkMl)}ml` },
  ];

  elements.periodStats.replaceChildren();
  for (const stat of stats) {
    const item = document.createElement("div");
    item.className = "summary-stat";
    const value = document.createElement("strong");
    value.textContent = stat.value;
    const label = document.createElement("span");
    label.textContent = stat.label;
    item.append(value, label);
    elements.periodStats.appendChild(item);
  }

  elements.recordedDays.textContent = String(summary.recordedDays);

  if (summary.recordedDays === 0) {
    elements.periodMessage.textContent = "この期間の記録はまだありません。";
    elements.periodNote.textContent = "";
    return;
  }

  // 平均が目安から最も遠い栄養素を一つだけ挙げる（並べても選べないため）。
  const lowest = NUTRIENTS.map((nutrient) => {
    const target = getTargetValue(nutrient.key);
    return { nutrient, ratio: target > 0 ? (summary.averageTotals[nutrient.key] ?? 0) / target : 1 };
  }).sort((a, b) => a.ratio - b.ratio)[0];

  elements.periodMessage.textContent =
    lowest && lowest.ratio < 1
      ? `平均で目安に届いていないのは${lowest.nutrient.label}（${Math.round(lowest.ratio * 100)}%）です。`
      : "平均ではどの栄養素も目安に届いています。";

  const ageTarget = getActiveAgeTarget();
  elements.periodNote.textContent = `${summary.entryCount}品を記録。％は${ageTarget.label}（${ageTarget.note}）の1日の目安に対する、ミルク込みの1日平均の割合です。`;
}

function renderAverages(summary, days) {
  for (const row of elements.averagesList.querySelectorAll("[data-nutrient]")) {
    if (row.open) expandedNutrients.add(row.dataset.nutrient);
    else expandedNutrients.delete(row.dataset.nutrient);
  }

  const periodEntries = days.flatMap((day) => day.entries);
  const periodMilkMl = days.reduce((total, day) => total + day.milkMl, 0);
  const divisor = summary.recordedDays || 1;

  elements.averagesList.replaceChildren();
  for (const nutrient of NUTRIENTS) {
    const value = summary.averageTotals[nutrient.key] ?? 0;
    const foodValue = summary.averageFoodTotals[nutrient.key] ?? 0;
    const target = getTargetValue(nutrient.key);
    const ratio = target > 0 ? value / target : 0;

    const row = document.createElement("details");
    row.className = "nutrient-row";
    row.dataset.nutrient = nutrient.key;
    row.open = expandedNutrients.has(nutrient.key);

    const summaryLine = document.createElement("summary");
    summaryLine.className = "nutrient-summary";

    const topline = document.createElement("div");
    topline.className = "nutrient-topline";
    const name = document.createElement("span");
    name.className = "nutrient-name";
    name.textContent = nutrient.label;
    const valueLabel = document.createElement("span");
    valueLabel.className = "nutrient-value";
    valueLabel.textContent = `${formatValue(value, nutrient)}/日 / 目安${formatValue(target, nutrient)}${ratio >= 1 ? " ✓" : ""}`;
    topline.append(name, valueLabel);

    const track = document.createElement("div");
    track.className = "progress-track";
    track.setAttribute("role", "progressbar");
    track.setAttribute("aria-label", `${nutrient.label}の1日平均`);
    track.setAttribute("aria-valuemin", "0");
    track.setAttribute("aria-valuemax", "100");
    const width = Math.min(ratio * 100, 100);
    track.setAttribute("aria-valuenow", String(Math.round(width)));
    const fill = document.createElement("div");
    fill.className = "progress-fill";
    fill.style.setProperty("width", `${width}%`);
    fill.style.setProperty("--bar-color", nutrient.color);
    track.appendChild(fill);

    const breakdown = document.createElement("p");
    breakdown.className = "nutrient-breakdown";
    const foodShare = value > 0 ? Math.round((foodValue / value) * 100) : 0;
    breakdown.textContent = `うち離乳食 ${formatValue(foodValue, nutrient)}（${foodShare}%）・目安に届いた日 ${summary.metDays[nutrient.key] ?? 0}/${summary.recordedDays}日`;

    summaryLine.append(topline, track, breakdown);

    const contributors = document.createElement("div");
    contributors.className = "nutrient-contributors";
    renderContributors(contributors, nutrient, periodEntries, periodMilkMl, divisor, value);

    row.append(summaryLine, contributors);
    elements.averagesList.appendChild(row);
  }
}

// 内訳も1日平均に揃える（行の値と足し算が合わないと読み手が混乱するため）。
function renderContributors(container, nutrient, entries, milkMl, divisor, average) {
  container.replaceChildren();

  const contributors = getNutrientContributors(nutrient.key, entries, milkMl).map((item) => ({
    label: item.label,
    value: item.value / divisor,
  }));

  if (contributors.length === 0) {
    const empty = document.createElement("p");
    empty.className = "contributor-empty";
    empty.textContent = "この期間の記録がありません。";
    container.appendChild(empty);
    return;
  }

  const shown = contributors.slice(0, CONTRIBUTOR_LIMIT);
  const rest = contributors.slice(CONTRIBUTOR_LIMIT);

  for (const item of shown) {
    const line = document.createElement("div");
    line.className = "contributor-item";
    const label = document.createElement("span");
    label.className = "contributor-label";
    label.textContent = item.label;
    const value = document.createElement("span");
    value.className = "contributor-value";
    const share = average > 0 ? Math.round((item.value / average) * 100) : 0;
    value.textContent = `${formatValue(item.value, nutrient)}（${share}%）`;
    line.append(label, value);
    container.appendChild(line);
  }

  if (rest.length > 0) {
    const restValue = rest.reduce((sum, item) => sum + item.value, 0);
    const line = document.createElement("div");
    line.className = "contributor-item contributor-rest";
    const label = document.createElement("span");
    label.className = "contributor-label";
    label.textContent = `ほか${rest.length}品`;
    const value = document.createElement("span");
    value.className = "contributor-value";
    value.textContent = formatValue(restValue, nutrient);
    line.append(label, value);
    container.appendChild(line);
  }
}

function renderTrend(days) {
  const selected = NUTRIENTS.filter((nutrient) => selectedChartNutrients.has(nutrient.key));

  elements.trendGrid.replaceChildren();
  if (selected.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "表示する栄養素を選んでください";
    elements.trendGrid.appendChild(empty);
    return;
  }

  const recordedDays = days.filter((day) => day.recorded).length || 1;

  for (const nutrient of selected) {
    const values = days.map((day) => day.totals[nutrient.key] || 0);
    const average = values.reduce((sum, value) => sum + value, 0) / recordedDays;
    const target = getTargetValue(nutrient.key);

    const card = document.createElement("article");
    card.className = "trend-card";

    const head = document.createElement("div");
    head.className = "trend-card-head";
    const name = document.createElement("span");
    name.className = "trend-name";
    name.style.setProperty("--trend-color", nutrient.color);
    name.textContent = nutrient.label;
    const valueBox = document.createElement("span");
    valueBox.className = "trend-values";
    const strong = document.createElement("strong");
    strong.textContent = `平均${formatValue(average, nutrient)}`;
    const small = document.createElement("small");
    small.textContent = `目安${formatValue(target, nutrient)}`;
    valueBox.append(strong, small);
    head.append(name, valueBox);

    const canvas = document.createElement("canvas");
    canvas.className = "trend-canvas";
    canvas.width = 420;
    canvas.height = 220;
    canvas.setAttribute("aria-label", `${nutrient.label}の日ごとの推移`);

    card.append(head, canvas);
    elements.trendGrid.appendChild(card);

    drawDailyBarChart(canvas, {
      values,
      labels: days.map((day) => formatShortDate(day.date)),
      nutrient,
      target,
      highlightIndex: days.findIndex((day) => day.date === todayKey),
    });
  }
}

function renderRanking(days) {
  const ranking = buildFoodRanking(days);

  elements.foodRanking.replaceChildren();
  if (ranking.length === 0) {
    const empty = document.createElement("p");
    empty.className = "contributor-empty";
    empty.textContent = "この期間はまだ離乳食の記録がありません。";
    elements.foodRanking.appendChild(empty);
    return;
  }

  for (const item of ranking.slice(0, RANKING_LIMIT)) {
    const row = document.createElement("div");
    row.className = "ranking-item";

    const swatch = document.createElement("span");
    swatch.className = "swatch";
    swatch.style.setProperty("--swatch", item.color || "#24786a");

    const name = document.createElement("span");
    name.className = "ranking-name";
    name.textContent = item.name;

    const detail = document.createElement("span");
    detail.className = "ranking-detail";
    detail.textContent = `${item.days}日・${item.count}回・${Math.round(item.grams)}g`;

    row.append(swatch, name, detail);
    elements.foodRanking.appendChild(row);
  }

  if (ranking.length > RANKING_LIMIT) {
    const rest = document.createElement("p");
    rest.className = "contributor-empty";
    rest.textContent = `ほか${ranking.length - RANKING_LIMIT}品`;
    elements.foodRanking.appendChild(rest);
  }
}

function renderPeriodList(entries, feeds, currentAnchor, oldestRecordKey) {
  const anchors = listPeriodAnchors(periodType, oldestRecordKey, todayKey);
  const energy = nutrientByKey.get("energy");
  const energyTarget = getTargetValue("energy");

  elements.periodList.replaceChildren();
  for (const anchor of anchors) {
    const days = elapsedDaysOf(buildDailySummaries(periodDateKeys(periodType, anchor), entries, feeds));
    const summary = summarizePeriod(days, getActiveAgeTarget().targets);

    const button = document.createElement("button");
    button.type = "button";
    button.className = "period-item";
    if (anchor === selectedAnchorKey) button.setAttribute("aria-current", "true");

    const label = document.createElement("span");
    label.className = "period-item-label";
    const relation = formatPeriodRelation(periodType, anchor, todayKey);
    label.textContent = relation
      ? `${formatPeriodLabel(periodType, anchor)}（${relation}）`
      : formatPeriodLabel(periodType, anchor);

    const detail = document.createElement("span");
    detail.className = "period-item-detail";
    if (summary.recordedDays === 0) {
      detail.textContent = "記録なし";
    } else {
      const percent =
        energyTarget > 0 ? Math.round(((summary.averageTotals.energy ?? 0) / energyTarget) * 100) : 0;
      detail.textContent = `記録${summary.recordedDays}日・平均${formatValue(summary.averageTotals.energy ?? 0, energy)}（${percent}%）`;
    }

    button.append(label, detail);
    button.addEventListener("click", () => {
      selectedAnchorKey = anchor;
      render();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
    elements.periodList.appendChild(button);
  }

  if (anchors.length === 1 && anchors[0] === currentAnchor && !oldestRecordKey) {
    const note = document.createElement("p");
    note.className = "contributor-empty";
    note.textContent = "記録が増えると、ここに過去の期間が並びます。";
    elements.periodList.appendChild(note);
  }
}

// 記録ページと同じ同期バー（Supabase接続情報がある場合のみ表示）。
function initSyncBar() {
  if (!window.EiyoSync || !EiyoSync.CONFIGURED || !elements.syncBar) return;

  EiyoSync.init();
  elements.syncBar.hidden = false;

  let loggedIn = false;
  elements.syncBarButton.addEventListener("click", () => {
    if (loggedIn) EiyoSync.syncNow();
    else EiyoSync.signIn();
  });

  EiyoSync.onAuth((user) => {
    loggedIn = Boolean(user);
    elements.syncBar.dataset.mode = loggedIn ? "status" : "login";
    elements.syncBarLabel.textContent = loggedIn ? "再同期" : "ログイン";
    elements.syncBarButton.title = loggedIn ? "手動で同期し直す（通常は自動で同期されます）" : "";
    elements.syncBarIcon.textContent = loggedIn ? "" : "🔄";
    elements.syncBarIcon.classList.toggle("sync-bar-dot", loggedIn);
  });

  EiyoSync.onStatus((status) => {
    elements.syncBarStatus.textContent = status.message || "";
    if (status.state) {
      elements.syncBarStatus.dataset.state = status.state;
      elements.syncBar.dataset.state = status.state;
    }
  });
}

init();
