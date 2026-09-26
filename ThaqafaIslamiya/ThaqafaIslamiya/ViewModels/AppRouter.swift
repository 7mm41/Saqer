//
//  AppRouter.swift
//  ثقافة إسلامية
//
//  يدير التبويب المختار في الشريط السفلي، ومسار التنقّل، وعرض الدرس التفاعلي وجولة الأسئلة بملء الشاشة.
//

import SwiftUI
import Observation

@Observable
final class AppRouter {
    enum Tab: Hashable { case home, questions, settings }

    var tab: Tab = .home
    var path: [Route] = []
    /// الدرس المعروض حاليًا بملء الشاشة.
    var presentedLesson: InteractiveLesson?
    /// جولة الأسئلة المعروضة حاليًا بملء الشاشة.
    var presentedQuiz: QuizSessionConfig?

    func open(_ route: Route) { path.append(route) }
    func present(_ lesson: InteractiveLesson) { presentedLesson = lesson }
    func present(_ quiz: QuizSessionConfig) { presentedQuiz = quiz }
    func popToRoot() { path.removeAll() }
}
