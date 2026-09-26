# مولّد الرسوم المتحركة

يرسم هذا المولّد شخصية طفل بأسلوب رسومي مسطّح حديث (vector) تؤدي كل حركة في دروس الوضوء والاغتسال والتيمم والصلاة، ثم يحوّل كل خطوة إلى فيديو MP4 قصير صامت يتكرر.
الفيديوهات الناتجة موجودة في `ThaqafaIslamiya/Assets/Animations/` وتُدمج داخل التطبيق، فلا حاجة للإنترنت.

| الملف | الدور |
|---|---|
| `rig.py` | الشخصية (منظر أمامي وجانبي)، الخلفيات (الحمّام، الدُّش، الصحراء، المسجد)، الماء والتراب والمؤثرات |
| `steps.py` | حركة كل خطوة: دالة لكل معرّف مثل `wudu_05` مع مدتها بالثواني |
| `render_all.py` | يرسم الإطارات بمعدّل 24 إطارًا في الثانية ويصدّرها بـ H.264 (720×720) |
| `preview.py` / `contact_sheet.py` | صور معاينة سريعة دون تصدير فيديو |

## التشغيل

```bash
pip install pycairo imageio-ffmpeg
cd ThaqafaIslamiya/Tools/Animations
python3 render_all.py ../../ThaqafaIslamiya/Assets/Animations            # كل الخطوات
python3 render_all.py ../../ThaqafaIslamiya/Assets/Animations wudu_06     # خطوة واحدة
python3 preview.py wudu_06,salah_13 0.2,0.5,0.8 preview.png 0.4          # معاينة إطارات
```

لتعديل حركة: عدّل دالتها في `steps.py` (مواضع اليدين عبر `kf` للإطارات المفتاحية، ووضعيات الصلاة `STAND` / `RUKU` / `SUJUD` / `SIT`)، ثم أعد التصدير.
