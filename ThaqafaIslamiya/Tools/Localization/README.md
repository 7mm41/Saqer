# الترجمات

`TalqeenData.json` (العربية) هو المصدر. كل لغة لها ملف تراكب `tr_<lang>.py` بالمعرّفات نفسها:

| المتغيّر | الشكل |
|---|---|
| `BOOK` | عنوان الكتاب والمؤلف والنبذة والهيكل |
| `CHAPTERS` | `id → (part, title, subtitle)` |
| `LESSONS` | `id → (title, subtitle, reference)` |
| `STEPS` | `id → (title, text, detail | None, duaMeaning | None)` |
| `MASAIL` | `id → (title, summary, [points])` — 127 مسألة |
| `QUIZ` | `chapterId → [(question, [3 options], explanation)]` بترتيب الخيارات نفسه |

```bash
python3 build_i18n.py en fa tr hi bn     # يولّد TalqeenData.<lang>.json ويتحقق من اكتمال كل المعرّفات
python3 ui_strings.py                     # يولّد UIStrings.json لنصوص الواجهة
```

الأدعية لا تُترجم: تبقى بالعربية كما في الكتاب، ويُضاف معناها في `duaMeaning`.
