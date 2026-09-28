import Foundation

/// A booked code the member shows (or has scanned) at the venue.
struct PromoCode: Identifiable, Hashable, Sendable {
    enum Status: String, Codable, Sendable {
        case active
        case used
        case cancelled
    }

    let id: String
    let code: String
    let venueID: String
    let venueName: LocalizedText
    let category: OfferCategory
    /// The ticket option booked ("VIP hall", "Group of 4"...).
    let offerTitle: LocalizedText
    let quantity: Int
    let paidTotal: Decimal
    let originalTotal: Decimal
    let purchasedAt: Date
    let expiresAt: Date
    var status: Status
    var usedAt: Date?

    var savings: Decimal { originalTotal - paidTotal }

    var isExpired: Bool { status == .active && expiresAt < .now }

    /// Can still be shown at the venue.
    var isRedeemable: Bool { status == .active && !isExpired }

    /// Payload encoded in the QR code; staff scan it in the dashboard to redeem.
    var qrPayload: String { "sarena://redeem?code=\(code)" }
}

extension PromoCode: Codable {
    private enum CodingKeys: String, CodingKey {
        case id, code, category, offerTitle, quantity, status, purchasedAt, expiresAt, usedAt, venueName
        case venueID = "venueId"
        case paidTotal = "paidTotalBaisa"
        case originalTotal = "originalTotalBaisa"
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        code = try c.decode(String.self, forKey: .code)
        // The venue may have been removed since; the code keeps its snapshot.
        venueID = try c.decodeIfPresent(String.self, forKey: .venueID) ?? ""
        venueName = try c.decode(LocalizedText.self, forKey: .venueName)
        category = try c.decode(OfferCategory.self, forKey: .category)
        offerTitle = try c.decode(LocalizedText.self, forKey: .offerTitle)
        quantity = try c.decode(Int.self, forKey: .quantity)
        paidTotal = .baisa(try c.decode(Int.self, forKey: .paidTotal))
        originalTotal = .baisa(try c.decode(Int.self, forKey: .originalTotal))
        status = try c.decode(Status.self, forKey: .status)
        purchasedAt = try c.decode(Date.self, forKey: .purchasedAt)
        expiresAt = try c.decode(Date.self, forKey: .expiresAt)
        usedAt = try c.decodeIfPresent(Date.self, forKey: .usedAt)
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(id, forKey: .id)
        try c.encode(code, forKey: .code)
        try c.encode(venueID, forKey: .venueID)
        try c.encode(venueName, forKey: .venueName)
        try c.encode(category, forKey: .category)
        try c.encode(offerTitle, forKey: .offerTitle)
        try c.encode(quantity, forKey: .quantity)
        try c.encode(paidTotal.baisaValue, forKey: .paidTotal)
        try c.encode(originalTotal.baisaValue, forKey: .originalTotal)
        try c.encode(status, forKey: .status)
        try c.encode(purchasedAt, forKey: .purchasedAt)
        try c.encode(expiresAt, forKey: .expiresAt)
        try c.encodeIfPresent(usedAt, forKey: .usedAt)
    }
}
