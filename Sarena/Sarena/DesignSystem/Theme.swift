import SwiftUI

/// Sarena design tokens. Every colour, radius and spacing value used by the
/// glass components lives here so the brand can be tuned from one place.
enum Theme {
    enum Palette {
        /// Sampled from the Sarena logo tile.
        static let orange = Color(hex: 0xFF7900)
        static let glow = Color(hex: 0xFFB05C)
        static let ember = Color(hex: 0xE45A00)
        static let festivalPink = Color(hex: 0xFF2F7D)
        static let violet = Color(hex: 0x6B3DFF)
        static let lagoon = Color(hex: 0x19C3D8)
        static let mint = Color(hex: 0x2FD8A6)
        static let gold = Color(hex: 0xFFC24D)
        static let nightPlum = Color(hex: 0x170A24)
        static let ink = Color(hex: 0x15151B)
        static let success = Color(hex: 0x22C55E)
        static let danger = Color(hex: 0xFF4D5E)
    }

    static let brandGradient = LinearGradient(
        colors: [Palette.glow, Palette.orange, Palette.ember],
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
