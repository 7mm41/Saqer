//
//  BankQuestion.swift
//  ثقافة إسلامية
//
//  سؤال من بنك الأسئلة العشوائية (أكثر من ١٠٠٠ سؤال لكل لغة، كلها من نص الكتاب):
//  اختيار من متعدد أو كتابة الكلمة الناقصة. الملف: `Questions.<lang>.json` (يولّده Tools/Questions).
//

import Foundation

struct BankQuestion: Codable, Identifiable, Hashable {
    let id: String
    /// "c" اختيار من متعدد، "w" كتابة.
    let k: String
    /// نوع السؤال (pm، sm، mc، ns، ps، st، du، bk، fw).
    let t: String
    /// نص السؤال.
    let q: String
    /// اقتباس من الكتاب يُعرض مع السؤال (وفي أسئلة الكتابة: النص مع الفراغ).
    let x: String?
    /// معنى الاقتباس (للأدعية العربية في اللغات الأخرى).
    let xm: String?
    /// الاقتباس عربي دائمًا (دعاء).
    let ar: Bool?
    /// الخيارات والإجابة الصحيحة.
    let o: [String]?
    let a: Int?
    /// الإجابات المقبولة في أسئلة الكتابة، والتلميح، ومصدر النص.
    let w: [String]?
    let h: String?
    let s: String?
    /// الشرح بعد الإجابة.
    let e: String
    /// القسم والمسألة.
    let c: String
    let m: String?

    enum Kind { case choice, written }
    var kind: Kind { k == "w" ? .written : .choice }
    var quoteIsArabic: Bool { ar ?? false }

    /// هل الإجابة المكتوبة صحيحة؟ (تتجاهل التشكيل والهمزات والمسافات، وتقبل خطأً إملائيًا واحدًا في الكلمات الطويلة)
    func accepts(_ typed: String) -> Bool {
        let answer = Self.normalize(typed)
        guard !answer.isEmpty else { return false }
        for accepted in w ?? [] {
            let target = Self.normalize(accepted)
            if answer == target { return true }
            if target.count >= 5 && Self.distance(answer, target) <= 1 { return true }
        }
        return false
    }

    var correctAnswerText: String {
        switch kind {
        case .choice: if let o, let a, o.indices.contains(a) { return o[a] }; return ""
        case .written: return w?.first ?? ""
        }
    }

    static func normalize(_ s: String) -> String {
        s.searchNormalized.filter { $0.isLetter || $0.isNumber }
    }

    /// مسافة ليفنشتاين بين نصّين قصيرين.
    static func distance(_ a: String, _ b: String) -> Int {
        let a = Array(a), b = Array(b)
        if a.isEmpty { return b.count }
        if b.isEmpty { return a.count }
        var previous = Array(0...b.count)
        for i in 1...a.count {
            var current = [i] + Array(repeating: 0, count: b.count)
            for j in 1...b.count {
                current[j] = min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (a[i - 1] == b[j - 1] ? 0 : 1))
            }
            previous = current
        }
        return previous[b.count]
    }
}

struct QuestionBankFile: Codable {
    let version: Int
    let questions: [BankQuestion]
}

/// إعداد جولة أسئلة.
struct QuizSessionConfig: Identifiable, Hashable {
    enum Mode: Hashable { case round, daily }
    let id = UUID()
    let questions: [BankQuestion]
    let mode: Mode
}
