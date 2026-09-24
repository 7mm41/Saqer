//
//  CleanSpaceApp.swift
//  CleanSpace
//
//  Composition root. Builds the SwiftData container and the shared
//  AppEnvironment, then hands both to the view tree.
//

import SwiftUI
import SwiftData

@main
struct CleanSpaceApp: App {
    private let container: ModelContainer
    @State private var env: AppEnvironment

    init() {
        let container = CacheSchema.container()
        self.container = container
        _env = State(initialValue: AppEnvironment(modelContext: container.mainContext))
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(env)
                .tint(.indigo)
                .onAppear { HapticsManager.shared.prepare() }
        }
        .modelContainer(container)
    }
}
