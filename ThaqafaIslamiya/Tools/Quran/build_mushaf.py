"""Build the text-rendered Madani mushaf (QCF V1, King Fahd Complex) for the app.

Input: RAW_DIR from fetch_mushaf_layout.py. Output (Assets/Quran):
  mushaf_layout.json   for each page: 15 lines; each line is one of
                        {"w": [[code, ayah, end], …], "x": scaleX}   words (code = glyph string in the page font,
                                                                      ayah = global ayah index 0…6235, end = 1 for
                                                                      the ayah-number medallion), justified by scaleX
                        {"h": surah}                                  surah title band
                        {"b": 1}                                      basmala (drawn with the page-1 glyphs of 1:1)
                        {"c": 1} on pages 1–2: centred page (Al-Fatiha / start of Al-Baqarah)
  Fonts/QCF_P<ppp>.ttf page fonts, Fonts/QuranSurahNames.ttf

Checks (fails loudly): every glyph exists in its page font; every page has 15 lines (8 on pages 1–2);
every ayah 1…6236 appears exactly once as an end medallion, in order; page first ayahs = quran_meta.json.
usage: python3 build_mushaf.py RAW_DIR [--preview PAGE ...]
"""
import json, os, statistics, sys
from fontTools.ttLib import TTFont

HERE = os.path.dirname(os.path.abspath(__file__))
QDIR = os.path.join(HERE, "..", "..", "ThaqafaIslamiya", "Assets", "Quran")
FDIR = os.path.join(QDIR, "Fonts")
META = json.load(open(os.path.join(QDIR, "quran_meta.json"), encoding="utf-8"))
FIRST, _i = {}, 0
for _s in META["surahs"]:
    FIRST[_s["n"]] = _i
    _i += _s["count"]


def gidx(key):
    s, a = map(int, key.split(":"))
    return FIRST[s] + a - 1


# the app draws glyph outlines straight from cmap + glyf (no shaping), so only these tables are kept;
# the old AAT tables (morx/feat/just/prop), hinting and odd embedding flags are dropped
KEEP_TABLES = {"cmap", "glyf", "loca", "head", "hhea", "hmtx", "maxp", "name", "OS/2", "post"}


def clean_font(src, dst):
    font = TTFont(src)
    for tag in list(font.keys()):
        if tag not in KEEP_TABLES and tag != "GlyphOrder":
            del font[tag]
    font["post"].formatType = 3.0
    font["OS/2"].fsType = 0
    font.save(dst)


def load_pages(raw):
    pages = {}
    for p in range(1, 605):
        verses = json.load(open(os.path.join(raw, f"page_{p:03d}.json"), encoding="utf-8"))
        font = TTFont(os.path.join(raw, "fonts", f"p{p}.ttf"), lazy=True)
        cmap, hmtx, upm = font.getBestCmap(), font["hmtx"], font["head"].unitsPerEm
        lines = {}
        for v in verses:
            for w in v["words"]:
                for ch in w["code_v1"]:
                    if ord(ch) not in cmap:
                        raise SystemExit(f"page {p}: glyph U+{ord(ch):04X} missing in font")
                lines.setdefault(w["line_number"], []).append(
                    [w["code_v1"], gidx(v["verse_key"]), 1 if w["char_type_name"] == "end" else 0])
        widths = {ln: sum(hmtx[cmap[ord(c)]][0] for w in ws for c in w[0]) / upm for ln, ws in lines.items()}
        pages[p] = (lines, widths)
    return pages


def main():
    raw = sys.argv[1]
    pages = load_pages(raw)
    all_widths = [w for p, (_, ws) in pages.items() if p > 2 for w in ws.values()]
    target = statistics.median(all_widths)

    out = []
    pending_basmala_for = None      # a title band at the end of the previous page whose basmala is on this page
    for p in range(1, 605):
        lines, widths = pages[p]
        total = 8 if p in (1, 2) else 15
        rows = []
        for ln in range(1, total + 1):
            if ln in lines:
                ws = lines[ln]
                w = widths[ln]
                # justify full lines exactly (glyph widths already give ~equal lines; ±3 % correction)
                x = round(target / w, 4) if p > 2 and 0.9 <= w / target <= 1.12 else 1.0
                rows.append({"w": ws, "x": x})
            else:
                rows.append(None)                   # decided below
        # fill the gaps: each gap run precedes the first word after it (or the next page's first word)
        k = 0
        while k < total:
            if rows[k] is not None:
                k += 1
                continue
            start = k
            while k < total and rows[k] is None:
                k += 1
            run = list(range(start, k))
            after = next((r["w"][0][1] for r in rows[k:] if r), None)
            if after is None:                       # gap at the end of the page → next page's first ayah
                nxt = pages[p + 1][0]
                after = nxt[min(nxt)][0][1]
            surah = next(n for n in range(114, 0, -1) if FIRST[n] <= after)
            first_of_surah = after == FIRST[surah]
            needs_basmala = surah not in (1, 9)
            if start == 0 and pending_basmala_for == surah and len(run) == 1:
                kinds = ["b"]
            elif len(run) == 2 and needs_basmala:
                kinds = ["h", "b"]
            elif len(run) == 1:
                kinds = ["h"]
            else:
                raise SystemExit(f"page {p}: unexpected gap {run} before ayah {after}")
            if not first_of_surah:
                raise SystemExit(f"page {p}: gap not before a surah start (ayah {after})")
            for ln, kind in zip(run, kinds):
                rows[ln] = {"h": surah} if kind == "h" else {"b": 1}
            pending_basmala_for = surah if (k == total and kinds == ["h"] and needs_basmala) else None
        page = {"l": rows}
        if p in (1, 2):
            page["c"] = 1
        out.append(page)

    # verification: every ayah's end medallion exactly once, in reading order; page first ayahs
    ends = [w[1] for page in out for r in page["l"] if "w" in r for w in r["w"] if w[2]]
    if ends != list(range(6236)):
        raise SystemExit(f"ayah end markers out of order / missing ({len(ends)})")
    for p, page in enumerate(out, 1):
        first = next(r["w"][0][1] for r in page["l"] if "w" in r)
        if first != META["pageFirstAyah"][p - 1]:
            raise SystemExit(f"page {p}: first ayah {first} != meta {META['pageFirstAyah'][p - 1]}")
    heads = [r["h"] for page in out for r in page["l"] if "h" in r]
    if heads != list(range(1, 115)):
        raise SystemExit(f"surah title bands: {len(heads)} (expected 114 in order)")

    os.makedirs(FDIR, exist_ok=True)
    for p in range(1, 605):
        clean_font(os.path.join(raw, "fonts", f"p{p}.ttf"), os.path.join(FDIR, f"QCF_P{p:03d}.ttf"))
    clean_font(os.path.join(raw, "fonts", "sura_names.ttf"), os.path.join(FDIR, "QuranSurahNames.ttf"))
    path = os.path.join(QDIR, "mushaf_layout.json")
    json.dump({"target": round(target, 4), "pages": out}, open(path, "w", encoding="utf-8"),
              ensure_ascii=False, separators=(",", ":"))
    print("ok: 604 pages, 6236 ayah markers in order, 114 title bands; target line width", round(target, 3), "em;",
          os.path.getsize(path) // 1024, "KB")


if __name__ == "__main__":
    main()
