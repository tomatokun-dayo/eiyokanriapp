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

// 文部科学省 食品成分データベース foodNo 13011「乳児用調製粉乳」(100gあたり)を13%調乳（粉13g/出来上がり100ml）で換算。参照日: 2026-07-03。
// https://fooddb.mext.go.jp/details/details.pl?ITEM_NO=13_13011_7
// 製品により差があるため、パッケージ表示を優先。
const MILK_PER_100ML = { energy: 66, protein: 1.6, fat: 3.5, carbs: 7.3, iron: 0.8, calcium: 48 };

function milkNutrient(totalMl, nutrientKey) {
  return (MILK_PER_100ML[nutrientKey] * totalMl) / 100;
}
