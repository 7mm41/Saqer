//
//  ProgressStore.swift
//  ثقافة إسلامية
//
//  يحفظ تقدّم الطفل محليًا على الجهاز (UserDefaults): المسائل المتعلَّمة، والدروس المكتملة، ونتائج الاختبارات،
//  وإحصاءات بنك الأسئلة (عدد الإجابات، الصحيحة، أفضل سلسلة، الأسئلة التي ظهرت، وأيام التعلّم المتتالية).
//

import Foundation
import Observation

@Observable
final class ProgressStore {
    private(set) var learnedMasail: Set<String>
    private(set) var completedLessons: Set<String>
    private(set) var bestQuizScores: [String: Int]
    private(set) var answeredCount: Int
    private(set) var correctCount: Int
    private(set) var bestStreak: Int
    private(set) var seenQuestions: Set<String>
    private(set) var dayStreak: Int
    private var lastActiveDay: Int

    private let defaults: UserDefaults

    private enum Keys {
        static let learned = "progress.learnedMasail"
        static let lessons = "progress.completedLessons"
        static let quiz = "progress.bestQuizScores"
        static let answered = "bank.answered"
        static let correct = "bank.correct"
        static let bestStreak = "bank.bestStreak"
        static let seen = "bank.seen"
        static let dayStreak = "bank.dayStreak"
        static let lastDay = "bank.lastDay"
    }

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        learnedMasail = Set(defaults.stringArray(forKey: Keys.learned) ?? [])
        completedLessons = Set(defaults.stringArray(forKey: Keys.lessons) ?? [])
        bestQuizScores = defaults.dictionary(forKey: Keys.quiz) as? [String: Int] ?? [:]
        answeredCount = defaults.integer(forKey: Keys.answered)
        correctCount = defaults.integer(forKey: Keys.correct)
        bestStreak = defaults.integer(forKey: Keys.bestStreak)
        seenQuestions = Set(defaults.stringArray(forKey: Keys.seen) ?? [])
        dayStreak = defaults.integer(forKey: Keys.dayStreak)
        lastActiveDay = defaults.integer(forKey: Keys.lastDay)
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

    // MARK: - بنك الأسئلة

    var accuracy: Double { answeredCount == 0 ? 0 : Double(correctCount) / Double(answeredCount) }

    func recordAnswer(questionId: String, correct: Bool) {
        answeredCount += 1
        if correct { correctCount += 1 }
        seenQuestions.insert(questionId)
        touchToday()
        defaults.set(answeredCount, forKey: Keys.answered)
        defaults.set(correctCount, forKey: Keys.correct)
        defaults.set(Array(seenQuestions), forKey: Keys.seen)
    }

    func recordStreak(_ streak: Int) {
        guard streak > bestStreak else { return }
        bestStreak = streak
        defaults.set(bestStreak, forKey: Keys.bestStreak)
    }

    /// أيام التعلّم المتتالية (تزيد مرة واحدة في اليوم عند الإجابة).
    private func touchToday() {
        let today = Calendar.current.ordinality(of: .day, in: .era, for: .now) ?? 0
        guard today != lastActiveDay else { return }
        dayStreak = (today == lastActiveDay + 1) ? dayStreak + 1 : 1
        lastActiveDay = today
        defaults.set(dayStreak, forKey: Keys.dayStreak)
        defaults.set(lastActiveDay, forKey: Keys.lastDay)
    }

    /// سلسلة الأيام الحالية (صفر إن انقطعت).
    var currentDayStreak: Int {
        let today = Calendar.current.ordinality(of: .day, in: .era, for: .now) ?? 0
        return today - lastActiveDay <= 1 ? dayStreak : 0
    }

    func resetAll() {
        learnedMasail = []
        completedLessons = []
        bestQuizScores = [:]
        answeredCount = 0
        correctCount = 0
        bestStreak = 0
        seenQuestions = []
        dayStreak = 0
        lastActiveDay = 0
        for key in [Keys.learned, Keys.lessons, Keys.quiz, Keys.answered, Keys.correct, Keys.bestStreak,
                    Keys.seen, Keys.dayStreak, Keys.lastDay] {
            defaults.removeObject(forKey: key)
        }
    }
}
