const NUTRIENTS = [
  { key: "energy", label: "エネルギー", unit: "kcal", target: 450, color: "#da6f50", decimals: 0 },
  { key: "protein", label: "たんぱく質", unit: "g", target: 15, color: "#24786a", decimals: 1 },
  { key: "fat", label: "脂質", unit: "g", target: 18, color: "#d99f32", decimals: 1 },
  { key: "carbs", label: "炭水化物", unit: "g", target: 65, color: "#657fb4", decimals: 1 },
  { key: "iron", label: "鉄", unit: "mg", target: 5, color: "#8b6ba8", decimals: 1 },
  { key: "calcium", label: "カルシウム", unit: "mg", target: 250, color: "#7e9b51", decimals: 0 },
];

const foodById = new Map(FOOD_MASTER.map((food) => [food.id, food]));
const nutrientByKey = new Map(NUTRIENTS.map((nutrient) => [nutrient.key, nutrient]));
const ageTargetById = new Map(AGE_TARGETS.map((target) => [target.id, target]));

function calculateTotals(entries) {
  const totals = Object.fromEntries(NUTRIENTS.map((nutrient) => [nutrient.key, 0]));

  for (const entry of entries) {
    const food = foodById.get(entry.foodId);
    if (!food) continue;

    for (const nutrient of NUTRIENTS) {
      totals[nutrient.key] += (food.per100[nutrient.key] * entry.amount) / 100;
    }
  }

  return totals;
}

function formatValue(value, nutrient) {
  const decimals = nutrient?.decimals ?? 1;
  const rounded = Number(value || 0).toFixed(decimals);
  return `${rounded.replace(/\.0$/, "")}${nutrient?.unit ? nutrient.unit : ""}`;
}

// 使用中の育児用ミルク。製品を変えるときは per100g と powderRatio を差し替えるだけでよい
// （表示名は index.html のミルク説明文にJSから差し込まれる）。
// powderRatio = 粉の重量 ÷ 出来上がり量。はぐくみの標準調乳は すりきり1さじ2.6g → 20mL なので 0.13。
const MILK_PRODUCT = {
  name: "森永はぐくみ",
  per100g: { energy: 512, protein: 10.5, fat: 27.0, carbs: 57.5, iron: 6.0, calcium: 380 },
  powderRatio: 0.13,
  url: "https://www.morinagamilk.co.jp/products/babyfood/hagukumi/305.html",
  referencedAt: "2026-07-22",
};

// 出来上がり100mLあたりの栄養（粉100gあたりの表示値 × 調乳濃度）。
const MILK_PER_100ML = Object.fromEntries(
  Object.entries(MILK_PRODUCT.per100g).map(([key, value]) => [key, value * MILK_PRODUCT.powderRatio]),
);

function milkNutrient(totalMl, nutrientKey) {
  return (MILK_PER_100ML[nutrientKey] * totalMl) / 100;
}

// ミルク量(ml)を栄養素の合計に変換する。
function calculateMilkTotals(totalMl) {
  return Object.fromEntries(NUTRIENTS.map((nutrient) => [nutrient.key, milkNutrient(totalMl, nutrient.key)]));
}

// 離乳食とミルクの合計。目安ラインは1日の総摂取量に対する値なので、
// 充足率の判定にはこの合計を使う。
function combineTotals(...totalsList) {
  return Object.fromEntries(
    NUTRIENTS.map((nutrient) => [
      nutrient.key,
      totalsList.reduce((sum, totals) => sum + (totals?.[nutrient.key] ?? 0), 0),
    ]),
  );
}
