import CoreLocation
import SwiftUI

/// A bookable place or event (cinema, club, arena, festival...), managed from
/// the Sarena dashboard.
struct Venue: Identifiable, Hashable, Sendable {
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
    /// Ticket options, each with its original and member price.
    var tickets: [TicketOption]
    let isFeatured: Bool
    /// When the member price expires — powers the marketing countdown.
    let dealEndsAt: Date?
    /// Photo uploaded from the dashboard; the category artwork is shown without one.
    var imageURL: URL? = nil
    /// Set for events (festivals, shows).
    var eventStartsAt: Date? = nil
    var eventEndsAt: Date? = nil

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

    /// The option pre-selected on the detail screen: the cheapest one.
    var defaultTicket: TicketOption? {
        tickets.min { $0.memberPrice < $1.memberPrice }
    }
}

extension Venue: Codable {
    private enum CodingKeys: String, CodingKey {
        case id, category, name, area, summary, about, highlights, openingHours, latitude, longitude
        case rating, reviewCount, isFeatured, dealEndsAt, eventStartsAt, eventEndsAt
        case tickets = "offers"
        case imageURL = "imageUrl"
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        category = try c.decode(OfferCategory.self, forKey: .category)
        name = try c.decode(LocalizedText.self, forKey: .name)
        area = try c.decode(LocalizedText.self, forKey: .area)
        summary = try c.decode(LocalizedText.self, forKey: .summary)
        about = try c.decode(LocalizedText.self, forKey: .about)
        highlights = try c.decodeIfPresent([LocalizedText].self, forKey: .highlights) ?? []
        openingHours = try c.decode(LocalizedText.self, forKey: .openingHours)
        latitude = try c.decode(Double.self, forKey: .latitude)
        longitude = try c.decode(Double.self, forKey: .longitude)
        rating = try c.decodeIfPresent(Double.self, forKey: .rating) ?? 0
        reviewCount = try c.decodeIfPresent(Int.self, forKey: .reviewCount) ?? 0
        tickets = try c.decodeIfPresent([TicketOption].self, forKey: .tickets) ?? []
        isFeatured = try c.decodeIfPresent(Bool.self, forKey: .isFeatured) ?? false
        dealEndsAt = try c.decodeIfPresent(Date.self, forKey: .dealEndsAt)
        // A malformed or empty image link simply falls back to the artwork.
        imageURL = (try? c.decodeIfPresent(String.self, forKey: .imageURL)).flatMap { $0.flatMap(URL.init(string:)) }
        eventStartsAt = try c.decodeIfPresent(Date.self, forKey: .eventStartsAt)
        eventEndsAt = try c.decodeIfPresent(Date.self, forKey: .eventEndsAt)
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(id, forKey: .id)
        try c.encode(category, forKey: .category)
        try c.encode(name, forKey: .name)
        try c.encode(area, forKey: .area)
        try c.encode(summary, forKey: .summary)
        try c.encode(about, forKey: .about)
        try c.encode(highlights, forKey: .highlights)
        try c.encode(openingHours, forKey: .openingHours)
        try c.encode(latitude, forKey: .latitude)
        try c.encode(longitude, forKey: .longitude)
        try c.encode(rating, forKey: .rating)
        try c.encode(reviewCount, forKey: .reviewCount)
        try c.encode(tickets, forKey: .tickets)
        try c.encode(isFeatured, forKey: .isFeatured)
        try c.encodeIfPresent(dealEndsAt, forKey: .dealEndsAt)
        try c.encodeIfPresent(imageURL?.absoluteString, forKey: .imageURL)
        try c.encodeIfPresent(eventStartsAt, forKey: .eventStartsAt)
        try c.encodeIfPresent(eventEndsAt, forKey: .eventEndsAt)
    }
}

/// A ticket option at a venue ("Standard show", "VIP hall"...), each with the
/// original price and the exclusive member price.
struct TicketOption: Identifiable, Hashable, Sendable {
    let id: String
    let title: LocalizedText
    let originalPrice: Decimal
    /// The exclusive price only signed-in members can see.
    let memberPrice: Decimal
    let perks: [LocalizedText]
    /// Remaining allocation at the member price (nil = unlimited). Updated live.
    var remaining: Int?

    var savings: Decimal { originalPrice - memberPrice }

    var discountPercent: Int {
        guard originalPrice > 0 else { return 0 }
        let ratio = NSDecimalNumber(decimal: savings / originalPrice).doubleValue
        return Int((ratio * 100).rounded())
    }

    var isLowStock: Bool { (remaining ?? .max) <= 15 }

    var isSoldOut: Bool { remaining == 0 }
}

extension TicketOption: Codable {
    private enum CodingKeys: String, CodingKey {
        case id, title, perks, remaining, originalPriceBaisa, memberPriceBaisa
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        title = try c.decode(LocalizedText.self, forKey: .title)
        perks = try c.decodeIfPresent([LocalizedText].self, forKey: .perks) ?? []
        remaining = try c.decodeIfPresent(Int.self, forKey: .remaining)
        originalPrice = .baisa(try c.decode(Int.self, forKey: .originalPriceBaisa))
        memberPrice = .baisa(try c.decode(Int.self, forKey: .memberPriceBaisa))
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(id, forKey: .id)
        try c.encode(title, forKey: .title)
        try c.encode(perks, forKey: .perks)
        try c.encodeIfPresent(remaining, forKey: .remaining)
        try c.encode(originalPrice.baisaValue, forKey: .originalPriceBaisa)
        try c.encode(memberPrice.baisaValue, forKey: .memberPriceBaisa)
    }
}

extension Decimal {
    /// Omani prices are quoted in rials with 3 decimals (1 OMR = 1000 baisa).
    static func baisa(_ value: Int) -> Decimal {
        Decimal(value) / 1000
    }

    /// The amount in baisa, as the API sends and expects it.
    var baisaValue: Int {
        var scaled = self * 1000
        var rounded = Decimal()
        NSDecimalRound(&rounded, &scaled, 0, .plain)
        return NSDecimalNumber(decimal: rounded).intValue
    }
}
