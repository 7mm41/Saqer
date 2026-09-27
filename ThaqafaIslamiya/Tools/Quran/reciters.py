"""The app's reciters (Hafs ʿan ʿAsim, murattal). Audio: full-surah MP3 from mp3quran.net (`<server><sss>.mp3`).
Also written to Assets/Quran/quran_reciters.json for the app by write_reciters() below."""
import json, os

RECITERS = [
    {"key": "balushi", "ar": "هزاع البلوشي", "en": "Hazza Al-Balushi", "server": "https://server11.mp3quran.net/hazza/",
     "timingRead": None,
     "missing": [2, 3, 4, 5, 7, 9, 10, 11, 16, 23, 24, 26, 27, 28, 33, 48, 58, 59, 60, 62, 64, 65, 66]},
    {"key": "alafasy", "ar": "مشاري العفاسي", "en": "Mishary Alafasy", "server": "https://server8.mp3quran.net/afs/", "timingRead": 123},
    {"key": "husary", "ar": "محمود خليل الحصري", "en": "Mahmoud Khalil Al-Husary", "server": "https://server13.mp3quran.net/husr/", "timingRead": 118},
    {"key": "minshawi", "ar": "محمد صديق المنشاوي", "en": "Mohamed Siddiq Al-Minshawi", "server": "https://server10.mp3quran.net/minsh/", "timingRead": 112},
    {"key": "abdulbasit", "ar": "عبدالباسط عبدالصمد", "en": "AbdulBaset AbdulSamad", "server": "https://server7.mp3quran.net/basit/", "timingRead": 53},
    {"key": "sudais", "ar": "عبدالرحمن السديس", "en": "Abdul Rahman Al-Sudais", "server": "https://server11.mp3quran.net/sds/", "timingRead": 54},
    {"key": "shuraim", "ar": "سعود الشريم", "en": "Saud Al-Shuraim", "server": "https://server7.mp3quran.net/shur/", "timingRead": 31},
    {"key": "ghamdi", "ar": "سعد الغامدي", "en": "Saad Al-Ghamdi", "server": "https://server7.mp3quran.net/s_gmd/", "timingRead": 30},
    {"key": "yasser", "ar": "ياسر الدوسري", "en": "Yasser Al-Dosari", "server": "https://server11.mp3quran.net/yasser/", "timingRead": 92},
    {"key": "qatami", "ar": "ناصر القطامي", "en": "Nasser Al-Qatami", "server": "https://server6.mp3quran.net/qtm/", "timingRead": 86},
    {"key": "tunaiji", "ar": "خليفة الطنيجي", "en": "Khalifa Al-Tunaiji", "server": "https://server12.mp3quran.net/tnjy/", "timingRead": 24},
]

# Surahs bundled inside the app (offline from the first launch).
BUNDLED = {
    "balushi": [1, 18, 36, 55, 56, 67] + list(range(78, 115)),
    "alafasy": [2, 18, 67],
}


def write_reciters(out_dir):
    data = []
    for r in RECITERS:
        data.append({"key": r["key"], "ar": r["ar"], "en": r["en"], "server": r["server"],
                     "missing": r.get("missing", []), "bundled": BUNDLED.get(r["key"], [])})
    json.dump(data, open(os.path.join(out_dir, "quran_reciters.json"), "w", encoding="utf-8"),
              ensure_ascii=False, separators=(",", ":"))


if __name__ == "__main__":
    write_reciters(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "ThaqafaIslamiya", "Assets", "Quran"))
    print("ok")
