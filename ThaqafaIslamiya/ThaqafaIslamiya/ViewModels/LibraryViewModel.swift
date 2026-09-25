//
//  LibraryViewModel.swift
//  ثقافة إسلامية
//
//  يحمّل محتوى الكتاب من الملف المحلي `TalqeenData.json` ويوفّر البحث والوصول للأقسام والمسائل والدروس.
//

import Foundation
import Observation

@Observable
final class LibraryViewModel {
    private(set) var book: BookInfo?
    private(set) var chapters: [Chapter] = []
    private(set) var lessons: [InteractiveLesson] = []
    private(set) var loadError: String?

    var searchText: String = ""

    // فهارس سريعة للبحث بالمعرّف
    private var chapterIndex: [String: Chapter] = [:]
    private var masalaIndex: [String: (masala: Masala, chapterId: String)] = [:]
    private var lessonIndex: [String: InteractiveLesson] = [:]

    init(bundle: Bundle = .main, fileName: String = "TalqeenData") {
        load(from: bundle, fileName: fileName)
    }

    func load(from bundle: Bundle, fileName: String) {
        do {
            let library = try bundle.decode(TalqeenLibrary.self, from: fileName)
            book = library.book
            chapters = library.chapters
            lessons = library.lessons
            buildIndexes()
            loadError = nil
        } catch {
            loadError = error.localizedDescription
        }
    }

    private func buildIndexes() {
        chapterIndex = Dictionary(uniqueKeysWithValues: chapters.map { ($0.id, $0) })
        lessonIndex = Dictionary(uniqueKeysWithValues: lessons.map { ($0.id, $0) })
        var masail: [String: (Masala, String)] = [:]
        for chapter in chapters {
            for masala in chapter.masail {
                masail[masala.id] = (masala, chapter.id)
            }
        }
        masalaIndex = masail.mapValues { (masala: $0.0, chapterId: $0.1) }
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

    var totalMasailCount: Int { chapters.reduce(0) { $0 + $1.masail.count } }

    /// الأجزاء الأربعة للكتاب بترتيبها (المقدمة، المقصد الأول، المقصد الثاني، الخاتمة).
    var parts: [String] {
        var seen = Set<String>()
        return chapters.map(\.part).filter { seen.insert($0).inserted }
    }

    func chapters(inPart part: String) -> [Chapter] {
        chapters.filter { $0.part == part }
    }

    // MARK: - Search

    struct SearchResult: Identifiable, Hashable {
        let masala: Masala
        let chapter: Chapter
        var id: String { masala.id }
    }

    var isSearching: Bool {
        !searchText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var searchResults: [SearchResult] {
        guard isSearching else { return [] }
        return chapters.flatMap { chapter in
            chapter.masail
                .filter { masala in
                    masala.title.arabicContains(searchText)
                        || masala.summary.arabicContains(searchText)
                        || masala.points.contains { $0.arabicContains(searchText) }
                }
                .map { SearchResult(masala: $0, chapter: chapter) }
        }
    }
}
