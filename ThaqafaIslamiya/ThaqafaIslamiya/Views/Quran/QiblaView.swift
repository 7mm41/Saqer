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
            LiquidBackground(colors: aligned ? [.green, .mint] : [.teal, .indigo])
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
                    .frame(maxWidth: 340, maxHeight: 340)
                    .padding(.horizontal, 8)
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

    /// قرص زجاجي عائم: وردة إسلامية ثمانية في المركز، تدريج ودرجات تدور مع الجهاز، والكعبة على حافة القرص
    /// في اتجاهها الحقيقي، وقوس ذهبي يبيّن مقدار الدوران المتبقي، ومؤشر ثابت أعلى القرص يخضرّ عند المحاذاة.
    private func dial(bearing: Double) -> some View {
        GeometryReader { proxy in
            let side = min(proxy.size.width, proxy.size.height)
            let radius = side / 2
            let rotation = compass.hasCompass ? dialRotation : 0
            let accent: Color = aligned ? .green : gold[0]
            ZStack {
                // القرص الزجاجي
                Color.clear
                    .glassCircle(tint: aligned ? .green : .teal, interactive: false)
                    .shadow(color: accent.opacity(aligned ? 0.55 : 0.25), radius: aligned ? 30 : 22, y: 10)
                Circle()
                    .strokeBorder(AngularGradient(colors: [gold[0], .teal, gold[1], .teal, gold[0]], center: .center), lineWidth: 2)

                // الطبقة الدوّارة
                ZStack {
                    IslamicRosette()
                        .stroke(gold[0].opacity(0.35), lineWidth: 1)
                        .frame(width: side * 0.46, height: side * 0.46)
                    ForEach(0..<120, id: \.self) { i in
                        let major = i % 10 == 0
                        Capsule()
                            .fill(major ? Color.primary.opacity(0.9) : Color.primary.opacity(i % 5 == 0 ? 0.5 : 0.22))
                            .frame(width: major ? 2.5 : 1.2, height: major ? 14 : (i % 5 == 0 ? 9 : 5))
                            .offset(y: -radius + 12)
                            .rotationEffect(.degrees(Double(i) * 3))
                    }
                    ForEach(0..<12, id: \.self) { i in
                        let degrees = i * 30
                        Group {
                            if degrees % 90 == 0 {
                                Text(cardinal(degrees))
                                    .font(.system(size: side * 0.06, weight: .heavy, design: .rounded))
                                    .foregroundStyle(degrees == 0 ? Color.red : Color.primary)
                            } else {
                                Text(degrees.digits)
                                    .font(.system(size: side * 0.036, weight: .semibold, design: .rounded))
                                    .foregroundStyle(.secondary)
                            }
                        }
                        .rotationEffect(.degrees(-Double(degrees) - rotation))
                        .offset(y: -radius + side * 0.1)
                        .rotationEffect(.degrees(Double(degrees)))
                    }
                    // اتجاه القبلة
                    Capsule()
                        .fill(LinearGradient(colors: [gold[0].opacity(0), gold[0].opacity(0.9)], startPoint: .bottom, endPoint: .top))
                        .frame(width: 3, height: side * 0.2)
                        .offset(y: -side * 0.2)
                        .rotationEffect(.degrees(bearing))
                    KaabaGlyph(size: side * 0.12)
                        .shadow(color: gold[0].opacity(0.6), radius: aligned ? 14 : 6)
                        .rotationEffect(.degrees(-bearing - rotation))
                        .offset(y: -radius + side * 0.21)
                        .rotationEffect(.degrees(bearing))
                }
                .rotationEffect(.degrees(rotation))

                // قوس الدوران المتبقي (من أعلى القرص إلى القبلة)
                if let offset, compass.hasCompass, !aligned {
                    Circle()
                        .trim(from: 0, to: min(abs(offset), 180) / 360)
                        .stroke(LinearGradient(colors: [gold[0], .orange], startPoint: .top, endPoint: .bottom),
                                style: StrokeStyle(lineWidth: 5, lineCap: .round))
                        .rotationEffect(.degrees(-90))
                        .scaleEffect(x: offset < 0 ? -1 : 1)
                        .padding(side * 0.035)
                        .opacity(0.9)
                }

                // المؤشر الثابت أعلى القرص
                PointerTriangle()
                    .fill(aligned ? AnyShapeStyle(LinearGradient(colors: [.green, .mint], startPoint: .top, endPoint: .bottom))
                                  : AnyShapeStyle(LinearGradient(colors: [gold[0], gold[1]], startPoint: .top, endPoint: .bottom)))
                    .frame(width: side * 0.07, height: side * 0.06)
                    .shadow(color: accent.opacity(0.6), radius: 6)
                    .offset(y: -radius - side * 0.02)

                centerReadout(side: side)
            }
            .frame(width: side, height: side)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .scaleEffect(aligned ? 1.02 : 1)
        }
        .environment(\.layoutDirection, .leftToRight)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(L10n.t("qibla.bearing", Int(bearing.rounded()).digits))
    }

    /// مركز القرص: الزاوية المتبقية واتجاه الدوران، أو علامة المحاذاة.
    private func centerReadout(side: CGFloat) -> some View {
        ZStack {
            Color.clear
                .glassCircle(tint: aligned ? .green : .white, interactive: false)
            VStack(spacing: 2) {
                if aligned {
                    Image(systemName: "checkmark.seal.fill")
                        .font(.system(size: side * 0.1))
                        .foregroundStyle(LinearGradient(colors: [.green, .mint], startPoint: .top, endPoint: .bottom))
                        .symbolEffect(.bounce, value: aligned)
                } else if let offset, compass.hasCompass {
                    Text("\(Int(abs(offset).rounded()).digits)°")
                        .font(.system(size: side * 0.1, weight: .heavy, design: .rounded))
                        .contentTransition(.numericText())
                        .monospacedDigit()
                    Label(L10n.t(offset > 0 ? "qibla.turnRight" : "qibla.turnLeft"),
                          systemImage: offset > 0 ? "arrow.turn.up.right" : "arrow.turn.up.left")
                        .font(.system(size: side * 0.036, weight: .bold))
                        .foregroundStyle(gold[0])
                } else {
                    KaabaGlyph(size: side * 0.1)
                }
            }
        }
        .frame(width: side * 0.34, height: side * 0.34)
    }

    private func cardinal(_ degrees: Int) -> String {
        switch degrees {
        case 0: L10n.t("qibla.north")
        case 90: L10n.t("qibla.east")
        case 180: L10n.t("qibla.south")
        default: L10n.t("qibla.west")
        }
    }

    private func status(bearing: Double) -> some View {
        VStack(spacing: 12) {
            if !compass.hasCompass {
                Text(L10n.t("qibla.noCompass")).font(.subheadline.weight(.semibold))
            } else {
                Text(L10n.t(aligned ? "qibla.aligned" : "qibla.turn"))
                    .font(.headline)
                    .foregroundStyle(aligned ? Color.green : Color.primary)
                    .contentTransition(.opacity)
            }
            HStack(spacing: 10) {
                statPill(symbol: "safari.fill", text: L10n.t("qibla.bearing", Int(bearing.rounded()).digits))
                if let km = compass.distanceKm {
                    statPill(symbol: "location.fill", text: L10n.t("qibla.distance", Int(km.rounded()).digits))
                }
            }
            if compass.hasCompass, compass.headingAccuracy < 0 || compass.headingAccuracy > 25 {
                Label(L10n.t("qibla.calibrate"), systemImage: "infinity")
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(.orange)
            }
        }
        .multilineTextAlignment(.center)
        .padding(16)
        .frame(maxWidth: 420)
        .glassCard(cornerRadius: 28, tint: aligned ? .green : .teal, elevated: false)
    }

    private func statPill(symbol: String, text: String) -> some View {
        Label(text, systemImage: symbol)
            .font(.caption.weight(.semibold))
            .foregroundStyle(.secondary)
            .padding(.horizontal, 12)
            .padding(.vertical, 7)
            .glassCapsule(interactive: false)
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

/// مؤشر مثلث يشير إلى أسفل (أعلى القرص).
struct PointerTriangle: Shape {
    func path(in rect: CGRect) -> Path {
        var p = Path()
        p.move(to: CGPoint(x: rect.minX, y: rect.minY))
        p.addLine(to: CGPoint(x: rect.maxX, y: rect.minY))
        p.addLine(to: CGPoint(x: rect.midX, y: rect.maxY))
        p.closeSubpath()
        return p
    }
}

/// وردة إسلامية: نجمتان ثمانيتان متداخلتان ودائرتان.
struct IslamicRosette: Shape {
    func path(in rect: CGRect) -> Path {
        var p = Path()
        let c = CGPoint(x: rect.midX, y: rect.midY)
        p.addPath(Octagram().path(in: rect))
        let inner = rect.insetBy(dx: rect.width * 0.18, dy: rect.height * 0.18)
        let turn = CGAffineTransform(translationX: c.x, y: c.y).rotated(by: .pi / 8).translatedBy(x: -c.x, y: -c.y)
        p.addPath(Octagram().path(in: inner).applying(turn))
        p.addEllipse(in: rect.insetBy(dx: rect.width * 0.36, dy: rect.height * 0.36))
        p.addEllipse(in: rect.insetBy(dx: -rect.width * 0.04, dy: -rect.height * 0.04))
        return p
    }
}
