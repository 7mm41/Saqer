"""Ayah timings by CTC forced alignment (for reciters without official timings, e.g. Hazza Al-Balushi).

An Arabic wav2vec2 CTC model (jonatasgrosman/wav2vec2-large-xlsr-53-arabic) turns the recording into letter
probabilities; torchaudio's forced_align then places the surah's own text (letters only) on the audio, and the
first letter of each ayah gives its start time. Works for any voice because it follows the text itself.

usage (in a venv with torch, torchaudio, transformers):
  python3 ctc_align.py AUDIO_DIR/balushi OUT.json [surah ...]
  python3 ctc_align.py AUDIO_DIR/husary  --validate husary
"""
import json, os, re, subprocess, sys, time

import numpy as np
import torch
import torchaudio.functional as F
from transformers import Wav2Vec2ForCTC, Wav2Vec2Processor

HERE = os.path.dirname(os.path.abspath(__file__))
QDIR = os.path.join(HERE, "..", "..", "ThaqafaIslamiya", "Assets", "Quran")
META = json.load(open(os.path.join(QDIR, "quran_meta.json"), encoding="utf-8"))
TEXT = json.load(open(os.path.join(QDIR, "quran_text.json"), encoding="utf-8"))
FIRST, _i = {}, 0
for _s in META["surahs"]:
    FIRST[_s["n"]] = _i
    _i += _s["count"]
BASMALA = "بسم الله الرحمن الرحيم"
ISTIADHA = "اعوذ بالله من الشيطان الرجيم"
MODEL_ID = "jonatasgrosman/wav2vec2-large-xlsr-53-arabic"
SR = 16000

torch.set_num_threads(os.cpu_count() or 4)
processor = Wav2Vec2Processor.from_pretrained(MODEL_ID)
model = Wav2Vec2ForCTC.from_pretrained(MODEL_ID).eval()
VOCAB = processor.tokenizer.get_vocab()
BLANK = processor.tokenizer.pad_token_id
SEP = VOCAB.get("|")


def normalize(t):
    """Uthmani text -> plain letters in the model's alphabet (no diacritics, simple alef/ya forms)."""
    t = re.sub("[ؐ-ًؚ-ٰٟۖ-ۭـ]", "", t)   # harakat, Quranic marks, tatweel
    t = t.replace("ٱ", "ا").replace("أ", "ا").replace("إ", "ا").replace("آ", "ا").replace("ى", "ي")
    t = t.replace("ۥ", "").replace("ۦ", "").replace("ۜ", "")
    t = re.sub(r"[^ء-ي\s]", "", t)
    return re.sub(r"\s+", " ", t).strip()


def tokens(t):
    ids = []
    for w in normalize(t).split(" "):
        for ch in w:
            if ch in VOCAB:
                ids.append(VOCAB[ch])
        if SEP is not None:
            ids.append(SEP)
    return ids


def load_audio(path):
    raw = subprocess.run([__import__("imageio_ffmpeg").get_ffmpeg_exe(), "-v", "error", "-i", path, "-ac", "1",
                          "-ar", str(SR), "-f", "f32le", "-"], capture_output=True).stdout
    return np.frombuffer(raw, dtype=np.float32)


@torch.inference_mode()
def emissions(wave, chunk_s=20, overlap_s=1):
    chunk, ov = chunk_s * SR, overlap_s * SR
    outs, pos = [], 0
    while pos < len(wave):
        seg = wave[max(0, pos - ov): pos + chunk + ov]
        inp = processor(seg, sampling_rate=SR, return_tensors="pt").input_values
        lp = torch.log_softmax(model(inp).logits[0], dim=-1)
        fps = lp.shape[0] / (len(seg) / SR)
        lead = int(round((pos - max(0, pos - ov)) / SR * fps))
        keep = int(round(min(chunk, len(wave) - pos) / SR * fps))
        outs.append(lp[lead: lead + keep])
        pos += chunk
    em = torch.cat(outs)
    return em, len(wave) / SR / em.shape[0]


def first_frames(em_window, seqs):
    """Forced-align token sequences to an emission window; return the first frame of each sequence (or None)."""
    flat = [t for q in seqs for t in q]
    if not flat or len(flat) >= em_window.shape[0]:
        return None, None
    ali, scores = F.forced_align(em_window.unsqueeze(0), torch.tensor([flat], dtype=torch.int32), blank=BLANK)
    ali = ali[0].tolist()
    frames, t_idx, prev = [], 0, BLANK
    for f, tok in enumerate(ali):
        if t_idx < len(flat) and tok == flat[t_idx] and (tok != prev or prev == BLANK):
            frames.append(f)
            t_idx += 1
        prev = tok
    if len(frames) < len(flat):
        return None, None
    out, k = [], 0
    for q in seqs:
        out.append(frames[k])
        k += len(q)
    return out, float(scores[0].sum())


