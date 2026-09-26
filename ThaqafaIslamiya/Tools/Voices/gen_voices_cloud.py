"""Arabic narration with a realistic adult male voice from a cloud TTS service.

Target voice: a man of ~30–35 with a warm, resonant tone, reading clear Standard Arabic (Fusha)
in a calm, respectful, measured teaching pace. The text read is exactly the text shown on screen.
Output names match gen_voices.py, so the app uses the new clips without any code change:

  voice_ar_step_<stepId>.m4a   step title + text
  voice_ar_m_<masalaId>.m4a    masala title + summary + points
  voice_dua_<stepId>.m4a       supplication (fully diacritized)

Providers (pick one; the key is read from the environment, never from the command line):

  elevenlabs  ELEVENLABS_API_KEY   most human-sounding; choose a male Arabic voice:
                                    python3 gen_voices_cloud.py --provider elevenlabs --list-voices
  google      GOOGLE_TTS_API_KEY   Google Cloud TTS, Chirp 3 HD (default ar-XA-Chirp3-HD-Charon)
  azure       AZURE_SPEECH_KEY + AZURE_SPEECH_REGION   (default ar-OM-AbdullahNeural)
  edge        no key — Microsoft Edge neural voices via edge-tts (default ar-OM-AbdullahNeural — Omani male).
              Behind a TLS-inspecting proxy set EDGE_TTS_CAFILE to the proxy CA bundle.

usage:
  python3 gen_voices_cloud.py OUT_DIR --provider elevenlabs --voice <voice_id> [--only steps|masail|dua] [--force]
  python3 gen_voices_cloud.py OUT_DIR --provider elevenlabs --voice <voice_id> --sample   # one test clip
"""
import argparse, json, os, re, subprocess, sys, tempfile, time
import urllib.parse, urllib.request, urllib.error
import base64
from xml.sax.saxutils import escape

import imageio_ffmpeg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gen_voices import DATA, DUAS, clean  # noqa: E402  (shared texts & hand-diacritized duas)

FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()

DEFAULT_VOICE = {
    "edge": "ar-OM-AbdullahNeural",
    "elevenlabs": None,                        # must be chosen (see --list-voices)
    "google": "ar-XA-Chirp3-HD-Charon",
    "azure": "ar-OM-AbdullahNeural",
}

PACE = 0.95       # measured teaching pace (heavier slowing sounds robotic)
DUA_PACE = 0.90   # supplications slower and more deliberate


# MARK: - HTTP

def http(url, body=None, headers=None, method=None):
    data = json.dumps(body).encode() if isinstance(body, (dict, list)) else body
    req = urllib.request.Request(url, data=data, headers=headers or {}, method=method)
    for attempt in range(5):
        try:
            with urllib.request.urlopen(req, timeout=180) as resp:
                return resp.read()
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503) and attempt < 4:
                time.sleep(2 ** attempt * 2)
                continue
            raise SystemExit(f"HTTP {e.code} from {urllib.parse.urlsplit(url).netloc}: {e.read()[:400]!r}")


def need(var):
    value = os.environ.get(var)
    if not value:
        raise SystemExit(f"Set the environment variable {var}.")
    return value


# MARK: - Providers (each returns MP3 bytes)

def elevenlabs(voice, parts, pace):
    key = need("ELEVENLABS_API_KEY")
    # A full stop + line break gives a natural, clear pause between title / sentences / points.
    text = "\n".join(p if p.endswith((".", "؟", "!")) else p + "." for p in parts)
    return http(
        f"https://api.elevenlabs.io/v1/text-to-speech/{voice}?output_format=mp3_44100_128",
        {
            "text": text,
            "model_id": os.environ.get("ELEVENLABS_MODEL", "eleven_multilingual_v2"),
            "language_code": "ar",
            "voice_settings": {
                "stability": 0.62,          # calm and even, no theatrical swings
                "similarity_boost": 0.8,
                "style": 0.1,
                "use_speaker_boost": True,
                "speed": pace,
            },
        },
        {"xi-api-key": key, "Content-Type": "application/json", "Accept": "audio/mpeg"},
    )


def google(voice, parts, pace):
    key = need("GOOGLE_TTS_API_KEY")
    text = " ".join(p if p.endswith((".", "؟", "!")) else p + "." for p in parts)
    out = http(
        f"https://texttospeech.googleapis.com/v1/text:synthesize?key={urllib.parse.quote(key)}",
        {
            "input": {"text": text},
            "voice": {"languageCode": "ar-XA", "name": voice},
            "audioConfig": {"audioEncoding": "MP3", "speakingRate": pace, "sampleRateHertz": 24000},
        },
        {"Content-Type": "application/json"},
    )
    return base64.b64decode(json.loads(out)["audioContent"])


def azure(voice, parts, pace):
    key = need("AZURE_SPEECH_KEY")
    region = os.environ.get("AZURE_SPEECH_REGION", "eastus")
    body = '<break time="450ms"/>'.join(escape(p) for p in parts if p)
    ssml = (
        '<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="ar-SA">'
        f'<voice name="{voice}"><prosody rate="{round((pace - 1) * 100)}%" pitch="-4%">{body}</prosody>'
        '</voice></speak>'
    )
    return http(
        f"https://{region}.tts.speech.microsoft.com/cognitiveservices/v1",
        ssml.encode("utf-8"),
        {"Ocp-Apim-Subscription-Key": key, "Content-Type": "application/ssml+xml",
         "X-Microsoft-OutputFormat": "audio-24khz-96kbitrate-mono-mp3", "User-Agent": "ThaqafaIslamiya"},
    )


