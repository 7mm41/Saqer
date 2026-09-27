import SwiftUI

/// Owns the in-app language and switches it *behind a cover*, so members see a
/// short, branded "changing language" moment instead of the whole UI flipping
/// between left-to-right and right-to-left in front of them.
///
/// Sequence: cover fades in → language applied while hidden → the new layout
/// settles → cover fades out.
@Observable
@MainActor
final class LanguageCoordinator {
    /// The language the UI renders in (persisted).
    private(set) var language: AppLanguage
    /// Target language while the transition cover is on screen.
    private(set) var coverLanguage: AppLanguage?

    /// Time the cover takes to become fully opaque before the switch.
    let coverDelay: Duration
    /// Time the new layout gets to settle before the cover lifts.
    let settleDelay: Duration

    private let defaults: UserDefaults
    @ObservationIgnored private var isSwitching = false

    init(defaults: UserDefaults = .standard,
         coverDelay: Duration = .milliseconds(450),
         settleDelay: Duration = .milliseconds(1_050)) {
        self.defaults = defaults
        self.coverDelay = coverDelay
        self.settleDelay = settleDelay
        self.language = defaults.string(forKey: AppLanguage.storageKey).flatMap(AppLanguage.init(rawValue:)) ?? .system
    }

    /// Total time the progress ring runs, in seconds.
    var transitionSeconds: Double {
        Double(coverDelay.components.seconds) + Double(coverDelay.components.attoseconds) / 1e18
            + Double(settleDelay.components.seconds) + Double(settleDelay.components.attoseconds) / 1e18
    }

    /// Switches language behind the cover. `whileCovered` runs after the new
    /// language is applied but before the cover lifts (e.g. to move onboarding
    /// to its next step so it appears already translated).
    func change(to newLanguage: AppLanguage, whileCovered: (() -> Void)? = nil) async {
        guard !isSwitching else { return }
        guard newLanguage != language else {
            whileCovered?()
            return
        }
        isSwitching = true
        defer { isSwitching = false }

        withAnimation(.easeInOut(duration: 0.35)) { coverLanguage = newLanguage }
        try? await Task.sleep(for: coverDelay)

        language = newLanguage
        defaults.set(newLanguage.rawValue, forKey: AppLanguage.storageKey)
        whileCovered?()

        try? await Task.sleep(for: settleDelay)
        withAnimation(.easeInOut(duration: 0.4)) { coverLanguage = nil }
    }
}
