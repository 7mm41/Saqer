import SwiftUI

/// The floating 3D glass Sarena price tag (rendered artwork in `SarenaLogo`),
/// with an orange halo so it glows over the dark scene.
struct SarenaLogoView: View {
    var size: CGFloat = 120
    var floats = true

    var body: some View {
        let logo = Image("SarenaLogo")
            .resizable()
            .scaledToFit()
            .frame(width: size, height: size)
            .background {
                Circle()
                    .fill(Theme.Palette.orange.opacity(0.45))
                    .blur(radius: size * 0.35)
                    .scaleEffect(0.9)
            }
            .accessibilityLabel(Text("Sarena"))

        if floats {
            logo.floatingGlass(amplitude: size * 0.06, tilt: 10, period: 2.6)
        } else {
            logo
        }
    }
}

/// Logo + wordmark. The wordmark is localised ("Sarena" / "سرينا").
struct SarenaWordmark: View {
    var logoSize: CGFloat = 96

    var body: some View {
        VStack(spacing: Theme.Spacing.m) {
            SarenaLogoView(size: logoSize)
            Text("Sarena")
                .font(.system(size: logoSize * 0.38, weight: .black, design: .rounded))
                .tracking(2)
                .foregroundStyle(
                    LinearGradient(colors: [.primary, .primary.opacity(0.75)], startPoint: .top, endPoint: .bottom)
                )
        }
    }
}

/// A ticket silhouette with semicircular notches on both edges — used for
/// promo codes. Insettable, so it works with `glassSurface(in:)`.
struct TicketShape: InsettableShape {
    var cornerRadius: CGFloat = Theme.Radius.card
    var notchRadius: CGFloat = 13
    /// Vertical position of the notches as a fraction of the height.
    var notchPosition: CGFloat = 0.64
    private var insetAmount: CGFloat = 0

    init(cornerRadius: CGFloat = Theme.Radius.card, notchRadius: CGFloat = 13, notchPosition: CGFloat = 0.64) {
        self.cornerRadius = cornerRadius
        self.notchRadius = notchRadius
        self.notchPosition = notchPosition
    }

    func path(in rect: CGRect) -> Path {
        let frame = rect.insetBy(dx: insetAmount, dy: insetAmount)
        let radius = notchRadius + insetAmount
        let y = rect.minY + rect.height * notchPosition
        let body = Path(roundedRect: frame, cornerRadius: max(cornerRadius - insetAmount, 0), style: .continuous)
        let leading = Path(ellipseIn: CGRect(x: rect.minX - notchRadius - insetAmount, y: y - radius, width: radius * 2, height: radius * 2))
        let trailing = Path(ellipseIn: CGRect(x: rect.maxX - notchRadius - insetAmount, y: y - radius, width: radius * 2, height: radius * 2))
        return body.subtracting(leading).subtracting(trailing)
    }

    func inset(by amount: CGFloat) -> TicketShape {
        var shape = self
        shape.insetAmount += amount
        return shape
    }
}

/// Dashed perforation line drawn between the notches of a `TicketShape`.
struct Perforation: View {
    var body: some View {
        Line()
            .stroke(style: StrokeStyle(lineWidth: 1.2, dash: [5, 5]))
            .foregroundStyle(Color.secondary.opacity(0.5))
            .frame(height: 1)
            .accessibilityHidden(true)
    }

    private struct Line: Shape {
        func path(in rect: CGRect) -> Path {
            var path = Path()
            path.move(to: CGPoint(x: rect.minX, y: rect.midY))
            path.addLine(to: CGPoint(x: rect.maxX, y: rect.midY))
            return path
        }
    }
}

#Preview {
    ZStack {
        GlassBackground()
        VStack(spacing: 40) {
            SarenaWordmark()
            Text("SRN-7KQ4-M2XP")
                .font(.title3.monospaced().bold())
                .padding(40)
                .glassSurface(.card, in: TicketShape())
        }
    }
}
