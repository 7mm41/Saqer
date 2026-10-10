//
//  PrayerTimeline.swift
//  ثقافة إسلامية — الأداة
//
//  جدول الأداة: مدخل عند كل أذان (يعرض «مضى على الأذان» نصف ساعة)، ومدخل بعدها يعدّ تنازليًا للصلاة القادمة.
//  المواقيت تُحسب بنفس حساب التطبيق تمامًا (جداول وزارة الأوقاف لعُمان، وطرق الحساب لغيرها) من موقع المستخدم
//  وطريقته اللذين يشاركهما التطبيق؛ فإن لم تتوفر المشاركة تحدد الأداة الموقع بنفسها.
//

import WidgetKit
import CoreLocation

struct PrayerMoment: Hashable {
    let prayer: Prayer
    let time: Date
}

struct PrayerEntry: TimelineEntry {
    let date: Date
    let language: AppLanguage
    let place: String?
    /// `nil` قبل أن يُعرف الموقع (تطلب الأداة فتح التطبيق).
    let status: Status?

    struct Status {
        let next: PrayerMoment
        /// آخر أذان مضى (للعدّ التصاعدي بعد الأذان).
        let previous: PrayerMoment?
        /// خلال نصف الساعة التي تلي الأذان: «مضى على الأذان ١٢:٣٤».
        let showsElapsed: Bool
        /// صلوات اليوم الذي فيه الصلاة القادمة (بعد العشاء: صلوات الغد).
        let day: [PrayerMoment]
    }

    /// معاينة معرض الأدوات.
    static func sample(language: AppLanguage) -> PrayerEntry {
        let now = Date()
        let start = Calendar.current.startOfDay(for: now)
        let hours: [(Prayer, Double)] = [(.fajr, 4.7), (.dhuhr, 12.1), (.asr, 15.45), (.maghrib, 18.05), (.isha, 19.25)]
        let day = hours.map { PrayerMoment(prayer: $0.0, time: start.addingTimeInterval($0.1 * 3600)) }
        let next = day.first { $0.time > now } ?? PrayerMoment(prayer: .fajr, time: start.addingTimeInterval(28.7 * 3600))
        return PrayerEntry(date: now, language: language, place: nil,
                           status: Status(next: next, previous: nil, showsElapsed: false, day: day))
    }
}

/// ما تُحسب به المواقيت.
struct WidgetPrayerConfig {
    let latitude: Double
    let longitude: Double
    let method: PrayerMethod
    let asr: AsrSchool
    let place: String?
    let language: AppLanguage

    /// من التطبيق (مطابق لإعدادات المستخدم)، وإلا من موقع تحدده الأداة وطريقة بلد الجهاز.
    static func resolve(_ completion: @escaping (WidgetPrayerConfig?) -> Void) {
        if let shared = PrayerSnapshot.load() {
            completion(WidgetPrayerConfig(latitude: shared.latitude, longitude: shared.longitude, method: shared.method,
                                          asr: shared.asr, place: shared.placeName, language: shared.language))
            return
        }
        WidgetLocator.shared.locate { location in
            guard let location else { completion(nil); return }
            completion(WidgetPrayerConfig(latitude: location.coordinate.latitude, longitude: location.coordinate.longitude,
                                          method: .suggested(region: Locale.current.region?.identifier), asr: .standard,
                                          place: nil, language: .deviceDefault))
        }
    }
}

enum PrayerTimeline {
    /// مدة عرض «مضى على الأذان» بعد كل أذان.
    static let elapsedWindow: TimeInterval = 30 * 60

    static func entries(_ config: WidgetPrayerConfig, from now: Date, horizon: TimeInterval = 36 * 3600) -> [PrayerEntry] {
        let calendar = Calendar.current
        let days = (-1...2).compactMap { calendar.date(byAdding: .day, value: $0, to: now) }.map {
            PrayerCalculator.day(for: $0, latitude: config.latitude, longitude: config.longitude,
                                 method: config.method, asr: config.asr)
        }
        let adhans = days.flatMap { day in
            Prayer.allCases.filter(\.hasAdhan).compactMap { p in day.time(p).map { PrayerMoment(prayer: p, time: $0) } }
        }.sorted { $0.time < $1.time }

        // لحظات تغيّر العرض: الآن، وكل أذان، ونهاية «مضى على الأذان» بعده
        var points: Set<Date> = [now]
        for adhan in adhans {
            for point in [adhan.time, adhan.time.addingTimeInterval(elapsedWindow)]
            where point > now && point < now.addingTimeInterval(horizon) {
                points.insert(point)
            }
        }
        return points.sorted().map { entry(at: $0, adhans: adhans, config: config) }
    }

