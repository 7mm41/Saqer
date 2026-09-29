import SwiftUI

// MARK: - Style

/// Describes one surface ("pane"). Presets cover the common surfaces; build
/// your own for special cases.
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
/// Calm by design: a solid card colour, a hairline edge and a very soft
/// neutral shadow, so neighbouring cards never bleed into each other. A live
/// `Material` blur is kept only for surfaces that float over moving content
/// (`.panel`, `.bar`, sheets).
struct GlassSurfaceStyle {
    /// Live blur behind the pane; `nil` = a solid card.
    var material: Material?
    /// Optional colour washed over the card (a soft orange, grey...).
    var tint: Color?
    var tintOpacity: Double = 0.12
    var cornerRadius: CGFloat = Theme.Radius.card
    var borderWidth: CGFloat = 1
    var shadow = GlassShadow.floating

    static let card = GlassSurfaceStyle()
    static let tile = GlassSurfaceStyle(cornerRadius: Theme.Radius.tile)
    static let field = GlassSurfaceStyle(cornerRadius: Theme.Radius.field, shadow: .none)
    static let chip = GlassSurfaceStyle(cornerRadius: Theme.Radius.chip, shadow: .none)
    static let flat = GlassSurfaceStyle(shadow: .none)
    /// Thin-material panel for forms.
    static let panel = GlassSurfaceStyle(material: .thinMaterial, cornerRadius: Theme.Radius.hero, shadow: .lifted)
    /// Ultra-thin-material bar that floats over scrolling content (e.g. "Book Now").
    static let bar = GlassSurfaceStyle(material: .ultraThinMaterial, cornerRadius: Theme.Radius.hero, shadow: .lifted)

    static func tinted(
        _ color: Color,
        opacity: Double = 0.12,
        cornerRadius: CGFloat = Theme.Radius.card,
        shadow: GlassShadow = .floating
    ) -> GlassSurfaceStyle {
        GlassSurfaceStyle(tint: color, tintOpacity: opacity, cornerRadius: cornerRadius, shadow: shadow)
    }
}

/// One soft, neutral shadow: just enough to lift a card off the background,
/// never enough to spill onto the next one.
struct GlassShadow {
    var radius: CGFloat
    var y: CGFloat
    var opacity: Double

    static let none = GlassShadow(radius: 0, y: 0, opacity: 0)
    static let subtle = GlassShadow(radius: 3, y: 1, opacity: 0.04)
    static let floating = GlassShadow(radius: 6, y: 2, opacity: 0.05)
    static let lifted = GlassShadow(radius: 14, y: 6, opacity: 0.10)
    /// Kept for existing call sites: the same quiet shadow as `.floating`.
    static let glow = floating
}

// MARK: - Modifier

/// The surface modifier: solid card (or material) + optional soft tint +
/// hairline edge + soft shadow.
struct GlassSurfaceModifier<S: InsettableShape>: ViewModifier {
    let shape: S
    let style: GlassSurfaceStyle
    @Environment(\.colorScheme) private var colorScheme

    func body(content: Content) -> some View {
        content
            .background {
                if style.shadow.opacity > 0 {
                    surface
                        .shadow(color: .black.opacity(isDark ? style.shadow.opacity * 3 : style.shadow.opacity),
                                radius: style.shadow.radius, y: style.shadow.y)
                } else {
                    surface
                }
            }
            .overlay {
                shape
                    .strokeBorder(isDark ? Color.white.opacity(0.08) : Color.black.opacity(0.06), lineWidth: style.borderWidth)
                    .allowsHitTesting(false)
            }
    }

    private var surface: some View {
        ZStack {
            if let material = style.material {
                shape.fill(material)
            } else {
                shape.fill(Theme.Palette.card)
            }
            if let tint = style.tint {
                shape.fill(tint.opacity(style.tintOpacity))
            }
        }
    }

    private var isDark: Bool { colorScheme == .dark }
}

extension View {
    /// Wraps the view in a rounded-rectangle card.
    func glassSurface(_ style: GlassSurfaceStyle = .card) -> some View {
        modifier(GlassSurfaceModifier(
            shape: RoundedRectangle(cornerRadius: style.cornerRadius, style: .continuous),
            style: style
        ))
    }

    /// Wraps the view in a surface of any insettable shape (`Capsule()`, `Circle()`, `TicketShape()`...).
    func glassSurface<S: InsettableShape>(_ style: GlassSurfaceStyle = .card, in shape: S) -> some View {
        modifier(GlassSurfaceModifier(shape: shape, style: style))
    }
}
