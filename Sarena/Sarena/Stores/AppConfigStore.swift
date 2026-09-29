import Foundation
import Observation

/// The dashboard-controlled look (logo, greeting, banner) and reminder
/// timings. The last config is cached so a theme shows immediately
/// on launch, then refreshed on foreground and live `config` events.
@Observable
@MainActor
final class AppConfigStore {
    private(set) var config: AppConfig

    private let service: any AppConfigServicing
    private let defaults: UserDefaults
    private static let cacheKey = "sarena.appConfig"

    init(service: any AppConfigServicing, defaults: UserDefaults = .standard) {
        self.service = service
        self.defaults = defaults
        config = defaults.data(forKey: Self.cacheKey)
            .flatMap { try? JSONDecoder().decode(AppConfig.self, from: $0) } ?? .standard
    }

    /// Forgets the cached look (when the app moves to another server).
    static func clearCache(defaults: UserDefaults = .standard) {
        defaults.removeObject(forKey: cacheKey)
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
}
