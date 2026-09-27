//
//  MushafLayout.swift
//  ثقافة إسلامية
//
//  تخطيط المصحف المدني (مجمع الملك فهد — خطوط QCF لكل صفحة): ٦٠٤ صفحات × ١٥ سطرًا،
//  كل سطر كلمات (رمز الكلمة في خط الصفحة + رقم الآية) أو شريط اسم السورة أو البسملة.
//  النص يُرسم بالخط الرسمي لكل صفحة، فيطابق المصحف المطبوع حرفًا بحرف وسطرًا بسطر.
//

import Foundation
import CoreText
import SwiftUI

struct MushafWord: Decodable, Hashable {
    /// رمز الكلمة في خط الصفحة.
    let code: String
    /// فهرس الآية (0…6235).
    let ayah: Int
    /// علامة نهاية الآية (الدائرة المرقّمة).
    let isEnd: Bool

    /// كلمة بلا آية (البسملة فوق السورة).
    init(code: String) {
        self.code = code
        ayah = -1
        isEnd = false
    }

    init(from decoder: Decoder) throws {
        var c = try decoder.unkeyedContainer()
        code = try c.decode(String.self)
        ayah = try c.decode(Int.self)
        isEnd = try c.decode(Int.self) == 1
    }
}

enum MushafLine: Decodable, Hashable {
    case words([MushafWord], scale: Double)
    case surahTitle(Int)
    case basmala

    private enum Keys: String, CodingKey { case w, x, h, b }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Keys.self)
        if let words = try c.decodeIfPresent([MushafWord].self, forKey: .w) {
            self = .words(words, scale: try c.decodeIfPresent(Double.self, forKey: .x) ?? 1)
        } else if let surah = try c.decodeIfPresent(Int.self, forKey: .h) {
            self = .surahTitle(surah)
        } else {
            self = .basmala
        }
    }
}

struct MushafPage: Decodable, Hashable {
    let lines: [MushafLine]
    /// صفحتا الفاتحة وبداية البقرة: أسطر قصيرة في وسط الصفحة.
    let centered: Bool

    private enum Keys: String, CodingKey { case l, c }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Keys.self)
        lines = try c.decode([MushafLine].self, forKey: .l)
        centered = (try c.decodeIfPresent(Int.self, forKey: .c) ?? 0) == 1
    }
}

struct MushafLayout: Decodable {
    /// عرض السطر الكامل بوحدة em (لحساب حجم الخط من عرض الشاشة).
    let target: Double
    let pages: [MushafPage]

    /// رموز البسملة (كلمات ١:١ من الصفحة الأولى، بخطها).
    var basmalaCodes: [String] {
        guard let page = pages.first else { return [] }
        for line in page.lines {
            if case .words(let words, _) = line {
                return words.filter { $0.ayah == 0 && !$0.isEnd }.map(\.code)
            }
        }
        return []
    }
}

/// خطوط المصحف (خط لكل صفحة + خط أسماء السور): تُنشأ مباشرة من ملف الخط في الحزمة (CTFont من البيانات)
/// ولا تعتمد على التسجيل العام ولا البحث بالاسم — كان ذلك يفشل فيظهر النص بخط النظام وأسماء السور «؟».
enum QuranFonts {
    private static var descriptors: [String: CTFontDescriptor] = [:]
    private static let lock = NSLock()

    static func pageFileName(_ page: Int) -> String { String(format: "QCF_P%03d", page) }
    static let surahNamesFile = "QuranSurahNames"

    /// واصف خط من ملف في الحزمة (يُقرأ مرة واحدة ويُحفظ).
    private static func descriptor(_ file: String) -> CTFontDescriptor? {
        lock.lock(); defer { lock.unlock() }
        if let cached = descriptors[file] { return cached }
        guard let url = Bundle.main.url(forResource: file, withExtension: "ttf"),
              let data = try? Data(contentsOf: url),
              let descriptor = CTFontManagerCreateFontDescriptorFromData(data as CFData) else { return nil }
        descriptors[file] = descriptor
        return descriptor
    }

    /// يجهّز خط الصفحة مسبقًا (من الخلفية) لتقليب سلس.
    static func preload(page: Int) { _ = descriptor(pageFileName(page)) }
    static func preloadSurahNames() { _ = descriptor(surahNamesFile) }

    static func pageFont(_ page: Int, size: CGFloat) -> Font { font(pageFileName(page), size: size) }
    static func surahNamesFont(size: CGFloat) -> Font { font(surahNamesFile, size: size) }

    private static func font(_ file: String, size: CGFloat) -> Font {
        guard let descriptor = descriptor(file) else { return .system(size: size) }
        return Font(CTFontCreateWithFontDescriptor(descriptor, size, nil))
    }

    /// رمز اسم السورة في خط أسماء السور: U+E000 + رقم السورة مكتوبًا بأرقام ست عشرية (١١٤ → U+E114).
    static func surahNameGlyph(_ surah: Int) -> String {
        guard let value = UInt32(String(surah), radix: 16), let scalar = Unicode.Scalar(0xE000 + value) else { return "" }
        return String(Character(scalar))
    }

    /// كلمة «سورة» في خط أسماء السور.
    static let surahWordGlyph = String(Character(Unicode.Scalar(0xE000)!))
}
