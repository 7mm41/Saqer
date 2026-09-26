//
//  Bundle+Decode.swift
//  ثقافة إسلامية
//
//  تحميل ملفات JSON المدمجة داخل التطبيق (بدون أي اتصال بالإنترنت).
//

import Foundation

enum BundleDecodingError: LocalizedError {
    case fileNotFound(String)

    var errorDescription: String? {
        switch self {
        case .fileNotFound(let name):
            return L10n.t("error.fileNotFound", name)
        }
    }
}

extension Bundle {
    /// يفك ترميز ملف JSON مدمج في حزمة التطبيق.
    func decode<T: Decodable>(_ type: T.Type, from fileName: String, withExtension ext: String = "json") throws -> T {
        guard let url = url(forResource: fileName, withExtension: ext) else {
            throw BundleDecodingError.fileNotFound("\(fileName).\(ext)")
        }
        let data = try Data(contentsOf: url, options: .mappedIfSafe)
        return try JSONDecoder().decode(T.self, from: data)
    }
}
