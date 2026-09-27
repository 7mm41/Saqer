import Foundation

/// A booked, prepaid code the member shows (or has scanned) at the venue.
struct PromoCode: Identifiable, Hashable, Codable, Sendable {
    enum Status: String, Codable, Sendable {
        case active
        case used
    }

    let id: UUID
    let code: String
    let venueID: String
    let venueName: LocalizedText
    let category: OfferCategory
    /// Package the code was booked with.
    let tier: MembershipPlan
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

    /// Payload encoded in the QR code. A real backend would sign this.
    var qrPayload: String { "sarena://redeem?code=\(code)&venue=\(venueID)" }
}
