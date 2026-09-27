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
///
/// Performance note: a `Material` is a live backdrop blur that re-renders
/// whenever anything behind it moves. The backdrop is already pre-blurred, so
/// content panes use *frosted* glass (translucent fill, sheen and rim) that looks
/// the same at a fraction of the GPU cost. Real `ultraThinMaterial` /
/// `thinMaterial` is reserved for surfaces that float over moving content
/// (`.panel`, `.bar`, sheets).
struct GlassSurfaceStyle {
    /// Live blur behind the pane; `nil` = frosted glass without a backdrop blur.
    var material: Material?
    /// Optional colour poured into the glass (orange glass, pink glass, ...).
    var tint: Color?
    var tintOpacity: Double = 0.28
    var cornerRadius: CGFloat = Theme.Radius.card
    var borderWidth: CGFloat = 1
    /// Adds the diagonal inner reflection on the upper-leading edge.
    var sheen = true
    var shadow = GlassShadow.floating

    static let card = GlassSurfaceStyle()
    static let tile = GlassSurfaceStyle(cornerRadius: Theme.Radius.tile)
    static let field = GlassSurfaceStyle(cornerRadius: Theme.Radius.field, shadow: .subtle)
    static let chip = GlassSurfaceStyle(cornerRadius: Theme.Radius.chip, sheen: false, shadow: .none)
    static let flat = GlassSurfaceStyle(sheen: false, shadow: .none)
    /// Thin-material panel for forms.
    static let panel = GlassSurfaceStyle(material: .thinMaterial, cornerRadius: Theme.Radius.hero, shadow: .lifted)
    /// Ultra-thin-material bar that floats over scrolling content (e.g. "Book Now").
    static let bar = GlassSurfaceStyle(material: .ultraThinMaterial, cornerRadius: Theme.Radius.hero, shadow: .lifted)

    static func tinted(
        _ color: Color,
        opacity: Double = 0.32,
        cornerRadius: CGFloat = Theme.Radius.card,
        shadow: GlassShadow = .glow
    ) -> GlassSurfaceStyle {
        GlassSurfaceStyle(tint: color, tintOpacity: opacity, cornerRadius: cornerRadius, shadow: shadow)
    }
}

/// A single soft shadow is what lifts the glass off the scene (optionally glowing
/// in the tint colour). One shadow instead of two halves the offscreen work.
struct GlassShadow {
    var radius: CGFloat
    var y: CGFloat
    var opacity: Double
    var glowsWithTint = false

    static let none = GlassShadow(radius: 0, y: 0, opacity: 0)
    static let subtle = GlassShadow(radius: 10, y: 5, opacity: 0.12)
    static let floating = GlassShadow(radius: 22, y: 14, opacity: 0.22)
    static let lifted = GlassShadow(radius: 32, y: 20, opacity: 0.28)
    static let glow = GlassShadow(radius: 24, y: 14, opacity: 0.45, glowsWithTint: true)
}

// MARK: - Modifier

/// The reusable glassmorphism modifier: glass body (material or frosted fill)
/// + tint + inner reflection + gradient rim light + floating shadow.
struct GlassSurfaceModifier<S: InsettableShape>: ViewModifier {
    let shape: S
    let style: GlassSurfaceStyle
    @Environment(\.colorScheme) private var colorScheme

    func body(content: Content) -> some View {
        content
            .background {
                if style.shadow.opacity > 0 {
                    glassBody
                        .compositingGroup()
                        .shadow(color: shadowColor.opacity(style.shadow.opacity), radius: style.shadow.radius, y: style.shadow.y)
                } else {
                    glassBody
                }
            }
            .overlay {
                shape
                    .strokeBorder(rimGradient, lineWidth: style.borderWidth)
                    .allowsHitTesting(false)
            }
    }

    private var glassBody: some View {
        ZStack {
            if let material = style.material {
                shape.fill(material)
            } else {
                shape.fill(.white.opacity(isDark ? 0.09 : 0.46))
            }

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
