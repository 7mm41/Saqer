//
//  LessonCompletionView.swift
//  ثقافة إسلامية
//
//  شاشة الاحتفال عند إتمام الدرس.
//

import SwiftUI

struct LessonCompletionView: View {
    let lesson: InteractiveLesson
    var onRestart: () -> Void
    var onClose: () -> Void

    @State private var pop = false

    private var colors: [Color] { lesson.colors.themeColors }

    var body: some View {
        ZStack {
            Rectangle()
                .fill(.ultraThinMaterial)
                .ignoresSafeArea()

            ConfettiView()

            VStack(spacing: 18) {
                Image(systemName: "checkmark.seal.fill")
                    .font(.system(size: 96))
                    .foregroundStyle(.white, LinearGradient.diagonal(colors))
                    .symbolEffect(.bounce, value: pop)
                    .scaleEffect(pop ? 1 : 0.3)
                    .shadow(color: (colors.first ?? .teal).opacity(0.5), radius: 20, y: 10)

                Text(L10n.t("done.title"))
                    .font(.largeTitle.weight(.heavy))

                Text(L10n.t("done.message", lesson.title))
                    .font(.title3)
                    .multilineTextAlignment(.center)
                    .foregroundStyle(.secondary)

                Text(lesson.reference)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .glassCapsule(interactive: false)

                HStack(spacing: 14) {
                    Button(action: onRestart) {
                        Label(L10n.t("done.restart"), systemImage: "arrow.counterclockwise")
                            .font(.headline)
                    }
                    .buttonStyle(GlassButtonStyle())

                    Button(action: onClose) {
                        Label(L10n.t("done.back"), systemImage: "house.fill")
                    }
                    .buttonStyle(ProminentGlassButtonStyle(colors: colors))
                }
                .padding(.top, 8)
            }
            .padding(32)
            .frame(maxWidth: 480)
            .glassCard(cornerRadius: 40, tint: colors.first ?? .teal)
            .padding(24)
        }
        .onAppear {
            withAnimation(.spring(response: 0.6, dampingFraction: 0.55)) { pop = true }
        }
    }
}
