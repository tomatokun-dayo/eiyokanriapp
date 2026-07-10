// 他アプリからコピペした食事メモを解析して、入力行にセットできる形へ変換する。
// 対応形式（1行1品）:
//   10倍がゆ50g / 卵黄15g / かぼちゃ 15グラム / にんじん小さじ1 / バナナ（量なし→既定量）
//   ミルク100ml → ミルク欄への値として返す
// 依存: foldKana (logic/units.js)

function normalizeMemoLine(rawLine) {
  return String(rawLine)
    // 全角英数字→半角
    .replace(/[０-９ａ-ｚＡ-Ｚ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/[．]/g, ".")
    // 行頭の箇条書き記号を除去
    .replace(/^[\s　]*[・･•\-*●○▪︎☆★]+[\s　]*/, "")
    .replace(/[\s　]+/g, " ")
    .trim();
}

function findFoodByMemoName(name, foods) {
  const target = foldKana(name.toLowerCase());
  if (!target) return null;

  let best = null;
  let bestScore = 0;

  for (const food of foods) {
    const foodName = foldKana(food.name.toLowerCase());
    let score = 0;
    if (foodName === target) {
      score = 3;
    } else if (foodName.includes(target)) {
      score = 2; // メモ「納豆」→ マイ食材「だいず 糸引き納豆」
    } else if (target.includes(foodName)) {
      score = 1; // メモ「プレーンヨーグルト無糖」→ マイ食材「プレーンヨーグルト」
    }
    if (score === 0) continue;

    // 同スコアなら名前の長さが近いものを優先
    const closeness = -Math.abs(foodName.length - target.length);
    if (best === null || score > bestScore || (score === bestScore && closeness > best.closeness)) {
      best = { food, closeness };
      bestScore = score;
    }
  }

  return best?.food ?? null;
}

function parseMealMemo(text, foods) {
  const items = [];
  const unmatched = [];
  let milkMl = null;

  for (const rawLine of String(text).split(/\r?\n/)) {
    const line = normalizeMemoLine(rawLine);
    if (!line) continue;

    // ミルク行はミルク欄向けの値として拾う
    if (/^(ミルク|みるく)/.test(line)) {
      const ml = line.match(/([0-9]+(?:\.[0-9]+)?)/);
      if (ml) milkMl = Number(ml[1]);
      continue;
    }

    let name = null;
    let amount = null;
    let unit = "g";

    // 「にんじん小さじ1」「ほうれん草 大さじ0.5」
    let m = line.match(/^(.*?)[\s]*(小さじ|大さじ)[\s]*([0-9]+(?:\.[0-9]+)?)[\s]*$/);
    if (m) {
      name = m[1];
      unit = m[2] === "小さじ" ? "tsp" : "tbsp";
      amount = Number(m[3]);
    } else {
      // 「10倍がゆ50g」「卵黄 15」「かぼちゃ15グラム」
      m = line.match(/^(.*?)[\s]*([0-9]+(?:\.[0-9]+)?)[\s]*(?:g|グラム)[\s]*$/i) ||
        line.match(/^(.*?)[\s]+([0-9]+(?:\.[0-9]+)?)[\s]*$/);
      if (m && m[1]) {
        name = m[1];
        amount = Number(m[2]);
      } else {
        // 量なし行は食材名だけとして扱う（既定量は呼び出し側で補完）
        name = line;
      }
    }

    name = (name ?? "").replace(/[、,。・:：]+$/, "").trim();
    if (!name) {
      unmatched.push(line);
      continue;
    }

    const food = findFoodByMemoName(name, foods);
    if (!food) {
      unmatched.push(name);
      continue;
    }

    items.push({ foodId: food.id, amount, unit });
  }

  return { items, milkMl, unmatched };
}
