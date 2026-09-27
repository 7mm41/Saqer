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

/// رسم كلمة (أو أكثر) من خط المصحف: شكل الحروف مسارًا جاهزًا بوحدة em (الأعلى سالب، خط الأساس صفر)،
/// وعرضها. الرموز داخل الكلمة تُرتَّب من اليمين إلى اليسار كما في المصحف.
struct GlyphRun {
    let path: CGPath
    let advance: CGFloat
}

/// خط من خطوط المصحف مقروء مباشرة من ملفه (CGFont) وتُستخرج منه أشكال الحروف مسارات.
/// الرسم بالمسارات لا يمر بآلية اختيار الخطوط في SwiftUI/CoreText إطلاقًا — كانت تستبدل خط المصحف
/// بخط النظام (حروف عربية عادية) وأسماء السور برموز تعبيرية و«؟».
final class QuranFace: @unchecked Sendable {
    /// صاعد ونازل صندوق السطر بوحدة em.
    let ascent: CGFloat
    let descent: CGFloat
    private let font: CTFont
    private var runs: [String: GlyphRun] = [:]
    private let lock = NSLock()

    init?(url: URL) {
        guard let data = try? Data(contentsOf: url),
              let provider = CGDataProvider(data: data as CFData),
              let graphicsFont = CGFont(provider) else { return nil }
        font = CTFontCreateWithGraphicsFont(graphicsFont, 1, nil, nil)
        ascent = CTFontGetAscent(font)
        descent = CTFontGetDescent(font)
    }

    func run(_ code: String) -> GlyphRun {
        lock.lock(); defer { lock.unlock() }
        if let cached = runs[code] { return cached }
        var glyphs: [CGGlyph] = []
        var advances: [CGFloat] = []
        for scalar in code.unicodeScalars {
            var units = Array(String(scalar).utf16)
            var found = [CGGlyph](repeating: 0, count: units.count)
            CTFontGetGlyphsForCharacters(font, &units, &found, units.count)
            var glyph = found[0]
            var advance = CGSize.zero
            CTFontGetAdvancesForGlyphs(font, .horizontal, &glyph, &advance, 1)
            glyphs.append(glyph)
            advances.append(advance.width)
        }
        let total = advances.reduce(0, +)
        let path = CGMutablePath()
        var x = total
        for (glyph, advance) in zip(glyphs, advances) {
            x -= advance                                  // الرمز الأول في أقصى اليمين
            if glyph != 0, let outline = CTFontCreatePathForGlyph(font, glyph, nil) {
                // إحداثيات الخط للأعلى؛ نقلبها لإحداثيات الشاشة (للأسفل)
                path.addPath(outline, transform: CGAffineTransform(a: 1, b: 0, c: 0, d: -1, tx: x, ty: 0))
            }
        }
        let run = GlyphRun(path: path, advance: total)
        runs[code] = run
        return run
    }
}

/// خطوط المصحف: خط لكل صفحة (QCF) وخط أسماء السور، تُقرأ عند الحاجة ويُحتفظ بآخرها في الذاكرة.
enum QuranFonts {
    private static let cache: NSCache<NSString, QuranFace> = {
        let cache = NSCache<NSString, QuranFace>()
        cache.countLimit = 24
        return cache
    }()
    private static let lock = NSLock()

    static func pageFileName(_ page: Int) -> String { String(format: "QCF_P%03d", page) }
    static let surahNamesFile = "QuranSurahNames"

    static func face(_ file: String) -> QuranFace? {
        lock.lock(); defer { lock.unlock() }
        if let cached = cache.object(forKey: file as NSString) { return cached }
        guard let url = Bundle.main.url(forResource: file, withExtension: "ttf"),
              let face = QuranFace(url: url) else { return nil }
        cache.setObject(face, forKey: file as NSString)
        return face
    }

    static func pageFace(_ page: Int) -> QuranFace? { face(pageFileName(page)) }
    static var surahNamesFace: QuranFace? { face(surahNamesFile) }

    /// يجهّز خط الصفحة مسبقًا (من الخلفية) لتقليب سلس.
    static func preload(page: Int) { _ = pageFace(page) }
    static func preloadSurahNames() { _ = surahNamesFace }

    /// رمز اسم السورة في خط أسماء السور: U+E000 + رقم السورة مكتوبًا بأرقام ست عشرية (١١٤ → U+E114).
    static func surahNameGlyph(_ surah: Int) -> String {
        guard let value = UInt32(String(surah), radix: 16), let scalar = Unicode.Scalar(0xE000 + value) else { return "" }
        return String(Character(scalar))
    }

    /// كلمة «سورة» في خط أسماء السور.
    static let surahWordGlyph = String(Character(Unicode.Scalar(0xE000)!))
}
