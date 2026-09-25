# ثقافة إسلامية — تطبيق iOS / iPadOS

يحوّل التطبيق كتاب **«تلقين الصبيان ما يلزم الإنسان»** للعلامة نور الدين عبد الله بن حميد السالمي إلى تجربة تفاعلية للأطفال، بواجهة SwiftUI وثيم «الزجاج السائل».

- **127 مسألة** في 11 قسمًا مرتّبة كأجزاء الكتاب (المقدمة، المقصد الأول، المقصد الثاني، الخاتمة). لكل مسألة شاشة مستقلة ورقم صفحتها في الكتاب.
- **4 دروس تفاعلية** بنظام البطاقات القابلة للسحب: الوضوء (13 خطوة)، الاغتسال (10)، الصلاة (21)، التيمم (7).
- **33 سؤال اختبار** مأخوذة من نص الكتاب، مع حفظ أفضل نتيجة.
- **يعمل دون إنترنت بالكامل (100% Offline)**: لا يحتوي التطبيق على أي كود شبكة. المحتوى في `Assets/Data/TalqeenData.json`، والصور في `Assets.xcassets`، وقراءة الأدعية بصوت النظام العربي المثبّت على الجهاز.
- يدعم **iPhone وiPad**: شبكات متكيّفة، وقائمة خطوات جانبية في الدروس على الآيباد.
- الواجهة **عربية من اليمين إلى اليسار (RTL)**، وتدعم الوضع الداكن و«تقليل الحركة» وVoiceOver.

## المتطلبات

| | |
|---|---|
| Xcode | 16 أو أحدث (يُفضّل Xcode 26 لتفعيل Liquid Glass الأصلي) |
| iOS / iPadOS | 17.0 أو أحدث |
| Swift | 5 (وضع اللغة) |

## التشغيل

1. افتح `ThaqafaIslamiya.xcodeproj` في Xcode.
2. من *Signing & Capabilities* اختر فريقك (Team). غيّر `com.saqer.ThaqafaIslamiya` إن لزم.
3. اختر محاكي iPhone أو iPad ثم اضغط ⌘R.

