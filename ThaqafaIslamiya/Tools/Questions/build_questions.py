"""Build the random question bank (> 1000 questions per language) from the book content.

Every question is derived from the text of «تلقين الصبيان» itself (TalqeenData[.<lang>].json), so it is always
consistent with what the learner reads in the app. Output: Assets/Data/Questions.<lang>.json

Question kinds
  choice  (k = "c"): prompt + optional quote + 4 options (a = correct index)
    pm  which masala does this passage belong to?          (one per passage, 437+)
    sm  which masala does this summary describe?           (127)
    mc  which chapter contains masala X?                   (127)
    ns  in lesson L, which step comes after X?             (47)
    ps  in lesson L, which step comes before X?            (47)
    st  in lesson L, what is this step called?             (≈49)
    du  when do we say this supplication?                  (18)
    bk  the book's own chapter quizzes                      (33)
  written (k = "w"): fill the missing word of a passage; w = accepted answers, h = hint  (≈440)

usage: python3 build_questions.py            # all languages
"""
import json, os, random, unicodedata

import regex

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "..", "..", "ThaqafaIslamiya", "Assets", "Data")
LANGS = ["ar", "en", "fa", "tr", "hi", "bn"]

T = {
    "pm": ["من أي مسألة هذه العبارة؟", "Which topic is this passage from?", "این عبارت از کدام مسئله است؟",
           "Bu ifade hangi meseleden?", "यह अंश किस मसले से है?", "এই অংশটি কোন মাসআলার?"],
    "sm": ["أي مسألة يلخّصها هذا المعنى؟", "Which topic does this summary describe?", "این خلاصه مربوط به کدام مسئله است؟",
           "Bu özet hangi meseleyi anlatıyor?", "यह सारांश किस मसले का है?", "এই সারাংশ কোন মাসআলার?"],
    "mc": ["في أي باب من الكتاب تجد مسألة «{0}»؟", "In which chapter of the book is the topic “{0}”?",
           "مسئلهٔ «{0}» در کدام بخش کتاب است؟", "“{0}” meselesi kitabın hangi bölümünde?",
           "“{0}” मसला किताब के किस अध्याय में है?", "“{0}” মাসআলাটি বইয়ের কোন অধ্যায়ে?"],
    "ns": ["في درس «{0}»، ما الخطوة التي تأتي بعد «{1}»؟", "In the “{0}” lesson, which step comes after “{1}”?",
           "در درس «{0}»، چه مرحله‌ای بعد از «{1}» می‌آید؟", "“{0}” dersinde “{1}” adımından sonra hangisi gelir?",
           "“{0}” पाठ में “{1}” के बाद कौन-सा क़दम आता है?", "“{0}” পাঠে “{1}”-এর পরে কোন ধাপ আসে?"],
    "ps": ["في درس «{0}»، ما الخطوة التي تأتي قبل «{1}»؟", "In the “{0}” lesson, which step comes before “{1}”?",
           "در درس «{0}»، چه مرحله‌ای قبل از «{1}» است؟", "“{0}” dersinde “{1}” adımından önce hangisi gelir?",
           "“{0}” पाठ में “{1}” से पहले कौन-सा क़दम आता है?", "“{0}” পাঠে “{1}”-এর আগে কোন ধাপ আসে?"],
    "st": ["في درس «{0}»، ما اسم هذه الخطوة؟", "In the “{0}” lesson, what is this step called?",
           "در درس «{0}»، نام این مرحله چیست؟", "“{0}” dersinde bu adımın adı nedir?",
           "“{0}” पाठ में इस क़दम का नाम क्या है?", "“{0}” পাঠে এই ধাপটির নাম কী?"],
    "du": ["متى نقول هذا الدعاء؟", "When do we say this supplication?", "این دعا را چه وقت می‌خوانیم؟",
           "Bu duayı ne zaman okuruz?", "यह दुआ हम कब पढ़ते हैं?", "এই দোয়াটি আমরা কখন পড়ি?"],
    "fill": ["أكمل الفراغ بالكلمة الصحيحة:", "Fill in the missing word:", "جای خالی را با کلمهٔ درست پر کن:",
             "Boşluğu doğru kelimeyle doldur:", "रिक्त स्थान में सही शब्द लिखें:", "শূন্যস্থানে সঠিক শব্দটি লেখো:"],
    "hint": ["تبدأ بـ «{0}» وعدد حروفها {1}", "Starts with “{0}”, {1} letters", "با «{0}» شروع می‌شود، {1} حرف",
             "“{0}” ile başlar, {1} harf", "“{0}” से शुरू, {1} अक्षर", "“{0}” দিয়ে শুরু, {1}টি অক্ষর"],
    "from": ["من مسألة: {0}", "From the topic: {0}", "از مسئلهٔ: {0}", "Mesele: {0}", "मसला: {0}", "মাসআলা: {0}"],
    "e_masala": ["العبارة من مسألة «{0}» في باب «{1}».", "This is from the topic “{0}” in the chapter “{1}”.",
                 "این عبارت از مسئلهٔ «{0}» در بخش «{1}» است.", "Bu ifade “{1}” bölümündeki “{0}” meselesindendir.",
                 "यह “{1}” अध्याय के “{0}” मसले से है।", "এটি “{1}” অধ্যায়ের “{0}” মাসআলা থেকে।"],
    "e_chapter": ["مسألة «{0}» في باب «{1}».", "The topic “{0}” is in the chapter “{1}”.", "مسئلهٔ «{0}» در بخش «{1}» است.",
                  "“{0}” meselesi “{1}” bölümündedir.", "“{0}” मसला “{1}” अध्याय में है।", "“{0}” মাসআলাটি “{1}” অধ্যায়ে।"],
    "e_order": ["في درس «{0}»: «{1}» ثم «{2}».", "In the “{0}” lesson: “{1}”, then “{2}”.", "در درس «{0}»: «{1}» سپس «{2}».",
                "“{0}” dersinde: “{1}”, sonra “{2}”.", "“{0}” पाठ में: “{1}”, फिर “{2}”।", "“{0}” পাঠে: “{1}”, তারপর “{2}”।"],
    "e_step": ["«{0}»: {1}", "“{0}”: {1}", "«{0}»: {1}", "“{0}”: {1}", "“{0}”: {1}", "“{0}”: {1}"],
    "e_dua": ["نقوله في خطوة «{0}» من درس «{1}».", "We say it at the step “{0}” of the “{1}” lesson.",
              "آن را در مرحلهٔ «{0}» از درس «{1}» می‌خوانیم.", "“{1}” dersinin “{0}” adımında okunur.",
              "यह “{1}” पाठ के “{0}” क़दम में पढ़ी जाती है।", "এটি “{1}” পাঠের “{0}” ধাপে পড়া হয়।"],
    "e_fill": ["النص كاملًا: «{0}»", "Full text: “{0}”", "متن کامل: «{0}»", "Tam metin: “{0}”", "पूरा पाठ: “{0}”", "পূর্ণ পাঠ: “{0}”"],
}

