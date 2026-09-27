"""Fetch per-ayah timings (mp3quran.net ayat_timing API) for the app's reciters and write
Assets/Quran/quran_timing_<key>.json = {"<surah>": [start_ms of ayah 1, …, start_ms of ayah n, end_ms]}.

The start of ayah 1 skips the reciter's opening (isti'adha/basmala), so playback of a page begins exactly
at the page's first ayah. Reciters without official timings (Hazza Al-Balushi) are handled by align_balushi.py.
"""
import json, os, sys, time, urllib.request
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "..", "ThaqafaIslamiya", "Assets", "Quran")
sys.path.insert(0, HERE)
from reciters import RECITERS  # noqa: E402

META = json.load(open(os.path.join(OUT, "quran_meta.json"), encoding="utf-8"))
COUNTS = {s["n"]: s["count"] for s in META["surahs"]}


def get(url):
    for attempt in range(5):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.load(r)
        except Exception:
            time.sleep(2 * (attempt + 1))
    raise RuntimeError(url)


def surah_timing(read_id, surah):
    raw = get(f"https://www.mp3quran.net/api/v3/ayat_timing?surah={surah}&read={read_id}")
    by_ayah = {}
    for r in raw:
        if r["ayah"] >= 1 and r["ayah"] not in by_ayah:   # some timings contain duplicate rows
            by_ayah[r["ayah"]] = r
    rows = [by_ayah[k] for k in sorted(by_ayah)]
    starts = [int(r["start_time"]) for r in rows]
    intro = [r for r in raw if r["ayah"] == 0]
    if len(starts) == COUNTS[surah] - 1 and intro:
        # Al-Fatiha in some timings: the basmala (ayah 1) is filed as "ayah 0" and the rest shifted by one
        starts = [int(intro[0]["start_time"])] + starts
    if len(starts) != COUNTS[surah]:
        raise ValueError(f"read {read_id} surah {surah}: {len(starts)} != {COUNTS[surah]}")
    return starts + [int(rows[-1]["end_time"])]


def main():
    keys = sys.argv[1:] or [r["key"] for r in RECITERS if r.get("timingRead")]
    for r in RECITERS:
        if r["key"] not in keys or not r.get("timingRead"):
            continue
        def safe(s):
            try:
                t = surah_timing(r["timingRead"], s)
                ok = all(a <= b for a, b in zip(t, t[1:]))
                return s, (t if ok else None)
            except ValueError:
                return s, None

        with ThreadPoolExecutor(8) as ex:
            results = list(ex.map(safe, range(1, 115)))
        good = {str(s): t for s, t in results if t}
        path = os.path.join(OUT, f"quran_timing_{r['key']}.json")
        json.dump(good, open(path, "w"), separators=(",", ":"))
        skipped = [s for s, t in results if not t]
        print(r["key"], os.path.getsize(path) // 1024, "KB", "skipped:", skipped, flush=True)


if __name__ == "__main__":
    main()
