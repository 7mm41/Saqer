"""Build TalqeenData.<lang>.json from the Arabic source + a translation overlay module (tr_<lang>.py)."""
import json, os, sys, copy, importlib
DATA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "ThaqafaIslamiya", "Assets", "Data")
src = json.load(open(f'{DATA}/TalqeenData.json', encoding='utf-8'))

def build(lang):
    T = importlib.import_module(f'tr_{lang}')
    d = copy.deepcopy(src)
    problems = []
    d['book'].update({k: v for k, v in T.BOOK.items()})
    for c in d['chapters']:
        c['part'], c['title'], c['subtitle'] = T.CHAPTERS[c['id']]
        for m in c['masail']:
            if m['id'] not in T.MASAIL: problems.append('masala ' + m['id']); continue
            m['title'], m['summary'], m['points'] = T.MASAIL[m['id']]
        q = T.QUIZ[c['id']]
        if len(q) != len(c['quiz']): problems.append('quiz count ' + c['id'])
        for qa, qt in zip(c['quiz'], q):
            qa['question'], qa['options'], qa['explanation'] = qt
            if len(qt[1]) != 3: problems.append('options ' + qt[0])
    for l in d['lessons']:
        l['title'], l['subtitle'], l['reference'] = T.LESSONS[l['id']]
        for s in l['steps']:
            if s['id'] not in T.STEPS: problems.append('step ' + s['id']); continue
            title, text, detail, meaning = T.STEPS[s['id']]
            s['title'], s['text'] = title, text
            if detail: s['detail'] = detail
            else: s.pop('detail', None)
            if s.get('dua'):
                if not meaning: problems.append('duaMeaning ' + s['id'])
                s['duaMeaning'] = meaning
            elif meaning: problems.append('meaning without dua ' + s['id'])
    extra = set(T.MASAIL) - {m['id'] for c in d['chapters'] for m in c['masail']}
    if extra: problems.append('extra ' + str(extra))
    json.dump(d, open(f'{DATA}/TalqeenData.{lang}.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(lang, 'ok' if not problems else problems)

for lang in sys.argv[1:]:
    build(lang)
