import SwiftUI
import UIKit

struct SettingsView: View {
    @State private var viewModel: SettingsViewModel

    @AppStorage(AppAppearance.storageKey) private var appearance: AppAppearance = .system
    @AppStorage(PreferenceKeys.floatingMotion) private var floatingMotion = true

    @Environment(\.locale) private var locale
    @Environment(\.layoutDirection) private var layoutDirection
    @Environment(\.openURL) private var openURL
    @Environment(LanguageCoordinator.self) private var languageCoordinator
    @State private var notifications = NotificationsManager.shared
    @Environment(\.services) private var services
    @Environment(LiveSync.self) private var liveSync

    init(session: SessionStore) {
        _viewModel = State(initialValue: SettingsViewModel(session: session))
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: Theme.Spacing.xl) {
                    languageSection
                    notificationsSection
                    appIconSection
                    experienceSection
                    aboutSection
                    signOutButton
                    deleteAccountButton
                }
                .padding(.horizontal, Theme.gutter)
                .padding(.bottom, Theme.Spacing.xxl)
            }
            .sarenaScreenBackground()
            .navigationTitle("Settings")
            .toolbarBackground(.hidden, for: .navigationBar)
            .onAppear { viewModel.refreshIcon() }
            .task { await notifications.refreshAuthorization() }
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
            tint: isRTL ? Theme.Palette.orange : Theme.Palette.steel
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

    // MARK: Notifications

    private var notificationsSection: some View {
        SettingsSection(title: "Notifications", systemImage: "bell.badge.fill") {
            HStack(alignment: .center, spacing: Theme.Spacing.m) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(notifications.isAuthorized ? "Notifications are on" : "Notifications are off")
                        .font(.sarena(.subheadline, weight: .semibold))
                    Text("New events, member discounts and reminders before the events you booked.")
                        .font(.sarena(.caption))
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 0)
                if notifications.isAuthorized {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.title3)
                        .foregroundStyle(Theme.Palette.success)
                }
            }
            if !notifications.isAuthorized {
                Button {
                    if notifications.authorization == .denied {
                        if let url = URL(string: UIApplication.openNotificationSettingsURLString) { openURL(url) }
                    } else {
                        Task { await notifications.requestAuthorization() }
                    }
                } label: {
                    Label("Turn on notifications", systemImage: "bell.fill")
                }
                .buttonStyle(.sarenaGlass)
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
            serverRow
        }
    }

    /// Which server the app talks to, and whether live updates are flowing.
    private var serverRow: some View {
        HStack(spacing: 8) {
            Text("Server")
            Spacer()
            if services.isDemo {
                Text("Demo (on this device)")
                    .foregroundStyle(.secondary)
            } else {
                Circle()
                    .fill(liveSync.isConnected ? Theme.Palette.orange : Theme.Palette.steel)
                    .frame(width: 7, height: 7)
                Text(verbatim: ServerAddress.current()?.host() ?? "—")
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                    .truncationMode(.middle)
                    .environment(\.layoutDirection, .leftToRight)
            }
        }
        .font(.sarena(.subheadline, weight: .medium))
        .accessibilityElement(children: .combine)
        .accessibilityValue(services.isDemo ? Text(verbatim: "") : liveSync.isConnected ? Text("Live") : Text("Reconnecting"))
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
        // Attached to the button itself: on iOS 26 the dialog is a popover that
        // points at the view it is attached to.
        .confirmationDialog("Log out of Sarena?", isPresented: $viewModel.isConfirmingSignOut, titleVisibility: .visible) {
            Button("Log Out", role: .destructive) {
                Task { await viewModel.signOut() }
            }
        } message: {
            Text("Your codes stay safe in your Wallet and will be waiting when you sign back in.")
        }
    }

    private var deleteAccountButton: some View {
        Button(role: .destructive) {
            viewModel.isConfirmingDeletion = true
        } label: {
            if viewModel.isDeleting {
                ProgressView()
            } else {
                Text("Delete account")
                    .font(.sarena(.footnote, weight: .semibold))
            }
        }
        .foregroundStyle(Theme.Palette.danger)
        .disabled(viewModel.isDeleting)
        // Anchored to the button (iOS 26 shows it as a popover pointing here).
        .confirmationDialog("Delete your Sarena account?", isPresented: $viewModel.isConfirmingDeletion, titleVisibility: .visible) {
            Button("Delete account", role: .destructive) {
                Task { await viewModel.deleteAccount() }
            }
        } message: {
            Text("Your profile, membership and codes are erased permanently. This can't be undone.")
        }
        .alert("Couldn't delete the account", isPresented: $viewModel.deletionFailed) {
            Button("OK", role: .cancel) {}
        } message: {
            Text("Please try again in a moment.")
        }
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
