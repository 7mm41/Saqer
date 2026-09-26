//
//  LibraryViewModel.swift
//  ثقافة إسلامية
//
//  يحمّل محتوى الكتاب باللغة المختارة من الملف المحلي (`TalqeenData.json` أو `TalqeenData.<lang>.json`)
//  ويوفّر البحث والوصول للأقسام والمسائل والدروس.
//  كل الفهارس ونصوص البحث المطبّعة تُحسب مرة واحدة عند التحميل، فيبقى البحث فوريًا أثناء الكتابة.
//

import Foundation
import Observation

@Observable
final class LibraryViewModel {
    private(set) var language: AppLanguage = .arabic
    private(set) var book: BookInfo?
    private(set) var chapters: [Chapter] = []
    private(set) var lessons: [InteractiveLesson] = []
    private(set) var parts: [String] = []
    private(set) var totalMasailCount = 0
    private(set) var loadError: String?

    var searchText: String = "" {
        didSet { updateSearch() }
    }
    private(set) var searchResults: [SearchResult] = []

    // فهارس سريعة للبحث بالمعرّف
    @ObservationIgnored private var chapterIndex: [String: Chapter] = [:]
    @ObservationIgnored private var masalaIndex: [String: (masala: Masala, chapterId: String)] = [:]
    @ObservationIgnored private var lessonIndex: [String: InteractiveLesson] = [:]
    @ObservationIgnored private var chaptersByPart: [String: [Chapter]] = [:]
    /// نص كل مسألة مطبَّعًا للبحث (العنوان + الملخّص + النقاط).
    @ObservationIgnored private var searchHaystack: [(result: SearchResult, text: String)] = []

    init(fileName: String? = nil, language: AppLanguage = L10n.language, bundle: Bundle = .main) {
        load(fileName: fileName ?? language.dataFileName, language: language, bundle: bundle)
    }

    /// يحمّل ملف المحتوى (مثل `TalqeenData.en` أو `TalqeenData.tashkeel` للعربية المشكولة).
    func load(fileName: String, language: AppLanguage, bundle: Bundle = .main) {
        do {
            let library = try bundle.decode(TalqeenLibrary.self, from: fileName)
            self.language = language
            book = library.book
            chapters = library.chapters
            lessons = library.lessons
            buildIndexes()
            loadError = nil
            updateSearch()
        } catch {
            loadError = error.localizedDescription
        }
    }

    private func buildIndexes() {
        chapterIndex = Dictionary(uniqueKeysWithValues: chapters.map { ($0.id, $0) })
        lessonIndex = Dictionary(uniqueKeysWithValues: lessons.map { ($0.id, $0) })

        var masail: [String: (masala: Masala, chapterId: String)] = [:]
        var haystack: [(result: SearchResult, text: String)] = []
        var byPart: [String: [Chapter]] = [:]
        var orderedParts: [String] = []
        for chapter in chapters {
            if byPart[chapter.part] == nil { orderedParts.append(chapter.part) }
            byPart[chapter.part, default: []].append(chapter)
            for masala in chapter.masail {
                masail[masala.id] = (masala, chapter.id)
                let text = ([masala.title, masala.summary] + masala.points).joined(separator: "\n").searchNormalized
                haystack.append((result: SearchResult(masala: masala, chapter: chapter), text: text))
            }
        }
        masalaIndex = masail
        searchHaystack = haystack
        chaptersByPart = byPart
        parts = orderedParts
        totalMasailCount = masail.count
    }

    // MARK: - Lookup

    func chapter(id: String) -> Chapter? { chapterIndex[id] }
    func lesson(id: String) -> InteractiveLesson? { lessonIndex[id] }
    func masala(id: String) -> Masala? { masalaIndex[id]?.masala }
    func chapter(containing masalaId: String) -> Chapter? {
        guard let chapterId = masalaIndex[masalaId]?.chapterId else { return nil }
        return chapterIndex[chapterId]
    }

    func lessons(for chapter: Chapter) -> [InteractiveLesson] {
        (chapter.lessonIds ?? []).compactMap { lessonIndex[$0] }
    }

    func chapters(inPart part: String) -> [Chapter] { chaptersByPart[part] ?? [] }

    // MARK: - Search

    struct SearchResult: Identifiable, Hashable {
        let masala: Masala
        let chapter: Chapter
        var id: String { masala.id }
    }

    var isSearching: Bool {
        !searchText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private func updateSearch() {
        let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines).searchNormalized
        guard !query.isEmpty else {
            if !searchResults.isEmpty { searchResults = [] }
            return
        }
        searchResults = searchHaystack.filter { $0.text.contains(query) }.map { $0.result }
    }
}
