"""Find the reference point the Ministry of Awqaf uses for each of its 86 places, from its official times.

The Ministry's rule (derived from its tables): Fajr and Isha at 18 degrees, sunrise/sunset at 0.833 degrees,
Asr shadow factor 1, then +5 minutes on Dhuhr, Asr and Maghrib and rounding up to the next minute. For each
place this searches the latitude/longitude whose times, under that rule and the app's own solar algorithm,
reproduce the most official values of a year (Dhuhr fixes the longitude; the seasons fix the latitude).
usage: python3 fit_ministry_coords.py DAYS_DIR YEAR OUT_JSON
"""
import datetime, glob, json, os, sys
import numpy as np

D2R = np.pi / 180
KEYS = ["fajr", "sunrise", "dhuhr", "asr", "maghrib", "isha"]
OFFSET = {"fajr": 0, "sunrise": 0, "dhuhr": 5, "asr": 5, "maghrib": 5, "isha": 0}


def julian(y, m, d):
    if m <= 2:
        y -= 1; m += 12
    a = y // 100
    return int(365.25 * (y + 4716)) + int(30.6001 * (m + 1)) + d + 2 - a + a // 4 - 1524.5


def raw(y, m, d, lat, lng, tz=4.0):
    """Astronomical times in minutes — the same algorithm as PrayerCalculator.rawHours in the app."""
    jd = julian(y, m, d) - lng / (15 * 24)

    def sun(t):
        n = jd + t - 2451545.0
        g = (357.529 + 0.98560028 * n) % 360
        q = (280.459 + 0.98564736 * n) % 360
        lam = (q + 1.915 * np.sin(g * D2R) + 0.020 * np.sin(2 * g * D2R)) % 360
        e = 23.439 - 0.00000036 * n
        ra = np.arctan2(np.cos(e * D2R) * np.sin(lam * D2R), np.cos(lam * D2R)) / D2R / 15
        return np.arcsin(np.sin(e * D2R) * np.sin(lam * D2R)) / D2R, q / 15 - (ra % 24)

    def mid(t):
        return (12 - sun(t)[1]) % 24

    def at(angle, t, ccw=False):
        decl = sun(t)[0]
        h = np.arccos((-np.sin(angle * D2R) - np.sin(decl * D2R) * np.sin(lat * D2R))
                      / (np.cos(decl * D2R) * np.cos(lat * D2R))) / D2R / 15
        return mid(t) - h if ccw else mid(t) + h

    def asr(t):
        decl = sun(t)[0]
        return at(-np.arctan(1 / (1 + np.tan(np.abs(lat - decl) * D2R))) / D2R, t)

    adj = tz - lng / 15
    return {"fajr": (at(18, 5 / 24, True) + adj) * 60, "sunrise": (at(0.833, 6 / 24, True) + adj) * 60,
            "dhuhr": (mid(12 / 24) + adj) * 60, "asr": (asr(13 / 24) + adj) * 60,
            "maghrib": (at(0.833, 18 / 24) + adj) * 60, "isha": (at(18, 18 / 24) + adj) * 60}


def minutes(text, column):
    h, m = int(text[:2]), int(text[3:])
    if column >= 3 or (column == 2 and h < 11):
        h += 12
    return h * 60 + m


def fit(observations):
    lng = np.arange(51.5, 60.0, 0.002)
    score = np.zeros_like(lng)
    for day, t in observations:
        r = raw(day.year, day.month, day.day, np.full_like(lng, 20.0), lng)
        score += np.ceil(r["dhuhr"] + 5) == t[2]
    lng0 = lng[score == score.max()].mean()
    lat = np.arange(16.0, 27.0, 0.005)[:, None]
    lg = np.arange(lng0 - 0.03, lng0 + 0.0301, 0.003)[None, :]
    LA = np.broadcast_to(lat, (lat.shape[0], lg.shape[1]))
    LO = np.broadcast_to(lg, LA.shape)
    score = np.zeros(LA.shape)
    for day, t in observations:
        r = raw(day.year, day.month, day.day, LA, LO)
        for i, k in enumerate(KEYS):
            score += np.ceil(r[k] + OFFSET[k]) == t[i]
    i = np.unravel_index(np.argmax(score), score.shape)
    return round(float(LA[i]), 3), round(float(LO[i]), 3), int(score[i]), 6 * len(observations)


def main():
    days_dir, year, out = sys.argv[1], sys.argv[2], sys.argv[3]
    files = sorted(glob.glob(os.path.join(days_dir, f"{year}-*.json")))[::4]      # every 4th day covers all seasons
    days = [(datetime.date.fromisoformat(os.path.basename(f)[:10]), json.load(open(f, encoding="utf-8"))) for f in files]
    result = {}
    for name in days[0][1]:
        obs = [(d, [minutes(v, i) for i, v in enumerate(rows[name])]) for d, rows in days if name in rows]
        lat, lng, ok, total = fit(obs)
        result[name] = [lat, lng]
        print(f"{name}: {lat}, {lng}  exact {ok}/{total}", flush=True)
    json.dump(result, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
