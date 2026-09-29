import SwiftUI

/// Full-screen cover shown while the app switches language: the logo inside a
/// progress ring that fills like a timer, the target language with its flag,
/// and a short message — all rendered in the *target* language, so the cover
/// itself never flips direction mid-way.
struct LanguageTransitionView: View {
    let target: AppLanguage
    /// How long the ring takes to fill (matches the coordinator's timing).
    let duration: Double

    @State private var progress: CGFloat = 0
    @State private var appeared = false

    var body: some View {
        ZStack {
            GlassBackground()
            // Swallow touches so nothing underneath can be tapped mid-switch.
            Color.clear.contentShape(Rectangle())

            VStack(spacing: Theme.Spacing.xl) {
                ZStack {
                    Circle()
                        .stroke(Color.primary.opacity(0.08), lineWidth: 6)
                    Circle()
                        .trim(from: 0, to: progress)
                        .stroke(Theme.brandGradient, style: StrokeStyle(lineWidth: 6, lineCap: .round))
                        .rotationEffect(.degrees(-90))
                    SarenaLogoView(size: 78)
                }
                .frame(width: 132, height: 132)

                VStack(spacing: Theme.Spacing.s) {
                    Text(verbatim: "\(target.flag)  \(target.nativeName)")
                        .font(.sarena(.title, weight: .heavy))
                    Text("Changing language…")
                        .font(.sarena(.headline, weight: .semibold))
                        .foregroundStyle(.secondary)
                    Text("Just a moment")
                        .font(.sarena(.subheadline))
                        .foregroundStyle(.secondary)
                }
                .multilineTextAlignment(.center)
            }
            .padding(Theme.Spacing.xxl)
            .glassSurface(.panel)
            .padding(Theme.gutter)
            .scaleEffect(appeared ? 1 : 0.92)
            .opacity(appeared ? 1 : 0)
        }
        .environment(\.locale, target.locale)
        .environment(\.layoutDirection, target.layoutDirection)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isModal)
        .onAppear {
            withAnimation(.spring(response: 0.45, dampingFraction: 0.8)) { appeared = true }
            withAnimation(.easeInOut(duration: duration)) { progress = 1 }
        }
    }
}

extension View {
    /// Places the language-change cover above the whole app.
    func languageTransitionCover(_ coordinator: LanguageCoordinator) -> some View {
        overlay {
            if let target = coordinator.coverLanguage {
                LanguageTransitionView(target: target, duration: coordinator.transitionSeconds)
                    .transition(.opacity)
                    .ignoresSafeArea()
            }
        }
    }
}

#Preview {
    LanguageTransitionView(target: .arabic, duration: 1.5)
}
