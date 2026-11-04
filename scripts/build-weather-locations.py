import csv
import json
import re
import sys
from pathlib import Path
from statistics import median
from xml.etree import ElementTree


root = Path(sys.argv[1])
csv.field_size_limit(20_000_000)


def read_csv(name):
    with (root / name).open(encoding="utf-8-sig", newline="") as file:
        yield from csv.DictReader(file)


def row(code, parent, name, alias, latitude, longitude):
    return [code, parent, name, alias, round(float(latitude), 2), round(float(longitude), 2)]


points = {item["id"]: item["geo"].split() for item in read_csv("ok_geo.csv")}
rows = []
for item in read_csv("ok_data_level3.csv"):
    code, parent = item["id"], item["pid"]
    if code.startswith("91") or code.startswith("71") and code != "71" or code in {"810000", "820000"}:
        continue
    longitude, latitude = points[code]
    rows.append(row(code, parent, item["ext_name"], item["name"] + " " + item["pinyin"], latitude, longitude))

rows += [
    row("653228", "6532", "和康县", "he kang 昆岭", 36.3517, 78.03),
    row("653229", "6532", "和安县", "he an 红柳", 35.98, 79.19),
    row("653132", "6531", "岑岭县", "cen ling 新华", 36.3982, 76.659),
]

sar_names = {
    "HK": ("8100", {"NYL": "元朗区", "NTW": "荃湾区", "NTP": "大埔区", "NSK": "西贡区", "NIS": "离岛区", "HCW": "中西区", "HWC": "湾仔区", "HEA": "东区", "HSO": "南区", "KYT": "油尖旺区", "KSS": "深水埗区", "KKC": "九龙城区", "KWT": "黄大仙区", "KKT": "观塘区", "NKT": "葵青区", "NTM": "屯门区", "NNO": "北区", "NST": "沙田区"}),
    "MO": ("8200", dict(zip(map(str, range(11875154, 11875162)), ["花地玛堂区", "圣安多尼堂区", "望德堂区", "大堂区", "风顺堂区", "嘉模堂区", "路氹城", "圣方济各堂区"]))),
}
for region, (parent, names) in sar_names.items():
    for line in (root / region / f"{region}.txt").read_text(encoding="utf-8").splitlines():
        values = line.split("\t")
        if values[7] == "ADM1" and values[10] in names:
            rows.append(row(region.lower() + values[0], parent, names[values[10]], values[1], values[4], values[5]))

towns = {}
for item in ElementTree.parse(root / "tw-centers.xml").getroot():
    name = item.findtext("行政區名") or ""
    code = item.findtext("_x0033_碼郵遞區號")
    match = re.fullmatch(r"(.{2,3}[縣市])(.+)", name)
    if match and code:
        city, district = match.groups()
        if district in {"南沙群島", "東沙群島", "釣魚臺"}:
            continue
        towns.setdefault(city, []).append((code, district, float(item.findtext("中心點緯度")), float(item.findtext("中心點經度"))))
for city, districts in towns.items():
    key = "tw-" + min(entry[0] for entry in districts)
    rows.append(row(key, "71", city, "", median(d[2] for d in districts), median(d[3] for d in districts)))
    rows.extend(row(f"{key}-{i}", key, district, "", lat, lon) for i, (_, district, lat, lon) in enumerate(districts))

assert len({item[0] for item in rows}) == len(rows)
assert all(3 < item[4] < 55 and 70 < item[5] < 140 for item in rows)
assert sum(item[1] == "8100" for item in rows) == 18
assert sum(item[1] == "8200" for item in rows) == 8
target = Path("src/domain/weather-locations.json")
target.write_text("[\n" + ",\n".join(json.dumps(item, ensure_ascii=False, separators=(",", ":")) for item in rows) + "\n]\n", encoding="utf-8")
print(f"{len(rows)} weather locations, {len(towns)} Taiwan city and county records")
