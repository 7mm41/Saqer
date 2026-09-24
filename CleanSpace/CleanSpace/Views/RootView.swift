//
//  RootView.swift
//  CleanSpace
//
//  Top-level router. Decides between onboarding, the access-required wall, and
//  the main dashboard based on live authorization and onboarding state. Watches
//  scenePhase so permission changes made in Settings are reflected on return.
//

import SwiftUI
import Photos

struct RootView: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        Group {
            if !env.preferences.hasCompletedOnboarding {
                OnboardingFlow()
            } else if env.permissions.isAuthorized {
                MainTabView()
            } else {
                AccessRequiredView(isLimited: env.permissions.isLimited) {
                    env.permissions.openSettings()
                }
                .padding()
            }
        }
        .animation(.smooth, value: env.preferences.hasCompletedOnboarding)
        .animation(.smooth, value: env.permissions.status)
        .onChange(of: scenePhase) { _, phase in
            if phase == .active {
                env.permissions.refresh()
                if env.permissions.isAuthorized {
                    env.refreshStorage()
                    env.scanEngine.resume()   // continue a scan paused by backgrounding
                }
            }
        }
    }
}
