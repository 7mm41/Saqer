//
//  PrayerStore.swift
//  ثقافة إسلامية
//
//  مواقيت الصلاة حسب موقع المستخدم (تُحسب على الجهاز دون إنترنت)، وتنبيه الأذان:
//  - إشعار محلي عند كل أذان صوته الأذان نفسه (مقطع ٢٩٫٥ ث — حد iOS لأصوات الإشعارات ٣٠ ث)،
//    مجدول لأيام قادمة (حد iOS ٦٤ إشعارًا معلّقًا) ويُجدَّد كلما فُتح التطبيق.
//  - إن كان التطبيق مفتوحًا وقت الأذان يُرفع الأذان كاملًا داخله.
//  الموقع يُحفظ على الجهاز فقط لتبقى المواقيت متاحة دون إنترنت.
//

import Foundation
import Observation
import CoreLocation
import UserNotifications
import AVFoundation

@Observable
final class PrayerStore: NSObject, CLLocationManagerDelegate {
    enum AlertSound: String, CaseIterable, Identifiable {
        case adhan, system
        var id: String { rawValue }
        var title: String { L10n.t("prayer.sound.\(rawValue)") }
    }

    // MARK: Settings (محفوظة)

    private(set) var latitude: Double?
    private(set) var longitude: Double?
    /// أقرب مكان إلى موقع المستخدم (يُعرف دون إنترنت من قائمة الأماكن المدمجة).
    private(set) var place: NearestPlace?
    /// اسم المكان بلغة التطبيق: «عبري، الظاهرة».
    var placeName: String? { place?.display(arabicScript: L10n.language.isRightToLeft) }
    var method: PrayerMethod {
        didSet {
            if !applyingAutomaticMethod { methodIsManual = true }       // اختيار المستخدم يُحترم ولا يُستبدل تلقائيًا
            save(); refresh(); scheduleNotifications()
        }
    }
    /// اختار المستخدم طريقة الحساب بنفسه؛ وإلا تُختار تلقائيًا حسب البلد الذي هو فيه.
    private(set) var methodIsManual: Bool
    var asrSchool: AsrSchool { didSet { save(); refresh(); scheduleNotifications() } }
    var alertSound: AlertSound { didSet { save(); scheduleNotifications() } }
    /// تنبيه الأذان لكل صلاة.
    private(set) var alerts: Set<Prayer>

    // MARK: State

    private(set) var today: PrayerDay?
    private(set) var tomorrow: PrayerDay?
    private(set) var isLocating = false
    private(set) var locationDenied = false
    private(set) var notificationsDenied = false
    private(set) var isPlayingAdhan = false

    @ObservationIgnored private let defaults: UserDefaults
    @ObservationIgnored private let manager: CLLocationManager
    @ObservationIgnored private var player: AVAudioPlayer?
    @ObservationIgnored private var computedFor: Date?
    @ObservationIgnored private var applyingAutomaticMethod = false
    /// تحديث صامت للموقع عند فتح التطبيق (دون مؤشر انتظار).
    @ObservationIgnored private var silentUpdate = false
    @ObservationIgnored private var countryCode: String?

    static let notificationPrefix = "adhan."
    static let notificationCategory = "adhan"
    static let notificationSound = "adhan_notification.caf"
    /// أيام الجدولة مقدمًا (٥ أذانات × ١٢ يومًا = ٦٠ إشعارًا، مع تذكير الدرس اليومي ضمن حد iOS ٦٤).
    private static let daysAhead = 12

