//
//  ThaqafaIslamiyaApp.swift
//  ثقافة إسلامية
//
//  نقطة دخول التطبيق — تطوير صقر ستور © 2026. يعمل التطبيق دون إنترنت بالكامل:
//  المحتوى بست لغات وبنك الأسئلة في `Assets/Data`، والرسوم ثلاثية الأبعاد في `Assets/Animations`،
//  والأصوات الطبيعية في `Assets/Voices`.
//

import SwiftUI
import AVFoundation

@main
struct ThaqafaIslamiyaApp: App {
    @State private var settings: AppSettings
    @State private var library: LibraryViewModel
    @State private var bank = QuestionBankViewModel()
    @State private var progress = ProgressStore()
    @State private var router = AppRouter()
    @State private var voice = VoicePlayer()

    init() {
        let settings = AppSettings()
        _settings = State(initialValue: settings)
        _library = State(initialValue: LibraryViewModel(fileName: settings.contentFileName, language: settings.language))
        // الرسوم المتحركة صامتة ولا توقف صوت التطبيقات الأخرى، والقراءة تُسمع حتى في الوضع الصامت.
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .spokenAudio, options: [.duckOthers])
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .withAppEnvironment(AppEnvironment(settings: settings, library: library, bank: bank,
                                                   progress: progress, router: router, voice: voice))
                .onAppear { bank.load(settings.language) }
                .onChange(of: settings.language) { _, language in
                    voice.stop()
                    library.searchText = ""
                    library.load(fileName: settings.contentFileName, language: language)
                    bank.load(language)
                    if settings.reminderEnabled { ReminderScheduler.schedule(minutes: settings.reminderMinutes) }
                }
                .onChange(of: settings.showTashkeel) {
                    library.load(fileName: settings.contentFileName, language: settings.language)
                }
                .onChange(of: settings.speechRate) { _, rate in voice.rate = rate }
                .onAppear { voice.rate = settings.speechRate }
        }
    }
}

/// كل كائنات التطبيق المشتركة (تُحقن في الجذر وفي العروض بملء الشاشة).
struct AppEnvironment {
    let settings: AppSettings
    let library: LibraryViewModel
    let bank: QuestionBankViewModel
    let progress: ProgressStore
    let router: AppRouter
    let voice: VoicePlayer
}

extension AppEnvironment {
    /// بيئة كاملة للمعاينات (Xcode Previews).
    static func preview() -> AppEnvironment {
        let settings = AppSettings()
        return AppEnvironment(settings: settings,
                              library: LibraryViewModel(fileName: settings.contentFileName, language: settings.language),
                              bank: QuestionBankViewModel(), progress: ProgressStore(), router: AppRouter(), voice: VoicePlayer())
    }
}

extension View {
    /// يحقن كائنات التطبيق واتجاه الكتابة ولغة الواجهة والمظهر.
    func withAppEnvironment(_ env: AppEnvironment) -> some View {
        self
            .environment(env.settings)
            .environment(env.library)
            .environment(env.bank)
            .environment(env.progress)
            .environment(env.router)
            .environment(env.voice)
            .environment(\.layoutDirection, env.settings.layoutDirection)
            .environment(\.locale, env.settings.language.locale)
            .preferredColorScheme(env.settings.appearance.colorScheme)
            .fontDesign(.rounded)
            .tint(.teal)
    }
}

/// الحاوية الجذرية: الشريط السفلي (الرئيسية، الأسئلة، الإعدادات) + العروض بملء الشاشة + شاشة البداية.
struct RootView: View {
    @Environment(AppSettings.self) private var settings
    @Environment(LibraryViewModel.self) private var library
    @Environment(QuestionBankViewModel.self) private var bank
    @Environment(AppRouter.self) private var router
    @Environment(ProgressStore.self) private var progress
    @Environment(VoicePlayer.self) private var voice

    @State private var showSplash = true

    private var env: AppEnvironment {
        AppEnvironment(settings: settings, library: library, bank: bank, progress: progress, router: router, voice: voice)
    }

    var body: some View {
        @Bindable var router = router

        ZStack {
            TabView(selection: $router.tab) {
                NavigationStack(path: $router.path) {
                    HomeView()
                        .navigationDestination(for: Route.self) { route in
                            destination(for: route)
                        }
                }
                .tabItem { Label(L10n.t("tab.home"), systemImage: "house.fill") }
                .tag(AppRouter.Tab.home)

                NavigationStack {
                    QuestionsHomeView()
                }
                .tabItem { Label(L10n.t("tab.questions"), systemImage: "questionmark.bubble.fill") }
                .tag(AppRouter.Tab.questions)

                NavigationStack {
                    SettingsView()
                }
                .tabItem { Label(L10n.t("tab.settings"), systemImage: "gearshape.fill") }
                .tag(AppRouter.Tab.settings)
            }
            // إعادة بناء الواجهة كاملة عند تغيير اللغة (النصوص والاتجاه والأرقام).
            .id(settings.language)

            if showSplash {
                SplashView()
                    .transition(.opacity.combined(with: .scale(scale: 1.08)))
                    .zIndex(10)
            }
        }
        .fullScreenCover(item: $router.presentedLesson) { lesson in
            InteractiveLessonView(lesson: library.lesson(id: lesson.id) ?? lesson)
                .withAppEnvironment(env)
        }
        .fullScreenCover(item: $router.presentedQuiz) { config in
            QuizSessionView(config: config)
                .withAppEnvironment(env)
        }
        .task {
            try? await Task.sleep(for: .milliseconds(1400))
            withAnimation(.easeInOut(duration: 0.6)) { showSplash = false }
        }
    }

    @ViewBuilder
    private func destination(for route: Route) -> some View {
        switch route {
        case .chapter(let id):
            if let chapter = library.chapter(id: id) {
                ChapterView(chapter: chapter)
            }
        case .masala(let id):
            if let masala = library.masala(id: id), let chapter = library.chapter(containing: id) {
                MasalaDetailView(masala: masala, chapter: chapter)
            }
        case .quiz(let chapterId):
            if let chapter = library.chapter(id: chapterId) {
                QuizView(chapter: chapter)
            }
        case .about:
            AboutView()
        }
    }
}

#Preview {
    RootView()
        .withAppEnvironment(.preview())
}
