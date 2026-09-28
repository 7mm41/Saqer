import Foundation

/// A change pushed by the server over `GET /v1/live` (Server-Sent Events).
/// The app refreshes just the affected data — no sign-out/sign-in needed.
enum LiveEvent: Equatable, Sendable {
    /// Connected (or reconnected: anything may have changed meanwhile).
    case ready
    /// Venues, events or ticket options changed in the dashboard.
    case catalog
    /// A ticket option's remaining member-price allocation changed.
    case offerRemaining(offerID: String, remaining: Int?)
    /// Membership plans (price, perks) changed.
    case plans
    /// This member's membership changed (granted, renewed, cancelled).
    case membership
    /// This member's codes changed (booked on another device, redeemed at the venue).
    case bookings
    /// Profile, role or status changed; `revoked` when the device was signed out.
    case account(revoked: Bool)
}

protocol LiveUpdatesServicing: Sendable {
    /// One connection. Finishes when the server closes it and throws when it
    /// fails; `LiveSync` reconnects with back-off.
    func connect() -> AsyncThrowingStream<LiveEvent, Error>
}

/// Turns SSE lines into events. Every Sarena event is a single `event:` line
/// followed by a single `data:` line, so a `data:` line completes the event
/// (line readers drop the blank separator lines).
struct ServerSentEventParser {
    private var pendingName: String?

    mutating func consume(_ line: String) -> LiveEvent? {
        if line.hasPrefix("event:") {
            pendingName = Self.value(of: line, after: "event:")
            return nil
        }
        guard line.hasPrefix("data:") else { return nil } // comments (": ping"), retry:, id:
        let name = pendingName ?? "message"
        pendingName = nil
        return Self.event(named: name, data: Data(Self.value(of: line, after: "data:").utf8))
    }

    static func event(named name: String, data: Data) -> LiveEvent? {
        let object = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] ?? [:]
        switch name {
        case "ready": return .ready
        case "catalog": return .catalog
        case "plans": return .plans
        case "membership": return .membership
        case "bookings": return .bookings
        case "account": return .account(revoked: object["revoked"] as? Bool ?? false)
        case "offer":
            guard let offerID = object["offerId"] as? String else { return nil }
            return .offerRemaining(offerID: offerID, remaining: object["remaining"] as? Int)
        default: return nil // e.g. dashboard-only "admin" events
        }
    }

    private static func value(of line: String, after prefix: String) -> String {
        let rest = line.dropFirst(prefix.count)
        return String(rest.first == " " ? rest.dropFirst() : rest)
    }
}
