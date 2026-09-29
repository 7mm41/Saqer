import SwiftUI
import UIKit

struct SettingsView: View {
    @State private var viewModel: SettingsViewModel

    @AppStorage(AppAppearance.storageKey) private var appearance: AppAppearance = .system

    @Environment(\.locale) private var locale
    @Environment(\.layoutDirection) private var layoutDirection
    @Environment(\.openURL) private var openURL
    @Environment(LanguageCoordinator.self) private var languageCoordinator
    @State private var notifications = NotificationsManager.shared

    init(session: SessionStore) {
        _viewModel = State(initialValue: SettingsViewModel(session: session))
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: Theme.Spacing.xl) {
                    languageSection
                    notificationsSection
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
            .sarenaNavigationBar()
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
            if notifications.isAuthorized, let problem = notifications.registrationProblem {
                // iOS gave no push token (e.g. the build lacks the Push Notifications capability).
                Label {
                    Text("This phone couldn't register for notifications: \(problem)")
                } icon: {
                    Image(systemName: "exclamationmark.triangle.fill")
                }
                .font(.sarena(.caption, weight: .medium))
                .foregroundStyle(Theme.Palette.danger)
                .fixedSize(horizontal: false, vertical: true)
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
            if viewModel.usesAlternateIcon {
                // Icons are set by Sarena now; someone who picked one earlier can go back.
                Button {
                    Task { await viewModel.restoreOriginalIcon() }
                } label: {
                    if viewModel.isRestoringIcon {
                        ProgressView()
                    } else {
                        Label("Use the original app icon", systemImage: "arrow.uturn.backward")
                    }
                }
                .buttonStyle(.sarenaGlass)
                .disabled(viewModel.isRestoringIcon)
            }
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

#Preview {
    PreviewContainer {
        SettingsViewPreview()
    }
}

private struct SettingsViewPreview: View {
    @Environment(SessionStore.self) private var session
    var body: some View { SettingsView(session: session) }
}
