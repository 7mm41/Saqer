//
//  ProgressStore.swift
//  ثقافة إسلامية
//
//  يحفظ تقدّم الطفل محليًا على الجهاز (UserDefaults): المسائل المتعلَّمة، والدروس المكتملة، ونتائج الاختبارات.
//

import Foundation
import Observation

@Observable
final class ProgressStore {
    private(set) var learnedMasail: Set<String>
    private(set) var completedLessons: Set<String>
    private(set) var bestQuizScores: [String: Int]

    private let defaults: UserDefaults

    private enum Keys {
        static let learned = "progress.learnedMasail"
        static let lessons = "progress.completedLessons"
        static let quiz = "progress.bestQuizScores"
    }

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        learnedMasail = Set(defaults.stringArray(forKey: Keys.learned) ?? [])
        completedLessons = Set(defaults.stringArray(forKey: Keys.lessons) ?? [])
        bestQuizScores = defaults.dictionary(forKey: Keys.quiz) as? [String: Int] ?? [:]
    }

    // MARK: - المسائل

    func isLearned(_ masala: Masala) -> Bool { learnedMasail.contains(masala.id) }

    func toggleLearned(_ masala: Masala) {
        if learnedMasail.contains(masala.id) {
            learnedMasail.remove(masala.id)
        } else {
            learnedMasail.insert(masala.id)
        }
        defaults.set(Array(learnedMasail), forKey: Keys.learned)
    }

    func progress(for chapter: Chapter) -> Double {
        guard !chapter.masail.isEmpty else { return 0 }
        let learned = chapter.masail.filter { learnedMasail.contains($0.id) }.count
        return Double(learned) / Double(chapter.masail.count)
    }

    func learnedCount(in chapter: Chapter) -> Int {
        chapter.masail.filter { learnedMasail.contains($0.id) }.count
    }

    func overallProgress(total: Int) -> Double {
        guard total > 0 else { return 0 }
        return min(1, Double(learnedMasail.count) / Double(total))
    }

    // MARK: - الدروس

    func isCompleted(_ lesson: InteractiveLesson) -> Bool { completedLessons.contains(lesson.id) }

    func markCompleted(_ lesson: InteractiveLesson) {
        completedLessons.insert(lesson.id)
        defaults.set(Array(completedLessons), forKey: Keys.lessons)
    }

    // MARK: - الاختبارات

    func bestScore(for chapter: Chapter) -> Int? { bestQuizScores[chapter.id] }

    func record(score: Int, for chapter: Chapter) {
        if score > (bestQuizScores[chapter.id] ?? -1) {
            bestQuizScores[chapter.id] = score
            defaults.set(bestQuizScores, forKey: Keys.quiz)
        }
    }

    func resetAll() {
        learnedMasail = []
        completedLessons = []
        bestQuizScores = [:]
        defaults.removeObject(forKey: Keys.learned)
        defaults.removeObject(forKey: Keys.lessons)
        defaults.removeObject(forKey: Keys.quiz)
    }
}
