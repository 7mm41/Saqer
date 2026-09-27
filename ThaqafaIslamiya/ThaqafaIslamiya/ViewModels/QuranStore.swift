//
//  QuranStore.swift
//  ثقافة إسلامية
//
//  مخزن المصحف: يحمّل بيانات القرآن في الخلفية عند أول فتح لتبويب «القرآن» (فلا يبطئ تشغيل التطبيق)،
//  ويربط الصفحات بالآيات، ويوفّر التفسير والترجمة وتوقيت القرّاء، ويحفظ موضع القراءة والعلامات.
//

import Foundation
import Observation

@Observable
final class QuranStore {
    private(set) var meta: QuranMeta?
    private(set) var reciters: [QuranReciter] = []
    private(set) var isLoading = false
    /// تخطيط صفحات المصحف (خطوط مجمع الملك فهد) — يُحمَّل في الخلفية عند أول فتح للمصحف.
    private(set) var layout: MushafLayout?
    @ObservationIgnored private(set) var basmalaCodes: [String] = []
    @ObservationIgnored private var isLoadingLayout = false

    /// آخر صفحة قرأها المستخدم (1…604).
    private(set) var lastPage: Int
    private(set) var lastReadDate: Date?
    /// الصفحات المعلَّمة.
    private(set) var bookmarks: [Int]
    /// القارئ المختار.
    var reciterKey: String {
        didSet { defaults.set(reciterKey, forKey: Keys.reciter) }
    }
    /// ليلي للمصحف: قلب ألوان الصفحة لقراءة مريحة في الظلام.
    var nightPages: Bool {
        didSet { defaults.set(nightPages, forKey: Keys.night) }
    }
    /// الانتقال التلقائي مع التلاوة إلى الصفحة التالية.
    var followRecitation: Bool {
        didSet { defaults.set(followRecitation, forKey: Keys.follow) }
    }

    @ObservationIgnored private(set) var text: [String] = []
    @ObservationIgnored private var tafsir: [String]?
    @ObservationIgnored private var translations: [String: [String]] = [:]
    @ObservationIgnored private var timings: [String: [String: [Int]]] = [:]
    @ObservationIgnored private var surahStart: [Int] = []          // global index of ayah 1 of each surah
    @ObservationIgnored private var letterCounts: [Int] = []
    private let defaults: UserDefaults
    private let lock = NSLock()

    private enum Keys {
        static let lastPage = "quran.lastPage"
        static let lastDate = "quran.lastDate"
        static let bookmarks = "quran.bookmarks"
        static let reciter = "quran.reciter"
        static let night = "quran.nightPages"
        static let follow = "quran.follow"
    }

