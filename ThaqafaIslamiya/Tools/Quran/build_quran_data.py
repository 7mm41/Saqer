"""Build the offline Quran data bundled in the app (Assets/Quran).

Sources
  * Text & page/juz metadata: Tanzil Uthmani text via api.alquran.cloud (edition quran-uthmani, Madani 604-page layout)
  * Tafsir: التفسير الميسّر — King Fahd Glorious Quran Printing Complex (ar.muyassar)
  * Translations: en.sahih, fa.khorramdel, tr.diyanet, hi.hindi, bn.bengali
  * Mushaf page images: pdfquran.com standard mushaf (King Fahd Complex print) — see export_pages.py

Outputs (compact JSON, arrays indexed by global ayah index 0..6235):
  quran_meta.json         surahs, juz starts, first ayah of every page, page of every ayah
  quran_text.json         Uthmani text (the basmala of each surah's first ayah is split off)
  quran_tafsir_ar.json    التفسير الميسر
  quran_tr_<lang>.json    translation for en, fa, tr, hi, bn

usage: python3 build_quran_data.py SRC_DIR   (SRC_DIR holds <edition>.json files from /v1/quran/<edition>)
"""
import json, os, sys, unicodedata

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "..", "ThaqafaIslamiya", "Assets", "Quran")
TRANSLATIONS = {"en": "en.sahih", "fa": "fa.khorramdel", "tr": "tr.diyanet", "hi": "hi.hindi", "bn": "bn.bengali"}
BASMALA = "بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ"

# Surah names in the app languages that are not covered by the API (en comes from the API).
TRANSLIT_TR = None  # Turkish uses the Latin transliteration (englishName) — standard in Turkish mushafs


def load(src, edition):
    return json.load(open(os.path.join(src, f"{edition}.json"), encoding="utf-8"))["data"]["surahs"]


def dump(name, obj):
    path = os.path.join(OUT, name)
    json.dump(obj, open(path, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(f"{name}: {os.path.getsize(path) // 1024} KB")


def main():
    src = sys.argv[1]
    os.makedirs(OUT, exist_ok=True)
    quran = load(src, "quran-uthmani")

    surahs, text, page_of, juz_of, sajdas = [], [], [], [], []
    juz_starts = {}
    for s in quran:
        first_page = s["ayahs"][0]["page"]
        surahs.append({
            "n": s["number"],
            "ar": s["name"].replace("سُورَةُ ", "").strip(),
            "en": s["englishName"],
            "meaning": s["englishNameTranslation"],
            "type": "m" if s["revelationType"] == "Meccan" else "d",
            "count": len(s["ayahs"]),
            "page": first_page,
        })
        for a in s["ayahs"]:
            t = unicodedata.normalize("NFC", a["text"]).lstrip("\ufeff")
            if a["numberInSurah"] == 1 and s["number"] not in (1, 9) and t.startswith(BASMALA):
                t = t[len(BASMALA):].strip()
            text.append(t)
            page_of.append(a["page"])
            juz_of.append(a["juz"])
            if a["juz"] not in juz_starts:
                juz_starts[a["juz"]] = {"juz": a["juz"], "surah": s["number"], "ayah": a["numberInSurah"], "page": a["page"]}
            if a.get("sajda"):
                sajdas.append(len(text) - 1)

    assert len(text) == 6236
    page_first = []
    for i, p in enumerate(page_of):
        if len(page_first) < p:
            page_first.append(i)
    assert len(page_first) == 604

    dump("quran_meta.json", {
        "surahs": surahs,
        "juz": [juz_starts[j] for j in sorted(juz_starts)],
        "pageFirstAyah": page_first,
        "ayahPage": page_of,
        "sajdas": sajdas,
        "basmala": BASMALA,
    })
    dump("quran_text.json", text)

    tafsir = [a["text"].lstrip("\ufeff").strip() for s in load(src, "ar.muyassar") for a in s["ayahs"]]
    assert len(tafsir) == 6236
    dump("quran_tafsir_ar.json", tafsir)

    for lang, edition in TRANSLATIONS.items():
        tr = [a["text"].lstrip("\ufeff").strip() for s in load(src, edition) for a in s["ayahs"]]
        assert len(tr) == 6236, edition
        dump(f"quran_tr_{lang}.json", tr)


if __name__ == "__main__":
    main()
