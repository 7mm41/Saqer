"""Generate bundled neural narration (Piper) for every language.

Outputs (flat, unique names — Xcode flattens resources):
  voice_<lang>_step_<stepId>.m4a   lesson step: title + text
  voice_<lang>_m_<masalaId>.m4a    masala: title + summary + points
  voice_dua_<stepId>.m4a           Arabic dua (hand-diacritized, shared by all languages)

usage: python3 gen_voices.py OUT_DIR [lang ...] [--only steps|masail|dua]
"""
import json, os, re, subprocess, sys, tempfile, wave

import imageio_ffmpeg

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "ThaqafaIslamiya", "Assets", "Data")
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()

VOICES = {
    "ar": "ar_JO-kareem-medium",
    "en": "en_US-lessac-high",
    "fa": "fa_IR-gyro-medium",
    "tr": "tr_TR-dfki-medium",
    "hi": "hi_IN-priyamvada-medium",
    "bn": "bn_BD-google-medium",
}

# Slightly slower than default and with clear pauses between sentences — for children.
PIPER_CONFIG = dict(length_scale=1.08, noise_scale=0.6, noise_w_scale=0.75)

DUAS = {
    "wudu_05": "اللَّهُمَّ اسْقِنِي مِنَ الْمَاءِ الرَّحِيقِ الْمَخْتُومِ",
    "wudu_06": "اللَّهُمَّ لَا تَحْرِمْنِي مِنْ رَوَائِحِ جَنَّتِكَ، بِرَحْمَتِكَ يَا أَرْحَمَ الرَّاحِمِينَ",
    "wudu_07": "اللَّهُمَّ بَيِّضْ وَجْهِي بِنُورِكَ، يَوْمَ تَبْيَضُّ وُجُوهُ عِبَادِكَ الصَّالِحِينَ، يَا أَرْحَمَ الرَّاحِمِينَ",
    "wudu_08": "اللَّهُمَّ أَعْطِنِي كِتَابِي بِيَمِينِي، وَحَاسِبْنِي حِسَابًا يَسِيرًا",
    "wudu_09": "اللَّهُمَّ إِنِّي أَعُوذُ بِكَ أَنْ تُعْطِيَنِي كِتَابِي بِشِمَالِي، أَوْ مِنْ وَرَاءِ ظَهْرِي",
    "wudu_10": "اللَّهُمَّ أَظِلَّنِي بِظِلِّ عَرْشِكَ، يَوْمَ لَا ظِلَّ إِلَّا ظِلُّكَ",
    "wudu_11": "اللَّهُمَّ اجْعَلْنِي مِنَ الَّذِينَ يَسْتَمِعُونَ الْقَوْلَ فَيَتَّبِعُونَ أَحْسَنَهُ",
    "wudu_12": "اللَّهُمَّ ثَبِّتْ قَدَمَيَّ عَلَى الْحَقِّ وَالدِّينِ، بِرَحْمَتِكَ يَا أَرْحَمَ الرَّاحِمِينَ",
    "salah_03": "أُصَلِّي لِلَّهِ تَبَارَكَ وَتَعَالَى، فِي مَقَامِي هَذَا، فَرِيضَةَ الظُّهْرِ، أَرْبَعَ رَكَعَاتٍ، مُتَوَجِّهًا إِلَى الْكَعْبَةِ الشَّرِيفَةِ، أَدَاءً لِلْفَرْضِ، طَاعَةً لِلَّهِ وَلِرَسُولِهِ مُحَمَّدٍ، صَلَّى اللَّهُ عَلَيْهِ وَسَلَّمَ",
    "salah_05": "سُبْحَانَكَ اللَّهُمَّ وَبِحَمْدِكَ، تَبَارَكَ اسْمُكَ، وَتَعَالَى جَدُّكَ، وَجَلَّ ثَنَاؤُكَ، وَلَا إِلَهَ غَيْرُكَ",
    "salah_06": "إِنِّي وَجَّهْتُ وَجْهِيَ لِلَّذِي فَطَرَ السَّمَاوَاتِ وَالْأَرْضَ، حَنِيفًا، وَمَا أَنَا مِنَ الْمُشْرِكِينَ",
    "salah_07": "أُصَلِّي لِلَّهِ تَعَالَى فَرِيضَةَ الظُّهْرِ، أَرْبَعَ رَكَعَاتٍ، وَأَنَّ الْكَعْبَةَ قِبْلَتِي",
    "salah_08": "اللَّهُ أَكْبَرُ",
    "salah_09": "أَعُوذُ بِاللَّهِ مِنَ الشَّيْطَانِ الرَّجِيمِ",
    "salah_11": "سُبْحَانَ رَبِّيَ الْعَظِيمِ",
    "salah_12": "سَمِعَ اللَّهُ لِمَنْ حَمِدَهُ. رَبَّنَا وَلَكَ الْحَمْدُ",
    "salah_13": "سُبْحَانَ رَبِّيَ الْأَعْلَى",
    "salah_15": "سُبْحَانَ رَبِّيَ الْأَعْلَى",
    "salah_17": "التَّحِيَّاتُ الْمُبَارَكَاتُ لِلَّهِ، وَالصَّلَوَاتُ وَالطَّيِّبَاتُ، السَّلَامُ عَلَى النَّبِيِّ وَرَحْمَةُ اللَّهِ وَبَرَكَاتُهُ، السَّلَامُ عَلَيْنَا وَعَلَى عِبَادِ اللَّهِ الصَّالِحِينَ، أَشْهَدُ أَنْ لَا إِلَهَ إِلَّا اللَّهُ وَحْدَهُ لَا شَرِيكَ لَهُ، وَأَشْهَدُ أَنَّ مُحَمَّدًا عَبْدُهُ وَرَسُولُهُ",
}


