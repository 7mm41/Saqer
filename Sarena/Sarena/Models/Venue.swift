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

    /// The offer included in a package, falling back to the Regular offer.
    func ticket(for plan: MembershipPlan) -> TicketOption? {
        tickets.first { $0.tier == plan } ?? tickets.first { $0.tier == .regular } ?? tickets.first
    }
}

/// A venue's offer for one membership package.
struct TicketOption: Identifiable, Hashable, Codable, Sendable {
    let id: String
    /// The package this offer belongs to (members see the offer for their own package).
    let tier: MembershipPlan
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

extension Decimal {
    /// Omani prices are quoted in rials with 3 decimals (1 OMR = 1000 baisa).
    static func baisa(_ value: Int) -> Decimal {
        Decimal(value) / 1000
    }
}
