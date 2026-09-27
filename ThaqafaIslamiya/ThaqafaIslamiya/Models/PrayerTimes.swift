//
//  PrayerTimes.swift
//  ثقافة إسلامية
//
//  حساب مواقيت الصلاة على الجهاز دون إنترنت: موضع الشمس (الميل ومعادلة الزمن) ثم زوايا الفجر والعشاء
//  وظل العصر حسب طريقة الحساب المختارة. طابق التحقق مواقيت api.aladhan.com بالدقيقة في ١٢ مدينة
//  (الفجر والشروق والظهر والمغرب والعشاء)، والعصر فلكيًا مطابق لمعادلات NOAA (aladhan يضيف دقيقة أو دقيقتين احتياطًا).
//

import Foundation

enum Prayer: String, CaseIterable, Identifiable, Codable {
    case fajr, sunrise, dhuhr, asr, maghrib, isha
    var id: String { rawValue }
    var title: String { L10n.t("prayer.\(rawValue)") }
    /// الصلوات التي يُؤذَّن لها (الشروق ليس صلاة).
    var hasAdhan: Bool { self != .sunrise }
    var symbol: String {
        switch self {
        case .fajr: "sun.haze.fill"
        case .sunrise: "sunrise.fill"
        case .dhuhr: "sun.max.fill"
        case .asr: "sun.min.fill"
        case .maghrib: "sunset.fill"
        case .isha: "moon.stars.fill"
        }
    }
}

/// طرق الحساب المعتمدة (زاوية الفجر، والعشاء زاوية أو دقائق بعد المغرب).
enum PrayerMethod: String, CaseIterable, Identifiable, Codable {
    case oman, ummAlQura, muslimWorldLeague, egypt, karachi, northAmerica, kuwait, qatar, dubai, gulf, turkey, tehran
    var id: String { rawValue }
    var title: String { L10n.t("prayer.method.\(rawValue)") }

    var fajrAngle: Double {
        switch self {
        case .ummAlQura: 18.5
        case .oman, .muslimWorldLeague, .karachi, .kuwait, .qatar, .turkey: 18
        case .egypt, .gulf: 19.5
        case .northAmerica: 15
        case .dubai: 18.2
        case .tehran: 17.7
        }
    }

    enum Isha { case angle(Double), minutes(Double) }

    var isha: Isha {
        switch self {
        case .ummAlQura, .qatar, .gulf: .minutes(90)
        case .muslimWorldLeague, .turkey: .angle(17)
        case .egypt: .angle(17.5)
        case .oman, .karachi: .angle(18)
        case .northAmerica: .angle(15)
        case .kuwait: .angle(17.5)
        case .dubai: .angle(18.2)
        case .tehran: .angle(14)
        }
    }

    /// المغرب بزاوية تحت الأفق (طهران ٤٫٥°) بدل الغروب.
    var maghribAngle: Double? { self == .tehran ? 4.5 : nil }

    /// تعديلات رسمية بالدقائق (احتياط).
    var offsets: [Prayer: Double] {
        switch self {
        case .dubai: [.dhuhr: 3, .maghrib: 3]
        // وزارة الأوقاف والشؤون الدينية بسلطنة عُمان — مستخرجة من تقويمها الرسمي لستة جداول (حبروت والمعمورة
        // في فبراير، والمعمورة والمضيبي والقابل في مايو، ومسقط في سبتمبر ٢٠٢٦ — ١٠٣٨ وقتًا):
        // الفجر والعشاء ١٨° دون إضافة، واحتياط ٥ دقائق للظهر والعصر والمغرب، والتقريب للدقيقة التالية.
        // النتيجة: كل الأوقات ضمن دقيقة واحدة من الجدول الرسمي، و٩١٪ منها مطابقة تمامًا.
        case .oman: [.dhuhr: 5, .asr: 5, .maghrib: 5]
        default: [:]
        }
    }

    /// التقريب للدقيقة التالية بدل الأقرب (احتياطًا، كما في التقويم العُماني).
    var roundsUp: Bool { self == .oman }

