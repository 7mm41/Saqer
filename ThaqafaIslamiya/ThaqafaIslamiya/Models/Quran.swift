//
//  Quran.swift
//  ثقافة إسلامية
//
//  نماذج المصحف الشريف (دون إنترنت):
//  - صفحات المصحف المدني (٦٠٤ صفحات) من طبعة مجمع الملك فهد: `mushaf_<ppp>.webp`.
//  - النص العثماني، والتفسير الميسّر، والترجمات بلغات التطبيق.
//  - القرّاء وتوقيت بداية كل آية (للبدء من أول آية في الصفحة).
//

import Foundation

struct QuranSurah: Codable, Identifiable, Hashable {
    /// رقم السورة (1…114).
    let n: Int
    /// الاسم العربي، مثل «الكهف».
    let ar: String
    /// الاسم اللاتيني، مثل «Al-Kahf».
    let en: String
    /// معنى الاسم بالإنجليزية.
    let meaning: String
    /// "m" مكية، "d" مدنية.
    let type: String
    let count: Int
    /// صفحة بداية السورة في المصحف.
    let page: Int

    var id: Int { n }
    var isMeccan: Bool { type == "m" }
}

struct QuranJuzStart: Codable, Hashable {
    let juz: Int
    let surah: Int
    let ayah: Int
    let page: Int
}

struct QuranMeta: Codable {
    let surahs: [QuranSurah]
    let juz: [QuranJuzStart]
    /// فهرس أول آية (0…6235) في كل صفحة.
    let pageFirstAyah: [Int]
    /// صفحة كل آية.
    let ayahPage: [Int]
    let sajdas: [Int]
    let basmala: String
}

/// موضع آية: رقم السورة ورقم الآية فيها.
struct AyahRef: Hashable, Codable {
    let surah: Int
    let ayah: Int
}

/// قارئ (رواية حفص عن عاصم، مرتّل).
struct QuranReciter: Codable, Identifiable, Hashable {
    let key: String
    let ar: String
    let en: String
    /// مجلد الملفات على الخادم: `<server><sss>.mp3`.
    let server: String
    /// سور لم يسجّلها القارئ.
    let missing: [Int]
    /// سور مدمجة داخل التطبيق (تعمل من أول تشغيل دون إنترنت).
    let bundled: [Int]

    var id: String { key }
    func has(_ surah: Int) -> Bool { !missing.contains(surah) }
    func remoteURL(_ surah: Int) -> URL? { URL(string: server + String(format: "%03d.mp3", surah)) }
    /// اسم الملف المدمج: `quran_<key>_<sss>.m4a`.
    func bundledName(_ surah: Int) -> String { "quran_\(key)_" + String(format: "%03d", surah) }
    func displayName(arabic: Bool) -> String { arabic ? ar : en }
}

/// مواضع خاصة يُكثر المسلمون من قراءتها.
enum SpecialSurah: Int, CaseIterable, Identifiable {
    case kahf = 18, mulk = 67, baqarah = 2, yasin = 36
    var id: Int { rawValue }
    var symbol: String {
        switch self {
        case .kahf: "moon.stars.fill"
        case .mulk: "shield.lefthalf.filled"
        case .baqarah: "house.lodge.fill"
        case .yasin: "heart.text.square.fill"
        }
    }
    var colors: [String] {
        switch self {
        case .kahf: ["indigo", "purple"]
        case .mulk: ["teal", "blue"]
        case .baqarah: ["green", "mint"]
        case .yasin: ["orange", "pink"]
        }
    }
    var noteKey: String { "quran.special.\(rawValue)" }
}
