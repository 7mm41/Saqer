"""Download the Madani mushaf layout (King Fahd Complex, QCF V1 — 604 pages × 15 lines) and its page fonts.

  * words of every page with their line number and QCF V1 glyph code: api.quran.com (mushaf=2 → QCF V1)
  * page fonts: static.qurancdn.com/fonts/quran/hafs/v1/ttf/p<N>.ttf   (one font per page: glyph = word)
  * surah names font: static.qurancdn.com/fonts/quran/surah-names/v1/sura_names.ttf

Writes RAW_DIR/page_<ppp>.json (API rows) and RAW_DIR/fonts/*.ttf. Then run build_mushaf.py.
usage: python3 fetch_mushaf_layout.py RAW_DIR
"""
import json, os, sys, time, urllib.request
from concurrent.futures import ThreadPoolExecutor

API = ("https://api.quran.com/api/v4/verses/by_page/{p}?words=true&per_page=50&mushaf=2"
       "&word_fields=code_v1,line_number,page_number,text_uthmani&fields=text_uthmani")
FONT = "https://static.qurancdn.com/fonts/quran/hafs/v1/ttf/p{p}.ttf"
NAMES = "https://static.qurancdn.com/fonts/quran/surah-names/v1/sura_names.ttf"


def fetch(url, binary=False):
    for attempt in range(6):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=60) as r:
                data = r.read()
            return data if binary else json.loads(data)
        except Exception:
            time.sleep(2 * (attempt + 1))
    raise RuntimeError(url)


def page(raw, p):
    path = os.path.join(raw, f"page_{p:03d}.json")
    if not os.path.exists(path):
        verses = fetch(API.format(p=p))["verses"]
        json.dump(verses, open(path, "w", encoding="utf-8"), ensure_ascii=False)
    font = os.path.join(raw, "fonts", f"p{p}.ttf")
    if not os.path.exists(font):
        open(font, "wb").write(fetch(FONT.format(p=p), binary=True))
    return p


def main():
    raw = sys.argv[1]
    os.makedirs(os.path.join(raw, "fonts"), exist_ok=True)
    with ThreadPoolExecutor(8) as ex:
        done = list(ex.map(lambda p: page(raw, p), range(1, 605)))
    names = os.path.join(raw, "fonts", "sura_names.ttf")
    if not os.path.exists(names):
        open(names, "wb").write(fetch(NAMES, binary=True))
    print("pages", len(done))


if __name__ == "__main__":
    main()
