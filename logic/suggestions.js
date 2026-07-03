const SUGGESTION_NUTRIENT_KEYS = ["energy", "protein", "iron", "calcium"];
const SUGGESTION_THRESHOLD = 0.7;
const SUGGESTION_EXCLUDED_STATES = new Set(["not_introduced", "avoid"]);

function buildSuggestions(totals) {
  return SUGGESTION_NUTRIENT_KEYS.map((key) => {
    const target = getTargetValue(key);
    const value = totals[key] ?? 0;
    const ratio = target > 0 ? value / target : 1;
    return { key, ratio, target };
  })
    .filter((item) => item.target > 0 && item.ratio < SUGGESTION_THRESHOLD)
    .sort((a, b) => a.ratio - b.ratio)
    .slice(0, 3);
}

function findFoodSuggestions(nutrientKey) {
  return FOOD_MASTER.filter(
    (food) => !SUGGESTION_EXCLUDED_STATES.has(food.state) && (food.per100[nutrientKey] ?? 0) > 0,
  )
    .sort((a, b) => b.per100[nutrientKey] - a.per100[nutrientKey])
    .slice(0, 3);
}