    private enum Keys {
        static let lat = "prayer.lat", lng = "prayer.lng", place = "prayer.place"
        static let method = "prayer.method", asr = "prayer.asr", sound = "prayer.sound", alerts = "prayer.alerts"
        static let manual = "prayer.methodManual", country = "prayer.country"
    }

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        let manager = CLLocationManager()
        self.manager = manager
        if defaults.object(forKey: Keys.lat) != nil {
            latitude = defaults.double(forKey: Keys.lat)
            longitude = defaults.double(forKey: Keys.lng)
        }
        place = defaults.data(forKey: Keys.place).flatMap { try? JSONDecoder().decode(NearestPlace.self, from: $0) }
        countryCode = defaults.string(forKey: Keys.country)
        methodIsManual = defaults.bool(forKey: Keys.manual)
        method = defaults.string(forKey: Keys.method).flatMap(PrayerMethod.init(rawValue:))
            ?? PrayerMethod.suggested(region: defaults.string(forKey: Keys.country) ?? Locale.current.region?.identifier)
        asrSchool = defaults.string(forKey: Keys.asr).flatMap(AsrSchool.init(rawValue:)) ?? .standard
        alertSound = defaults.string(forKey: Keys.sound).flatMap(AlertSound.init(rawValue:)) ?? .adhan
        if let saved = defaults.array(forKey: Keys.alerts) as? [String] {
            alerts = Set(saved.compactMap(Prayer.init(rawValue:)))
        } else {
            alerts = Set(Prayer.allCases.filter(\.hasAdhan))
        }
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyKilometer
        refresh()
    }

    var hasLocation: Bool { latitude != nil && longitude != nil }

    private func save() {
        defaults.set(method.rawValue, forKey: Keys.method)
        defaults.set(methodIsManual, forKey: Keys.manual)
        defaults.set(asrSchool.rawValue, forKey: Keys.asr)
        defaults.set(alertSound.rawValue, forKey: Keys.sound)
        defaults.set(alerts.map(\.rawValue), forKey: Keys.alerts)
    }

    // MARK: Times

    func day(for date: Date) -> PrayerDay? {
        guard let latitude, let longitude else { return nil }
        return PrayerCalculator.day(for: date, latitude: latitude, longitude: longitude, method: method, asr: asrSchool)
    }

    /// يعيد حساب مواقيت اليوم والغد (عند تغيّر اليوم أو الإعدادات أو الموقع).
    func refresh(now: Date = .now) {
        today = day(for: now)
        tomorrow = day(for: Calendar.current.date(byAdding: .day, value: 1, to: now) ?? now)
        computedFor = now
    }

    /// يتأكد أن مواقيت اليوم تخص تاريخ اليوم (بعد منتصف الليل مثلًا).
    func refreshIfNeeded(now: Date = .now) {
        if let computedFor, Calendar.current.isDate(computedFor, inSameDayAs: now) { return }
        refresh(now: now)
        scheduleNotifications()
    }

    /// الصلاة القادمة (قد تكون فجر الغد) — الشروق ليس صلاة.
    func next(after now: Date = .now) -> (prayer: Prayer, time: Date)? {
        let candidates = [today, tomorrow].compactMap { $0 }.flatMap { day in
            Prayer.allCases.filter(\.hasAdhan).compactMap { p in day.time(p).map { (p, $0) } }
        }
        return candidates.filter { $0.1 > now }.min { $0.1 < $1.1 }
    }

    /// الصلاة الحالية (آخر أذان مضى اليوم).
    func current(at now: Date = .now) -> (prayer: Prayer, time: Date)? {
        guard let today else { return nil }
        return Prayer.allCases.filter(\.hasAdhan).compactMap { p in today.time(p).map { (p, $0) } }
            .filter { $0.1 <= now }.max { $0.1 < $1.1 }
    }

    // MARK: Location

    /// يُستدعى عند فتح التطبيق: يحدّث الموقع بصمت إن كان الإذن ممنوحًا، فتتبع المواقيت المستخدم أينما سافر.
    func updateLocationIfAuthorized() {
        let status = manager.authorizationStatus
        guard status == .authorizedWhenInUse || status == .authorizedAlways, !isLocating else { return }
        silentUpdate = true
        manager.requestLocation()
    }

    /// يعيد طريقة الحساب إلى الاختيار التلقائي حسب البلد.
    func useAutomaticMethod() {
        methodIsManual = false
        applyAutomaticMethod()
        save()
    }

    private func applyAutomaticMethod() {
        guard !methodIsManual else { return }
        let suggested = PrayerMethod.suggested(region: countryCode ?? Locale.current.region?.identifier)
        guard suggested != method else { return }
        applyingAutomaticMethod = true
        method = suggested
        applyingAutomaticMethod = false
    }

    func locate() {
        switch manager.authorizationStatus {
        case .notDetermined:
            isLocating = true
            manager.requestWhenInUseAuthorization()
        case .denied, .restricted:
            locationDenied = true
        default:
            isLocating = true
            locationDenied = false
            manager.requestLocation()
        }
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        switch manager.authorizationStatus {
        case .authorizedWhenInUse, .authorizedAlways:
            locationDenied = false
            if isLocating || !hasLocation {
                isLocating = true
                manager.requestLocation()
            }
        case .denied, .restricted:
            locationDenied = true
            isLocating = false
        default:
            break
        }
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let location = locations.last else { return }
        let explicit = !silentUpdate
        silentUpdate = false
        isLocating = false
        // تحديث صامت: لا نغيّر شيئًا إن لم يبتعد المستخدم أكثر من ١ كم عن الموقع المحفوظ (فرق المواقيت فيه ثانيتان)
        if !explicit, let latitude, let longitude,
           location.distance(from: CLLocation(latitude: latitude, longitude: longitude)) < 1000 { return }
        if let latitude, let longitude,
           location.distance(from: CLLocation(latitude: latitude, longitude: longitude)) >= 1000 {
            place = nil                                      // مكان جديد: لا يبقى اسم المكان السابق
            defaults.removeObject(forKey: Keys.place)
        }
        latitude = location.coordinate.latitude
        longitude = location.coordinate.longitude
        defaults.set(latitude, forKey: Keys.lat)
        defaults.set(longitude, forKey: Keys.lng)
        refresh()
        if explicit { Task { await enableNotifications() } } else { scheduleNotifications() }
        // اسم المكان والبلد دون إنترنت: أقرب مكان مأهول من القائمة المدمجة
        let coordinate = location.coordinate
        Task.detached(priority: .utility) { [weak self] in
            let nearest = WorldPlaces.nearest(latitude: coordinate.latitude, longitude: coordinate.longitude)
            await MainActor.run {
                guard let self, let nearest else { return }
                self.place = nearest
                self.defaults.set(try? JSONEncoder().encode(nearest), forKey: Keys.place)
                // طريقة الحساب تتبع البلد الذي فيه المستخدم فعلًا (ما لم يخترها بنفسه)
                self.countryCode = nearest.country
                self.defaults.set(nearest.country, forKey: Keys.country)
                self.applyAutomaticMethod()
                self.scheduleNotifications()
            }
        }
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        isLocating = false
        silentUpdate = false
    }

    // MARK: Adhan alerts

    func isAlertOn(_ prayer: Prayer) -> Bool { alerts.contains(prayer) }

    func setAlert(_ prayer: Prayer, on: Bool) {
        if on { alerts.insert(prayer) } else { alerts.remove(prayer) }
        save()
        Task { await enableNotifications() }
    }

    /// يطلب إذن الإشعارات (مرة واحدة) ثم يجدول تنبيهات الأذان.
    @MainActor
    func enableNotifications() async {
        let center = UNUserNotificationCenter.current()
        let settings = await center.notificationSettings()
        if settings.authorizationStatus == .notDetermined {
            _ = try? await center.requestAuthorization(options: [.alert, .sound, .badge])
        }
        let status = await center.notificationSettings().authorizationStatus
        notificationsDenied = status == .denied
        scheduleNotifications()
    }

    /// يعيد جدولة إشعارات الأذان للأيام القادمة (تُستبدل السابقة كلها).
    func scheduleNotifications(now: Date = .now) {
        let center = UNUserNotificationCenter.current()
        let days = (0..<Self.daysAhead).compactMap { Calendar.current.date(byAdding: .day, value: $0, to: now) }.compactMap(day(for:))
        let enabled = alerts
        let sound = alertSound
        let place = placeName
        center.getPendingNotificationRequests { pending in
            let old = pending.map(\.identifier).filter { $0.hasPrefix(Self.notificationPrefix) }
            center.removePendingNotificationRequests(withIdentifiers: old)
            guard !enabled.isEmpty else { return }
            let stamp = DateFormatter()
            stamp.dateFormat = "yyyyMMdd"
            stamp.locale = Locale(identifier: "en_US_POSIX")
            for day in days {
                for prayer in Prayer.allCases where prayer.hasAdhan && enabled.contains(prayer) {
                    guard let time = day.time(prayer), time > now else { continue }
                    let content = UNMutableNotificationContent()
                    content.title = L10n.t("prayer.notification.title", prayer.title)
                    content.body = place.map { L10n.t("prayer.notification.bodyPlace", $0) } ?? L10n.t("prayer.notification.body")
                    content.sound = sound == .adhan
                        ? UNNotificationSound(named: UNNotificationSoundName(Self.notificationSound))
                        : .default
                    content.categoryIdentifier = Self.notificationCategory
                    content.userInfo = ["prayer": prayer.rawValue]
                    content.interruptionLevel = .timeSensitive
                    let parts = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute], from: time)
                    let trigger = UNCalendarNotificationTrigger(dateMatching: parts, repeats: false)
                    let id = Self.notificationPrefix + stamp.string(from: time) + "." + prayer.rawValue
                    center.add(UNNotificationRequest(identifier: id, content: content, trigger: trigger))
                }
            }
        }
    }

    // MARK: Full adhan (داخل التطبيق)

    func playAdhan() {
        guard let url = Bundle.main.url(forResource: "adhan_full", withExtension: "m4a") else { return }
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .default)
        try? AVAudioSession.sharedInstance().setActive(true)
        player = try? AVAudioPlayer(contentsOf: url)
        player?.delegate = self
        player?.play()
        isPlayingAdhan = player?.isPlaying ?? false
    }

    func stopAdhan() {
        player?.stop()
        player = nil
        isPlayingAdhan = false
    }

    func toggleAdhan() { isPlayingAdhan ? stopAdhan() : playAdhan() }
}

extension PrayerStore: AVAudioPlayerDelegate {
    func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        DispatchQueue.main.async { self.isPlayingAdhan = false }
    }
}

/// يعرض إشعار الأذان حتى والتطبيق مفتوح، ويرفع الأذان كاملًا داخله؛ والضغط على الإشعار يفتح شاشة المواقيت.
final class NotificationHandler: NSObject, UNUserNotificationCenterDelegate {
    static let shared = NotificationHandler()
    weak var prayers: PrayerStore?
    weak var router: AppRouter?

    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification,
                                withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        guard notification.request.content.categoryIdentifier == PrayerStore.notificationCategory else {
            completionHandler([.banner, .list, .sound])
            return
        }
        DispatchQueue.main.async {
            if self.prayers?.alertSound == .adhan {
                self.prayers?.playAdhan()
                completionHandler([.banner, .list])          // الأذان الكامل يُرفع داخل التطبيق
            } else {
                completionHandler([.banner, .list, .sound])
            }
        }
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse,
                                withCompletionHandler completionHandler: @escaping () -> Void) {
        if response.notification.request.content.categoryIdentifier == PrayerStore.notificationCategory {
            DispatchQueue.main.async { self.router?.showPrayerTimes = true }
        }
        completionHandler()
    }
}
