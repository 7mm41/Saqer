import Foundation

/// The Sarena membership: one plan, one yearly price, every member price.
/// Its name, price and perks come from the server, so they can be changed
/// from the dashboard without an app update.
struct MembershipPlan: Identifiable, Hashable, Sendable {
    let id: String
    let name: LocalizedText
    let description: LocalizedText
    /// Price in OMR for the whole period.
    let price: Decimal
    let durationDays: Int
    let perks: [LocalizedText]

    /// Launch plan: 15 OMR a year. Used by the mock backend and as a fallback.
    static let annual = MembershipPlan(
        id: "annual",
        name: LocalizedText("Sarena Annual Membership", ar: "عضوية سرينا السنوية"),
        description: LocalizedText(
            "One membership, every member price — for a whole year.",
            ar: "عضوية واحدة وكل أسعار الأعضاء، لسنة كاملة."
        ),
        price: .baisa(15_000),
        durationDays: 365,
        perks: [
            LocalizedText("Member prices at every Sarena venue and event", ar: "أسعار الأعضاء في كل أماكن وفعاليات سرينا"),
            LocalizedText("Instant booking codes, no printing or queues", ar: "أكواد حجز فورية بلا طباعة ولا طوابير"),
            LocalizedText("Early access to festivals and new venues", ar: "وصول مبكر للمهرجانات والأماكن الجديدة"),
        ]
    )

    /// Yearly plans read as "/ year"; anything else shows its length in days.
    var isYearly: Bool { (360...370).contains(durationDays) }

    /// Price per month, for the "only X a month" marketing line.
    var monthlyEquivalent: Decimal { price * 30 / Decimal(max(durationDays, 1)) }
}

extension MembershipPlan: Codable {
    private enum CodingKeys: String, CodingKey {
        case id, name, description, priceBaisa, durationDays, perks
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        name = try container.decode(LocalizedText.self, forKey: .name)
        description = try container.decode(LocalizedText.self, forKey: .description)
        price = .baisa(try container.decode(Int.self, forKey: .priceBaisa))
        durationDays = try container.decode(Int.self, forKey: .durationDays)
        perks = try container.decodeIfPresent([LocalizedText].self, forKey: .perks) ?? []
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(id, forKey: .id)
        try container.encode(name, forKey: .name)
        try container.encode(description, forKey: .description)
        try container.encode(price.baisaValue, forKey: .priceBaisa)
        try container.encode(durationDays, forKey: .durationDays)
        try container.encode(perks, forKey: .perks)
    }
}

/// The member's membership period. Booking at member prices needs an active one.
struct Membership: Identifiable, Hashable, Codable, Sendable {
    enum Status: String, Codable, Sendable {
        case active, expired, cancelled
    }

    let id: String
    let plan: MembershipPlan
    let status: Status
    let startsAt: Date
    let expiresAt: Date

    func isActive(at now: Date = .now) -> Bool {
        status == .active && expiresAt > now
    }

    /// Whole days left, never negative.
    func daysRemaining(from now: Date = .now) -> Int {
        max(0, Int((expiresAt.timeIntervalSince(now) / 86_400).rounded(.up)))
    }

    /// Worth nudging a renewal: active with a month or less to go.
    func isEndingSoon(at now: Date = .now) -> Bool {
        isActive(at: now) && daysRemaining(from: now) <= 30
    }
}
