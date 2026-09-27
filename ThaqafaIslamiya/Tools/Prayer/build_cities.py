"""Build the offline world-places list used for prayer times without GPS or internet.

Source: GeoNames (https://www.geonames.org, CC BY 4.0):
  cities5000.zip  every place with 5,000+ people worldwide
  cities1000.zip  places with 1,000+ people — used for the Gulf states and Yemen
  OM.zip          every populated place in Oman (villages and neighbourhoods included)
  admin1CodesASCII.txt  region names
  alternatenames/<CC>.zip  language-tagged names for Oman, the Gulf states and Yemen (unzipped into RAW_DIR/alt)
Download them into RAW_DIR, unzip, then: python3 build_cities.py RAW_DIR

Output Assets/Data/world_places.json:
  {"tz": [timezone ids], "r": {"CC.code": ["region name", "Arabic region name or empty"]},
   "p": [[name, arabic name or "", country, region code, lat*1e4, lng*1e4, tz index, population], ...]}
sorted by population (largest first), so search results come out in a sensible order.
"""
import json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "..", "ThaqafaIslamiya", "Assets", "Data", "world_places.json")
GULF = {"SA", "AE", "KW", "QA", "BH", "YE", "OM"}
SKIP_CODES = {"PPLQ", "PPLH", "PPLW", "PPLCH"}           # abandoned, historical, destroyed
# a name counts as Arabic only if it uses standard Arabic letters (no Persian/Urdu/Uyghur letters, no Latin)
PURE_ARABIC = re.compile(r"^[\u0621-\u064A\u064B-\u0652\u0670\u0671 \-]+$")
PREFIXES = ("ولاية ", "والاية ", "مدينة ", "محافظة ", "قرية ", "بلدة ")

# Arabic names for the regions of Oman and neighbouring states (GeoNames only has English ones)
REGION_AR = {
    "OM.01": "الداخلية", "OM.02": "جنوب الباطنة", "OM.03": "الوسطى", "OM.04": "جنوب الشرقية", "OM.09": "الظاهرة",
    "OM.06": "مسقط", "OM.07": "مسندم", "OM.08": "ظفار", "OM.10": "البريمي", "OM.12": "شمال الشرقية", "OM.11": "شمال الباطنة",
    "AE.01": "أبوظبي", "AE.02": "عجمان", "AE.03": "دبي", "AE.04": "الفجيرة", "AE.05": "رأس الخيمة", "AE.06": "الشارقة", "AE.07": "أم القيوين",
    "SA.02": "الباحة", "SA.05": "المدينة المنورة", "SA.06": "الشرقية", "SA.08": "القصيم", "SA.10": "الرياض", "SA.11": "عسير",
    "SA.13": "حائل", "SA.14": "مكة المكرمة", "SA.15": "الحدود الشمالية", "SA.16": "نجران", "SA.17": "جازان", "SA.19": "تبوك", "SA.20": "الجوف",
}


# Omani wilayat centres with no Arabic name in GeoNames
ARABIC_FIXES = {
    ("OM", "Şaḩam"): "صحم", ("OM", "Sufālat Samā’il"): "سفالة سمائل", ("OM", "Bidbid"): "بدبد",
    ("OM", "Badīyah"): "بدية", ("OM", "Bayt al ‘Awābī"): "العوابي", ("OM", "Dib Dibba"): "دبا",
}


def arabic_name(alternates):
    names = [a.strip() for a in alternates.split(",") if PURE_ARABIC.match(a.strip())]
    cleaned = []
    for n in names:
        for p in PREFIXES:
            if n.startswith(p) and len(n) > len(p) + 1:
                n = n[len(p):]
        cleaned.append(n)
    return min(cleaned, key=len) if cleaned else ""


def tagged_arabic(raw):
    """Arabic names tagged 'ar' by GeoNames (preferred name first) — more reliable than guessing from alternates."""
    names = {}
    folder = os.path.join(raw, "alt")
    for cc in sorted(GULF):
        path = os.path.join(folder, f"{cc}.txt")
        if not os.path.exists(path):
            continue
        for c in rows(path):
            if len(c) > 4 and c[2] == "ar" and PURE_ARABIC.match(c[3]):
                best = names.get(c[1])
                rank = (0 if c[4] == "1" else 1, len(c[3]))
                if best is None or rank < best[0]:
                    names[c[1]] = (rank, c[3])
    return {k: v[1] for k, v in names.items()}


def rows(path):
    with open(path, encoding="utf-8") as f:
        for line in f:
            yield line.rstrip("\n").split("\t")


def main():
    raw = sys.argv[1]
    places = {}

    def add(c):
        if c[6] != "P" or c[7] in SKIP_CODES or not c[17]:
            return
        places[c[0]] = c

    for c in rows(os.path.join(raw, "cities5000.txt")):
        add(c)
    for c in rows(os.path.join(raw, "cities1000.txt")):
        if c[8] in GULF:
            add(c)
    for c in rows(os.path.join(raw, "OM.txt")):
        add(c)

    regions = {}
    for c in rows(os.path.join(raw, "admin1CodesASCII.txt")):
        regions[c[0]] = [c[1], REGION_AR.get(c[0], "")]

    tagged = tagged_arabic(raw)
    tz_index, tzs, out, used_regions = {}, [], [], {}
    for c in sorted(places.values(), key=lambda c: (-int(c[14] or 0), c[1])):
        tz = c[17]
        if tz not in tz_index:
            tz_index[tz] = len(tzs)
            tzs.append(tz)
        region = f"{c[8]}.{c[10]}" if c[10] else ""
        if region in regions:
            used_regions[region] = regions[region]
        else:
            region = ""
        out.append([c[1], ARABIC_FIXES.get((c[8], c[1])) or tagged.get(c[0]) or arabic_name(c[3]), c[8], region.split(".", 1)[1] if region else "",
                    round(float(c[4]) * 1e4), round(float(c[5]) * 1e4), tz_index[tz], int(c[14] or 0)])

    json.dump({"tz": tzs, "r": used_regions, "p": out}, open(OUT, "w", encoding="utf-8"),
              ensure_ascii=False, separators=(",", ":"))
    om = [p for p in out if p[2] == "OM"]
    print(f"{len(out)} places ({len(om)} in Oman, {sum(1 for p in om if p[1])} with Arabic names), "
          f"{len(tzs)} time zones, {os.path.getsize(OUT) // 1024} KB")


if __name__ == "__main__":
    main()
