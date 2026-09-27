//
//  QiblaView.swift
//  ثقافة إسلامية
//
//  بوصلة القبلة — تعمل دون إنترنت: الموقع من GPS والاتجاه من البوصلة المغناطيسية للجهاز،
//  ثم يُحسب اتجاه الكعبة المشرّفة بالدائرة العظمى. الموقع لا يغادر الجهاز.
//

import SwiftUI
import CoreLocation
import UIKit

// MARK: - Compass model

@Observable
final class QiblaCompass: NSObject, CLLocationManagerDelegate {
    /// اتجاه الجهاز بالدرجات من الشمال الحقيقي.
    private(set) var heading: Double?
    private(set) var headingAccuracy: Double = -1
    private(set) var location: CLLocation?
    private(set) var status: CLAuthorizationStatus

    @ObservationIgnored private let manager: CLLocationManager

    /// الكعبة المشرّفة.
    static let kaaba = CLLocation(latitude: 21.422487, longitude: 39.826206)

    override init() {
        let manager = CLLocationManager()
        self.manager = manager
        status = manager.authorizationStatus
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyHundredMeters
        manager.headingFilter = 0.5
        manager.headingOrientation = .portrait
    }

    var hasCompass: Bool { CLLocationManager.headingAvailable() }
    var isDenied: Bool { status == .denied || status == .restricted }

    /// اتجاه القبلة بالدرجات من الشمال.
    var bearing: Double? { location.map { Self.bearing(from: $0.coordinate) } }
    var distanceKm: Double? { location.map { $0.distance(from: Self.kaaba) / 1000 } }

    func start() {
        if status == .notDetermined {
            manager.requestWhenInUseAuthorization()
        }
        if let last = manager.location { location = last }
        manager.startUpdatingLocation()
        if hasCompass { manager.startUpdatingHeading() }
    }

    func stop() {
        manager.stopUpdatingLocation()
        manager.stopUpdatingHeading()
    }

    static func bearing(from c: CLLocationCoordinate2D) -> Double {
        let lat1 = c.latitude * .pi / 180
        let lat2 = kaaba.coordinate.latitude * .pi / 180
        let dLon = (kaaba.coordinate.longitude - c.longitude) * .pi / 180
        let y = sin(dLon) * cos(lat2)
        let x = cos(lat1) * sin(lat2) - sin(lat1) * cos(lat2) * cos(dLon)
        let degrees = atan2(y, x) * 180 / .pi
        return (degrees + 360).truncatingRemainder(dividingBy: 360)
    }

    // MARK: CLLocationManagerDelegate

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        status = manager.authorizationStatus
        if status == .authorizedWhenInUse || status == .authorizedAlways {
            manager.startUpdatingLocation()
            if hasCompass { manager.startUpdatingHeading() }
        }
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let last = locations.last else { return }
        location = last
        // دقة كافية للقبلة: نخفّف استهلاك البطارية بعد أول قراءة جيدة
        if last.horizontalAccuracy > 0, last.horizontalAccuracy < 1000 {
            manager.desiredAccuracy = kCLLocationAccuracyKilometer
        }
    }

    func locationManager(_ manager: CLLocationManager, didUpdateHeading newHeading: CLHeading) {
        heading = newHeading.trueHeading >= 0 ? newHeading.trueHeading : newHeading.magneticHeading
        headingAccuracy = newHeading.headingAccuracy
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {}

    func locationManagerShouldDisplayHeadingCalibration(_ manager: CLLocationManager) -> Bool { true }
}

// MARK: - View

struct QiblaView: View {
    @Environment(AppRouter.self) private var router
    @Environment(\.colorScheme) private var colorScheme
    @State private var compass = QiblaCompass()
    /// زاوية القرص تراكميًا (لتدور دائمًا بأقصر طريق عند عبور ٣٦٠°).
    @State private var dialRotation: Double = 0
    @State private var aligned = false

    private let gold = [Color(red: 0.86, green: 0.68, blue: 0.32), Color(red: 0.6, green: 0.42, blue: 0.16)]

    /// الفرق بين اتجاه الجهاز واتجاه القبلة (−١٨٠…١٨٠).
    private var offset: Double? {
        guard let bearing = compass.bearing, let heading = compass.heading else { return nil }
        var d = bearing - heading
        while d > 180 { d -= 360 }
        while d < -180 { d += 360 }
        return d
    }

