# تطبيق كتف للآيفون — Katf iPhone app

## بالعربية

1. على جهاز Mac مع Xcode 16 أو أحدث، افتح الملف **`Katf.xcodeproj`** في هذا المجلد (نقرتان).
2. اختر المخطط **Katf** ومحاكي آيفون، ثم اضغط **Run** (⌘R).
3. أول بناء يحتاج إنترنت لتنزيل حزم Capacitor. لا حاجة إلى Node أو pnpm.

عنوان الخادم في إعداد البناء **`KATF_API_URL`** (الهدف Katf ← Build Settings ← User-Defined):
`http://localhost:4000` في Debug، و`https://katf.example` مؤقتاً في Release — ضع نطاقك قبل الأرشفة.

بعد تعديل كود تطبيق الفنيين في `apps/tech`: نفّذ `pnpm ios:sync` من جذر المستودع ثم اعمل commit لمجلد `ios`.
التوقيع والإشعارات وTestFlight: [docs/ios.md](../docs/ios.md).

## English

1. On a Mac with Xcode 16 or newer, open **`Katf.xcodeproj`** in this folder.
2. Choose the **Katf** scheme and an iPhone simulator, then **Run** (⌘R).
3. The first build needs internet to download Capacitor's Swift packages. Node and pnpm are not needed.

The server address is the build setting **`KATF_API_URL`** (target Katf → Build Settings → User-Defined):
`http://localhost:4000` for Debug, the placeholder `https://katf.example` for Release — set your domain
before archiving.

After changing the technician app in `apps/tech`, run `pnpm ios:sync` from the repository root and commit
`ios/`. `Katf/public`, `Plugins/` and `CapApp-SPM/Package.swift` are generated; do not edit them by hand.
Signing, push and TestFlight: [docs/ios.md](../docs/ios.md).
