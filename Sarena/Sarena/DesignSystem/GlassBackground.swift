import SwiftUI

/// The living backdrop behind every screen: slow-drifting colour orbs under a
/// deep gradient. Glass only reads as glass when there is colour behind it.
struct GlassBackground: View {
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private struct Orb {
        let color: Color
        let size: CGFloat
        /// Anchor in unit coordinates.
        let anchor: UnitPoint
        /// Drift radius in points and speed in radians per second.
        let drift: CGFloat
        let speed: Double
        let phase: Double
    }

    var body: some View {
        GeometryReader { proxy in
            TimelineView(.animation(minimumInterval: 1.0 / 30.0, paused: reduceMotion)) { timeline in
                let time = timeline.date.timeIntervalSinceReferenceDate
                ZStack {
                    baseGradient
                    ForEach(Array(orbs.enumerated()), id: \.offset) { _, orb in
                        Circle()
                            .fill(orb.color)
                            .frame(width: orb.size, height: orb.size)
                            .blur(radius: orb.size * 0.32)
                            .position(position(of: orb, in: proxy.size, at: time))
                    }
                    // A faint top light so the upper edge of glass panes catches a highlight.
                    LinearGradient(colors: [.white.opacity(isDark ? 0.05 : 0.25), .clear], startPoint: .top, endPoint: .center)
                }
            }
        }
        .ignoresSafeArea()
        .accessibilityHidden(true)
    }

    private var isDark: Bool { colorScheme == .dark }

    private func position(of orb: Orb, in size: CGSize, at time: TimeInterval) -> CGPoint {
        let angle = time * orb.speed + orb.phase
        let dx = CGFloat(cos(angle)) * orb.drift
        let dy = CGFloat(sin(angle * 0.8)) * orb.drift
        return CGPoint(x: size.width * orb.anchor.x + dx, y: size.height * orb.anchor.y + dy)
    }

    private var baseGradient: LinearGradient {
        isDark
            ? LinearGradient(colors: [Color(hex: 0x241034), Theme.Palette.nightPlum, Color(hex: 0x07050C)], startPoint: .topLeading, endPoint: .bottomTrailing)
            : LinearGradient(colors: [Color(hex: 0xFFF8F1), Color(hex: 0xFFEBDB), Color(hex: 0xFFE1CC)], startPoint: .topLeading, endPoint: .bottomTrailing)
    }

    private var orbs: [Orb] {
        let strength = isDark ? 1.0 : 0.55
        return [
            Orb(color: Theme.Palette.orange.opacity(0.85 * strength), size: 360, anchor: UnitPoint(x: 0.12, y: 0.10), drift: 40, speed: 0.22, phase: 0),
            Orb(color: Theme.Palette.festivalPink.opacity(0.55 * strength), size: 380, anchor: UnitPoint(x: 0.95, y: 0.55), drift: 50, speed: 0.17, phase: 1.3),
            Orb(color: Theme.Palette.violet.opacity(0.50 * strength), size: 320, anchor: UnitPoint(x: 0.05, y: 0.92), drift: 45, speed: 0.19, phase: 2.6),
            Orb(color: Theme.Palette.gold.opacity(0.55 * strength), size: 220, anchor: UnitPoint(x: 0.85, y: 0.08), drift: 30, speed: 0.25, phase: 4.1),
        ]
    }
}

extension View {
    /// Places the animated Sarena backdrop behind a full screen.
    func sarenaScreenBackground() -> some View {
        background { GlassBackground() }
    }
}

#Preview {
    GlassBackground()
}
