//
//  QuizSessionViewModel.swift
//  ثقافة إسلامية
//
//  جولة أسئلة عشوائية: اختيار من متعدد أو كتابة، مع النتيجة وسلسلة الإجابات الصحيحة المتتالية.
//

import SwiftUI
import Observation

@Observable
final class QuizSessionViewModel {
    let config: QuizSessionConfig
    private(set) var index = 0
    private(set) var selectedOption: Int?
    var typedAnswer = ""
    private(set) var writtenResult: Bool?
    private(set) var score = 0
    private(set) var streak = 0
    private(set) var bestStreak = 0
    private(set) var isFinished = false
    var showHint = false

    init(config: QuizSessionConfig) {
        self.config = config
    }

    var questions: [BankQuestion] { config.questions }
    var current: BankQuestion { questions[index] }
    var total: Int { questions.count }
    var isLast: Bool { index + 1 >= total }

    var hasAnswered: Bool {
        current.kind == .choice ? selectedOption != nil : writtenResult != nil
    }

    var isCorrect: Bool {
        switch current.kind {
        case .choice: selectedOption != nil && selectedOption == current.a
        case .written: writtenResult == true
        }
    }

    var progress: Double { Double(index + (hasAnswered ? 1 : 0)) / Double(max(total, 1)) }
    var accuracy: Double { Double(score) / Double(max(total, 1)) }

    /// يسجّل الإجابة ويعيد هل كانت صحيحة (لتحديث الإحصاءات).
    @discardableResult
    func select(_ option: Int) -> Bool {
        guard selectedOption == nil else { return isCorrect }
        withAnimation(.spring(response: 0.4, dampingFraction: 0.65)) {
            selectedOption = option
            register(option == current.a)
        }
        return isCorrect
    }

    @discardableResult
    func submitWritten() -> Bool {
        guard writtenResult == nil, !typedAnswer.trimmingCharacters(in: .whitespaces).isEmpty else { return false }
        let ok = current.accepts(typedAnswer)
        withAnimation(.spring(response: 0.4, dampingFraction: 0.65)) {
            writtenResult = ok
            register(ok)
        }
        return ok
    }

    /// «لا أعرف»: يكشف الإجابة ويحسبها خاطئة.
    func reveal() {
        guard writtenResult == nil else { return }
        withAnimation(.spring(response: 0.4, dampingFraction: 0.7)) {
            writtenResult = false
            register(false)
        }
    }

    private func register(_ correct: Bool) {
        if correct {
            score += 1
            streak += 1
            bestStreak = max(bestStreak, streak)
        } else {
            streak = 0
        }
    }

    func next() {
        withAnimation(.spring(response: 0.5, dampingFraction: 0.85)) {
            if isLast {
                isFinished = true
            } else {
                index += 1
                selectedOption = nil
                typedAnswer = ""
                writtenResult = nil
                showHint = false
            }
        }
    }
}
