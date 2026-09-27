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
    enum Tab: Hashable { case home, quran, questions, settings }

    /// فتح المصحف على صفحة.
    struct MushafLaunch: Identifiable, Hashable {
        let id = UUID()
        let page: Int
    }

    var tab: Tab = .home
    var path: [Route] = []
    /// الدرس المعروض حاليًا بملء الشاشة.
    var presentedLesson: InteractiveLesson?
    /// جولة الأسئلة المعروضة حاليًا بملء الشاشة.
    var presentedQuiz: QuizSessionConfig?
    /// المصحف المعروض بملء الشاشة.
    var presentedMushaf: MushafLaunch?

    func open(_ route: Route) { path.append(route) }
    func present(_ lesson: InteractiveLesson) { presentedLesson = lesson }
    func present(_ quiz: QuizSessionConfig) { presentedQuiz = quiz }
    func popToRoot() { path.removeAll() }
    func openMushaf(page: Int) { presentedMushaf = MushafLaunch(page: page) }
}
