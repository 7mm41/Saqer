"""verify.py ORIG DIAC — every line's text, with diacritics stripped, must equal the original (also stripped)."""
import re, sys, unicodedata
HARAKAT = re.compile('[ً-ْٰـ]')
def strip(s): return HARAKAT.sub('', unicodedata.normalize('NFC', s))
def load(p):
    out = {}
    for line in open(p, encoding='utf-8'):
        line = line.rstrip('\n')
        if not line: continue
        mid, k, text = line.split('|', 2)
        out[(mid, k)] = text
    return out
o, d = load(sys.argv[1]), load(sys.argv[2])
bad = 0
for key in o:
    if key not in d: print('MISSING', key); bad += 1; continue
    if strip(o[key]) != strip(d[key]):
        bad += 1
        a, b = strip(o[key]).split(), strip(d[key]).split()
        diff = [(x, y) for x, y in zip(a, b) if x != y][:3]
        print('DIFF', key, diff or (len(a), len(b)))
for key in d:
    if key not in o: print('EXTRA', key); bad += 1
# undiacritized words (length>2) left in the diacritized file
bare = sum(1 for t in d.values() for w in re.findall(r'[ء-ي]{3,}', t) if not HARAKAT.search(w))
print(f'{len(o)} lines, {bad} problems, {bare} bare words')
