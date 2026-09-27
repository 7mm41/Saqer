import SwiftUI

struct SettingsView: View {
    @State private var viewModel: SettingsViewModel

    @AppStorage(AppLanguage.storageKey) private var language: AppLanguage = .system
    @AppStorage(AppAppearance.storageKey) private var appearance: AppAppearance = .system
    @AppStorage(PreferenceKeys.floatingMotion) private var floatingMotion = true

    @Environment(\.locale) private var locale
    @Environment(\.layoutDirection) private var layoutDirection
    @Environment(\.openURL) private var openURL

    init(session: SessionStore) {
        _viewModel = State(initialValue: SettingsViewModel(session: session))
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: Theme.Spacing.xl) {
                    if let user = viewModel.user {
                        MemberCard(user: user)
                    }
                    languageSection
                    appIconSection
                    experienceSection
                    aboutSection
                    signOutButton
                }
                .padding(.horizontal, Theme.gutter)
                .padding(.bottom, Theme.Spacing.xxl)
            }
            .sarenaScreenBackground()
            .navigationTitle("Settings")
            .toolbarBackground(.hidden, for: .navigationBar)
            .confirmationDialog("Log out of Sarena?", isPresented: $viewModel.isConfirmingSignOut, titleVisibility: .visible) {
                Button("Log Out", role: .destructive) {
                    Task { await viewModel.signOut() }
                }
            } message: {
                Text("Your codes stay safe in your Wallet and will be waiting when you sign back in.")
            }
            .alert("Couldn't change the icon", isPresented: $viewModel.iconChangeFailed) {
                Button("OK", role: .cancel) {}
            } message: {
                Text("Please try again in a moment.")
            }
        }
    }

    // MARK: Language

    private var languageSection: some View {
        SettingsSection(title: "Language", systemImage: "globe") {
            // Live indicator of the language and direction the UI is rendering in.
            HStack(spacing: Theme.Spacing.m) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Current language")
                        .font(.sarena(.caption, weight: .semibold))
                        .foregroundStyle(.secondary)
                    Text(verbatim: currentLanguageName)
                        .font(.sarena(.title3, weight: .heavy))
                }
                Spacer()
                directionBadge
            }

            GlassSegmentedControl(
                options: AppLanguage.allCases,
                selection: $language.animation(.smooth),
                title: \.title
            )

            Label("Fully localized in English & العربية, with right-to-left layout.", systemImage: "checkmark.seal.fill")
                .font(.sarena(.caption, weight: .medium))
                .foregroundStyle(.secondary)

            Button {
                if let url = URL(string: UIApplication.openSettingsURLString) { openURL(url) }
            } label: {
                Label("Open iOS Language Settings", systemImage: "arrow.up.forward.app")
            }
            .buttonStyle(.sarenaGlass)
        }
    }

    private var directionBadge: some View {
        let isRTL = layoutDirection == .rightToLeft
        return GlassBadge(
            text: isRTL ? "Right-to-left" : "Left-to-right",
            systemImage: isRTL ? "text.alignright" : "text.alignleft",
            tint: isRTL ? Theme.Palette.festivalPink : Theme.Palette.lagoon
        )
    }

    private var currentLanguageName: String {
        let code = locale.language.languageCode?.identifier ?? "en"
        let name = locale.localizedString(forLanguageCode: code) ?? code
        return name.prefix(1).uppercased() + name.dropFirst()
    }

    // MARK: App icon

    private var appIconSection: some View {
        SettingsSection(title: "App Icon", systemImage: "square.grid.2x2.fill") {
            LazyVGrid(columns: [GridItem(.flexible(), spacing: Theme.Spacing.m), GridItem(.flexible(), spacing: Theme.Spacing.m)],
                      spacing: Theme.Spacing.m) {
                ForEach(AppIcon.allCases) { icon in
                    AppIconTile(
                        icon: icon,
                        isSelected: viewModel.currentIcon == icon,
                        isChanging: viewModel.changingIcon == icon
                    ) {
                        Task { await viewModel.setIcon(icon) }
                    }
                    .disabled(!viewModel.supportsAlternateIcons)
                }
            }

            if !viewModel.supportsAlternateIcons {
                Text("Alternate icons aren't available on this device.")
                    .font(.sarena(.caption))
                    .foregroundStyle(.secondary)
            }
        }
    }

    // MARK: Experience

    private var experienceSection: some View {
        SettingsSection(title: "Experience", systemImage: "sparkles") {
            VStack(alignment: .leading, spacing: Theme.Spacing.s) {
                Text("Appearance")
                    .font(.sarena(.caption, weight: .semibold))
                    .foregroundStyle(.secondary)
                GlassSegmentedControl(
                    options: AppAppearance.allCases,
                    selection: $appearance.animation(.smooth),
                    title: \.title
                )
            }

            Toggle(isOn: $floatingMotion) {
                VStack(alignment: .leading, spacing: 2) {
                    Label("Floating glass motion", systemImage: "move.3d")
                        .font(.sarena(.subheadline, weight: .semibold))
                    Text("Glass tilts and catches the light as you move your phone.")
                        .font(.sarena(.caption))
                        .foregroundStyle(.secondary)
                }
            }
            .tint(Theme.Palette.orange)
        }
    }

    // MARK: About

    private var aboutSection: some View {
        SettingsSection(title: "About", systemImage: "info.circle.fill") {
            HStack {
                Text("Version")
                Spacer()
                Text(verbatim: viewModel.appVersion)
                    .foregroundStyle(.secondary)
                    .environment(\.layoutDirection, .leftToRight)
            }
            .font(.sarena(.subheadline, weight: .medium))
        }
    }

    private var signOutButton: some View {
        Button(role: .destructive) {
            viewModel.isConfirmingSignOut = true
        } label: {
            if viewModel.isSigningOut {
                ProgressView()
            } else {
                Label("Log Out", systemImage: "rectangle.portrait.and.arrow.right")
            }
        }
        .buttonStyle(.sarenaDestructive)
        .disabled(viewModel.isSigningOut)
    }
}