    var body: some View {
        ZStack {
            LiquidBackground(colors: aligned ? [.green, .mint] : [.orange, .teal])
                .animation(.easeInOut(duration: 0.6), value: aligned)

            VStack(spacing: 22) {
                header
                Spacer(minLength: 0)
                content
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 10)
        }
        .onAppear { compass.start() }
        .onDisappear { compass.stop() }
        .onChange(of: compass.heading) { _, heading in
            guard let heading else { return }
            // القرص يدور عكس اتجاه الجهاز، بأقصر مسافة
            var target = -heading
            let delta = (target - dialRotation).truncatingRemainder(dividingBy: 360)
            let shortest = delta > 180 ? delta - 360 : (delta < -180 ? delta + 360 : delta)
            target = dialRotation + shortest
            withAnimation(.interpolatingSpring(stiffness: 120, damping: 18)) { dialRotation = target }
        }
        .onChange(of: offset.map { abs($0) < 3 } ?? false) { _, nowAligned in
            withAnimation(.spring(response: 0.35, dampingFraction: 0.7)) { aligned = nowAligned }
            if nowAligned { UINotificationFeedbackGenerator().notificationOccurred(.success) }
        }
    }

    private var header: some View {
        HStack {
            Button { router.showQibla = false } label: {
                Image(systemName: "xmark")
                    .font(.headline.weight(.bold))
                    .foregroundStyle(.primary)
                    .frame(width: 44, height: 44)
                    .glassCircle(interactive: false)
                    .contentShape(Circle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(L10n.t("common.close"))
            Spacer()
            VStack(spacing: 2) {
                Text(L10n.t("qibla.title")).font(.title3.weight(.heavy))
                Text(L10n.t("qibla.subtitle")).font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            Color.clear.frame(width: 44, height: 44)
        }
    }

    @ViewBuilder
    private var content: some View {
        if compass.isDenied {
            messageCard(symbol: "location.slash.fill", text: L10n.t("qibla.denied")) {
                Button {
                    if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) }
                } label: {
                    Text(L10n.t("qibla.openSettings"))
                        .font(.headline)
                        .padding(.horizontal, 22).padding(.vertical, 12)
                        .glassCapsule(tint: .orange)
                }
                .buttonStyle(.plain)
            }
        } else if let bearing = compass.bearing {
            VStack(spacing: 26) {
                dial(bearing: bearing)
                    .frame(maxWidth: 360, maxHeight: 360)
                    .aspectRatio(1, contentMode: .fit)
                status(bearing: bearing)
            }
        } else {
            messageCard(symbol: "location.circle", text: L10n.t("qibla.locating")) {
                ProgressView()
            }
        }
    }

    // MARK: Dial

    private func dial(bearing: Double) -> some View {
        GeometryReader { proxy in
            let side = min(proxy.size.width, proxy.size.height)
            let radius = side / 2
            ZStack {
                // القرص الدوّار: الشمال والتدريج والكعبة في اتجاهها الحقيقي
                ZStack {
                    Circle()
                        .fill(.ultraThinMaterial)
                        .overlay(Circle().strokeBorder(LinearGradient.diagonal(gold), lineWidth: 3))
                        .shadow(color: .black.opacity(0.15), radius: 20, y: 10)
                    ForEach(0..<72, id: \.self) { i in
                        Capsule()
                            .fill(i % 18 == 0 ? Color.primary : Color.secondary.opacity(i % 2 == 0 ? 0.7 : 0.35))
                            .frame(width: i % 18 == 0 ? 3 : 1.5, height: i % 18 == 0 ? 16 : (i % 2 == 0 ? 10 : 6))
                            .offset(y: -radius + 14)
                            .rotationEffect(.degrees(Double(i) * 5))
                    }
                    Text(L10n.t("qibla.north"))
                        .font(.headline.weight(.heavy))
                        .foregroundStyle(.red)
                        .rotationEffect(.degrees(-dialRotation))
                        .offset(y: -radius + 40)
                    // خط القبلة والكعبة
                    Capsule()
                        .fill(LinearGradient(colors: [gold[0].opacity(0), gold[0]], startPoint: .bottom, endPoint: .top))
                        .frame(width: 4, height: radius - 56)
                        .offset(y: -(radius - 56) / 2)
                        .rotationEffect(.degrees(bearing))
                    KaabaGlyph(size: side * 0.13)
                        .rotationEffect(.degrees(-bearing - dialRotation))
                        .offset(y: -radius + side * 0.16)
                        .rotationEffect(.degrees(bearing))
                }
                .rotationEffect(.degrees(compass.hasCompass ? dialRotation : 0))

                // مؤشر الجهاز الثابت (أعلى الشاشة)
                Image(systemName: "location.north.fill")
                    .font(.system(size: side * 0.14))
                    .foregroundStyle(aligned ? AnyShapeStyle(LinearGradient.diagonal([.green, .mint])) : AnyShapeStyle(Color.primary.opacity(0.8)))
                    .shadow(color: aligned ? .green.opacity(0.6) : .clear, radius: 14)
                    .scaleEffect(aligned ? 1.12 : 1)

                Circle()
                    .fill(aligned ? Color.green : Color.primary.opacity(0.6))
                    .frame(width: 10, height: 10)
            }
            .frame(width: side, height: side)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .environment(\.layoutDirection, .leftToRight)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(L10n.t("qibla.bearing", Int(bearing.rounded()).digits))
    }

    private func status(bearing: Double) -> some View {
        VStack(spacing: 10) {
            if !compass.hasCompass {
                Text(L10n.t("qibla.noCompass"))
            } else if aligned {
                Label(L10n.t("qibla.aligned"), systemImage: "checkmark.seal.fill")
                    .font(.headline)
                    .foregroundStyle(.green)
            } else {
                Text(L10n.t("qibla.turn")).font(.headline)
            }
            HStack(spacing: 10) {
                Label(L10n.t("qibla.bearing", Int(bearing.rounded()).digits), systemImage: "safari.fill")
                if let km = compass.distanceKm {
                    Label(L10n.t("qibla.distance", Int(km.rounded()).digits), systemImage: "point.topleft.down.to.point.bottomright.curvepath.fill")
                }
            }
            .font(.caption.weight(.semibold))
            .foregroundStyle(.secondary)
            if compass.hasCompass, compass.headingAccuracy < 0 || compass.headingAccuracy > 25 {
                Label(L10n.t("qibla.calibrate"), systemImage: "infinity")
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(.orange)
            }
        }
        .multilineTextAlignment(.center)
        .padding(16)
        .frame(maxWidth: 420)
        .glassCard(cornerRadius: 24, tint: aligned ? .green : .orange, elevated: false)
    }

    private func messageCard<Accessory: View>(symbol: String, text: String, @ViewBuilder accessory: () -> Accessory) -> some View {
        VStack(spacing: 16) {
            Image(systemName: symbol)
                .font(.system(size: 46))
                .foregroundStyle(LinearGradient.diagonal(gold))
            Text(text)
                .font(.subheadline)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
            accessory()
        }
        .padding(24)
        .frame(maxWidth: 420)
        .glassCard(cornerRadius: 28, tint: .orange, elevated: false)
    }
}

/// رسم مبسّط للكعبة المشرّفة: مكعب أسود بحزام ذهبي.
struct KaabaGlyph: View {
    let size: CGFloat

    var body: some View {
        ZStack(alignment: .top) {
            RoundedRectangle(cornerRadius: size * 0.12, style: .continuous)
                .fill(LinearGradient(colors: [Color(white: 0.2), Color(white: 0.05)], startPoint: .top, endPoint: .bottom))
            Rectangle()
                .fill(LinearGradient(colors: [Color(red: 0.95, green: 0.8, blue: 0.42), Color(red: 0.7, green: 0.5, blue: 0.2)],
                                     startPoint: .leading, endPoint: .trailing))
                .frame(height: size * 0.13)
                .padding(.top, size * 0.22)
        }
        .frame(width: size, height: size)
        .clipShape(RoundedRectangle(cornerRadius: size * 0.12, style: .continuous))
        .shadow(color: .black.opacity(0.35), radius: 6, y: 3)
    }
}
