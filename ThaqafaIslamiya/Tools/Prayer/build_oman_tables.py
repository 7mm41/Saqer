"""Pack the Ministry of Awqaf's official prayer times (from fetch_oman_ministry.py) for the app.

Output (Assets/Data):
  oman_ministry.json  {"start": "YYYY-MM-DD", "days": N, "places": [[name, lat, lng], ...]}
  oman_ministry.bin   little-endian UInt16 minutes after midnight (Oman time), ordered place → day →
                      fajr, sunrise, dhuhr, asr, maghrib, isha
lat/lng are each place's reference point as fitted from its own year of official times (fit_ministry_coords.py);
the app starts from the nearest place's official time and adds the astronomical difference to the user's position.
Checks: every day has all places, the six times are in order, and no time moves more than 3 minutes day to day.
usage: python3 build_oman_tables.py DAYS_DIR COORDS_JSON
"""
import datetime, glob, json, os, struct, sys

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "..", "ThaqafaIslamiya", "Assets", "Data")


def minutes(text, column):
    h, m = int(text[:2]), int(text[3:])
    if column >= 3 or (column == 2 and h < 11):      # asr, maghrib, isha are PM; dhuhr is 11:xx/12:xx or 01:xx
        h += 12
    return h * 60 + m


def main():
    days_dir, coords_path = sys.argv[1], sys.argv[2]
    coords = json.load(open(coords_path, encoding="utf-8"))
    files = sorted(glob.glob(os.path.join(days_dir, "*.json")))
    dates = [datetime.date.fromisoformat(os.path.basename(f)[:10]) for f in files]
    for a, b in zip(dates, dates[1:]):
        if (b - a).days != 1:
            raise SystemExit(f"missing days between {a} and {b}")
    first = json.load(open(files[0], encoding="utf-8"))
    names = list(first.keys())
    missing = [n for n in names if n not in coords]
    if missing:
        raise SystemExit(f"no coordinates for {missing}")

    table = {n: [] for n in names}
    for f in files:
        rows = json.load(open(f, encoding="utf-8"))
        for n in names:
            if n not in rows:
                raise SystemExit(f"{n} missing on {f}")
            t = [minutes(v, i) for i, v in enumerate(rows[n])]
            if t != sorted(t):
                raise SystemExit(f"{n} {f}: times out of order {rows[n]}")
            table[n].append(t)
    for n, series in table.items():
        for i in range(1, len(series)):
            for k in range(6):
                if abs(series[i][k] - series[i - 1][k]) > 3:
                    raise SystemExit(f"{n}: jump on day {i} prayer {k}")

    blob = bytearray()
    for n in names:
        for t in table[n]:
            blob += struct.pack("<6H", *t)
    open(os.path.join(OUT, "oman_ministry.bin"), "wb").write(blob)
    meta = {"start": dates[0].isoformat(), "days": len(dates),
            "places": [[n, coords[n][0], coords[n][1]] for n in names]}
    json.dump(meta, open(os.path.join(OUT, "oman_ministry.json"), "w", encoding="utf-8"), ensure_ascii=False)
    print(f"{len(names)} places × {len(dates)} days ({dates[0]} … {dates[-1]}), {len(blob) // 1024} KB")


if __name__ == "__main__":
    main()
