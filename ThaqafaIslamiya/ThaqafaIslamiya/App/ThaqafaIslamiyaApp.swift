//
//  ThaqafaIslamiyaApp.swift
//  ثقافة إسلامية
//
//  نقطة دخول التطبيق. يعمل التطبيق دون إنترنت بالكامل:
//  كل المحتوى في `Assets/Data/TalqeenData.json` وكل الصور في `Assets.xcassets`.
//

import SwiftUI

@main
struct ThaqafaIslamiyaApp: App {
    @State private var library = LibraryViewModel()
    @State private var progress = ProgressStore()
    @State private var router = AppRouter()
    @State private var speech = SpeechReader()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(library)
                .environment(progress)
                .environment(router)
                .environment(speech)
                // واجهة عربية من اليمين إلى اليسار في كل الشاشات
                .environment(\.layoutDirection, .rightToLeft)
                .environment(\.locale, Locale(identifier: "ar"))
                .fontDesign(.rounded)
                .tint(.teal)
        }
    }
}

/// الحاوية الجذرية: مكدّس التنقّل + عرض الدرس التفاعلي بملء الشاشة.
struct RootView: View {
    @Environment(LibraryViewModel.self) private var library
    @Environment(AppRouter.self) private var router
    @Environment(ProgressStore.self) private var progress
    @Environment(SpeechReader.self) private var speech

    var body: some View {
        @Bindable var router = router

        NavigationStack(path: $router.path) {
            HomeView()
                .navigationDestination(for: Route.self) { route in
                    destination(for: route)
                }
        }
        .fullScreenCover(item: $router.presentedLesson) { lesson in
            InteractiveLessonView(lesson: lesson)
                .environment(library)
                .environment(progress)
                .environment(router)
                .environment(speech)
                .environment(\.layoutDirection, .rightToLeft)
                .fontDesign(.rounded)
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
        .environment(LibraryViewModel())
        .environment(ProgressStore())
        .environment(AppRouter())
        .environment(SpeechReader())
        .environment(\.layoutDirection, .rightToLeft)
}
