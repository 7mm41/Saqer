//
//  ThaqafaIslamiyaApp.swift
//  ثقافة إسلامية
//
//  نقطة دخول التطبيق. يعمل التطبيق دون إنترنت بالكامل:
//  المحتوى بست لغات في `Assets/Data`، والرسوم المتحركة ثلاثية الأبعاد في `Assets/Animations`،
//  والأصوات الطبيعية في `Assets/Voices`.
//

import SwiftUI
import AVFoundation

@main
struct ThaqafaIslamiyaApp: App {
    @State private var settings: AppSettings
    @State private var library: LibraryViewModel
    @State private var progress = ProgressStore()
    @State private var router = AppRouter()
    @State private var voice = VoicePlayer()

    init() {
        let settings = AppSettings()
        _settings = State(initialValue: settings)
        _library = State(initialValue: LibraryViewModel(language: settings.language))
        // الرسوم المتحركة صامتة ولا توقف صوت التطبيقات الأخرى، والقراءة تُسمع حتى في الوضع الصامت.
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .spokenAudio, options: [.duckOthers])
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .withAppEnvironment(settings: settings, library: library, progress: progress, router: router, voice: voice)
                .onChange(of: settings.language) { _, language in
                    voice.stop()
                    library.searchText = ""
                    library.load(language: language)
                }
        }
    }
}

extension View {
    /// يحقن كائنات التطبيق واتجاه الكتابة ولغة الواجهة (يُستخدم للجذر وللعروض بملء الشاشة).
    func withAppEnvironment(settings: AppSettings, library: LibraryViewModel, progress: ProgressStore,
                            router: AppRouter, voice: VoicePlayer) -> some View {
        self
            .environment(settings)
            .environment(library)
            .environment(progress)
            .environment(router)
            .environment(voice)
            .environment(\.layoutDirection, settings.layoutDirection)
            .environment(\.locale, settings.language.locale)
            .fontDesign(.rounded)
            .tint(.teal)
    }
}

/// الحاوية الجذرية: مكدّس التنقّل + عرض الدرس التفاعلي بملء الشاشة.
struct RootView: View {
    @Environment(AppSettings.self) private var settings
    @Environment(LibraryViewModel.self) private var library
    @Environment(AppRouter.self) private var router
    @Environment(ProgressStore.self) private var progress
    @Environment(VoicePlayer.self) private var voice

    var body: some View {
        @Bindable var router = router

        NavigationStack(path: $router.path) {
            HomeView()
                .navigationDestination(for: Route.self) { route in
                    destination(for: route)
                }
        }
        // إعادة بناء الواجهة كاملة عند تغيير اللغة (النصوص والاتجاه والأرقام).
        .id(settings.language)
        .fullScreenCover(item: $router.presentedLesson) { lesson in
            InteractiveLessonView(lesson: library.lesson(id: lesson.id) ?? lesson)
                .withAppEnvironment(settings: settings, library: library, progress: progress, router: router, voice: voice)
        }
        .sheet(isPresented: $router.showsSettings) {
            SettingsView()
                .withAppEnvironment(settings: settings, library: library, progress: progress, router: router, voice: voice)
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
    let settings = AppSettings()
    return RootView()
        .withAppEnvironment(settings: settings, library: LibraryViewModel(language: settings.language),
                            progress: ProgressStore(), router: AppRouter(), voice: VoicePlayer())
}
