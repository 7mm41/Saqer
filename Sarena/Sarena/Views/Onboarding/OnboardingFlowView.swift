import SwiftUI

/// First launch: pick a language, then swipe through the welcome carousel.
struct OnboardingFlowView: View {
    private enum Step { case language, intro }

    @State private var step: Step = .language
    @AppStorage(PreferenceKeys.hasCompletedOnboarding) private var hasCompletedOnboarding = false

    var body: some View {
        ZStack {
            switch step {
            case .language:
                LanguagePickerView {
                    withAnimation(.smooth(duration: 0.5)) { step = .intro }
                }
                .transition(.opacity)
            case .intro:
                OnboardingPagerView {
                    withAnimation(.smooth(duration: 0.5)) { hasCompletedOnboarding = true }
                }
                .transition(.move(edge: .trailing).combined(with: .opacity))
            }
        }
    }
}

// MARK: - Language picker

struct LanguagePickerView: View {
    let onContinue: () -> Void

    @Environment(LanguageCoordinator.self) private var languageCoordinator
    @State private var chipsVisible = false

    private struct Option: Identifiable {
        let id: String
        let nativeName: String
        let flag: String
        /// nil = coming soon.
        let language: AppLanguage?
    }

    private let greetings = ["Bonjour", "Hola", "مرحبا", "Hello", "Привет", "你好"]

    private let options: [Option] = [
        Option(id: "ar", nativeName: "العربية", flag: "🇴🇲", language: .arabic),
        Option(id: "en", nativeName: "English", flag: "🇬🇧", language: .english),
        Option(id: "fr", nativeName: "Français", flag: "🇫🇷", language: nil),
        Option(id: "es", nativeName: "Español", flag: "🇪🇸", language: nil),
        Option(id: "ru", nativeName: "Русский", flag: "🇷🇺", language: nil),
        Option(id: "zh", nativeName: "中文", flag: "🇨🇳", language: nil),
    ]

    var body: some View {
        ScrollView {
            VStack(spacing: Theme.Spacing.xxl) {
                SarenaLogoView(size: 96, floats: true)
                    .padding(.top, Theme.Spacing.xl)

                greetingCloud

                VStack(spacing: Theme.Spacing.xs) {
                    Text(verbatim: "Select your language")
                        .font(.sarena(.title2, weight: .heavy))
                    Text(verbatim: "اختر لغتك")
                        .font(.sarena(.title3, weight: .bold))
                        .foregroundStyle(.secondary)
                }
                .padding(.top, Theme.Spacing.l)

                LazyVGrid(columns: [GridItem(.flexible(), spacing: Theme.Spacing.m), GridItem(.flexible(), spacing: Theme.Spacing.m)],
                          spacing: Theme.Spacing.m) {
                    ForEach(options) { option in
                        languageCard(option)
                    }
                }
            }
            .padding(.horizontal, Theme.gutter)
            .padding(.bottom, Theme.Spacing.xxl)
            .frame(maxWidth: 560)
            .frame(maxWidth: .infinity)
        }
        .scrollIndicators(.hidden)
        .sarenaScreenBackground()
        .environment(\.colorScheme, .dark)
    }

    /// Floating glass "hello" chips in six languages.
    private var greetingCloud: some View {
        VStack(spacing: Theme.Spacing.m) {
            HStack(spacing: Theme.Spacing.m) {
                ForEach(Array(greetings.prefix(4).enumerated()), id: \.offset) { index, word in
                    greetingChip(word, index: index)
                }
            }
            HStack(spacing: Theme.Spacing.m) {
                ForEach(Array(greetings.dropFirst(4).enumerated()), id: \.offset) { index, word in
                    greetingChip(word, index: index + 4)
                }
            }
        }
        .environment(\.layoutDirection, .leftToRight)
        .accessibilityHidden(true)
        .onAppear { chipsVisible = true }
    }

    /// Chips pop in once (staggered) and then stay still — no endless animation.
    private func greetingChip(_ word: String, index: Int) -> some View {
        Text(verbatim: word)
            .font(.sarena(.title3, weight: .heavy))
            .lineLimit(1)
            .minimumScaleFactor(0.7)
            .padding(.horizontal, Theme.Spacing.l)
            .padding(.vertical, Theme.Spacing.m)
            .glassSurface(.tinted(Theme.Palette.orange, opacity: 0.18, cornerRadius: Theme.Radius.field))
            .opacity(chipsVisible ? 1 : 0)
            .offset(y: chipsVisible ? 0 : 14)
            .animation(.spring(response: 0.5, dampingFraction: 0.7).delay(Double(index) * 0.07), value: chipsVisible)
    }