// MARK: - Pieces

/// Titled glass section.
struct SettingsSection<Content: View>: View {
    let title: LocalizedStringKey
    let systemImage: String
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.l) {
            Label(title, systemImage: systemImage)
                .font(.sarena(.headline, weight: .bold))
                .accessibilityAddTraits(.isHeader)
            content
        }
        .padding(Theme.Spacing.l)
        .frame(maxWidth: .infinity, alignment: .leading)
        .glassSurface(.card)
    }
}

/// Apple-Card-style floating glass membership card.
private struct MemberCard: View {
    let user: User
    @Environment(\.locale) private var locale

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.l) {
            HStack {
                Image("SarenaLogo")
                    .resizable()
                    .scaledToFit()
                    .frame(width: 34, height: 34)
                Text("Sarena")
                    .font(.system(.title3, design: .rounded, weight: .black))
                Spacer()
                GlassBadge(text: "Gold Member", systemImage: "crown.fill", tint: Theme.Palette.gold, prominent: true)
            }

            HStack(spacing: Theme.Spacing.m) {
                Text(verbatim: user.initials)
                    .font(.sarena(.title3, weight: .heavy))
                    .foregroundStyle(.white)
                    .frame(width: 52, height: 52)
                    .background(Circle().fill(.white.opacity(0.25)))
                    .overlay(Circle().strokeBorder(.white.opacity(0.6), lineWidth: 1))
                VStack(alignment: .leading, spacing: 2) {
                    Text(verbatim: user.fullName)
                        .font(.sarena(.headline, weight: .bold))
                    Text(verbatim: user.email)
                        .font(.sarena(.caption))
                        .opacity(0.8)
                }
            }

            HStack(alignment: .bottom) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Member No.")
                        .font(.sarena(.caption2, weight: .semibold))
                        .opacity(0.75)
                    Text(verbatim: user.memberNumber)
                        .font(.system(.subheadline, design: .monospaced).weight(.bold))
                }
                Spacer()
                VStack(alignment: .trailing, spacing: 2) {
                    Text("Member since")
                        .font(.sarena(.caption2, weight: .semibold))
                        .opacity(0.75)
                    Text(verbatim: user.memberSince.shortDate(locale))
                        .font(.sarena(.subheadline, weight: .bold))
                }
            }
        }
        .foregroundStyle(.white)
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(Theme.Spacing.xl)
        .background {
            ZStack {
                RoundedRectangle(cornerRadius: Theme.Radius.hero, style: .continuous)
                    .fill(LinearGradient(colors: [Theme.Palette.glow, Theme.Palette.orange, Theme.Palette.ember, Theme.Palette.festivalPink],
                                         startPoint: .topLeading, endPoint: .bottomTrailing))
                    .opacity(0.85)
                // Holographic sheen
                RoundedRectangle(cornerRadius: Theme.Radius.hero, style: .continuous)
                    .fill(LinearGradient(colors: [.clear, .white.opacity(0.35), .clear], startPoint: .topLeading, endPoint: .bottomTrailing))
            }
        }
        .glassSurface(.tinted(Theme.Palette.orange, opacity: 0.2, cornerRadius: Theme.Radius.hero))
        .parallax(tilt: 8, shift: 4)
        .padding(.top, Theme.Spacing.s)
        .accessibilityElement(children: .combine)
    }
}

private struct AppIconTile: View {
    let icon: AppIcon
    let isSelected: Bool
    let isChanging: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: Theme.Spacing.s) {
                Image(icon.previewImageName)
                    .resizable()
                    .scaledToFit()
                    .frame(width: 72, height: 72)
                    .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(.white.opacity(0.4), lineWidth: 1))
                    .shadow(color: .black.opacity(0.25), radius: 10, y: 6)
                    .overlay {
                        if isChanging {
                            ProgressView()
                                .padding(8)
                                .background(.ultraThinMaterial, in: Circle())
                        }
                    }
                    .overlay(alignment: .topTrailing) {
                        if isSelected {
                            Image(systemName: "checkmark.circle.fill")
                                .font(.title3)
                                .symbolRenderingMode(.palette)
                                .foregroundStyle(.white, Theme.Palette.orange)
                                .offset(x: 8, y: -8)
                        }
                    }
                Text(icon.title)
                    .font(.sarena(.caption, weight: .bold))
                    .multilineTextAlignment(.center)
                    .lineLimit(2, reservesSpace: true)
            }
            .frame(maxWidth: .infinity)
            .padding(Theme.Spacing.m)
            .glassSurface(isSelected ? .tinted(Theme.Palette.orange, opacity: 0.25, cornerRadius: Theme.Radius.tile) : .tile)
        }
        .buttonStyle(.glassPress)
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }
}

#Preview {
    PreviewContainer {
        SettingsViewPreview()
    }
}

private struct SettingsViewPreview: View {
    @Environment(SessionStore.self) private var session
    var body: some View { SettingsView(session: session) }
}
