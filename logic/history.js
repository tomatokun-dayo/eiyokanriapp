// 週・月ごとの履歴集計。DOMには触れない純関数のみ（Nodeで単体検証できる形を保つ）。
//
// 用語:
//   anchor  … 期間の代表日（週=その週の月曜 / 月=その月の1日）。期間の識別子として使う
//   recorded… その日に離乳食かミルクのどちらかの記録がある状態
//
// 平均の取り方: 記録がある日だけで割る（未記録日を0として薄めない）。
// 「記録3日の平均」なのか「7日の平均」なのかで意味が変わるため、UI側で母数を必ず併記する。
//
// 依存: toDateKey / addDays（store.js）、
//       NUTRIENTS / foodById / calculateTotals / calculateMilkTotals / combineTotals（logic/nutrition.js）

const HISTORY_PERIOD_TYPES = [
  { id: "week", label: "週" },
  { id: "month", label: "月" },
];

// 期間一覧の安全弁（週=約4年、月=約8年）。壊れた日付が入っても無限ループしない。
const HISTORY_PERIOD_LIMIT = { week: 208, month: 96 };

// "2026-08-20" → ローカル時刻0時の Date。new Date(文字列) はUTC解釈になるため使わない。
function parseDateKey(dateKey) {
  const [year, month, day] = String(dateKey).split("-").map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

// 週は月曜始まり。土日の記録がひとつの週に収まるようにするため。
function startOfWeek(date) {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const mondayBased = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - mondayBased);
  return start;
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

// その日が属する期間の anchor を返す。
function periodAnchorOf(type, dateKey) {
  const date = parseDateKey(dateKey);
  return toDateKey(type === "month" ? startOfMonth(date) : startOfWeek(date));
}

// 前後の期間へ移動する（delta は期間数。負で過去）。
function shiftPeriod(type, anchorKey, delta) {
  const anchor = parseDateKey(anchorKey);
  if (type === "month") {
    return toDateKey(new Date(anchor.getFullYear(), anchor.getMonth() + delta, 1));
  }
  return toDateKey(addDays(anchor, delta * 7));
}

// 期間に含まれる日付キー（週=7日 / 月=その月の日数）。
function periodDateKeys(type, anchorKey) {
  const anchor = parseDateKey(anchorKey);
  const length =
    type === "month" ? new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0).getDate() : 7;
  return Array.from({ length }, (_, index) => toDateKey(addDays(anchor, index)));
}

function formatPeriodLabel(type, anchorKey) {
  const anchor = parseDateKey(anchorKey);
  if (type === "month") return `${anchor.getFullYear()}年${anchor.getMonth() + 1}月`;

  const end = addDays(anchor, 6);
  return `${anchor.getMonth() + 1}/${anchor.getDate()}〜${end.getMonth() + 1}/${end.getDate()}`;
}

// 「今週」「先週」など、いま見ている期間の位置が分かる短い補足。
function formatPeriodRelation(type, anchorKey, baseDateKey) {
  const current = periodAnchorOf(type, baseDateKey);
  if (anchorKey === current) return type === "month" ? "今月" : "今週";
  if (anchorKey === shiftPeriod(type, current, -1)) return type === "month" ? "先月" : "先週";
  // 週のラベル（8/17〜8/23）には年が入らないので、年をまたいだときだけ添える。
  if (type === "week") {
    const year = parseDateKey(anchorKey).getFullYear();
    return year === parseDateKey(baseDateKey).getFullYear() ? "" : `${year}年`;
  }
  return "";
}

// 記録の最も古い日から今日までの期間 anchor を新しい順に返す。
// 記録が1件も無ければ今の期間だけを返す。
function listPeriodAnchors(type, oldestDateKey, baseDateKey) {
  const newest = periodAnchorOf(type, baseDateKey);
  const oldest = periodAnchorOf(type, oldestDateKey || baseDateKey);
  const limit = HISTORY_PERIOD_LIMIT[type] ?? 52;
  const anchors = [];

  let cursor = newest;
  while (anchors.length < limit) {
    anchors.push(cursor);
    if (cursor <= oldest) break;
    cursor = shiftPeriod(type, cursor, -1);
  }
  return anchors;
}