def edge(voice, parts, pace):
    import asyncio, ssl
    import edge_tts
    import edge_tts.communicate as communicate
    cafile = os.environ.get("EDGE_TTS_CAFILE")
    if cafile:
        communicate._SSL_CTX = ssl.create_default_context(cafile=cafile)
    # A full stop + line break gives a clear, natural pause between title / sentences / points.
    text = "\n".join(p if p.endswith((".", "؟", "!")) else p + "." for p in parts)
    rate = f"{round((pace - 1) * 100):+d}%"

    async def run():
        chunks = []
        async for msg in edge_tts.Communicate(text, voice, rate=rate, pitch="-2Hz").stream():
            if msg["type"] == "audio":
                chunks.append(msg["data"])
        return b"".join(chunks)

    for attempt in range(5):
        try:
            audio = asyncio.run(run())
            if audio:
                return audio
        except Exception as e:  # network hiccups / throttling
            if attempt == 4:
                raise SystemExit(f"edge-tts failed: {e}")
        time.sleep(2 ** attempt)
    raise SystemExit("edge-tts returned no audio")


PROVIDERS = {"elevenlabs": elevenlabs, "google": google, "azure": azure, "edge": edge}


def list_elevenlabs_voices():
    """Arabic male voices from the ElevenLabs voice library (add one to your account, then use its id)."""
    key = need("ELEVENLABS_API_KEY")
    q = urllib.parse.urlencode({"language": "ar", "gender": "male", "page_size": 40, "sort": "usage_character_count_1y"})
    data = json.loads(http(f"https://api.elevenlabs.io/v1/shared-voices?{q}", headers={"xi-api-key": key}))
    for v in data.get("voices", []):
        print(f"{v['voice_id']}  {v.get('name')}  | {v.get('age')} | {v.get('accent')} | {v.get('descriptive') or ''} "
              f"| {v.get('use_case') or ''}")


# MARK: - Encode

def to_m4a(mp3_bytes, out_path):
    with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as tmp:
        tmp.write(mp3_bytes)
        mp3 = tmp.name
    try:
        subprocess.run(
            [FFMPEG, "-y", "-loglevel", "error", "-i", mp3,
             # warmth: gentle low-mid lift, softened sibilance, then loudness normalisation
             "-af", "highpass=f=60,equalizer=f=180:t=q:w=1.0:g=2,equalizer=f=6500:t=q:w=1.5:g=-2,"
                    "loudnorm=I=-16:TP=-1.5:LRA=11",
             "-ac", "1", "-ar", "24000", "-c:a", "aac", "-b:a", "48k",
             "-movflags", "+faststart", out_path],
            check=True,
        )
    finally:
        os.unlink(mp3)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("out", nargs="?")
    ap.add_argument("--provider", choices=PROVIDERS, default="elevenlabs")
    ap.add_argument("--voice")
    ap.add_argument("--only", choices=["steps", "masail", "dua"])
    ap.add_argument("--force", action="store_true", help="overwrite existing clips")
    ap.add_argument("--sample", action="store_true", help="only one step + one dua, to audition the voice")
    ap.add_argument("--list-voices", action="store_true")
    a = ap.parse_args()

    if a.list_voices:
        if a.provider != "elevenlabs":
            raise SystemExit("--list-voices is for ElevenLabs; Google/Azure voices are listed in their docs.")
        return list_elevenlabs_voices()

    voice = a.voice or DEFAULT_VOICE[a.provider]
    if not voice or not a.out:
        raise SystemExit("Give OUT_DIR and --voice (ElevenLabs: see --list-voices).")
    synth = PROVIDERS[a.provider]
    os.makedirs(a.out, exist_ok=True)
    data = json.load(open(os.path.join(DATA, "TalqeenData.json"), encoding="utf-8"))

    jobs = []
    if a.only in (None, "steps"):
        for lesson in data["lessons"]:
            for s in lesson["steps"]:
                jobs.append((f"voice_ar_step_{s['id']}", [s["title"], s["text"]], PACE))
    if a.only in (None, "masail"):
        for c in data["chapters"]:
            for m in c["masail"]:
                jobs.append((f"voice_ar_m_{m['id']}", [m["title"], m["summary"], *m["points"]], PACE))
    if a.only in (None, "dua"):
        for sid, dua in DUAS.items():
            jobs.append((f"voice_dua_{sid}", re.split(r"(?<=\.)\s+", dua), DUA_PACE))
    if a.sample:
        jobs = [j for j in jobs if j[0] in ("voice_ar_step_wudu_07", "voice_dua_wudu_07")]

    for n, (name, parts, pace) in enumerate(jobs, 1):
        out = os.path.join(a.out, name + ".m4a")
        if os.path.exists(out) and not a.force:
            continue
        to_m4a(synth(voice, [clean(p, "ar") for p in parts], pace), out)
        print(f"[{n}/{len(jobs)}] {name}", flush=True)


if __name__ == "__main__":
    main()