يستخدم المشروع مجلدًا متزامنًا (Folder Synchronized Group)، فأي ملف تضيفه داخل `ThaqafaIslamiya/` يدخل في البناء تلقائيًا.
إن لم يفتح المشروع في نسخة Xcode قديمة، استخدم `project.yml` عبر [XcodeGen](https://github.com/yonaskolb/XcodeGen): `xcodegen generate`.

## هيكلية الملفات

```
ThaqafaIslamiya/
├── ThaqafaIslamiya.xcodeproj          مشروع Xcode
├── project.yml                        بديل XcodeGen (اختياري)
├── Docs/
│   └── ASSETS_GUIDE.md                دليل تسمية الصور وإضافتها
└── ThaqafaIslamiya/                   مجلد المصدر (متزامن مع الهدف)
    ├── App/
    │   └── ThaqafaIslamiyaApp.swift   ‏@main + RootView (التنقّل، RTL، حقن البيئة)
    ├── Models/
    │   ├── Masala.swift               ‏Masala · Chapter · QuizQuestion · BookInfo · TalqeenLibrary
    │   ├── InteractiveLesson.swift    ‏InteractiveLesson · LessonStep
    │   └── Route.swift                وجهات التنقّل
    ├── ViewModels/
    │   ├── LibraryViewModel.swift     تحميل JSON المحلي + البحث العربي
    │   ├── LessonViewModel.swift      منطق الخطوات والسحب وعدّاد التكرار
    │   ├── QuizViewModel.swift        منطق الاختبار
    │   ├── ProgressStore.swift        حفظ التقدّم محليًا (UserDefaults)
    │   ├── AppRouter.swift            مسار التنقّل وعرض الدروس
    │   └── SpeechReader.swift         قراءة الأدعية بصوت عربي دون إنترنت
    ├── Views/
    │   ├── Home/                      ‏HomeView · ChapterCard · LessonCard
    │   ├── Chapter/                   ‏ChapterView
    │   ├── Masala/                    ‏MasalaDetailView (قسم مستقل لكل مسألة)
    │   ├── Lesson/                    ‏InteractiveLessonView · StepCardView · LessonCompletionView
    │   ├── Quiz/                      ‏QuizView
    │   ├── About/                     ‏AboutView
    │   └── Components/                ‏LiquidBackground · IllustrationView · MasalaRow · ProgressRing · ConfettiView
    ├── Extensions/
    │   ├── View+Glass.swift           ‏glassCard / glassCapsule + أنماط الأزرار الزجاجية
    │   ├── Color+Theme.swift          ألوان الثيم والتدرّجات
    │   ├── String+Arabic.swift        أرقام عربية + بحث يتجاهل التشكيل والهمزات
    │   └── Bundle+Decode.swift        قراءة JSON من الحزمة
    └── Assets/
        ├── Assets.xcassets            ‏AppIcon · AccentColor · (صورك هنا)
        └── Data/TalqeenData.json      كل محتوى الكتاب
```

## ثيم الزجاج السائل

كل الأسطح الزجاجية تمر عبر معدِّل واحد في `Extensions/View+Glass.swift`:

```swift
Text("مرحبًا")
    .padding()
    .glassCard(cornerRadius: 28, tint: .teal, interactive: true)
```

- عند البناء بـ **Xcode 26** والتشغيل على **iOS 26+**: يستخدم `glassEffect(.regular.tint(...).interactive())`، وهو Liquid Glass الأصلي من Apple.
- على **iOS 17–18**: يستخدم `.ultraThinMaterial` مع حافة لامعة متدرّجة وظل ناعم ولمسة لونية.

الخلفية `LiquidBackground` تدرّج مع فقاعات لونية ضبابية تتحرّك ببطء، وتتوقف حركتها تلقائيًا عند تفعيل «تقليل الحركة».

## الشاشة التفاعلية القابلة لإعادة الاستخدام

`InteractiveLessonView(lesson:)` تعرض أي درس من `TalqeenData.json`:

- مكدّس بطاقات بعمق (البطاقة الحالية وخلفها اثنتان).
- **اسحب يمينًا** للخطوة التالية (كتقليب صفحة كتاب عربي)، و**يسارًا** للسابقة، أو استخدم الأزرار.
- كل بطاقة فيها: مساحة للصورة التوضيحية، عنوان ونص قصير، عدّاد تكرار بقطرات يلمسها الطفل (مثل «ثلاثًا»)، فقاعة الدعاء مع زر استماع، و«من الكتاب» للتفصيل.
- اهتزاز خفيف عند الانتقال، واحتفال بالنجوم عند الإتمام، وحفظ الإنجاز محليًا.
- على الآيباد تظهر قائمة جانبية بالخطوات للانتقال المباشر.

لإضافة درس جديد (مثل الأذان) أضف كائنًا جديدًا إلى `lessons` في ملف JSON واربطه بقسم عبر `lessonIds`، ولا حاجة لكتابة أي كود.

## المحتوى والأمانة العلمية

- المصدر: <https://alsaidia.com/sites/default/files/تلقين%20الصبيان%20ما%20يلزم%20الإنسان.pdf> (طبعة محققة عن نسخة عُرضت على المؤلف).
- نصوص المسائل منقولة من الكتاب مع **تبسيط يسير في الصياغة** ليناسب الأطفال، ورقم الصفحة مذكور مع كل مسألة للرجوع إلى الأصل.
- اختُصرت بعض المواضع التي لا تناسب مستوى الأطفال، مثل تفاصيل غسل الميت وأحكام الغنائم في باب الجهاد. **يُنصح بمراجعة المحتوى من مختص شرعي قبل النشر.**
- الكتاب على المذهب الإباضي. نُقلت صفته في الصلاة والوضوء كما هي: التوجيهان، والنطق بالنية، وأعداد الركعات. وحيث علّق أبو إسحاق اطفيش بخلاف قول المؤلف، كما في حكم الوتر، ذُكر القولان.

## الصور

راجع [`Docs/ASSETS_GUIDE.md`](Docs/ASSETS_GUIDE.md) لقائمة أسماء الصور الـ51 للخطوات، وأغلفة الأقسام والدروس، وطريقة إضافتها.
