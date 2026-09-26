//
//  InteractiveLesson.swift
//  ثقافة إسلامية
//
//  نموذج الدرس التفاعلي (الوضوء، الاغتسال، الصلاة، التيمم) المكوّن من خطوات.
//

import Foundation

/// درس تفاعلي يُعرض كبطاقات قابلة للسحب خطوة بخطوة.
struct InteractiveLesson: Codable, Identifiable, Hashable {
    let id: String
    let title: String
    let subtitle: String
    let symbol: String
    let colors: [String]
    /// موضع الدرس في الكتاب، مثل: "تلقين الصبيان، ص ٦١–٦٤".
    let reference: String
    let steps: [LessonStep]

    /// صورة غلاف الدرس الاختيارية: `lesson_<id>`.
    var imageName: String { "lesson_\(id)" }
}

/// خطوة واحدة داخل الدرس.
struct LessonStep: Codable, Identifiable, Hashable {
    /// مثل: "wudu_05".
    let id: String
    /// اسم الصورة التوضيحية في Assets.xcassets، مثل: "wudu_05".
    let image: String
    let title: String
    /// نص قصير مناسب للطفل.
    let text: String
    /// رمز SF Symbol بديل يظهر إذا لم تُضف الصورة بعد.
    let symbol: String
    /// شرح إضافي من الكتاب (اختياري).
    let detail: String?
    /// دعاء أو ذكر يُقال في هذه الخطوة (اختياري).
    let dua: String?
    /// معنى الدعاء بلغة الواجهة (في الترجمات فقط؛ يبقى الدعاء نفسه بالعربية).
    let duaMeaning: String?
    /// عدد مرات التكرار (مثل ٣ لغسل الوجه) — يظهر كقطرات يلمسها الطفل.
    let repeatCount: Int?

    /// مقطع صوتي مدمج لقراءة الخطوة: `voice_<lang>_step_<id>.m4a`.
    func narrationClip(for language: AppLanguage) -> String { "voice_\(language.rawValue)_step_\(id)" }
    /// مقطع الدعاء بالعربية (مشكول ومشترك بين كل اللغات): `voice_dua_<id>.m4a`.
    var duaClip: String { "voice_dua_\(id)" }
    /// النص الذي يُقرأ للخطوة.
    var narrationText: String { "\(title). \(text)" }
}