def align_surah(surah, path, group=8, commit=4):
    n = META["surahs"][surah - 1]["count"]
    ayahs = [tokens(TEXT[FIRST[surah] + k]) for k in range(n)]
    wave = load_audio(path)
    cache = path + ".em.pt"
    if os.path.exists(cache):
        em, spf = torch.load(cache)
    else:
        em, spf = emissions(wave)
        torch.save((em, spf), cache)
    total_frames = em.shape[0]
    fpt = 0.25 / spf                       # initial guess: 0.25 s per letter
    # 1) opening: isti'adha / basmala before ayah 1 (not for Al-Fatiha / At-Tawbah)
    prefixes = [[], [tokens(BASMALA)], [tokens(ISTIADHA), tokens(BASMALA)]] if surah not in (1, 9) else [[], [tokens(ISTIADHA)]]
    head = ayahs[:min(group, n)]
    best = None
    for pre in prefixes:
        need = sum(len(q) for q in pre + head)
        win = min(total_frames, int(need * fpt * 2.2) + int(15 / spf))
        fr, sc = first_frames(em[:win], pre + head)
        if fr is not None and (best is None or sc / max(1, need) > best[0]):
            best = (sc / max(1, need), len(pre))
    if best is None:
        print("  opening alignment failed", flush=True)
        return None
    offset_ayah_frames = []
    pos, k = 0, 0
    skip = best[1]
    pre = prefixes[[len(p) for p in prefixes].index(skip)]
    while k < n:
        seqs = pre + ayahs[k:k + group]
        need = sum(len(q) for q in seqs)
        last_group = k + group >= n
        win_end = total_frames if last_group else min(total_frames, pos + int(need * fpt * 1.3) + int(6 / spf))
        fr = None
        while fr is None:
            fr, _ = first_frames(em[pos:win_end], seqs)
            if fr is None:
                if win_end >= total_frames:
                    print(f"  window failed at ayah {k + 1}", flush=True)
                    return None
                win_end = min(total_frames, win_end + int(max(8, need * fpt * spf * 0.25) / spf))
        fr = fr[len(pre):]
        if os.environ.get("ALIGN_DEBUG"):
            print(f"  k={k + 1} pos={pos * spf:.1f}s win={(win_end - pos) * spf:.0f}s first={(pos + fr[0]) * spf:.1f}s fpt={fpt * spf:.3f}", flush=True)
        take = len(fr) if last_group else min(commit, len(fr))
        for j in range(take):
            offset_ayah_frames.append(pos + fr[j])
        # learn the pace from the committed ayahs
        if take >= 2:
            done = sum(len(q) for q in ayahs[k:k + take - 1])
            span = fr[take - 1] - fr[0]
            if done > 0 and span > 0:
                fpt = min(max(0.7 * fpt + 0.3 * (span / done), 0.12 / spf), 0.9 / spf)
        if last_group:
            break
        pos = pos + fr[take]                  # next window starts at the next uncommitted ayah
        k += take
        pre = []
    starts = [int(max(0, f * spf * 1000 - 120)) for f in offset_ayah_frames[:n]]
    if len(starts) != n or any(a > b for a, b in zip(starts, starts[1:])):
        print(f"  bad result: {len(starts)} starts for {n} ayahs", flush=True)
        return None
    return starts + [int(len(wave) / SR * 1000)]


def main():
    audio = sys.argv[1]
    if "--validate" in sys.argv:
        key = sys.argv[sys.argv.index("--validate") + 1]
        truth = json.load(open(os.path.join(QDIR, f"quran_timing_{key}.json")))
        allerr = []
        for f in sorted(x for x in os.listdir(audio) if x.endswith(".mp3")):
            s, t0 = int(f[:3]), time.time()
            got = align_surah(s, os.path.join(audio, f))
            e = [abs(a - b) for a, b in zip(got[:-1], truth[str(s)][:-1])]
            allerr += e
            print(s, "median", sorted(e)[len(e) // 2], "within 1s", sum(x < 1000 for x in e), "/", len(e),
                  f"({time.time() - t0:.0f}s)", flush=True)
        allerr.sort()
        print("overall median", allerr[len(allerr) // 2], "p90", allerr[int(.9 * len(allerr))],
              "within 1s", round(sum(x < 1000 for x in allerr) / len(allerr), 3))
        return
    out = sys.argv[2]
    only = [int(x) for x in sys.argv[3:]]
    result = json.load(open(out)) if os.path.exists(out) else {}
    for f in sorted(x for x in os.listdir(audio) if x.endswith(".mp3")):
        s = int(f[:3])
        if (only and s not in only) or str(s) in result:
            continue
        t0 = time.time()
        r = align_surah(s, os.path.join(audio, f))
        if r:
            result[str(s)] = r
            json.dump(result, open(out, "w"), separators=(",", ":"))
        print(s, "ok" if r else "FAILED", f"{time.time() - t0:.0f}s", flush=True)


if __name__ == "__main__":
    main()
