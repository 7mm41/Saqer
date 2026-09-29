import SwiftUI

/// Sarena design tokens. Every colour, radius and spacing value used by the
/// glass components lives here so the brand can be tuned from one place.
///
/// Calm on purpose: white cards on a plain grey background, dark text, and
/// Sarena orange only as a small accent (icons, prices, the main button).
/// No gradients or coloured glows. Red and green appear only for errors and
/// success. Text colours are chosen for contrast, so every word is readable.
enum Theme {
    enum Palette {
        /// Sampled from the Sarena logo tile: icons and small accents.
        static let orange = Color(hex: 0xFF7900)
        /// Filled buttons and badges with white text (deeper, so the text reads).
        static let orangeFill = Color(hex: 0xEC6D00)
        /// Orange words on cards (darker in light mode, lighter in dark mode).
        static let accentText = Color("AccentText")
        /// The soft orange behind icons and small badges.
        static let orangeSoft = Color(hex: 0xFF7900, opacity: 0.12)
        static let glow = Color(hex: 0xFFB05C)
        static let ember = Color(hex: 0xE45A00)
        /// Neutral grey for secondary icons, inactive states and badges.
        static let steel = Color(hex: 0x8E8E93)
        /// Dark grey for artwork behind white and orange symbols.
        static let graphite = Color(hex: 0x2E2E32)
        static let ink = Color(hex: 0x15151B)
        static let success = Color(hex: 0x22C55E)
        static let danger = Color(hex: 0xFF4D5E)

        /// The plain screen background: light grey, or near-black in dark mode.
        /// The same colour set as the launch screen, so launch → app is seamless.
        static let background = Color("LaunchBackground")
        /// Cards: white, or a raised dark grey in dark mode.
        static let card = Color("CardBackground")
        /// Behind venue symbols when there is no photo.
        static let artwork = Color("ArtworkBackground")
    }

    /// The brand fill: one flat orange (kept as a gradient type so any
    /// `ShapeStyle` use stays the same).
    static let brandGradient = LinearGradient(
        colors: [Palette.orangeFill, Palette.orangeFill],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )

    enum Radius {
        static let hero: CGFloat = 36
        static let card: CGFloat = 28
        static let tile: CGFloat = 22
        static let field: CGFloat = 18
        static let chip: CGFloat = 14
    }

    enum Spacing {
        static let xs: CGFloat = 4
        static let s: CGFloat = 8
        static let m: CGFloat = 12
        static let l: CGFloat = 16
        static let xl: CGFloat = 24
        static let xxl: CGFloat = 32
    }

    /// Horizontal page gutter shared by every screen.
    static let gutter: CGFloat = 20
}

extension Color {
    /// `Color(hex: 0xFF7900)`
    init(hex: UInt32, opacity: Double = 1) {
        self.init(
            .sRGB,
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255,
            opacity: opacity
        )
    }
}

extension Font {
    /// Rounded system font. Arabic text falls back to SF Arabic automatically.
    static func sarena(_ style: Font.TextStyle, weight: Font.Weight = .regular) -> Font {
        .system(style, design: .rounded, weight: weight)
    }
}
