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

    /// فتح المصحف على صفحة، أو على سورة وحدها (مثل الكهف والملك) لا يتجاوز القارئ حدودها حتى تنتهي.
    struct MushafLaunch: Identifiable, Hashable {
        let id = UUID()
        let page: Int
        var surah: Int? = nil
    }

    var tab: Tab = .home
    var path: [Route] = []
    /// الدرس المعروض حاليًا بملء الشاشة.
    var presentedLesson: InteractiveLesson?
    /// جولة الأسئلة المعروضة حاليًا بملء الشاشة.
    var presentedQuiz: QuizSessionConfig?
    /// المصحف المعروض بملء الشاشة.
    var presentedMushaf: MushafLaunch?
    /// بوصلة القبلة.
    var showQibla = false
    /// مواقيت الصلاة.
    var showPrayerTimes = false
    /// اللغة الجاري تطبيقها (تظهر شاشة انتظار أنيقة بدل انقلاب الواجهة أمام المستخدم).
    private(set) var switchingLanguage: AppLanguage?

    func open(_ route: Route) { path.append(route) }
    func present(_ lesson: InteractiveLesson) { presentedLesson = lesson }
    func present(_ quiz: QuizSessionConfig) { presentedQuiz = quiz }
    func popToRoot() { path.removeAll() }
    func openMushaf(page: Int) { presentedMushaf = MushafLaunch(page: page) }
    func openSurah(_ surah: Int, page: Int) { presentedMushaf = MushafLaunch(page: page, surah: surah) }
    func closeMushaf() { presentedMushaf = nil }

    /// تغيير اللغة خلف شاشة انتظار: تظهر الشاشة، ثم تُبدَّل اللغة وتُبنى الواجهة من جديد بلا حركة، ثم تختفي.
    @MainActor
    func changeLanguage(to language: AppLanguage, settings: AppSettings) {
        guard settings.language != language, switchingLanguage == nil else { return }
        withAnimation(.easeInOut(duration: 0.25)) { switchingLanguage = language }
        Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(320))
            var instant = Transaction()
            instant.disablesAnimations = true
            withTransaction(instant) { settings.language = language }
            try? await Task.sleep(for: .milliseconds(650))
            withAnimation(.easeInOut(duration: 0.4)) { switchingLanguage = nil }
        }
    }
}
