//
//  QuizViewModel.swift
//  ثقافة إسلامية
//
//  منطق الاختبار القصير في نهاية كل قسم.
//

import SwiftUI
import Observation

@Observable
final class QuizViewModel {
    let questions: [QuizQuestion]
    private(set) var index = 0
    private(set) var selectedOption: Int?
    private(set) var score = 0
    private(set) var isFinished = false

    init(questions: [QuizQuestion]) {
        self.questions = questions
    }

    var current: QuizQuestion { questions[index] }
    var hasAnswered: Bool { selectedOption != nil }
    var isCorrect: Bool { selectedOption == current.answerIndex }
    var progress: Double { Double(index + (hasAnswered ? 1 : 0)) / Double(max(questions.count, 1)) }

    func select(_ option: Int) {
        guard selectedOption == nil else { return }
        withAnimation(.spring(response: 0.4, dampingFraction: 0.6)) {
            selectedOption = option
            if option == current.answerIndex { score += 1 }
        }
    }

    func next() {
        withAnimation(.spring(response: 0.5, dampingFraction: 0.8)) {
            if index + 1 < questions.count {
                index += 1
                selectedOption = nil
            } else {
                isFinished = true
            }
        }
    }

    func restart() {
        withAnimation(.spring) {
            index = 0
            score = 0
            selectedOption = nil
            isFinished = false
        }
    }
}
