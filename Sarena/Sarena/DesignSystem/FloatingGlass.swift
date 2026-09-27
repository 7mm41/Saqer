import CoreMotion
import SwiftUI

// MARK: - Device motion

/// Publishes a smoothed device tilt so a few hero elements can drift and catch
/// the light as the phone moves.
///
/// Power rules (the motion sensor and the redraws it causes are not free):
/// * runs only while at least one `.parallax()` view is on screen (reference counted);
/// * runs only while `isAllowed` (the Settings toggle, Reduce Motion, app active);
/// * pauses automatically in Low Power Mode or when the device gets warm;
/// * samples at 20 Hz and ignores sub-pixel changes, so views aren't redrawn needlessly.
@Observable
@MainActor
final class MotionManager {
    /// Normalised tilt in `-1...1`.
    private(set) var pitch: Double = 0
    private(set) var roll: Double = 0
    /// True when heavy visual effects should pause (Low Power Mode or thermal pressure).
    private(set) var isThrottled = false

    private let manager = CMMotionManager()
    @ObservationIgnored private var isAllowed = true
    @ObservationIgnored private var reference: CMAttitude?
    @ObservationIgnored private var consumers = 0
    @ObservationIgnored private var observers: [NSObjectProtocol] = []

    init() {
        refreshThrottle()
        let center = NotificationCenter.default
        for name in [ProcessInfo.thermalStateDidChangeNotification, Notification.Name.NSProcessInfoPowerStateDidChange] {
            observers.append(center.addObserver(forName: name, object: nil, queue: .main) { [weak self] _ in
                MainActor.assumeIsolated { self?.refreshThrottle() }
            })
        }
    }

    /// Set by the root view from the Settings toggle, Reduce Motion and scene phase.
    func setAllowed(_ allowed: Bool) {
        guard allowed != isAllowed else { return }
        isAllowed = allowed
        updateRunningState()
    }

    /// Called by `.parallax()` views when they appear / disappear.
    func acquire() {
        consumers += 1
        updateRunningState()
    }

    func release() {
        consumers = max(consumers - 1, 0)
        updateRunningState()
    }

    private func refreshThrottle() {
        let info = ProcessInfo.processInfo
        let throttled = info.isLowPowerModeEnabled || info.thermalState == .serious || info.thermalState == .critical
        if throttled != isThrottled { isThrottled = throttled }
        updateRunningState()
    }

    private func updateRunningState() {
        let shouldRun = consumers > 0 && isAllowed && !isThrottled && manager.isDeviceMotionAvailable
        if shouldRun, !manager.isDeviceMotionActive {
            reference = nil
            manager.deviceMotionUpdateInterval = 1.0 / 20.0
            manager.startDeviceMotionUpdates(to: .main) { [weak self] motion, _ in
                guard let motion else { return }
                MainActor.assumeIsolated { self?.apply(motion) }
            }
        } else if !shouldRun, manager.isDeviceMotionActive {
            manager.stopDeviceMotionUpdates()
            if pitch != 0 || roll != 0 {
                pitch = 0
                roll = 0
            }
        }
    }

    private func apply(_ motion: CMDeviceMotion) {
        // Measure relative to how the user was holding the phone when motion started.
        guard let attitude = motion.attitude.copy() as? CMAttitude else { return }
        guard let reference else {
            reference = attitude
            return
        }
        attitude.multiply(byInverseOf: reference)
        let clamp = { (value: Double) in min(max(value / 0.6, -1), 1) }
        // Low-pass filter keeps the drift silky instead of jittery.
        let newPitch = pitch * 0.8 + clamp(attitude.pitch) * 0.2
        let newRoll = roll * 0.8 + clamp(attitude.roll) * 0.2
        // Skip invisible changes: every write redraws the views that read it.
        if abs(newPitch - pitch) > 0.004 { pitch = newPitch }
        if abs(newRoll - roll) > 0.004 { roll = newRoll }
    }
}

// MARK: - Parallax

/// 3D tilt that follows the device. Use it on **one or two hero elements per
/// screen**, and never on views that contain a `Material` (a moving backdrop blur
/// is expensive).
struct ParallaxModifier: ViewModifier {
    var tilt: Double
    var shift: CGFloat

    @Environment(MotionManager.self) private var motion: MotionManager?

    func body(content: Content) -> some View {
        let pitch = motion?.pitch ?? 0
        let roll = motion?.roll ?? 0

        content
            .rotation3DEffect(.degrees(pitch * tilt), axis: (x: 1, y: 0, z: 0), perspective: 0.55)
            .rotation3DEffect(.degrees(roll * tilt), axis: (x: 0, y: 1, z: 0), perspective: 0.55)
            .offset(x: roll * shift, y: pitch * shift)
            .onAppear { motion?.acquire() }
            .onDisappear { motion?.release() }
    }
}

// MARK: - Idle float

/// A gentle "breathing" float for lightweight artwork (the logo image).
/// Never apply it to glass panes: an endless animation keeps the GPU busy.
struct IdleFloatModifier: ViewModifier {
    var amplitude: CGFloat
    var period: Double

    @Environment(MotionManager.self) private var motion: MotionManager?
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    @ViewBuilder
    func body(content: Content) -> some View {
        if reduceMotion || motion?.isThrottled == true {
            content
        } else {
            content.phaseAnimator([false, true]) { view, lifted in
                view.offset(y: lifted ? -amplitude : amplitude)
            } animation: { _ in
                .easeInOut(duration: period)
            }
        }
    }
}

extension View {
    /// Device-motion parallax for hero elements (logo, discount medallion, member card).
    func parallax(tilt: Double = 8, shift: CGFloat = 5) -> some View {
        modifier(ParallaxModifier(tilt: tilt, shift: shift))
    }

    /// Idle floating motion for lightweight artwork only.
    func idleFloat(amplitude: CGFloat = 4, period: Double = 2.8) -> some View {
        modifier(IdleFloatModifier(amplitude: amplitude, period: period))
    }
}

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