// 記録・ミルクの中で最も古い日付キー（無ければ null）。
function findOldestRecordDate(entries, feeds) {
  let oldest = null;
  for (const item of [...entries, ...feeds]) {
    if (!item || !item.date) continue;
    if (oldest === null || item.date < oldest) oldest = item.date;
  }
  return oldest;
}

// 日ごとの集計。entries / feeds は全期間分を渡してよい（ここで日付で絞る）。
function buildDailySummaries(dateKeys, entries, feeds) {
  const entriesByDate = new Map();
  for (const entry of entries) {
    const list = entriesByDate.get(entry.date);
    if (list) list.push(entry);
    else entriesByDate.set(entry.date, [entry]);
  }

  const milkByDate = new Map();
  for (const feed of feeds) {
    milkByDate.set(feed.date, (milkByDate.get(feed.date) ?? 0) + feed.ml);
  }

  return dateKeys.map((date) => {
    const dayEntries = entriesByDate.get(date) ?? [];
    const milkMl = milkByDate.get(date) ?? 0;
    const foodTotals = calculateTotals(dayEntries);

    return {
      date,
      entries: dayEntries,
      milkMl,
      foodTotals,
      // 目安ラインは1日の総摂取量に対する値なので、ミルクを合流させた合計で評価する。
      totals: combineTotals(foodTotals, calculateMilkTotals(milkMl)),
      recorded: dayEntries.length > 0 || milkMl > 0,
    };
  });
}

// 期間のまとめ。targets は月齢別の1日の目安（{energy: 625, ...}）。
function summarizePeriod(days, targets) {
  const recorded = days.filter((day) => day.recorded);
  const divisor = recorded.length || 1;

  const sum = combineTotals(...recorded.map((day) => day.totals));
  const foodSum = combineTotals(...recorded.map((day) => day.foodTotals));
  const averageTotals = {};
  const averageFoodTotals = {};
  const metDays = {};

  for (const nutrient of NUTRIENTS) {
    averageTotals[nutrient.key] = (sum[nutrient.key] ?? 0) / divisor;
    averageFoodTotals[nutrient.key] = (foodSum[nutrient.key] ?? 0) / divisor;

    const target = targets?.[nutrient.key] ?? 0;
    metDays[nutrient.key] =
      target > 0 ? recorded.filter((day) => (day.totals[nutrient.key] ?? 0) >= target).length : 0;
  }

  return {
    recordedDays: recorded.length,
    totalDays: days.length,
    entryCount: recorded.reduce((count, day) => count + day.entries.length, 0),
    milkTotalMl: recorded.reduce((total, day) => total + day.milkMl, 0),
    averageMilkMl: recorded.reduce((total, day) => total + day.milkMl, 0) / divisor,
    averageTotals,
    averageFoodTotals,
    metDays,
  };
}

// 期間中によく食べた食材。「何日食べたか」を主、回数と累計量を従にして並べる。
function buildFoodRanking(days) {
  const byFood = new Map();

  for (const day of days) {
    const seenToday = new Set();
    for (const entry of day.entries) {
      const food = foodById.get(entry.foodId);
      if (!food) continue;

      let item = byFood.get(entry.foodId);
      if (!item) {
        item = { foodId: entry.foodId, name: food.name, color: food.color, days: 0, count: 0, grams: 0 };
        byFood.set(entry.foodId, item);
      }
      item.count += 1;
      item.grams += entry.amount;
      if (!seenToday.has(entry.foodId)) {
        item.days += 1;
        seenToday.add(entry.foodId);
      }
    }
  }

  return [...byFood.values()].sort((a, b) => b.days - a.days || b.count - a.count || b.grams - a.grams);
}
