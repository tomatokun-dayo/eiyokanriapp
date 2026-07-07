#!/usr/bin/env python3
"""日本食品標準成分表（八訂）増補2023年の第2章Excelから、
アプリで使う6栄養素を抽出して data/fooddb.js を生成する。

使い方:
  1. https://www.mext.go.jp/a_menu/syokuhinseibun/mext_00001.html から
     「第2章（データ）」のExcelをダウンロード
  2. python3 scripts/build-fooddb.py <path/to/excel.xlsx>

出力形式（data/fooddb.js）:
  window.FOOD_DB = [[食品番号, 食品名, 食品群コード, kcal, たんぱく質g, 脂質g, 炭水化物g, 鉄mg, カルシウムmg], ...]

数値の扱い: Tr（微量）・(0)・(数値)・- （未測定）はいずれも計算用に数値化する。
  "Tr"/"(Tr)" → 0 / "-" → 0 / "(1.2)" → 1.2
"""

import json
import re
import sys
from datetime import date

import openpyxl

# 成分識別子(12行目) → 取り出す列
WANTED = {
    "ENERC_KCAL": "energy",
    "PROT-": "protein",
    "FAT-": "fat",
    "CHOCDF-": "carbs",
    "FE": "iron",
    "CA": "calcium",
}

GROUP_LABELS = {
    1: "穀類", 2: "いも・でん粉類", 3: "砂糖・甘味類", 4: "豆類", 5: "種実類",
    6: "野菜類", 7: "果実類", 8: "きのこ類", 9: "藻類", 10: "魚介類",
    11: "肉類", 12: "卵類", 13: "乳類", 14: "油脂類", 15: "菓子類",
    16: "し好飲料類", 17: "調味料・香辛料類", 18: "調理済み流通食品類",
}


def to_number(value):
    if value is None:
        return 0
    if isinstance(value, (int, float)):
        return round(float(value), 2)
    text = str(value).strip()
    if text in ("", "-", "Tr", "(Tr)", "＊", "*"):
        return 0
    text = text.strip("()")
    try:
        return round(float(text), 2)
    except ValueError:
        return 0


def clean_name(name):
    # 全角スペース・連続空白を単一の全角スペースに正規化
    return re.sub(r"[\s　]+", "　", str(name).strip())


def main():
    if len(sys.argv) != 2:
        sys.exit("usage: build-fooddb.py <excel.xlsx>")

    wb = openpyxl.load_workbook(sys.argv[1], read_only=True)
    ws = wb["表全体"]

    rows = ws.iter_rows(values_only=True)
    header_cols = {}
    records = []

    for row in rows:
        if not header_cols:
            # 成分識別子の行を探す
            for idx, cell in enumerate(row):
                if cell is not None and str(cell).strip() in WANTED:
                    header_cols[WANTED[str(cell).strip()]] = idx
            continue

        food_no = row[1]
        name = row[3]
        if food_no is None or name is None:
            continue
        food_no = str(food_no).strip()
        if not re.fullmatch(r"\d{5}", food_no):
            continue

        group = int(str(row[0]).strip() or "0")
        values = [to_number(row[header_cols[key]]) for key in ("energy", "protein", "fat", "carbs", "iron", "calcium")]
        records.append([food_no, clean_name(name), group, *values])

    if len(records) < 2000:
        sys.exit(f"error: only {len(records)} records extracted — layout may have changed")

    lines = [json.dumps(record, ensure_ascii=False, separators=(",", ":")) for record in records]
    body = ",\n".join(lines)
    group_labels = json.dumps(GROUP_LABELS, ensure_ascii=False, separators=(",", ":"))

    output = f"""// 日本食品標準成分表（八訂）増補2023年 第2章（データ）より生成。
// 出典: 文部科学省 https://www.mext.go.jp/a_menu/syokuhinseibun/mext_00001.html
// 生成: scripts/build-fooddb.py（{date.today().isoformat()}）
// 形式: [食品番号, 食品名, 食品群コード, エネルギーkcal, たんぱく質g, 脂質g, 炭水化物g, 鉄mg, カルシウムmg]（可食部100gあたり。Tr/-/推計括弧値は数値化）
window.FOOD_DB = [
{body},
];
window.FOOD_DB_GROUPS = {group_labels};
"""
    with open("data/fooddb.js", "w") as fh:
        fh.write(output)
    print(f"wrote data/fooddb.js ({len(records)} foods)")


if __name__ == "__main__":
    main()