    static let pageCount = 604
    static let ayahCount = 6236

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        let saved = defaults.integer(forKey: Keys.lastPage)
        lastPage = (1...Self.pageCount).contains(saved) ? saved : 1
        lastReadDate = defaults.object(forKey: Keys.lastDate) as? Date
        bookmarks = defaults.array(forKey: Keys.bookmarks) as? [Int] ?? []
        reciterKey = defaults.string(forKey: Keys.reciter) ?? "balushi"
        nightPages = defaults.object(forKey: Keys.night) as? Bool ?? false
        followRecitation = defaults.object(forKey: Keys.follow) as? Bool ?? true
    }

    var isLoaded: Bool { meta != nil }
    var surahs: [QuranSurah] { meta?.surahs ?? [] }
    var reciter: QuranReciter? { reciters.first { $0.key == reciterKey } ?? reciters.first }
    var khatmaProgress: Double { Double(lastPage) / Double(Self.pageCount) }

    // MARK: - Loading

    /// يحمّل الفهرس والنص في الخلفية (مرة واحدة).
    func loadIfNeeded() {
        guard meta == nil, !isLoading else { return }
        isLoading = true
        Task.detached(priority: .userInitiated) { [weak self] in
            let meta = try? Bundle.main.decode(QuranMeta.self, from: "quran_meta")
            let text = (try? Bundle.main.decode([String].self, from: "quran_text")) ?? []
            let reciters = (try? Bundle.main.decode([QuranReciter].self, from: "quran_reciters")) ?? []
            var starts: [Int] = []
            var index = 0
            for surah in meta?.surahs ?? [] {
                starts.append(index)
                index += surah.count
            }
            let letters = text.map { $0.unicodeScalars.filter { (0x0621...0x064A).contains($0.value) }.count }
            await MainActor.run {
                guard let self else { return }
                self.text = text
                self.surahStart = starts
                self.letterCounts = letters
                self.reciters = reciters
                self.meta = meta
                self.isLoading = false
            }
        }
    }

    /// يحمّل تخطيط صفحات المصحف في الخلفية (مرة واحدة)، ويجهّز خط أسماء السور.
    func loadLayoutIfNeeded() {
        guard layout == nil, !isLoadingLayout else { return }
        isLoadingLayout = true
        Task.detached(priority: .userInitiated) { [weak self] in
            let layout = try? Bundle.main.decode(MushafLayout.self, from: "mushaf_layout")
            QuranFonts.preloadSurahNames()
            QuranFonts.preload(page: 1)
            let basmala = layout?.basmalaCodes ?? []
            await MainActor.run {
                guard let self else { return }
                self.basmalaCodes = basmala
                self.layout = layout
                self.isLoadingLayout = false
            }
        }
    }

    // MARK: - Pages & ayahs

    func surah(_ n: Int) -> QuranSurah? {
        guard let meta, (1...meta.surahs.count).contains(n) else { return nil }
        return meta.surahs[n - 1]
    }

    func globalIndex(_ ref: AyahRef) -> Int {
        guard surahStart.indices.contains(ref.surah - 1) else { return 0 }
        return surahStart[ref.surah - 1] + ref.ayah - 1
    }

    func ref(forGlobal g: Int) -> AyahRef {
        var lo = 0, hi = surahStart.count - 1
        while lo < hi {
            let mid = (lo + hi + 1) / 2
            if surahStart[mid] <= g { lo = mid } else { hi = mid - 1 }
        }
        return AyahRef(surah: lo + 1, ayah: g - (surahStart.isEmpty ? 0 : surahStart[lo]) + 1)
    }

    /// الآيات في صفحة (مرتبة).
    func ayahs(onPage page: Int) -> [AyahRef] {
        guard let meta, (1...Self.pageCount).contains(page) else { return [] }
        let first = meta.pageFirstAyah[page - 1]
        let end = page < Self.pageCount ? meta.pageFirstAyah[page] : Self.ayahCount
        return (first..<end).map(ref(forGlobal:))
    }

    func firstAyah(onPage page: Int) -> AyahRef? {
        guard let meta, (1...Self.pageCount).contains(page) else { return nil }
        return ref(forGlobal: meta.pageFirstAyah[page - 1])
    }

    func page(of ref: AyahRef) -> Int {
        guard let meta else { return 1 }
        let g = globalIndex(ref)
        return meta.ayahPage.indices.contains(g) ? meta.ayahPage[g] : 1
    }

    func surahs(onPage page: Int) -> [QuranSurah] {
        var seen: [Int] = []
        for a in ayahs(onPage: page) where !seen.contains(a.surah) { seen.append(a.surah) }
        return seen.compactMap(surah)
    }

    /// صفحات سورة من أولها إلى آخرها (لوضع قراءة السورة وحدها، مثل الكهف والملك).
    func pageRange(ofSurah n: Int) -> ClosedRange<Int> {
        guard let s = surah(n) else { return 1...Self.pageCount }
        let last = page(of: AyahRef(surah: n, ayah: s.count))
        return s.page...max(s.page, last)
    }

    func juz(forPage page: Int) -> Int {
        guard let meta else { return 1 }
        return (meta.juz.last { $0.page <= page }?.juz) ?? 1
    }

    func text(_ ref: AyahRef) -> String {
        let g = globalIndex(ref)
        return text.indices.contains(g) ? text[g] : ""
    }

    func isSajda(_ ref: AyahRef) -> Bool { meta?.sajdas.contains(globalIndex(ref)) ?? false }

    // MARK: - Tafsir & translation (loaded on first use)

    func tafsir(_ ref: AyahRef) -> String {
        lock.lock(); defer { lock.unlock() }
        if tafsir == nil { tafsir = (try? Bundle.main.decode([String].self, from: "quran_tafsir_ar")) ?? [] }
        let g = globalIndex(ref)
        return tafsir?.indices.contains(g) == true ? tafsir![g] : ""
    }

    func translation(_ ref: AyahRef, language: AppLanguage) -> String? {
        guard language != .arabic else { return nil }
        lock.lock(); defer { lock.unlock() }
        if translations[language.rawValue] == nil {
            translations[language.rawValue] = (try? Bundle.main.decode([String].self, from: "quran_tr_\(language.rawValue)")) ?? []
        }
        let list = translations[language.rawValue] ?? []
        let g = globalIndex(ref)
        return list.indices.contains(g) ? list[g] : nil
    }

    // MARK: - Recitation timing

    /// بداية كل آية بالمللي ثانية + نهاية السورة، لقارئ وسورة. عند غياب التوقيت يُقدَّر من طول الآيات.
    func timing(reciter: String, surah: Int, duration: Double?) -> [Int]? {
        lock.lock()
        if timings[reciter] == nil {
            timings[reciter] = (try? Bundle.main.decode([String: [Int]].self, from: "quran_timing_\(reciter)")) ?? [:]
        }
        let exact = timings[reciter]?[String(surah)]
        lock.unlock()
        if let exact { return exact }
        guard let duration, let s = self.surah(surah), surahStart.indices.contains(surah - 1) else { return nil }
        // تقدير تناسبي بعدد الحروف (احتياطي نادر)
        let first = surahStart[surah - 1]
        let lens = (0..<s.count).map { letterCounts.indices.contains(first + $0) ? max(letterCounts[first + $0], 1) : 1 }
        let total = Double(lens.reduce(0, +))
        let ms = duration * 1000
        let opening = surah == 1 || surah == 9 ? 0 : min(8000, ms * 0.03)
        var starts: [Int] = []
        var acc = 0
        for len in lens {
            starts.append(Int(opening + (ms - opening) * Double(acc) / total))
            acc += len
        }
        return starts + [Int(ms)]
    }

    // MARK: - Reading position & bookmarks

    func saveLastPage(_ page: Int) {
        guard (1...Self.pageCount).contains(page) else { return }
        lastPage = page
        lastReadDate = .now
        defaults.set(page, forKey: Keys.lastPage)
        defaults.set(lastReadDate, forKey: Keys.lastDate)
    }

    func isBookmarked(_ page: Int) -> Bool { bookmarks.contains(page) }

    func toggleBookmark(_ page: Int) {
        if let i = bookmarks.firstIndex(of: page) {
            bookmarks.remove(at: i)
        } else {
            bookmarks.append(page)
            bookmarks.sort()
        }
        defaults.set(bookmarks, forKey: Keys.bookmarks)
    }

    // MARK: - Search

    func searchSurahs(_ query: String) -> [QuranSurah] {
        let q = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !q.isEmpty else { return surahs }
        if let n = Int(q), let s = surah(n) { return [s] }
        return surahs.filter {
            $0.ar.arabicContains(q) || $0.en.localizedCaseInsensitiveContains(q) || $0.meaning.localizedCaseInsensitiveContains(q)
        }
    }
}