    /// طريقة مناسبة لبلد الجهاز (يمكن تغييرها من شاشة المواقيت).
    static func suggested(region: String?) -> PrayerMethod {
        switch region?.uppercased() {
        case "OM": .oman
        case "SA", "YE": .ummAlQura
        case "EG", "SD", "LY", "SY", "LB", "JO", "IQ", "PS": .egypt
        case "PK", "IN", "BD", "AF": .karachi
        case "US", "CA": .northAmerica
        case "KW": .kuwait
        case "QA": .qatar
        case "AE": .dubai
        case "BH": .gulf
        case "TR": .turkey
        case "IR": .tehran
        default: .muslimWorldLeague
        }
    }
}

/// مذهب العصر: الجمهور (ظل المثل) أو الحنفي (ظل المثلين).
enum AsrSchool: String, CaseIterable, Identifiable, Codable {
    case standard, hanafi
    var id: String { rawValue }
    var title: String { L10n.t("prayer.asr.\(rawValue)") }
    var shadowFactor: Double { self == .standard ? 1 : 2 }
}

struct PrayerDay: Equatable {
    let date: Date
    let times: [Prayer: Date]
    func time(_ prayer: Prayer) -> Date? { times[prayer] }
}

enum PrayerCalculator {
    /// مواقيت يوم (بتوقيت المنطقة المعطاة، متضمنًا التوقيت الصيفي).
    static func day(for date: Date, latitude lat: Double, longitude lng: Double, timeZone: TimeZone = .current,
                    method: PrayerMethod, asr: AsrSchool) -> PrayerDay {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        let parts = calendar.dateComponents([.year, .month, .day], from: date)
        let (y, m, d) = (parts.year ?? 2000, parts.month ?? 1, parts.day ?? 1)
        let noonDate = calendar.date(from: DateComponents(year: y, month: m, day: d, hour: 12)) ?? date
        let tz = Double(timeZone.secondsFromGMT(for: noonDate)) / 3600
        let midnight = calendar.startOfDay(for: noonDate)

        // سلطنة عُمان: الجدول الرسمي لأقرب مكان مرجعي من وزارة الأوقاف، مُعدَّلًا بفرق موقع المستخدم الفعلي عنه
        if method == .oman, asr == .standard,
           let official = OmanMinistry.times(year: y, month: m, day: d, latitude: lat, longitude: lng,
                                             raw: { la, lo in rawHours(y, m, d, la, lo, 4, noonDate, method, asr) }) {
            let muscat = TimeZone(identifier: "Asia/Muscat") ?? timeZone
            var omanCalendar = Calendar(identifier: .gregorian)
            omanCalendar.timeZone = muscat
            let omanMidnight = omanCalendar.date(from: DateComponents(year: y, month: m, day: d)) ?? midnight
            var times: [Prayer: Date] = [:]
            for (prayer, minutes) in official { times[prayer] = omanMidnight.addingTimeInterval(minutes.rounded() * 60) }
            return PrayerDay(date: midnight, times: times)
        }

        var t = rawHours(y, m, d, lat, lng, tz, noonDate, method, asr)
        for (prayer, minutes) in method.offsets { t[prayer] = (t[prayer] ?? .nan) + minutes / 60 }

        var times: [Prayer: Date] = [:]
        for (prayer, hours) in t where hours.isFinite {
            // تقريب لأقرب دقيقة (أو للدقيقة التالية حسب الطريقة)
            let minutes = hours * 60
            let seconds = (method.roundsUp ? minutes.rounded(.up) : minutes.rounded()) * 60
            times[prayer] = midnight.addingTimeInterval(seconds)
        }
        return PrayerDay(date: midnight, times: times)
    }

