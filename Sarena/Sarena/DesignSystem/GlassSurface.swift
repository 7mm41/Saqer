import SwiftUI

// MARK: - Style

/// Describes one "pane" of Sarena glass. Presets cover the common surfaces;
/// build your own for special cases.
///
/// ```swift
/// VStack { ... }
///     .padding()
///     .glassSurface(.card)
///
/// Text("-45%")
///     .glassSurface(.tinted(Theme.Palette.orange), in: Capsule())
/// ```
struct GlassSurfaceStyle {
    var material: Material = .ultraThinMaterial
    /// Optional colour poured into the glass (orange glass, pink glass, ...).
    var tint: Color?
    var tintOpacity: Double = 0.28
    var cornerRadius: CGFloat = Theme.Radius.card
    var borderWidth: CGFloat = 1
    /// Adds the diagonal inner reflection on the upper-leading edge.
    var sheen = true
    var shadow = GlassShadow.floating

    static let card = GlassSurfaceStyle()
    static let panel = GlassSurfaceStyle(material: .thinMaterial, cornerRadius: Theme.Radius.hero, shadow: .lifted)
    static let tile = GlassSurfaceStyle(cornerRadius: Theme.Radius.tile, shadow: .floating)
    static let field = GlassSurfaceStyle(cornerRadius: Theme.Radius.field, shadow: .subtle)
    static let chip = GlassSurfaceStyle(cornerRadius: Theme.Radius.chip, sheen: false, shadow: .subtle)
    static let flat = GlassSurfaceStyle(sheen: false, shadow: .none)

    static func tinted(
        _ color: Color,
        opacity: Double = 0.32,
        cornerRadius: CGFloat = Theme.Radius.card,
        shadow: GlassShadow = .glow
    ) -> GlassSurfaceStyle {
        GlassSurfaceStyle(tint: color, tintOpacity: opacity, cornerRadius: cornerRadius, shadow: shadow)
    }
}

/// Layered shadows are what make the glass look like it floats above the scene:
/// a wide soft ambient shadow plus a tighter contact shadow (and an optional colour glow).
struct GlassShadow {
    var ambientRadius: CGFloat
    var ambientY: CGFloat
    var ambientOpacity: Double
    var contactRadius: CGFloat
    var contactY: CGFloat
    var contactOpacity: Double
    var glowsWithTint = false

    static let none = GlassShadow(ambientRadius: 0, ambientY: 0, ambientOpacity: 0, contactRadius: 0, contactY: 0, contactOpacity: 0)
    static let subtle = GlassShadow(ambientRadius: 12, ambientY: 6, ambientOpacity: 0.12, contactRadius: 2, contactY: 1, contactOpacity: 0.08)
    static let floating = GlassShadow(ambientRadius: 28, ambientY: 18, ambientOpacity: 0.22, contactRadius: 4, contactY: 2, contactOpacity: 0.10)
    static let lifted = GlassShadow(ambientRadius: 44, ambientY: 28, ambientOpacity: 0.30, contactRadius: 6, contactY: 3, contactOpacity: 0.12)
    static let glow = GlassShadow(ambientRadius: 32, ambientY: 18, ambientOpacity: 0.45, contactRadius: 4, contactY: 2, contactOpacity: 0.10, glowsWithTint: true)
}

// MARK: - Modifier

/// The reusable glassmorphism modifier: blurred material + tint + inner
/// reflection + gradient rim light + layered floating shadow.
struct GlassSurfaceModifier<S: InsettableShape>: ViewModifier {
    let shape: S
    let style: GlassSurfaceStyle
    @Environment(\.colorScheme) private var colorScheme

    func body(content: Content) -> some View {
        content
            .background {
                glassBody
                    .compositingGroup()
                    .shadow(color: shadowColor.opacity(style.shadow.ambientOpacity), radius: style.shadow.ambientRadius, y: style.shadow.ambientY)
                    .shadow(color: .black.opacity(style.shadow.contactOpacity), radius: style.shadow.contactRadius, y: style.shadow.contactY)
            }
            .overlay {
                shape
                    .strokeBorder(rimGradient, lineWidth: style.borderWidth)
                    .allowsHitTesting(false)
            }
    }

    private var glassBody: some View {
        ZStack {
            shape.fill(style.material)

            if let tint = style.tint {
                shape.fill(
                    LinearGradient(
                        colors: [tint.opacity(style.tintOpacity), tint.opacity(style.tintOpacity * 0.45)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
            }

            if style.sheen {
                // Inner reflection: light enters from the upper-leading corner.
                shape.fill(
                    LinearGradient(
                        colors: [.white.opacity(isDark ? 0.16 : 0.38), .white.opacity(0)],
                        startPoint: .topLeading,
                        endPoint: UnitPoint(x: 0.6, y: 0.55)
                    )
                )
            }
        }
    }

    private var rimGradient: LinearGradient {
        LinearGradient(
            colors: [
                .white.opacity(isDark ? 0.55 : 0.85),
                .white.opacity(isDark ? 0.08 : 0.25),
                .white.opacity(isDark ? 0.04 : 0.15),
                (style.tint ?? .white).opacity(isDark ? 0.45 : 0.55),
            ],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }

    private var shadowColor: Color {
        if style.shadow.glowsWithTint, let tint = style.tint { return tint }
        return isDark ? .black : Theme.Palette.ember.opacity(0.55)
    }

    private var isDark: Bool { colorScheme == .dark }
}

extension View {
    /// Wraps the view in a rounded-rectangle glass pane.
    func glassSurface(_ style: GlassSurfaceStyle = .card) -> some View {
        modifier(GlassSurfaceModifier(
            shape: RoundedRectangle(cornerRadius: style.cornerRadius, style: .continuous),
            style: style
        ))
    }

    /// Wraps the view in glass of any insettable shape (`Capsule()`, `Circle()`, `TicketShape()`...).
    func glassSurface<S: InsettableShape>(_ style: GlassSurfaceStyle = .card, in shape: S) -> some View {
        modifier(GlassSurfaceModifier(shape: shape, style: style))
    }
}