STOP = {
    "ar": set("الذي التي الذين وهو وهي فإن وإن وإذا فإذا إذا حتى كان كانت يكون تكون على إلى عليه عليها عليهم منه منها "
              "فيه فيها بعد قبل ذلك هذه هذا وهذا وهذه كما مثل غير إلا وأن أنه وأنه وأنها وأنهم ولا فلا لكن وقيل قيل يجب "
              "ويجب شيء كل وكل جميع أيضا أيضًا بين عند عنه ممن مما لأن ثلاث ثلاثًا".split()),
    "en": set("that this with from which their there when then they them have been into also should must shall "
              "about after before each every other upon over under while where what whom your said says than only "
              "some such very more most does done being".split()),
    "fa": set("این آن که را از به با در برای تا است هست بود شود کند کرد می‌شود می‌کند باید اگر هم نیز پس سپس "
              "همه هر یک دو سه آنها ایشان او وی خود بر بین پیش بعد قبل چون زیرا ولی اما".split()),
    "tr": set("için olan olarak veya ile gibi daha kadar sonra önce bunu şunu buna bunun onun onlar onları "
              "değil ancak ama fakat eğer ise yani bile hem her bir iki üç olur olmaz etmek eder".split()),
    "hi": set("और के की का को में से पर है हैं था थे यह वह इस उस जो तो भी नहीं कि ही एक दो तीन लिए साथ बाद पहले "
              "करना करते करें होता होती होते जाता जाती चाहिए अपने अपनी उसके उनके".split()),
    "bn": set("এবং ও এর কে থেকে সে তা এই সেই যে যা না কি হয় হবে করে করা জন্য সঙ্গে পরে আগে তার তাদের একটি "
              "দুই তিন অথবা বা কিন্তু যদি তবে তখন নিজের উচিত".split()),
}

