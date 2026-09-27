"""Download the official prayer times of Oman's Ministry of Endowments and Religious Affairs (mara.gov.om).

calendar_page4.asp returns, for one day, the six times of all 86 reference places the Ministry publishes.
Each day is cached as RAW_DIR/YYYY-MM-DD.json ({place: [fajr, sunrise, dhuhr, asr, maghrib, isha]} as printed).

The Ministry's server omits its intermediate certificate (DigiCert Global G2 TLS RSA SHA256 2020 CA1), so
verification needs that intermediate added to the CA bundle (downloaded from cacerts.digicert.com) —
verification stays on.
usage: python3 fetch_oman_ministry.py RAW_DIR CA_BUNDLE FIRST_YEAR LAST_YEAR
"""
import datetime, html, json, os, re, ssl, sys, time, urllib.parse, urllib.request
from concurrent.futures import ThreadPoolExecutor

URL = "https://www.mara.gov.om/arabic/calendar_page4.asp"


def fetch_day(ctx, day):
    data = urllib.parse.urlencode({"year": day.year, "month": day.month, "day": day.day, "B1": "أعرض"}).encode()
    req = urllib.request.Request(URL, data=data, headers={"User-Agent": "Mozilla/5.0 (prayer-times build; xiisaqer@gmail.com)"})
    with urllib.request.urlopen(req, context=ctx, timeout=90) as r:
        text = r.read().decode("utf-8", "replace")
    out = {}
    for row in re.findall(r"<tr[^>]*>(.*?)</tr>", text, re.S):
        cells = [html.unescape(re.sub(r"<[^>]+>", "", c)).strip() for c in re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", row, re.S)]
        if len(cells) == 7 and re.fullmatch(r"\d\d:\d\d", cells[1]):
            out[cells[0]] = cells[1:]
    return out


def main():
    raw, bundle, first, last = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
    os.makedirs(raw, exist_ok=True)
    ctx = ssl.create_default_context(cafile=bundle)
    days = []
    d = datetime.date(first, 1, 1)
    while d.year <= last:
        if not os.path.exists(os.path.join(raw, f"{d}.json")):
            days.append(d)
        d += datetime.timedelta(days=1)

    def work(day):
        for attempt in range(8):
            try:
                rows = fetch_day(ctx, day)
                if len(rows) >= 80:
                    json.dump(rows, open(os.path.join(raw, f"{day}.json"), "w", encoding="utf-8"), ensure_ascii=False)
                    return True
            except Exception:
                pass
            time.sleep(3 * (attempt + 1))
        print("failed", day, flush=True)
        return False

    done = 0
    with ThreadPoolExecutor(3) as ex:
        for ok in ex.map(work, days):
            done += ok
            if done % 50 == 0:
                print("fetched", done, "of", len(days), flush=True)
    print("done", done, "of", len(days))


if __name__ == "__main__":
    main()
