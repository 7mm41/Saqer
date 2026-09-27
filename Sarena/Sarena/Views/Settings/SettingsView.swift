import SwiftUI

struct SettingsView: View {
    @State private var viewModel: SettingsViewModel

    @AppStorage(AppAppearance.storageKey) private var appearance: AppAppearance = .system
    @AppStorage(PreferenceKeys.floatingMotion) private var floatingMotion = true

    @Environment(\.locale) private var locale
    @Environment(\.layoutDirection) private var layoutDirection
    @Environment(\.openURL) private var openURL
    @Environment(LanguageCoordinator.self) private var languageCoordinator

    init(session: SessionStore) {
        _viewModel = State(initialValue: SettingsViewModel(session: session))
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: Theme.Spacing.xl) {
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
                selection: Binding(
                    get: { languageCoordinator.language },
                    // Switches behind the "changing language" cover.
                    set: { newLanguage in Task { await languageCoordinator.change(to: newLanguage) } }
                ),
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