WORD = regex.compile(r"[\p{L}\p{M}]+")


def graphemes(word):
    return regex.findall(r"\X", word)


def fold(s):
    s = unicodedata.normalize("NFKD", s.lower())
    return "".join(c for c in s if not unicodedata.combining(c) or unicodedata.category(c) == "Mc")


def load(lang):
    name = "TalqeenData.json" if lang == "ar" else f"TalqeenData.{lang}.json"
    return json.load(open(os.path.join(DATA, name), encoding="utf-8"))


def fmt(key, lang, *args):
    s = T[key][LANGS.index(lang)]
    for i, a in enumerate(args):
        s = s.replace("{%d}" % i, a)
    return s


def choice(rng, qid, kind, prompt, correct, pool, explanation, chapter, masala=None, quote=None):
    """4 distinct options: the correct one + 3 distractors from `pool` (ordered by preference)."""
    seen = {fold(correct)}
    distractors = []
    for p in pool:
        if fold(p) not in seen:
            seen.add(fold(p))
            distractors.append(p)
        if len(distractors) == 3:
            break
    if len(distractors) < 3:
        return None
    options = distractors + [correct]
    rng.shuffle(options)
    q = {"id": qid, "k": "c", "t": kind, "q": prompt, "o": options, "a": options.index(correct),
         "e": explanation, "c": chapter}
    if quote:
        q["x"] = quote
    if masala:
        q["m"] = masala
    return q


def build(lang):
    d = load(lang)
    rng = random.Random(f"thaqafa-{lang}")
    out = []
    chapters = d["chapters"]
    all_masail = [(c, m) for c in chapters for m in c["masail"]]
    titles_by_chapter = {c["id"]: [m["title"] for m in c["masail"]] for c in chapters}
    all_titles = [m["title"] for _, m in all_masail]

    def masala_pool(chapter_id, exclude):
        same = [t for t in titles_by_chapter[chapter_id] if t != exclude]
        other = [t for t in all_titles if t not in same and t != exclude]
        rng.shuffle(same)
        rng.shuffle(other)
        return same + other

    # pm / sm / mc + written fill-ins
    for c, m in all_masail:
        exp = fmt("e_masala", lang, m["title"], c["title"])
        for i, p in enumerate(m["points"]):
            if len(p) >= 25:
                q = choice(rng, f"pm-{m['id']}-{i}", "pm", fmt("pm", lang), m["title"], masala_pool(c["id"], m["title"]),
                           exp, c["id"], m["id"], quote=p)
                if q:
                    out.append(q)
            w = fill_in(lang, m, p, f"fw-{m['id']}-{i}", c["id"])
            if w:
                out.append(w)
        q = choice(rng, f"sm-{m['id']}", "sm", fmt("sm", lang), m["title"], masala_pool(c["id"], m["title"]),
                   exp, c["id"], m["id"], quote=m["summary"])
        if q:
            out.append(q)
        others = [x["title"] for x in chapters if x["id"] != c["id"]]
        rng.shuffle(others)
        q = choice(rng, f"mc-{m['id']}", "mc", fmt("mc", lang, m["title"]), c["title"], others,
                   fmt("e_chapter", lang, m["title"], c["title"]), c["id"], m["id"])
        if q:
            out.append(q)

    # lesson steps
    lesson_chapter = {}
    for c in chapters:
        for lid in c.get("lessonIds") or []:
            lesson_chapter.setdefault(lid, c["id"])
    for lesson in d["lessons"]:
        steps = lesson["steps"]
        titles = [s["title"] for s in steps]
        texts = [s["text"] for s in steps]
        chap = lesson_chapter.get(lesson["id"], chapters[0]["id"])
        unique_title = {t for t in titles if titles.count(t) == 1}

        def pool(exclude):
            p = [t for t in titles if t not in exclude]
            rng.shuffle(p)
            return p

        for i, s in enumerate(steps):
            if i + 1 < len(steps) and s["title"] in unique_title:
                nxt = steps[i + 1]["title"]
                q = choice(rng, f"ns-{s['id']}", "ns", fmt("ns", lang, lesson["title"], s["title"]), nxt,
                           pool({nxt, s["title"]}), fmt("e_order", lang, lesson["title"], s["title"], nxt), chap)
                if q:
                    out.append(q)
            if i > 0 and s["title"] in unique_title:
                prv = steps[i - 1]["title"]
                q = choice(rng, f"ps-{s['id']}", "ps", fmt("ps", lang, lesson["title"], s["title"]), prv,
                           pool({prv, s["title"]}), fmt("e_order", lang, lesson["title"], prv, s["title"]), chap)
                if q:
                    out.append(q)
            if texts.count(s["text"]) == 1 and s["title"] in unique_title:
                q = choice(rng, f"st-{s['id']}", "st", fmt("st", lang, lesson["title"]), s["title"], pool({s["title"]}),
                           fmt("e_step", lang, s["title"], s["text"]), chap, quote=s["text"])
                if q:
                    out.append(q)
        seen_duas = set()
        for s in steps:
            if s.get("dua") and s["dua"] not in seen_duas and s["title"] in unique_title:
                seen_duas.add(s["dua"])
                q = choice(rng, f"du-{s['id']}", "du", fmt("du", lang), s["title"], pool({s["title"]}),
                           fmt("e_dua", lang, s["title"], lesson["title"]), chap, quote=s["dua"])
                if q:
                    q["ar"] = True  # quote is Arabic whatever the UI language
                    if s.get("duaMeaning"):
                        q["xm"] = s["duaMeaning"]
                    out.append(q)

    # the book's own quizzes
    for c in chapters:
        for i, qq in enumerate(c["quiz"]):
            out.append({"id": f"bk-{c['id']}-{i}", "k": "c", "t": "bk", "q": qq["question"], "o": qq["options"],
                        "a": qq["answerIndex"], "e": qq["explanation"], "c": c["id"]})

    ids = [q["id"] for q in out]
    assert len(ids) == len(set(ids)), "duplicate ids"
    for q in out:
        if q["k"] == "c":
            assert len(q["o"]) >= 3 and 0 <= q["a"] < len(q["o"]), q["id"]
            assert len({fold(o) for o in q["o"]}) == len(q["o"]), q["id"]
    return out


