//
//  WelcomeView.swift
//  CleanSpace
//
//  Two-step onboarding: the privacy promise, then the permission request.
//

import SwiftUI

struct OnboardingFlow: View {
    @Environment(AppEnvironment.self) private var env
    @State private var page = 0

    var body: some View {
        ZStack {
            BackgroundGradient()
            TabView(selection: $page) {
                WelcomeView { withAnimation(.smooth) { page = 1 } }
                    .tag(0)
                PermissionRequestView(onGranted: finish)
                    .tag(1)
            }
            .tabViewStyle(.page(indexDisplayMode: .never))
        }
    }

    private func finish() {
        env.preferences.hasCompletedOnboarding = true
        env.refreshStorage()
        env.scanEngine.start()
    }
}

struct WelcomeView: View {
    var onContinue: () -> Void

    private let points: [(String, String, String)] = [
        ("bolt.shield", "100% Offline", "Every photo is analyzed right here on your iPhone. Nothing is ever uploaded."),
        ("square.stack.3d.up", "Find Look-alikes", "On-device intelligence groups near-identical shots so you keep the best one."),
        ("hand.draw", "Swipe to Clean", "Triage photos with a flick. Review everything before a single thing is deleted.")
    ]

    var body: some View {
        VStack(spacing: 0) {
            Spacer()
            VStack(spacing: 12) {
                Image(systemName: "sparkles.rectangle.stack")
                    .font(.system(size: 60, weight: .light))
                    .foregroundStyle(.tint)
                    .padding(.bottom, 6)
                Text("CleanSpace")
                    .font(.system(size: 40, weight: .bold, design: .rounded))
                Text("Reclaim your storage, privately.")
                    .font(.title3)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            VStack(alignment: .leading, spacing: 22) {
                ForEach(points, id: \.0) { point in
                    HStack(spacing: 16) {
                        Image(systemName: point.0)
                            .font(.title2)
                            .foregroundStyle(.tint)
                            .frame(width: 40)
                        VStack(alignment: .leading, spacing: 3) {
                            Text(point.1).font(.headline)
                            Text(point.2).font(.subheadline).foregroundStyle(.secondary)
                        }
                    }
                }
            }
            .padding(.horizontal, 32)
            Spacer()
            Button(action: onContinue) {
                Text("Get Started")
                    .font(.headline)
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .padding(.horizontal, 28)
            .padding(.bottom, 40)
        }
    }
}

struct BackgroundGradient: View {
    var body: some View {
        LinearGradient(
            colors: [Color.indigo.opacity(0.14), Color.clear],
            startPoint: .top, endPoint: .center
        )
        .ignoresSafeArea()
        .background(Color(.systemBackground).ignoresSafeArea())
    }
}
