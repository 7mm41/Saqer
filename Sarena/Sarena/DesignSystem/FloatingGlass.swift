import SwiftUI

// MARK: - Press feedback for glass cards

/// Glass cards sink slightly when pressed.
struct GlassPressButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.965 : 1)
            .opacity(configuration.isPressed ? 0.9 : 1)
            .animation(.spring(response: 0.28, dampingFraction: 0.7), value: configuration.isPressed)
    }
}

extension ButtonStyle where Self == GlassPressButtonStyle {
    static var glassPress: GlassPressButtonStyle { GlassPressButtonStyle() }
}
