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

    /// Every category shares Sarena orange: the symbol tells them apart, and the
    /// screen stays calm (orange, greys and white only).
    var colors: [Color] { [Theme.Palette.glow, Theme.Palette.orange] }

    var accent: Color { Theme.Palette.orange }
}
