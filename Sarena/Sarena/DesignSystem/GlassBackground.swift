import SwiftUI

/// The backdrop behind every screen: colour orbs under a deep gradient.
///
/// It ships as a pre-blurred image (`GlassBackdrop`, light + dark), so it costs
/// no blur or animation work at runtime. That matters: every translucent pane
/// drawn on top would otherwise be re-composited whenever the backdrop changed.
/// Regenerate it with `Branding/source/render.sh`.
struct GlassBackground: View {
    var body: some View {
        GeometryReader { proxy in
            Image("GlassBackdrop")
                .resizable()
                .scaledToFill()
                .frame(width: proxy.size.width, height: proxy.size.height)
                .clipped()
        }
        .ignoresSafeArea()
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}

extension View {
    /// Places the Sarena backdrop behind a full screen.
    func sarenaScreenBackground() -> some View {
        background { GlassBackground() }
    }
}

#Preview {
    GlassBackground()
}