def fill_in(lang, masala, passage, qid, chapter):
    """Blank the key word of a passage: a word of the masala title if present, else the longest content word."""
    words = WORD.findall(passage)
    title_words = {fold(w) for w in WORD.findall(masala["title"]) if len(graphemes(w)) >= 4}
    stop = STOP[lang]

    def ok(w):
        return len(graphemes(w)) >= 4 and w not in stop and fold(w) not in {fold(s) for s in stop}

    candidates = [w for w in words if ok(w) and fold(w) in title_words]
    if not candidates:
        min_len = 4 if lang in ("hi", "bn") else 5   # Indic words are shorter in graphemes
        candidates = sorted((w for w in words if ok(w) and len(graphemes(w)) >= min_len),
                            key=lambda w: -len(graphemes(w)))
    if not candidates or len(words) < 5:
        return None
    word = candidates[0]
    # only blank a word that occurs once, so the answer is unambiguous
    if sum(1 for w in words if w == word) != 1:
        return None
    blanked = regex.sub(r"(?<![\p{L}\p{M}])" + regex.escape(word) + r"(?![\p{L}\p{M}])", "＿＿＿＿", passage, count=1)
    if blanked == passage:
        return None
    g = graphemes(word)
    accepted = [word]
    if lang == "ar":
        # also accept the word without a leading conjunction/preposition (و، ف، ب، ل) typed alone
        for pre in ("و", "ف", "ب", "ل"):
            if word.startswith(pre) and len(word) > 4 and word[1:] not in accepted:
                accepted.append(word[1:])
    return {"id": qid, "k": "w", "t": "fw", "q": fmt("fill", lang), "x": blanked, "w": accepted,
            "h": fmt("hint", lang, g[0], str(len(g))), "s": fmt("from", lang, masala["title"]),
            "e": fmt("e_fill", lang, passage), "c": chapter, "m": masala["id"]}


def main():
    for lang in LANGS:
        qs = build(lang)
        kinds = {}
        for q in qs:
            kinds[q["t"]] = kinds.get(q["t"], 0) + 1
        path = os.path.join(DATA, f"Questions.{lang}.json")
        json.dump({"version": 1, "questions": qs}, open(path, "w", encoding="utf-8"), ensure_ascii=False,
                  separators=(",", ":"))
        print(lang, len(qs), kinds, f"{os.path.getsize(path) // 1024} KB")


if __name__ == "__main__":
    main()
