import SwiftUI

/// Sarena subscription packages. The package decides which offer a member
/// gets at every venue (Regular seats, Gold experiences or Family bundles).
enum MembershipPlan: String, CaseIterable, Identifiable, Hashable, Sendable {
    case regular
    case gold
    case family

    var id: String { rawValue }

    /// Package name, shown next to its emoji (e.g. "👑 الذهبية").
    var name: LocalizedText {
        switch self {
        case .regular: LocalizedText("Regular", ar: "العادية")
        case .gold: LocalizedText("Gold", ar: "الذهبية")
        case .family: LocalizedText("Family", ar: "العائلية")
        }
    }

    var emoji: String {
        switch self {
        case .regular: "⭐️"
        case .gold: "👑"
        case .family: "👨‍👩‍👧‍👦"
        }
    }

    /// "👑 Gold" / "👑 الذهبية"
    func label(_ locale: Locale) -> String { "\(emoji) \(name(locale))" }

    var symbol: String {
        switch self {
        case .regular: "star.fill"
        case .gold: "crown.fill"
        case .family: "person.2.fill"
        }
    }

    var tint: Color {
        switch self {
        case .regular: Theme.Palette.orange
        case .gold: Theme.Palette.gold
        case .family: Theme.Palette.lagoon
        }
    }

    /// Monthly price in OMR (Regular is free).
    var monthlyPrice: Decimal {
        switch self {
        case .regular: 0
        case .gold: .baisa(4_900)
        case .family: .baisa(7_900)
        }
    }

    var tagline: LocalizedText {
        switch self {
        case .regular: LocalizedText("Everything you need to start saving", ar: "كل ما تحتاجه لتبدأ التوفير")
        case .gold: LocalizedText("The premium Sarena experience", ar: "تجربة سرينا الفاخرة")
        case .family: LocalizedText("More fun for the whole family", ar: "متعة أكبر لكل العائلة")
        }
    }

    var perks: [LocalizedText] {
        switch self {
        case .regular:
            [LocalizedText("Member prices at every venue", ar: "أسعار الأعضاء في جميع الأماكن"),
             LocalizedText("Instant QR codes in your Wallet", ar: "أكواد QR فورية في محفظتك"),
             LocalizedText("Free forever", ar: "مجانية دائماً")]
        case .gold:
            [LocalizedText("Gold experiences: VIP seats, guided rides & more", ar: "تجارب ذهبية: مقاعد VIP ورحلات بمرشد والمزيد"),
             LocalizedText("The biggest discounts", ar: "أكبر الخصومات"),
             LocalizedText("Priority booking & fast lanes", ar: "أولوية الحجز والمسارات السريعة")]
        case .family:
            [LocalizedText("Family bundles for up to 4 people", ar: "باقات عائلية حتى ٤ أشخاص"),
             LocalizedText("Kids' zones & activities included", ar: "مناطق وأنشطة الأطفال مشمولة"),
             LocalizedText("One membership for the whole family", ar: "عضوية واحدة لكل العائلة")]
        }
    }

    /// Highlighted with a "Most popular" ribbon.
    var isFeatured: Bool { self == .gold }
}

// Older builds stored ticket tiers as "vip" / "group"; keep those wallet codes readable.
extension MembershipPlan: Codable {
    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        switch raw {
        case "vip": self = .gold
        case "group": self = .family
        default: self = MembershipPlan(rawValue: raw) ?? .regular
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(rawValue)
    }
}

/// The member's active package.
struct Subscription: Codable, Equatable, Sendable {
    var plan: MembershipPlan
    var startedAt: Date
    /// Next renewal for paid packages; nil for the free Regular package.
    var renewsAt: Date?

    static let free = Subscription(plan: .regular, startedAt: .now, renewsAt: nil)
}
