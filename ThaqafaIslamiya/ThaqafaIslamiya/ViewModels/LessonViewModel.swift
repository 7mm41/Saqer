//
//  LessonViewModel.swift
//  ثقافة إسلامية
//
//  منطق الدرس التفاعلي: التنقّل بين الخطوات، واتجاه الحركة، وعدّاد التكرار (مثل «ثلاثًا»).
//

import SwiftUI
import Observation

@Observable
final class LessonViewModel {
    enum Direction { case forward, backward }

    let lesson: InteractiveLesson
    private(set) var currentIndex: Int = 0
    private(set) var direction: Direction = .forward
    private(set) var isFinished = false
    /// عدد لمسات الطفل لكل خطوة فيها تكرار.
    private(set) var tapCounts: [String: Int] = [:]

    init(lesson: InteractiveLesson) {
        self.lesson = lesson
    }

    var steps: [LessonStep] { lesson.steps }
    var currentStep: LessonStep { steps[currentIndex] }
    var isFirst: Bool { currentIndex == 0 }
    var isLast: Bool { currentIndex == steps.count - 1 }
    var progress: Double { Double(currentIndex + 1) / Double(max(steps.count, 1)) }
    var tint: [Color] { lesson.colors.themeColors }

    // MARK: - Navigation

    func next() {
        if isLast {
            withAnimation(.spring(response: 0.55, dampingFraction: 0.75)) { isFinished = true }
            return
        }
        direction = .forward
        withAnimation(.spring(response: 0.5, dampingFraction: 0.8)) { currentIndex += 1 }
    }

    func previous() {
        guard !isFirst else { return }
        direction = .backward
        withAnimation(.spring(response: 0.5, dampingFraction: 0.8)) { currentIndex -= 1 }
    }

    func go(to index: Int) {
        guard steps.indices.contains(index), index != currentIndex else { return }
        direction = index > currentIndex ? .forward : .backward
        withAnimation(.spring(response: 0.5, dampingFraction: 0.8)) { currentIndex = index }
    }

    func restart() {
        tapCounts = [:]
        direction = .backward
        withAnimation(.spring(response: 0.55, dampingFraction: 0.8)) {
            isFinished = false
            currentIndex = 0
        }
    }

    // MARK: - Repeat counter

    func taps(for step: LessonStep) -> Int { tapCounts[step.id] ?? 0 }

    func isRepeatComplete(for step: LessonStep) -> Bool {
        guard let count = step.repeatCount else { return true }
        return taps(for: step) >= count
    }

    /// يسجّل لمسة على قطرة التكرار. يعيد `true` عند اكتمال العدد.
    @discardableResult
    func registerTap(for step: LessonStep) -> Bool {
        guard let count = step.repeatCount else { return true }
        let newValue = min(taps(for: step) + 1, count)
        withAnimation(.spring(response: 0.35, dampingFraction: 0.55)) {
            tapCounts[step.id] = newValue
        }
        return newValue == count
    }
}