    private func languageCard(_ option: Option) -> some View {
        let isAvailable = option.language != nil
        return Button {
            guard let selected = option.language else { return }
            // The carousel is shown while the cover is up, so it appears already translated.
            Task { await languageCoordinator.change(to: selected) { onContinue() } }
        } label: {
            HStack(spacing: Theme.Spacing.m) {
                Text(verbatim: option.flag)
                    .font(.title2)
                    .frame(width: 48, height: 48)
                    .glassSurface(.chip)
                Text(verbatim: option.nativeName)
                    .font(.sarena(.headline, weight: .bold))
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
                Spacer(minLength: 0)
            }
            .padding(Theme.Spacing.m)
            .frame(maxWidth: .infinity)
            .glassSurface(isAvailable ? .tile : .flat)
            .overlay(alignment: .topTrailing) {
                if !isAvailable {
                    Text("Soon")
                        .font(.sarena(.caption2, weight: .heavy))
                        .foregroundStyle(Theme.Palette.ink)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 3)
                        .background(Capsule().fill(.white))
                        .offset(x: 6, y: -8)
                }
            }
            .opacity(isAvailable ? 1 : 0.55)
            .contentShape(RoundedRectangle(cornerRadius: Theme.Radius.card, style: .continuous))
        }
        .buttonStyle(.glassPress)
        .disabled(!isAvailable)
    }
}

// MARK: - Welcome carousel

struct OnboardingPage: Identifiable {
    let id: Int
    let imageName: String
    let title: LocalizedStringKey
    let subtitle: LocalizedStringKey

    static let all: [OnboardingPage] = [
        OnboardingPage(
            id: 0,
            imageName: "Onboarding-Welcome",
            title: "Welcome to Sarena",
            subtitle: "The Sarena team is glad you're here. Oman's best experiences, at members-only prices."
        ),
        OnboardingPage(
            id: 1,
            imageName: "Onboarding-Deals",
            title: "Exclusive deals, every day",
            subtitle: "Cinemas, jet skis, clubs, arenas and festivals — all at member prices."
        ),
        OnboardingPage(
            id: 2,
            imageName: "Onboarding-Codes",
            title: "Book. Scan. Enjoy.",
            subtitle: "Your code lands in your Wallet instantly — just show the QR at the entrance."
        ),
    ]
}

struct OnboardingPagerView: View {
    let onFinish: () -> Void

    @State private var page = 0
    private let pages = OnboardingPage.all

    private var isLastPage: Bool { page == pages.count - 1 }

    var body: some View {
        VStack(spacing: 0) {
            TabView(selection: $page) {
                ForEach(pages) { item in
                    pageView(item)
                        .tag(item.id)
                }
            }
            .tabViewStyle(.page(indexDisplayMode: .never))
            .ignoresSafeArea(edges: .top)

            controls
        }
        .sarenaScreenBackground()
        .sensoryFeedback(.selection, trigger: page)
    }

    private func pageView(_ item: OnboardingPage) -> some View {
        GeometryReader { proxy in
            VStack(spacing: Theme.Spacing.xl) {
                Image(item.imageName)
                    .resizable()
                    .scaledToFill()
                    .frame(width: proxy.size.width, height: proxy.size.height * 0.68)
                    .clipShape(UnevenRoundedRectangle(bottomLeadingRadius: 44, bottomTrailingRadius: 44, style: .continuous))
                    .overlay(alignment: .bottom) {
                        // Glass lip where the artwork meets the page.
                        UnevenRoundedRectangle(bottomLeadingRadius: 44, bottomTrailingRadius: 44, style: .continuous)
                            .stroke(.white.opacity(0.5), lineWidth: 1)
                    }
                    .accessibilityHidden(true)

                VStack(spacing: Theme.Spacing.s) {
                    Text(item.title)
                        .font(.sarena(.title2, weight: .heavy))
                    Text(item.subtitle)
                        .font(.sarena(.subheadline))
                        .foregroundStyle(.secondary)
                }
                .multilineTextAlignment(.center)
                .padding(.horizontal, Theme.Spacing.xxl)
                .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    private var controls: some View {
        VStack(spacing: Theme.Spacing.l) {
            PageIndicator(count: pages.count, current: page)

            Button {
                if isLastPage {
                    onFinish()
                } else {
                    withAnimation(.smooth) { page += 1 }
                }
            } label: {
                if isLastPage {
                    Label("Get Started", systemImage: "sparkles")
                } else {
                    Text("Continue")
                }
            }
            .buttonStyle(.sarenaProminent)

            Button("Skip", action: onFinish)
                .font(.sarena(.subheadline, weight: .semibold))
                .foregroundStyle(.secondary)
                .opacity(isLastPage ? 0 : 1)
                .disabled(isLastPage)
        }
        .padding(.horizontal, Theme.gutter)
        .padding(.bottom, Theme.Spacing.l)
        .padding(.top, Theme.Spacing.s)
    }
}

/// Capsule for the current page, dots for the rest.
struct PageIndicator: View {
    let count: Int
    let current: Int

    var body: some View {
        HStack(spacing: 8) {
            ForEach(0..<count, id: \.self) { index in
                Capsule()
                    .fill(index == current ? AnyShapeStyle(Theme.brandGradient) : AnyShapeStyle(Theme.Palette.orange.opacity(0.3)))
                    .frame(width: index == current ? 30 : 9, height: 9)
            }
        }
        .animation(.spring(response: 0.35, dampingFraction: 0.75), value: current)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text("Page \(current + 1) of \(count)"))
    }
}

#Preview("Language") {
    PreviewContainer(signedIn: false) {
        LanguagePickerView {}
    }
}

#Preview("Onboarding") {
    OnboardingPagerView {}
}

#Preview("Onboarding · Arabic") {
    OnboardingPagerView {}
        .appLanguage(.arabic)
}
