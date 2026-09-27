import CoreLocation
import SwiftUI

/// A bookable place (cinema, club, arena, festival...).
struct Venue: Identifiable, Hashable, Codable, Sendable {
    let id: String
    let category: OfferCategory
    let name: LocalizedText
    let area: LocalizedText
    /// One-line pitch used on cards.
    let summary: LocalizedText
    /// Comprehensive description for the detail screen.
    let about: LocalizedText
    let highlights: [LocalizedText]
    let openingHours: LocalizedText
    let latitude: Double
    let longitude: Double
    let rating: Double
    let reviewCount: Int
    let tickets: [TicketOption]
    let isFeatured: Bool
    /// When the member price expires — powers the marketing countdown.
    let dealEndsAt: Date?

    var coordinate: CLLocationCoordinate2D {
        CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
    }

    var maxDiscountPercent: Int {
        tickets.map(\.discountPercent).max() ?? 0
    }

    var startingPrice: Decimal? {
        tickets.map(\.memberPrice).min()
    }

    var startingOriginalPrice: Decimal? {
        tickets.min(by: { $0.memberPrice < $1.memberPrice })?.originalPrice
    }
}

struct TicketOption: Identifiable, Hashable, Codable, Sendable {
    let id: String
    let tier: TicketTier
    let originalPrice: Decimal
    /// The exclusive price only signed-in members can see.
    let memberPrice: Decimal
    let perks: [LocalizedText]
    /// Remaining allocation at the member price (nil = unlimited).
    let remaining: Int?

    var savings: Decimal { originalPrice - memberPrice }

    var discountPercent: Int {
        guard originalPrice > 0 else { return 0 }
        let ratio = NSDecimalNumber(decimal: savings / originalPrice).doubleValue
        return Int((ratio * 100).rounded())
    }

    var isLowStock: Bool { (remaining ?? .max) <= 15 }
}

enum TicketTier: String, Codable, CaseIterable, Sendable {
    case regular
    case vip
    case family
    case group

    var title: LocalizedStringKey {
        switch self {
        case .regular: "Regular"
        case .vip: "VIP"
        case .family: "Family"
        case .group: "Group"
        }
    }

    var symbol: String {
        switch self {
        case .regular: "ticket.fill"
        case .vip: "crown.fill"
        case .family: "person.2.fill"
        case .group: "person.3.fill"
        }
    }

    var tint: Color {
        switch self {
        case .regular: Theme.Palette.orange
        case .vip: Theme.Palette.gold
        case .family: Theme.Palette.lagoon
        case .group: Theme.Palette.violet
        }
    }
}

extension Decimal {
    /// Omani prices are quoted in rials with 3 decimals (1 OMR = 1000 baisa).
    static func baisa(_ value: Int) -> Decimal {
        Decimal(value) / 1000
    }
}
