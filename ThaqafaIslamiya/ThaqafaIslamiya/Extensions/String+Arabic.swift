//
//  String+Arabic.swift
//  ثقافة إسلامية
//
//  تطبيع النص للبحث: يتجاهل التشكيل وحالة الأحرف، ويوحّد الهمزات والتاء المربوطة والألف المقصورة
//  (يعمل كذلك مع الفارسية والتركية والهندية والبنغالية والإنجليزية).
//

import Foundation

extension String {
    /// نص مُطبَّع للبحث.
    var searchNormalized: String {
        folding(options: [.diacriticInsensitive, .caseInsensitive, .widthInsensitive], locale: nil)
            .replacingOccurrences(of: "أ", with: "ا")
            .replacingOccurrences(of: "إ", with: "ا")
            .replacingOccurrences(of: "آ", with: "ا")
            .replacingOccurrences(of: "ة", with: "ه")
            .replacingOccurrences(of: "ى", with: "ي")
            .replacingOccurrences(of: "ی", with: "ي")
            .replacingOccurrences(of: "ک", with: "ك")
    }

    /// هل يحتوي النص على عبارة البحث (بمرونة)؟
    func arabicContains(_ query: String) -> Bool {
        let q = query.trimmingCharacters(in: .whitespacesAndNewlines).searchNormalized
        guard !q.isEmpty else { return true }
        return searchNormalized.contains(q)
    }
}
