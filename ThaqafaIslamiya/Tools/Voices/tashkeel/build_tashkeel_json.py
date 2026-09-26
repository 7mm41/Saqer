"""Build TalqeenData.tashkeel.json: the Arabic content with full tashkeel on steps and masail.

Source files (one line per text, `id|key|text`): steps.txt (key t=title, x=text) and ch_<chapter>.txt
(key t=title, s=summary, 0..n=points). Each diacritized text must equal the original once the diacritics
are removed — checked here, so the wording can never drift from the book text.
"""
import copy, glob, json, os, re, sys, unicodedata

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "..", "..", "..", "ThaqafaIslamiya", "Assets", "Data")
HARAKAT = re.compile("[ً-ْٰـ]")


def strip(s):
    return HARAKAT.sub("", unicodedata.normalize("NFC", s))


def load():
    table = {}
    for path in glob.glob(os.path.join(HERE, "*.txt")):
        for line in open(path, encoding="utf-8"):
            line = line.rstrip("\n")
            if line:
                mid, key, text = line.split("|", 2)
                table[(mid, key)] = text
    return table


def tashkeel_table():
    return load()


def main():
    table = load()
    src = json.load(open(os.path.join(DATA, "TalqeenData.json"), encoding="utf-8"))
    out = copy.deepcopy(src)
    problems = []

    def put(obj, field, mid, key):
        vocal = table.get((mid, key))
        if vocal is None:
            problems.append(f"missing {mid}|{key}")
        elif strip(vocal) != strip(obj[field]):
            problems.append(f"text mismatch {mid}|{key}")
        else:
            obj[field] = vocal

    for lesson in out["lessons"]:
        for s in lesson["steps"]:
            put(s, "title", s["id"], "t")
            put(s, "text", s["id"], "x")
    for chapter in out["chapters"]:
        for m in chapter["masail"]:
            put(m, "title", m["id"], "t")
            put(m, "summary", m["id"], "s")
            for i in range(len(m["points"])):
                put(m["points"], i, m["id"], str(i))
    if problems:
        print("\n".join(problems))
        sys.exit(1)
    json.dump(out, open(os.path.join(DATA, "TalqeenData.tashkeel.json"), "w", encoding="utf-8"),
              ensure_ascii=False, separators=(",", ":"))
    print("ok", len(table), "texts")


if __name__ == "__main__":
    main()
