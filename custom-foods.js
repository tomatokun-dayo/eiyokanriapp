// ユーザーが追加した食材（マイ食材のカスタム分）。
// data/food-master.js の直後に読み込み、FOOD_MASTER に合流させる。
// 保存先: localStorage（バックアップJSONにも含まれる）。
const CUSTOM_FOOD_STORAGE_KEY = "eiyokanri.customFoods.v1";

function isValidCustomFood(food) {
  return (
    food !== null &&
    typeof food === "object" &&
    typeof food.id === "string" &&
    food.id.length > 0 &&
    typeof food.name === "string" &&
    food.name.length > 0 &&
    typeof food.category === "string" &&
    food.per100 !== null &&
    typeof food.per100 === "object" &&
    ["energy", "protein", "fat", "carbs", "iron", "calcium"].every((key) => Number.isFinite(food.per100[key]))
  );
}

function loadStoredCustomFoods() {
  try {
    const stored = window.localStorage.getItem(CUSTOM_FOOD_STORAGE_KEY);
    if (!stored) return [];

    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed.filter(isValidCustomFood) : [];
  } catch (error) {
    return [];
  }
}

const customFoods = loadStoredCustomFoods();

for (const food of customFoods) {
  if (!FOOD_MASTER.some((existing) => existing.id === food.id)) {
    FOOD_MASTER.push(food);
  }
}

function persistCustomFoods() {
  try {
    window.localStorage.setItem(CUSTOM_FOOD_STORAGE_KEY, JSON.stringify(customFoods));
  } catch (error) {
    // Keep the in-memory list usable when localStorage is blocked or full.
  }
}

function isCustomFood(foodId) {
  return customFoods.some((food) => food.id === foodId);
}

function registerFoodIndexes(food) {
  // 後続スクリプトが構築するインデックスへ実行時に反映する
  if (typeof foodById !== "undefined") foodById.set(food.id, food);
  if (typeof defaultFoodStates !== "undefined") defaultFoodStates.set(food.id, food.state);
}

function addCustomFood(food) {
  if (!isValidCustomFood(food) || FOOD_MASTER.some((existing) => existing.id === food.id)) {
    return false;
  }
  customFoods.push(food);
  FOOD_MASTER.push(food);
  registerFoodIndexes(food);
  persistCustomFoods();
  return true;
}

function removeCustomFood(foodId) {
  const index = customFoods.findIndex((food) => food.id === foodId);
  if (index === -1) return false;

  customFoods.splice(index, 1);
  const masterIndex = FOOD_MASTER.findIndex((food) => food.id === foodId);
  if (masterIndex !== -1) FOOD_MASTER.splice(masterIndex, 1);
  if (typeof foodById !== "undefined") foodById.delete(foodId);
  if (typeof defaultFoodStates !== "undefined") defaultFoodStates.delete(foodId);
  persistCustomFoods();
  return true;
}

function replaceAllCustomFoods(nextFoods) {
  // 既存のカスタム分をFOOD_MASTERから取り除く
  for (const food of [...customFoods]) {
    removeCustomFood(food.id);
  }
  for (const food of nextFoods.filter(isValidCustomFood)) {
    addCustomFood(food);
  }
}
