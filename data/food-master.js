// per100 values are from MEXT fooddb detail pages referenced on 2026-06-27.
// MEXT "Tr" trace values are represented as 0 so the app can keep numeric fields.
window.FOOD_MASTER = [
  // MEXT foodNo 01097: こめ/［水稲五分かゆ］/精白米, used as 10倍がゆ equivalent.
  {
    id: "rice",
    name: "10倍がゆ",
    category: "主食",
    defaultAmount: 50,
    color: "#e1c866",
    state: "introduced",
    spoonGrams: { tsp: 5, tbsp: 15 },
    source: {
      db: "文部科学省 食品成分データベース（日本食品標準成分表2020年版(八訂)）",
      foodNo: "01097",
      url: "https://fooddb.mext.go.jp/details/details.pl?ITEM_NO=1_01097_7",
      referencedAt: "2026-06-27",
    },
    per100: { energy: 33, protein: 0.5, fat: 0.1, carbs: 7.9, iron: 0, calcium: 1 },
  },
  // MEXT foodNo 06215: にんじん/根/皮なし/ゆで.
  {
    id: "carrot",
    name: "にんじん",
    category: "野菜",
    defaultAmount: 25,
    color: "#da6f50",
    state: "introduced",
    spoonGrams: { tsp: 5, tbsp: 15 },
    source: {
      db: "文部科学省 食品成分データベース（日本食品標準成分表2020年版(八訂)）",
      foodNo: "06215",
      url: "https://fooddb.mext.go.jp/details/details.pl?ITEM_NO=6_06215_7",
      referencedAt: "2026-06-27",
    },
    per100: { energy: 28, protein: 0.7, fat: 0.1, carbs: 8.5, iron: 0.2, calcium: 29 },
  },
  // MEXT foodNo 06268: ほうれんそう/葉/通年平均/ゆで.
  {
    id: "spinach",
    name: "ほうれん草",
    category: "野菜",
    defaultAmount: 15,
    color: "#5f8c49",
    state: "introduced",
    spoonGrams: { tsp: 5, tbsp: 15 },
    source: {
      db: "文部科学省 食品成分データベース（日本食品標準成分表2020年版(八訂)）",
      foodNo: "06268",
      url: "https://fooddb.mext.go.jp/details/details.pl?ITEM_NO=6_06268_7",
      referencedAt: "2026-06-27",
    },
    per100: { energy: 23, protein: 2.6, fat: 0.5, carbs: 4.0, iron: 0.9, calcium: 69 },
  },
  // MEXT foodNo 04033: だいず/［豆腐・油揚げ類］/絹ごし豆腐.
  {
    id: "tofu",
    name: "絹ごし豆腐",
    category: "たんぱく",
    defaultAmount: 30,
    color: "#f1ead7",
    state: "introduced",
    spoonGrams: { tsp: 5, tbsp: 15 },
    source: {
      db: "文部科学省 食品成分データベース（日本食品標準成分表2020年版(八訂)）",
      foodNo: "04033",
      url: "https://fooddb.mext.go.jp/details/details.pl?ITEM_NO=4_04033_7",
      referencedAt: "2026-06-27",
    },
    per100: { energy: 56, protein: 5.3, fat: 3.5, carbs: 2.0, iron: 1.2, calcium: 75 },
  },
  // MEXT foodNo 10101: 白身魚の水煮代表として、かれい類/まがれい/水煮を選定.
  {
    id: "whitefish",
    name: "白身魚",
    category: "たんぱく",
    defaultAmount: 15,
    color: "#cad5dd",
    state: "introduced",
    spoonGrams: { tsp: 5, tbsp: 15 },
    source: {
      db: "文部科学省 食品成分データベース（日本食品標準成分表2020年版(八訂)）",
      foodNo: "10101",
      url: "https://fooddb.mext.go.jp/details/details.pl?ITEM_NO=10_10101_7",
      referencedAt: "2026-06-27",
    },
    per100: { energy: 97, protein: 21.4, fat: 1.1, carbs: 0.1, iron: 0.3, calcium: 56 },
  },
  // MEXT foodNo 11229: にわとり/［若どり・副品目］/ささみ/ゆで.
  {
    id: "chicken",
    name: "鶏ささみ",
    category: "たんぱく",
    defaultAmount: 15,
    color: "#d8a47f",
    state: "introduced",
    spoonGrams: { tsp: 5, tbsp: 15 },
    source: {
      db: "文部科学省 食品成分データベース（日本食品標準成分表2020年版(八訂)）",
      foodNo: "11229",
      url: "https://fooddb.mext.go.jp/details/details.pl?ITEM_NO=11_11229_7",
      referencedAt: "2026-06-27",
    },
    per100: { energy: 121, protein: 29.6, fat: 1.0, carbs: 0, iron: 0.3, calcium: 5 },
  },
  // MEXT foodNo 06049: かぼちゃ類/西洋かぼちゃ/果実/ゆで.
  {
    id: "pumpkin",
    name: "かぼちゃ",
    category: "野菜",
    defaultAmount: 25,
    color: "#d99f32",
    state: "introduced",
    spoonGrams: { tsp: 5, tbsp: 15 },
    source: {
      db: "文部科学省 食品成分データベース（日本食品標準成分表2020年版(八訂)）",
      foodNo: "06049",
      url: "https://fooddb.mext.go.jp/details/details.pl?ITEM_NO=6_06049_7",
      referencedAt: "2026-06-27",
    },
    per100: { energy: 80, protein: 1.6, fat: 0.3, carbs: 21.3, iron: 0.3, calcium: 22 },
  },
  // MEXT foodNo 07107: バナナ/生.
  {
    id: "banana",
    name: "バナナ",
    category: "果物",
    defaultAmount: 30,
    color: "#ead46c",
    state: "introduced",
    spoonGrams: { tsp: 5, tbsp: 15 },
    source: {
      db: "文部科学省 食品成分データベース（日本食品標準成分表2020年版(八訂)）",
      foodNo: "07107",
      url: "https://fooddb.mext.go.jp/details/details.pl?ITEM_NO=7_07107_7",
      referencedAt: "2026-06-27",
    },
    per100: { energy: 93, protein: 1.1, fat: 0.2, carbs: 22.5, iron: 0.3, calcium: 6 },
  },
  // MEXT foodNo 07148: りんご/皮なし/生.
  {
    id: "apple",
    name: "りんご",
    category: "果物",
    defaultAmount: 25,
    color: "#c85f5f",
    state: "introduced",
    spoonGrams: { tsp: 5, tbsp: 15 },
    source: {
      db: "文部科学省 食品成分データベース（日本食品標準成分表2020年版(八訂)）",
      foodNo: "07148",
      url: "https://fooddb.mext.go.jp/details/details.pl?ITEM_NO=7_07148_7",
      referencedAt: "2026-06-27",
    },
    per100: { energy: 53, protein: 0.1, fat: 0.2, carbs: 15.5, iron: 0.1, calcium: 3 },
  },
  // MEXT foodNo 13025: ヨーグルト/全脂無糖.
  {
    id: "yogurt",
    name: "プレーンヨーグルト",
    category: "乳製品",
    defaultAmount: 40,
    color: "#e9edf1",
    state: "introduced",
    spoonGrams: { tsp: 5, tbsp: 15 },
    source: {
      db: "文部科学省 食品成分データベース（日本食品標準成分表2020年版(八訂)）",
      foodNo: "13025",
      url: "https://fooddb.mext.go.jp/details/details.pl?ITEM_NO=13_13025_7",
      referencedAt: "2026-06-27",
    },
    per100: { energy: 56, protein: 3.6, fat: 3.0, carbs: 4.9, iron: 0, calcium: 120 },
  },
];