    private static func entry(at date: Date, adhans: [PrayerMoment], config: WidgetPrayerConfig) -> PrayerEntry {
        guard let next = adhans.first(where: { $0.time > date }) else {
            return PrayerEntry(date: date, language: config.language, place: config.place, status: nil)
        }
        let previous = adhans.last { $0.time <= date }
        let showsElapsed = previous.map { date.timeIntervalSince($0.time) < elapsedWindow } ?? false
        let day = adhans.filter { Calendar.current.isDate($0.time, inSameDayAs: next.time) }
        return PrayerEntry(date: date, language: config.language, place: config.place,
                           status: .init(next: next, previous: previous, showsElapsed: showsElapsed, day: day))
    }
}

struct PrayerProvider: TimelineProvider {
    private var galleryLanguage: AppLanguage { PrayerSnapshot.load()?.language ?? .deviceDefault }

    func placeholder(in context: Context) -> PrayerEntry { .sample(language: galleryLanguage) }

    func getSnapshot(in context: Context, completion: @escaping (PrayerEntry) -> Void) {
        WidgetPrayerConfig.resolve { config in
            guard let config else { completion(.sample(language: galleryLanguage)); return }
            completion(PrayerTimeline.entries(config, from: .now).first ?? .sample(language: config.language))
        }
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<PrayerEntry>) -> Void) {
        WidgetPrayerConfig.resolve { config in
            let now = Date()
            guard let config else {
                let empty = PrayerEntry(date: now, language: galleryLanguage, place: nil, status: nil)
                completion(Timeline(entries: [empty], policy: .after(now.addingTimeInterval(30 * 60))))
                return
            }
            // المدخلات تغطي ٣٦ ساعة؛ يُعاد الحساب كل بضع ساعات (لتغيّر الموقع أو اليوم)
            completion(Timeline(entries: PrayerTimeline.entries(config, from: now),
                                policy: .after(now.addingTimeInterval(4 * 3600))))
        }
    }
}

/// موقع الأداة نفسها (حين لا يشارك التطبيق موقعه): آخر موقع معروف، أو طلب جديد بإذن «أثناء استخدام التطبيق أو أدواته».
final class WidgetLocator: NSObject, CLLocationManagerDelegate {
    static let shared = WidgetLocator()

    private var manager: CLLocationManager?
    private var waiting: [(CLLocation?) -> Void] = []
    private let defaults = UserDefaults.standard
    private enum Keys { static let lat = "widget.lat", lng = "widget.lng" }

    private var saved: CLLocation? {
        guard defaults.object(forKey: Keys.lat) != nil else { return nil }
        return CLLocation(latitude: defaults.double(forKey: Keys.lat), longitude: defaults.double(forKey: Keys.lng))
    }

    /// تُستدعى الإجابة مرة واحدة: موقع حديث، أو المحفوظ، أو `nil`.
    func locate(_ completion: @escaping (CLLocation?) -> Void) {
        DispatchQueue.main.async { [self] in
            // مدير الموقع يُنشأ على الخيط الرئيسي ليصله الرد
            let manager = self.manager ?? {
                let m = CLLocationManager()
                m.delegate = self
                m.desiredAccuracy = kCLLocationAccuracyKilometer
                self.manager = m
                return m
            }()
            if let recent = manager.location, recent.timestamp.timeIntervalSinceNow > -30 * 60 {
                store(recent)
                completion(recent)
                return
            }
            guard manager.isAuthorizedForWidgetUpdates else {
                completion(manager.location ?? saved)
                return
            }
            waiting.append(completion)
            guard waiting.count == 1 else { return }
            manager.requestLocation()
            DispatchQueue.main.asyncAfter(deadline: .now() + 10) { [self] in finish(nil) }
        }
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        DispatchQueue.main.async { [self] in finish(locations.last) }
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        DispatchQueue.main.async { [self] in finish(nil) }
    }

    private func finish(_ location: CLLocation?) {
        guard !waiting.isEmpty else { return }
        if let location { store(location) }
        let result = location ?? manager?.location ?? saved
        let callbacks = waiting
        waiting.removeAll()
        callbacks.forEach { $0(result) }
    }

    private func store(_ location: CLLocation) {
        defaults.set(location.coordinate.latitude, forKey: Keys.lat)
        defaults.set(location.coordinate.longitude, forKey: Keys.lng)
    }
}
