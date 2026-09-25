//
//  Masala.swift
//  ثقافة إسلامية
//
//  نموذج «المسألة» الفقهية: الوحدة الأساسية للمحتوى في التطبيق.
//  كل مسألة مستخرجة من كتاب «تلقين الصبيان ما يلزم الإنسان» ولها قسم مستقل.
//

import Foundation

/// مسألة واحدة من مسائل الكتاب.
struct Masala: Codable, Identifiable, Hashable {
    /// معرّف ثابت، مثل: "sl-2" (يُستخدم أيضًا لحفظ التقدّم ولاسم الصورة الاختيارية `masala_<id>`).
    let id: String
    /// عنوان المسألة كما ورد في فهرس الكتاب.
    let title: String
    /// رقم الصفحة في الطبعة المطبوعة للرجوع إلى الأصل.
    let page: Int
    /// جملة قصيرة مبسّطة للأطفال تلخّص المسألة.
    let summary: String
    /// نقاط المسألة منقولة من نص الكتاب (مع تبسيط يسير في الصياغة).
    let points: [String]
    /// رمز SF Symbol يظهر عند عدم وجود صورة مخصّصة.
    let symbol: String
    /// معرّف الدرس التفاعلي المرتبط (wudu / ghusl / salah / tayammum) إن وُجد.
    let lessonId: String?

    /// اسم الصورة الاختيارية في Assets.xcassets.
    var imageName: String { "masala_\(id)" }
}

/// قسم (باب) من أبواب الكتاب يضم مجموعة مسائل.
struct Chapter: Codable, Identifiable, Hashable {
    let id: String
    /// الجزء من الكتاب: المقدمة / المقصد الأول / المقصد الثاني / الخاتمة.
    let part: String
    let title: String
    let subtitle: String
    let symbol: String
    /// أسماء ألوان التدرّج (انظر `Color.theme(_:)`).
    let colors: [String]
    let masail: [Masala]
    /// الدروس التفاعلية المرتبطة بهذا القسم.
    let lessonIds: [String]?
    let quiz: [QuizQuestion]

    var imageName: String { "chapter_\(id)" }
}

/// سؤال اختبار قصير مأخوذ من نص الكتاب.
struct QuizQuestion: Codable, Hashable, Identifiable {
    let question: String
    let options: [String]
    let answerIndex: Int
    let explanation: String

    var id: String { question }
}

/// معلومات الكتاب المصدر.
struct BookInfo: Codable, Hashable {
    let title: String
    let author: String
    let about: String
    let source: String
    let structure: [String]
}

/// الجذر الكامل لملف البيانات المحلي `TalqeenData.json`.
struct TalqeenLibrary: Codable {
    let book: BookInfo
    let chapters: [Chapter]
    let lessons: [InteractiveLesson]
}