def clean(text: str, lang: str) -> str:
    """Make text friendlier to the phonemizer (symbols, brackets, page refs)."""
    t = text.replace("ﷺ", " صَلَّى اللَّهُ عَلَيْهِ وَسَلَّمَ ")
    t = t.replace("«", "").replace("»", "").replace("“", "").replace("”", "").replace('"', "")
    t = re.sub(r"[()\[\]{}]", ", ", t)
    t = t.replace("…", ", ").replace("—", ", ").replace("–", ", ")
    t = re.sub(r"[\U0001F300-\U0001FAFF☀-➿]", "", t)  # emoji
    t = re.sub(r"\s+", " ", t).strip()
    return t


def join_sentences(parts, lang):
    stop = {"hi": "।", "bn": "।"}.get(lang, ".")
    out = []
    for p in parts:
        p = clean(p, lang).rstrip(" .،,:؛;!؟?।")
        if p:
            out.append(p + stop)
    return " ".join(out)


def synth(voice, text, out_path):
    if os.path.exists(out_path):
        return
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        wav_path = tmp.name
    try:
        with wave.open(wav_path, "wb") as wf:
            from piper import SynthesisConfig
            voice.synthesize_wav(text, wf, syn_config=SynthesisConfig(**PIPER_CONFIG))
        subprocess.run(
            [FFMPEG, "-y", "-loglevel", "error", "-i", wav_path,
             "-af", "highpass=f=70,loudnorm=I=-16:TP=-1.5:LRA=11,afade=t=in:d=0.03",
             "-ac", "1", "-ar", "22050", "-c:a", "aac", "-b:a", "28k",
             "-movflags", "+faststart", out_path],
            check=True,
        )
    finally:
        os.unlink(wav_path)


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    only = None
    if "--only" in sys.argv:
        only = sys.argv[sys.argv.index("--only") + 1]
        args = [a for a in args if a != only]
    out_dir = args[0]
    langs = args[1:] or list(VOICES)
    os.makedirs(out_dir, exist_ok=True)

    from piper import PiperVoice

    for lang in langs:
        voice = PiperVoice.load(os.path.join(os.environ.get("PIPER_VOICES", os.path.join(HERE, "voices")), VOICES[lang] + ".onnx"))
        suffix = "" if lang == "ar" else "." + lang
        data = json.load(open(os.path.join(DATA, f"TalqeenData{suffix}.json"), encoding="utf-8"))

        if only in (None, "steps"):
            for lesson in data["lessons"]:
                for step in lesson["steps"]:
                    text = join_sentences([step["title"], step["text"]], lang)
                    synth(voice, text, os.path.join(out_dir, f"voice_{lang}_step_{step['id']}.m4a"))
            print(lang, "steps done", flush=True)

        if only in (None, "masail"):
            for chapter in data["chapters"]:
                for m in chapter["masail"]:
                    text = join_sentences([m["title"], m["summary"], *m["points"]], lang)
                    synth(voice, text, os.path.join(out_dir, f"voice_{lang}_m_{m['id']}.m4a"))
            print(lang, "masail done", flush=True)

        if lang == "ar" and only in (None, "dua"):
            for step_id, dua in DUAS.items():
                synth(voice, dua, os.path.join(out_dir, f"voice_dua_{step_id}.m4a"))
            print("duas done", flush=True)


if __name__ == "__main__":
    main()
