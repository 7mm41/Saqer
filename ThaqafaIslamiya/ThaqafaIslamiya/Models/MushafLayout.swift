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

/// تسجيل خطوط المصحف عند الحاجة (خط لكل صفحة) — سريع ومرة واحدة لكل خط.
enum QuranFonts {
    static let surahNames = "sura_names"
    private static var registered = Set<String>()
    private static let lock = NSLock()

    static func pageFontName(_ page: Int) -> String { String(format: "QCF_P%03d", page) }

    /// يضمن تسجيل خط الصفحة ويعيد اسمه.
    @discardableResult
    static func ensurePage(_ page: Int) -> String {
        let name = pageFontName(page)
        register(file: name, name: name)
        return name
    }

    static func ensureSurahNames() {
        register(file: "QuranSurahNames", name: surahNames)
    }

    private static func register(file: String, name: String) {
        lock.lock(); defer { lock.unlock() }
        guard !registered.contains(name),
              let url = Bundle.main.url(forResource: file, withExtension: "ttf") else { return }
        CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil)
        registered.insert(name)
    }

    /// رمز اسم السورة في خط أسماء السور: U+E000 + رقم السورة مكتوبًا بأرقام ست عشرية (١١٤ → U+E114).
    static func surahNameGlyph(_ surah: Int) -> String {
        guard let value = UInt32(String(surah), radix: 16), let scalar = Unicode.Scalar(0xE000 + value) else { return "" }
        return String(Character(scalar))
    }

    /// كلمة «سورة» في خط أسماء السور.
    static let surahWordGlyph = String(Character(Unicode.Scalar(0xE000)!))
}
