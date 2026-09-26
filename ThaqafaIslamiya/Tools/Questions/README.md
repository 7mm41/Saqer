# بنك الأسئلة

```bash
pip install regex
python3 build_questions.py     # يولّد Questions.<ar|en|fa|tr|hi|bn>.json في ThaqafaIslamiya/Assets/Data
```

كل سؤال مشتق من نص الكتاب في `TalqeenData[.<lang>].json`، فتتغيّر الأسئلة تلقائيًا إذا عُدّل المحتوى.
الخيارات تُخلط بمولّد عشوائي ثابت لكل لغة، فيبقى الناتج نفسه في كل تشغيل.
