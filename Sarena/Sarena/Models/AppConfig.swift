import Foundation

/// What the dashboard controls about the app's look and reminders
/// (`GET /v1/app/config`). Cached on-device so the seasonal look is there
/// from the first frame of the next launch.
struct AppConfig: Codable, Hashable, Sendable {
    var theme: SeasonalTheme?
    var reminders: ReminderSettings
    var links: Links
    /// Whether the server can make Apple Wallet passes (older servers omit it).
    var wallet: Wallet? = nil

    struct Wallet: Codable, Hashable, Sendable {
        var enabled = false
    }

    var walletEnabled: Bool { wallet?.enabled ?? false }

    struct Links: Codable, Hashable, Sendable {
        var appStoreUrl = ""
        var googlePlayUrl = ""
        var whatsapp = ""
        var email = ""
        var instagram = ""
    }

    static let standard = AppConfig(theme: nil, reminders: .standard, links: Links())
}

/// A seasonal look set in the dashboard: National Day, Ramadan, Eid...
struct SeasonalTheme: Codable, Hashable, Sendable, Identifiable {
    let id: String
    let name: String
    /// Replaces the Sarena logo inside the app while the theme runs.
    let logoURL: URL?
    let bannerURL: URL?
    let greeting: LocalizedText?
    /// `#RRGGBB`
    let accentColor: String?
    /// A bundled alternate icon the app offers to apply (the member taps; App Store rule 4.6).
    let iconName: String?
    let endsAt: Date?

    private enum CodingKeys: String, CodingKey {
        case id, name, greeting, accentColor, iconName, endsAt
        case logoURL = "logoUrl"
        case bannerURL = "bannerUrl"
    }

    init(id: String, name: String, logoURL: URL? = nil, bannerURL: URL? = nil, greeting: LocalizedText? = nil,
         accentColor: String? = nil, iconName: String? = nil, endsAt: Date? = nil) {
        self.id = id
        self.name = name
        self.logoURL = logoURL
        self.bannerURL = bannerURL
        self.greeting = greeting
        self.accentColor = accentColor
        self.iconName = iconName
        self.endsAt = endsAt
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        name = try c.decode(String.self, forKey: .name)
        logoURL = MediaURL.decode(c, .logoURL, from: decoder)
        bannerURL = MediaURL.decode(c, .bannerURL, from: decoder)
        greeting = try c.decodeIfPresent(LocalizedText.self, forKey: .greeting)
        accentColor = try c.decodeIfPresent(String.self, forKey: .accentColor)
        iconName = try c.decodeIfPresent(String.self, forKey: .iconName)
        endsAt = try c.decodeIfPresent(Date.self, forKey: .endsAt)
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(id, forKey: .id)
        try c.encode(name, forKey: .name)
        try c.encodeIfPresent(logoURL?.absoluteString, forKey: .logoURL)
        try c.encodeIfPresent(bannerURL?.absoluteString, forKey: .bannerURL)
        try c.encodeIfPresent(greeting, forKey: .greeting)
        try c.encodeIfPresent(accentColor, forKey: .accentColor)
        try c.encodeIfPresent(iconName, forKey: .iconName)
        try c.encodeIfPresent(endsAt, forKey: .endsAt)
    }

    /// The bundled icon this theme suggests, if the app has it.
    var icon: AppIcon? {
        guard let iconName else { return nil }
        return AppIcon.allCases.first { $0.alternateIconName == iconName }
    }
}

/// When the phone reminds members of events they booked (set in the dashboard).
struct ReminderSettings: Codable, Hashable, Sendable {
    /// Morning of the event day, local time.
    var morningHour: Int
    /// The main reminder comes at least this many hours before the start.
    var hoursBefore: Int
    /// A last nudge this many minutes before the start (0 = off).
    var finalReminderMinutes: Int

    static let standard = ReminderSettings(morningHour: 8, hoursBefore: 5, finalReminderMinutes: 60)
}
