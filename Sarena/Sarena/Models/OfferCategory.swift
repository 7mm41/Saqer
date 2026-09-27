import SwiftUI

/// The seven Sarena destinations shown on the dashboard.
enum OfferCategory: String, CaseIterable, Identifiable, Codable, Sendable {
    case cinema
    case jetSki
    case shootingClub
    case automobileClub
    case ibriArena
    case videoGames
    case festivals

    var id: String { rawValue }

    var title: LocalizedStringKey {
        switch self {
        case .cinema: "Cinema Offers"
        case .jetSki: "Jet Ski"
        case .shootingClub: "Oman Shooting Club"
        case .automobileClub: "Oman Automobile Association"
        case .ibriArena: "Ibri Arena"
        case .videoGames: "Video Game Arcades"
        case .festivals: "Oman Festivals"
        }
    }

    var tagline: LocalizedStringKey {
        switch self {
        case .cinema: "Blockbusters for less"
        case .jetSki: "Ride the Muscat coast"
        case .shootingClub: "Precision, supervised"
        case .automobileClub: "Track days & karting"
        case .ibriArena: "Live shows & stunts"
        case .videoGames: "Play more, pay less"
        case .festivals: "Ibri & Muscat Nights"
        }
    }

    var symbol: String {
        switch self {
        case .cinema: "film.fill"
        case .jetSki: "water.waves"
        case .shootingClub: "scope"
        case .automobileClub: "steeringwheel"
        case .ibriArena: "flag.2.crossed.fill"
        case .videoGames: "gamecontroller.fill"
        case .festivals: "sparkles"
        }
    }

    /// Each category gets its own glass colour so the grid reads at a glance.
    var colors: [Color] {
        switch self {
        case .cinema: [Color(hex: 0xFF5A5F), Color(hex: 0xC2185B)]
        case .jetSki: [Color(hex: 0x3DD6F5), Color(hex: 0x1565C0)]
        case .shootingClub: [Color(hex: 0x9CCC65), Color(hex: 0x2E7D32)]
        case .automobileClub: [Color(hex: 0xFFB05C), Color(hex: 0xE45A00)]
        case .ibriArena: [Color(hex: 0xFFD54F), Color(hex: 0xF57F17)]
        case .videoGames: [Color(hex: 0xB388FF), Color(hex: 0x5E35B1)]
        case .festivals: [Color(hex: 0xFF80AB), Color(hex: 0xFF2F7D)]
        }
    }

    var accent: Color { colors.last ?? Theme.Palette.orange }
}
