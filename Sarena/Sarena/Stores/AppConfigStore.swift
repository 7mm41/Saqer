import Foundation
import Observation

/// The dashboard-controlled look (seasonal logo, greeting, suggested icon) and
/// reminder timings. The last config is cached so a theme shows immediately
/// on launch, then refreshed on foreground and live `config` events.
@Observable
@MainActor
final class AppConfigStore {
    private(set) var config: AppConfig

    private let service: any AppConfigServicing
    private let defaults: UserDefaults
    private static let cacheKey = "sarena.appConfig"
    private static let dismissedKey = "sarena.iconOffer.dismissed"

    init(service: any AppConfigServicing, defaults: UserDefaults = .standard) {
        self.service = service
        self.defaults = defaults
        config = defaults.data(forKey: Self.cacheKey)
            .flatMap { try? JSONDecoder().decode(AppConfig.self, from: $0) } ?? .standard
        dismissedOffer = defaults.string(forKey: Self.dismissedKey)
    }

    var theme: SeasonalTheme? { config.theme }
    var reminders: ReminderSettings { config.reminders }

    func refresh() async {
        guard let fresh = try? await service.fetchConfig(), fresh != config else { return }
        config = fresh
        if let data = try? JSONEncoder().encode(fresh) {
            defaults.set(data, forKey: Self.cacheKey)
        }
    }

    // MARK: Seasonal icon

    enum IconSuggestion: Equatable {
        /// The running theme has an icon the member hasn't applied.
        case apply(AppIcon)
        /// The season is over but its icon is still on the home screen.
        case restore(from: AppIcon)
    }

    /// Theme id (or "restore:<icon>") the member said "Not now" to.
    private(set) var dismissedOffer: String?

    /// Apple requires icon changes to be user-initiated, so the app offers them.
    func iconSuggestion(currentIconName: String?) -> IconSuggestion? {
        let current = AppIcon(alternateIconName: currentIconName)
        if let theme, let icon = theme.icon, icon != current {
            return dismissedOffer == theme.id ? nil : .apply(icon)
        }
        if current.isSeasonal, theme?.icon != current {
            return dismissedOffer == "restore:\(current.rawValue)" ? nil : .restore(from: current)
        }
        return nil
    }

    func dismiss(_ suggestion: IconSuggestion) {
        switch suggestion {
        case .apply: dismissedOffer = theme?.id
        case .restore(let icon): dismissedOffer = "restore:\(icon.rawValue)"
        }
        defaults.set(dismissedOffer, forKey: Self.dismissedKey)
    }
}