    /// الأوقات الفلكية بالساعات المحلية (قبل دقائق الاحتياط والتقريب).
    static func rawHours(_ y: Int, _ m: Int, _ d: Int, _ lat: Double, _ lng: Double, _ tz: Double, _ noonDate: Date,
                         _ method: PrayerMethod, _ asr: AsrSchool) -> [Prayer: Double] {
        let jd = julian(y, m, d) - lng / (15 * 24)

        func mid(_ t: Double) -> Double { fixHour(12 - sun(jd + t).eqt) }
        func angleTime(_ angle: Double, _ t: Double, ccw: Bool = false) -> Double {
            let decl = sun(jd + t).decl
            let noon = mid(t)
            let cosT = (-dsin(angle) - dsin(decl) * dsin(lat)) / (dcos(decl) * dcos(lat))
            guard (-1...1).contains(cosT) else { return .nan }         // لا تبلغ الشمس الزاوية (عروض عليا)
            let hours = darccos(cosT) / 15
            return noon + (ccw ? -hours : hours)
        }
        func asrTime(_ factor: Double, _ t: Double) -> Double {
            let decl = sun(jd + t).decl
            let angle = -darccot(factor + dtan(abs(lat - decl)))
            return angleTime(angle, t)
        }

        var t: [Prayer: Double] = [:]
        t[.fajr] = angleTime(method.fajrAngle, 5 / 24, ccw: true)
        t[.sunrise] = angleTime(0.833, 6 / 24, ccw: true)
        t[.dhuhr] = mid(12 / 24)
        t[.asr] = asrTime(asr.shadowFactor, 13 / 24)
        let sunset = angleTime(0.833, 18 / 24)
        t[.maghrib] = method.maghribAngle.map { angleTime($0, 18 / 24) } ?? sunset
        switch method.isha {
        case .angle(let a): t[.isha] = angleTime(a, 18 / 24)
        case .minutes(var minutes):
            // أم القرى: العشاء بعد المغرب بساعتين في رمضان
            if method == .ummAlQura, Calendar(identifier: .islamicUmmAlQura).component(.month, from: noonDate) == 9 {
                minutes = 120
            }
            t[.isha] = (t[.maghrib] ?? sunset) + minutes / 60
        }
        for key in t.keys { t[key] = (t[key] ?? .nan) + tz - lng / 15 }

        // العروض العليا: إن لم تبلغ الشمس زاوية الفجر أو العشاء، يُقدَّر الوقت بنسبة الزاوية من الليل
        let sunsetLocal = sunset + tz - lng / 15
        if let rise = t[.sunrise], rise.isFinite, sunsetLocal.isFinite {
            let night = fixHour(rise + 24 - sunsetLocal)
            let fajrPortion = method.fajrAngle / 60 * night
            if let f = t[.fajr], !f.isFinite || fixHour(rise - f) > fajrPortion { t[.fajr] = rise - fajrPortion }
            if case .angle(let a) = method.isha, let maghrib = t[.maghrib] {
                let ishaPortion = a / 60 * night
                if let i = t[.isha], !i.isFinite || fixHour(i - maghrib) > ishaPortion { t[.isha] = maghrib + ishaPortion }
            }
        }
        return t
    }

    // MARK: Astronomy

    private static func sun(_ jd: Double) -> (decl: Double, eqt: Double) {
        let d = jd - 2451545.0
        let g = fixAngle(357.529 + 0.98560028 * d)
        let q = fixAngle(280.459 + 0.98564736 * d)
        let l = fixAngle(q + 1.915 * dsin(g) + 0.020 * dsin(2 * g))
        let e = 23.439 - 0.00000036 * d
        let ra = darctan2(dcos(e) * dsin(l), dcos(l)) / 15
        return (darcsin(dsin(e) * dsin(l)), q / 15 - fixHour(ra))
    }

    private static func julian(_ year: Int, _ month: Int, _ day: Int) -> Double {
        var y = Double(year), m = Double(month)
        if m <= 2 { y -= 1; m += 12 }
        let a = (y / 100).rounded(.down)
        let b = 2 - a + (a / 4).rounded(.down)
        return (365.25 * (y + 4716)).rounded(.down) + (30.6001 * (m + 1)).rounded(.down) + Double(day) + b - 1524.5
    }

    private static let d2r = Double.pi / 180
    private static func dsin(_ x: Double) -> Double { sin(x * d2r) }
    private static func dcos(_ x: Double) -> Double { cos(x * d2r) }
    private static func dtan(_ x: Double) -> Double { tan(x * d2r) }
    private static func darcsin(_ x: Double) -> Double { asin(x) / d2r }
    private static func darccos(_ x: Double) -> Double { acos(x) / d2r }
    private static func darctan2(_ y: Double, _ x: Double) -> Double { atan2(y, x) / d2r }
    private static func darccot(_ x: Double) -> Double { atan(1 / x) / d2r }
    private static func fixAngle(_ a: Double) -> Double { a - 360 * (a / 360).rounded(.down) }
    private static func fixHour(_ h: Double) -> Double { h - 24 * (h / 24).rounded(.down) }
}
