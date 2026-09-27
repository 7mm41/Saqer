//
//  String+Arabic.swift
//  ثقافة إسلامية
//
//  تطبيع النص للبحث: يتجاهل التشكيل وحالة الأحرف، ويوحّد الهمزات والتاء المربوطة والألف المقصورة
//  (يعمل كذلك مع الفارسية والتركية والهندية والبنغالية والإنجليزية).
//

import Foundation

extension String {
    /// نص مُطبَّع للبحث: حروف صغيرة، بلا تشكيل ولا علامات قرآنية ولا تطويل، وبتوحيد الهمزات والتاء المربوطة
    /// والألف المقصورة والياء والكاف الفارسيتين. يعمل حرفًا بحرف (لا يعتمد على طيّ Foundation) فيطابق دائمًا.
    var searchNormalized: String {
        var out = String.UnicodeScalarView()
        for scalar in decomposedStringWithCanonicalMapping.lowercased().unicodeScalars {
            switch scalar.properties.generalCategory {
            case .nonspacingMark, .enclosingMark, .format, .control:
                continue                                   // التشكيل، علامات الوقف، المحارف غير المرئية
            default:
                break
            }
            switch scalar.value {
            case 0x0640: continue                          // ـ تطويل
            case 0x0622, 0x0623, 0x0625, 0x0671, 0x0672, 0x0673:
                out.append("ا")                            // آ أ إ ٱ
            case 0x0629: out.append("ه")                   // ة
            case 0x0649, 0x06CC, 0x0626: out.append("ي")   // ى ی ئ
            case 0x0624: out.append("و")                   // ؤ
            case 0x06A9: out.append("ك")                   // ک
            default: out.append(scalar)
            }
        }
        return String(out)
    }

    /// هل يحتوي النص على عبارة البحث (بمرونة)؟
    func arabicContains(_ query: String) -> Bool {
        let q = query.trimmingCharacters(in: .whitespacesAndNewlines).searchNormalized
        guard !q.isEmpty else { return true }
        return searchNormalized.contains(q)
    }
}
