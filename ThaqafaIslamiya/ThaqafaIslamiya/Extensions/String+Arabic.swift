//
//  String+Arabic.swift
//  ثقافة إسلامية
//
//  أدوات نصية عربية: الأرقام الهندية، والبحث المتجاهل للتشكيل والهمزات.
//

import Foundation

extension Int {
    /// الرقم بالأرقام العربية الهندية (١٢٣).
    var arabicDigits: String {
        Self.arabicFormatter.string(from: NSNumber(value: self)) ?? String(self)
    }

    private static let arabicFormatter: NumberFormatter = {
        let formatter = NumberFormatter()
        formatter.locale = Locale(identifier: "ar")
        formatter.numberStyle = .none
        return formatter
    }()
}

extension String {
    /// نص مُطبَّع للبحث: بلا تشكيل، والهمزات والتاء المربوطة والألف المقصورة موحّدة.
    var searchNormalized: String {
        folding(options: [.diacriticInsensitive, .caseInsensitive], locale: Locale(identifier: "ar"))
            .replacingOccurrences(of: "أ", with: "ا")
            .replacingOccurrences(of: "إ", with: "ا")
            .replacingOccurrences(of: "آ", with: "ا")
            .replacingOccurrences(of: "ة", with: "ه")
            .replacingOccurrences(of: "ى", with: "ي")
    }

    /// هل يحتوي النص على عبارة البحث (بمرونة عربية)؟
    func arabicContains(_ query: String) -> Bool {
        let q = query.trimmingCharacters(in: .whitespacesAndNewlines).searchNormalized
        guard !q.isEmpty else { return true }
        return searchNormalized.contains(q)
    }
}
