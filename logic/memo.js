// 他アプリからコピペした食事メモを解析して、入力行にセットできる形へ変換する。
// 対応形式（1行1品）:
//   10倍がゆ50g / 卵黄15g / かぼちゃ 15グラム / 牛乳15ml / 卵黄 15 /
//   にんじん小さじ1 / バナナ（量なし→既定量）
//   ミルク100ml → ミルク欄への値として返す（育児用ミルク専用。牛乳は通常の食材として扱う）
// 依存: foldKana (logic/units.js)

// 量の単位として受け付ける表記。すべてグラムとして扱う。
// ml/cc は液体用で 1ml = 1g とみなす（牛乳の比重は約1.03なので誤差3%。目安には十分）。
// 空文字は「牛乳15」のように単位を省いた場合。
const MEMO_AMOUNT_UNITS = new Set(["", "g", "グラム", "ml", "cc", "ミリリットル"]);

function isMemoAmountUnit(suffix) {
  // 全角→半角は normalizeMemoLine 済み。大文字(mL/CC)とひらがな(ぐらむ)をここで吸収する。
  return MEMO_AMOUNT_UNITS.has(foldKana(String(suffix).toLowerCase()));
}

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
      // 「10倍がゆ50g」「牛乳15ml」「かぼちゃ15グラム」「卵黄 15」
      // 末尾の「数字＋単位」を切り出す。単位の文字種から数字を外しているので、
      // 先頭に数字を持つ食材名（10倍がゆ）はここに引っかからない。
      m = line.match(/^(.*?)[\s]*([0-9]+(?:\.[0-9]+)?)[\s]*([a-zA-Zぁ-ゖァ-ヶー]*)[\s]*$/);
      if (m && m[1]) {
        if (!isMemoAmountUnit(m[3])) {
          // 「牛乳15dl」のような未知の単位。ここで既定量に落とすと、
          // 食材だけ一致して量が黙って別の値になる。認識できない行として返す。
          unmatched.push(line);
          continue;
        }
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
