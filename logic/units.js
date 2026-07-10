const AMOUNT_UNITS = [
  { key: "g", label: "g", grams: 1, min: "1", step: "1", max: "200" },
  { key: "tsp", label: "小さじ", grams: 5, min: "0.5", step: "0.5", max: "20" },
  { key: "tbsp", label: "大さじ", grams: 15, min: "0.5", step: "0.5", max: "10" },
];

const unitByKey = new Map(AMOUNT_UNITS.map((unit) => [unit.key, unit]));

function gramsPerUnit(unitKey, food) {
  const unit = unitByKey.get(unitKey) ?? unitByKey.get("g");
  if (unit.key !== "g") {
    const perSpoon = food?.spoonGrams?.[unit.key];
    if (Number.isFinite(perSpoon) && perSpoon > 0) {
      return perSpoon;
    }
  }
  return unit.grams;
}

function amountToGrams(amount, unitKey, food) {
  return amount * gramsPerUnit(unitKey, food);
}

function formatPlainNumber(value) {
  return Number(value || 0)
    .toFixed(1)
    .replace(/\.0$/, "");
}

// ひらがな→カタカナに寄せて、表記ゆれを吸収した部分一致にする
function foldKana(text) {
  return text.replace(/[ぁ-ゖ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) + 0x60));
}
