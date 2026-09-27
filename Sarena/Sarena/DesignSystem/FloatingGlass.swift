import CoreMotion
import SwiftUI

// MARK: - Device motion

/// Publishes a smoothed device tilt so glass panes can drift and catch the
/// light as the phone moves. One shared instance lives in the environment.
///
/// Device motion needs no user permission. Updates pause automatically when
/// the user turns the effect off, enables Reduce Motion, or Low Power Mode.
@Observable
@MainActor
final class MotionManager {
    /// Normalised tilt in `-1...1`.
    private(set) var pitch: Double = 0
    private(set) var roll: Double = 0

    private let manager = CMMotionManager()
    @ObservationIgnored private var reference: CMAttitude?

    func start() {
        guard manager.isDeviceMotionAvailable, !manager.isDeviceMotionActive else { return }
        reference = nil
        manager.deviceMotionUpdateInterval = 1.0 / 30.0
        manager.startDeviceMotionUpdates(to: .main) { [weak self] motion, _ in
            guard let motion else { return }
            MainActor.assumeIsolated { self?.apply(motion) }
        }
    }

    func stop() {
        manager.stopDeviceMotionUpdates()
        pitch = 0
        roll = 0
    }

    private func apply(_ motion: CMDeviceMotion) {
        // Measure relative to how the user was holding the phone when motion started.
        let attitude = motion.attitude.copy() as! CMAttitude
        if let reference {
            attitude.multiply(byInverseOf: reference)
        } else {
            reference = attitude.copy() as? CMAttitude
            return
        }
        let clamp = { (value: Double) in min(max(value / 0.6, -1), 1) }
        // Low-pass filter keeps the drift silky instead of jittery.
        pitch = pitch * 0.85 + clamp(attitude.pitch) * 0.15
        roll = roll * 0.85 + clamp(attitude.roll) * 0.15
    }
}

// MARK: - Floating modifier

/// Makes a glass pane feel physically suspended:
/// a slow idle "breathing" float plus a 3D parallax tilt driven by device motion.
struct FloatingGlassModifier: ViewModifier {
    var amplitude: CGFloat
    var tilt: Double
    var period: Double

    @Environment(MotionManager.self) private var motion: MotionManager?
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func body(content: Content) -> some View {
        let pitch = motion?.pitch ?? 0
        let roll = motion?.roll ?? 0

        content
            .rotation3DEffect(.degrees(pitch * tilt), axis: (x: 1, y: 0, z: 0), perspective: 0.55)
            .rotation3DEffect(.degrees(roll * tilt), axis: (x: 0, y: 1, z: 0), perspective: 0.55)
            .offset(x: roll * amplitude * 0.8, y: pitch * amplitude * 0.8)
            .phaseAnimator([false, true]) { view, lifted in
                view.offset(y: reduceMotion ? 0 : (lifted ? -amplitude : amplitude) * 0.5)
            } animation: { _ in
                .easeInOut(duration: period)
            }
    }
}

extension View {
    /// Idle float + motion parallax. Use larger values for hero elements, smaller for list rows.
    func floatingGlass(amplitude: CGFloat = 6, tilt: Double = 5, period: Double = 3.2) -> some View {
        modifier(FloatingGlassModifier(amplitude: amplitude, tilt: tilt, period: period))
    }
}

// MARK: - Press feedback for glass cards

/// Glass cards sink slightly and lose some shadow when pressed.
struct GlassPressButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.965 : 1)
            .brightness(configuration.isPressed ? -0.03 : 0)
            .animation(.spring(response: 0.28, dampingFraction: 0.7), value: configuration.isPressed)
    }
}

extension ButtonStyle where Self == GlassPressButtonStyle {
    static var glassPress: GlassPressButtonStyle { GlassPressButtonStyle() }
}
