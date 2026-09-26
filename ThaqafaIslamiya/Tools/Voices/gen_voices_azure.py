"""Arabic narration with a natural adult male voice (Azure Neural TTS, REST over HTTPS).

Voice: a warm, resonant man (~30–35) reading clear Standard Arabic (Fusha) in a calm,
respectful, measured teaching pace. Output file names are identical to gen_voices.py,
so the app picks the new clips up without code changes:

  voice_ar_step_<stepId>.m4a   step title + text (exactly the text shown on screen)
  voice_ar_m_<masalaId>.m4a    masala title + summary + points (as shown on screen)
  voice_dua_<stepId>.m4a       supplication, fully diacritized

usage:
  export AZURE_SPEECH_KEY=...  AZURE_SPEECH_REGION=eastus
  python3 gen_voices_azure.py OUT_DIR [--voice ar-OM-AbdullahNeural] [--only steps|masail|dua] [--force]

Azure's free tier (F0) covers 500k characters/month; the whole Arabic book is ~40k characters.
Audio produced with Azure TTS under your own subscription may be used in your app.
"""
import argparse, json, os, re, subprocess, sys, tempfile, time
import urllib.request, urllib.error
from xml.sax.saxutils import escape

import imageio_ffmpeg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gen_voices import DATA, DUAS, clean  # noqa: E402  (shared texts & hand-diacritized duas)

FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()

# Measured teaching pace and a slightly lower pitch for a warm, resonant timbre.
PROSODY = dict(rate="-8%", pitch="-4%")
SENTENCE_PAUSE_MS = 450   # clear pause between title / sentences / points
DUA_RATE = "-14%"          # supplications a little slower and more deliberate


def ssml(voice: str, parts: list[str], rate: str) -> str:
    body = f'<break time="{SENTENCE_PAUSE_MS}ms"/>'.join(escape(p) for p in parts if p)
    return (
        '<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" '
        'xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="ar-SA">'
        f'<voice name="{voice}"><mstts:silence type="Leading-exact" value="120ms"/>'
        f'<prosody rate="{rate}" pitch="{PROSODY["pitch"]}">{body}</prosody>'
        '</voice></speak>'
    )


def synthesize(key: str, region: str, doc: str, out_path: str):
    req = urllib.request.Request(
        f"https://{region}.tts.speech.microsoft.com/cognitiveservices/v1",
        data=doc.encode("utf-8"),
        headers={
            "Ocp-Apim-Subscription-Key": key,
            "Content-Type": "application/ssml+xml",
            "X-Microsoft-OutputFormat": "audio-24khz-96kbitrate-mono-mp3",
            "User-Agent": "ThaqafaIslamiya-voice-builder",
        },
    )
    for attempt in range(5):
        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                audio = resp.read()
            break
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503) and attempt < 4:
                time.sleep(2 ** attempt * 2)
                continue
            raise SystemExit(f"Azure TTS error {e.code}: {e.read()[:300]!r}")
    with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as tmp:
        tmp.write(audio)
        mp3 = tmp.name
    try:
        subprocess.run(
            [FFMPEG, "-y", "-loglevel", "error", "-i", mp3,
             "-af", "loudnorm=I=-16:TP=-1.5:LRA=11",
             "-ac", "1", "-ar", "24000", "-c:a", "aac", "-b:a", "40k",
             "-movflags", "+faststart", out_path],
            check=True,
        )
    finally:
        os.unlink(mp3)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("out")
    ap.add_argument("--voice", default="ar-OM-AbdullahNeural",
                    help="e.g. ar-OM-AbdullahNeural (Omani) or ar-SA-HamedNeural (Saudi) — both read Fusha")
    ap.add_argument("--only", choices=["steps", "masail", "dua"])
    ap.add_argument("--force", action="store_true", help="overwrite existing clips")
    a = ap.parse_args()

    key = os.environ.get("AZURE_SPEECH_KEY")
    region = os.environ.get("AZURE_SPEECH_REGION", "eastus")
    if not key:
        raise SystemExit("Set AZURE_SPEECH_KEY (and AZURE_SPEECH_REGION).")
    os.makedirs(a.out, exist_ok=True)
    data = json.load(open(os.path.join(DATA, "TalqeenData.json"), encoding="utf-8"))

    jobs = []
    if a.only in (None, "steps"):
        for lesson in data["lessons"]:
            for s in lesson["steps"]:
                jobs.append((f"voice_ar_step_{s['id']}", [s["title"], s["text"]], PROSODY["rate"]))
    if a.only in (None, "masail"):
        for c in data["chapters"]:
            for m in c["masail"]:
                jobs.append((f"voice_ar_m_{m['id']}", [m["title"], m["summary"], *m["points"]], PROSODY["rate"]))
    if a.only in (None, "dua"):
        for sid, dua in DUAS.items():
            jobs.append((f"voice_dua_{sid}", re.split(r"(?<=\.)\s+", dua), DUA_RATE))

    for n, (name, parts, rate) in enumerate(jobs, 1):
        out = os.path.join(a.out, name + ".m4a")
        if os.path.exists(out) and not a.force:
            continue
        synthesize(key, region, ssml(a.voice, [clean(p, "ar") for p in parts], rate), out)
        print(f"[{n}/{len(jobs)}] {name}", flush=True)


if __name__ == "__main__":
    main()
