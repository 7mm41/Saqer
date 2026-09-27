"""Ayah timings for a reciter without official timings (Hazza Al-Balushi).

Method: a timed reciter (Alafasy) gives the relative position of every ayah start in the surah; those positions,
scaled to the new recording, are snapped to real pauses in the new recording (ffmpeg silencedetect) with a
monotone dynamic programme (each ayah boundary = one distinct pause, in order, close to its expected place,
longer pauses preferred). `--validate <key>` measures the error of the method on a reciter whose real timings
are known.

usage:
  python3 align_balushi.py AUDIO_DIR                     # writes Assets/Quran/quran_timing_balushi.json
  python3 align_balushi.py AUDIO_DIR --validate husary   # AUDIO_DIR/husary/<sss>.mp3 must exist
"""
import json, os, re, subprocess, sys
import imageio_ffmpeg

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "..", "ThaqafaIslamiya", "Assets", "Quran")
FF = imageio_ffmpeg.get_ffmpeg_exe()
TEMPLATE = json.load(open(os.path.join(OUT, "quran_timing_alafasy.json")))


def duration_ms(path):
    e = subprocess.run([FF, "-i", path], capture_output=True, text=True).stderr
    h, m, s = re.search(r"Duration: (\d+):(\d+):([\d.]+)", e).groups()
    return int((int(h) * 3600 + int(m) * 60 + float(s)) * 1000)


def pauses(path, noise="-32dB", min_d=0.18):
    e = subprocess.run([FF, "-i", path, "-af", f"silencedetect=noise={noise}:d={min_d}", "-f", "null", "-"],
                       capture_output=True, text=True).stderr
    starts = [float(x) for x in re.findall(r"silence_start: ([\d.]+)", e)]
    ends = [float(x) for x in re.findall(r"silence_end: ([\d.]+)", e)]
    out = []
    for a, b in zip(starts, ends):
        # an ayah starts at the end of the pause (just before the voice resumes)
        out.append((int(b * 1000) - 60, b - a))
    return out


META = json.load(open(os.path.join(OUT, "quran_meta.json"), encoding="utf-8"))
TEXT = json.load(open(os.path.join(OUT, "quran_text.json"), encoding="utf-8"))
FIRST = {}
_i = 0
for _s in META["surahs"]:
    FIRST[_s["n"]] = _i
    _i += _s["count"]


def letters(t):
    return max(1, len(re.sub(r"[^\u0621-\u064A]", "", t)))


def pause_intervals(path, noise="-32dB", min_d=0.18):
    e = subprocess.run([FF, "-i", path, "-af", f"silencedetect=noise={noise}:d={min_d}", "-f", "null", "-"],
                       capture_output=True, text=True).stderr
    st = [float(x) * 1000 for x in re.findall(r"silence_start: ([\d.]+)", e)]
    en = [float(x) * 1000 for x in re.findall(r"silence_end: ([\d.]+)", e)]
    return [(a, b) for a, b in zip(st, en)]


SKIP = 0.5


def align(surah, path):
    """Choose one pause per ayah boundary so that every ayah's duration fits its text length at a steady pace."""
    import math
    n = META["surahs"][surah - 1]["count"]
    L = [letters(TEXT[FIRST[surah] + k]) for k in range(n)]
    T = duration_ms(path)
    iv = pause_intervals(path)
    # opening (isti'adha / basmala): recitation of ayah 1 starts after the first pause whose preceding speech
    # is at least as long as a basmala; Al-Fatiha & At-Tawbah have no separate basmala.
    pts = [(b - 80, b - a) for a, b in iv]                       # candidate start = end of pause
    if not pts:
        return None
    if surah in (1, 9):
        first_cands = [(0.0, 1.0)] + pts[:3]
    else:
        first_cands = [(0.0, 0.5)] + pts[:6]
    cands = sorted(set(first_cands + pts))
    M = len(cands)
    rate = (T - cands[0][0]) / sum(L) * 0.85                   # ms per letter, pauses included
    bon = [2.2 * min(c[1] / 1000.0, 2.5) for c in cands]
    pref = [0.0]
    for x in bon:
        pref.append(pref[-1] + x)                                # pref[j] = sum of bonuses of cands[:j]
    INF = float("inf")

    def seg_cost(k, i, j):
        # ayah k spans candidate i .. candidate j (start of next)
        dur = cands[j][0] - cands[i][0]
        exp = L[k] * rate + 700
        if dur <= 0:
            return INF
        r = math.log(dur / exp)
        skipped = pref[j] - pref[i + 1]                          # long pauses left inside the ayah
        return 3.0 * r * r + SKIP * skipped

    def bonus(j):
        return bon[j]

    first_idx = [cands.index(c) for c in first_cands]
    dp = [INF] * M
    for i in first_idx:
        dp[i] = 0.0 if cands[i][0] == 0 else -0.3 * bonus(i)
    backs = []
    for k in range(n - 1):
        nd, bk = [INF] * M, [-1] * M
        for j in range(M):
            best, arg = INF, -1
            for i in range(j - 1, -1, -1):
                if dp[i] == INF:
                    continue
                dur = cands[j][0] - cands[i][0]
                if dur > 8 * (L[k] * rate + 900):
                    break
                c = dp[i] + seg_cost(k, i, j)
                if c < best:
                    best, arg = c, i
            if arg >= 0:
                nd[j], bk[j] = best - bonus(j), arg
        backs.append(bk)
        dp = nd
    # last ayah runs to the end of the file
    end = T
    best, j = INF, -1
    for i in range(M):
        if dp[i] < INF:
            dur = end - cands[i][0]
            c = dp[i] + (3.0 * math.log(max(dur, 1) / (L[-1] * rate + 700)) ** 2 + SKIP * (pref[M] - pref[i + 1])
                         if dur > 0 else INF)
            if c < best:
                best, j = c, i
    if j < 0:
        return None
    idx = [j]
    for bk in reversed(backs):
        j = bk[j]
        idx.append(j)
    idx.reverse()
    return [int(cands[i][0]) for i in idx] + [T]


def main():
    audio = sys.argv[1]
    if "--validate" in sys.argv:
        key = sys.argv[sys.argv.index("--validate") + 1]
        truth = json.load(open(os.path.join(OUT, f"quran_timing_{key}.json")))
        errs = []
        for f in sorted(os.listdir(os.path.join(audio, key))):
            s = int(f[:3])
            got = align(s, os.path.join(audio, key, f))
            real = truth[str(s)]
            e = [abs(a - b) for a, b in zip(got[:-1], real[:-1])]
            errs += e
            print(s, "ayahs", len(e), "median ms", sorted(e)[len(e) // 2], "within 1s:", sum(x < 1000 for x in e), "/", len(e))
        errs.sort()
        print("overall median", errs[len(errs) // 2], "p90", errs[int(len(errs) * .9)], "within 1s", sum(x < 1000 for x in errs) / len(errs))
        return
    result = {}
    for f in sorted(os.listdir(os.path.join(audio, "balushi"))):
        s = int(f[:3])
        t = align(s, os.path.join(audio, "balushi", f))
        if t:
            result[str(s)] = t
    path = os.path.join(OUT, "quran_timing_balushi.json")
    json.dump(result, open(path, "w"), separators=(",", ":"))
    print("balushi surahs:", len(result), os.path.getsize(path) // 1024, "KB")


if __name__ == "__main__":
    main()
