import SwiftUI
import UIKit

@Observable
@MainActor
final class SettingsViewModel {
    private(set) var currentIcon: AppIcon
    private(set) var changingIcon: AppIcon?
    var iconChangeFailed = false
    var isConfirmingSignOut = false
    private(set) var isSigningOut = false
    var isConfirmingDeletion = false
    private(set) var isDeleting = false
    var deletionFailed = false

    let supportsAlternateIcons: Bool

    private let session: SessionStore

    init(session: SessionStore) {
        self.session = session
        self.supportsAlternateIcons = UIApplication.shared.supportsAlternateIcons
        self.currentIcon = AppIcon(alternateIconName: UIApplication.shared.alternateIconName)
    }

    var user: User? { session.user }

    var appVersion: String {
        let info = Bundle.main.infoDictionary
        let version = info?["CFBundleShortVersionString"] as? String ?? "1.0"
        let build = info?["CFBundleVersion"] as? String ?? "1"
        return "\(version) (\(build))"
    }

    // MARK: App icon

    /// Switches the Home Screen icon.
    ///
    /// `AppIcon.glass` maps to the **"AppIcon-Glass"** alternate icon set — the
    /// Glassmorphism logo — declared in `Assets.xcassets` and listed in the
    /// target's `ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES` build setting.
    /// Passing `.classic` restores the primary icon (`nil` alternate name).
    func setIcon(_ icon: AppIcon) async {
        guard supportsAlternateIcons, icon != currentIcon, changingIcon == nil else { return }
        changingIcon = icon
        defer { changingIcon = nil }
        do {
            try await AppIconSwitcher.apply(icon)
            currentIcon = icon
        } catch {
            iconChangeFailed = true
        }
    }

    /// Re-reads the icon (it may have been changed from the seasonal banner).
    func refreshIcon() {
        currentIcon = AppIconSwitcher.current
    }

    // MARK: Session

    func signOut() async {
        isSigningOut = true
        await session.signOut()
        isSigningOut = false
    }

    func deleteAccount() async {
        isDeleting = true
        defer { isDeleting = false }
        do {
            try await session.deleteAccount()
        } catch {
            deletionFailed = true
        }
    }
}

/// Changes the Home Screen icon. Always called from a tap: App Store rule 4.6
/// requires every icon change to be initiated by the member.
@MainActor
enum AppIconSwitcher {
    static var current: AppIcon { AppIcon(alternateIconName: UIApplication.shared.alternateIconName) }

    static func apply(_ icon: AppIcon) async throws {
        try await setAlternateIconName(icon.alternateIconName)
    }

    /// Bridges `setAlternateIconName(_:completionHandler:)` to async/await.
    /// (The completion-handler form is used on purpose: it is the variant that
    /// behaves reliably across iOS versions.)
    private static func setAlternateIconName(_ name: String?) async throws {
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            Task { @MainActor in
                UIApplication.shared.setAlternateIconName(name) { error in
                    if let error {
                        continuation.resume(throwing: error)
                    } else {
                        continuation.resume()
                    }
                }
            }
        }
    }
}
