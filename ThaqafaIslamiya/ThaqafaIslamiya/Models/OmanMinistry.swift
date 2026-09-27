//
//  OmanMinistry.swift
//  ثقافة إسلامية
//
//  مواقيت الصلاة الرسمية لوزارة الأوقاف والشؤون الدينية بسلطنة عُمان (mara.gov.om) مدمجة في التطبيق:
//  ٨٦ مكانًا مرجعيًا تنشر الوزارة مواقيتها، لكل يوم من ٢٠٢٦ إلى ٢٠٣١، دون إنترنت.
//
//  لموقع المستخدم: يُؤخذ الوقت الرسمي لأقرب مكان مرجعي، ثم يُضاف إليه فرق الوقت الفلكي بين موقع المستخدم
//  الفعلي وذلك المكان — فيطابق الجدول الرسمي تمامًا عند المكان المرجعي، ويختلف بدقة بين بوشر والمعبيلة وبركاء
//  وكل قرية حسب موقعها. خارج مدى الجداول يُستخدم حساب قواعد الوزارة نفسها.
//

import Foundation

enum OmanMinistry {
    private struct Place { let name: String; let lat: Double; let lng: Double }

    private struct Tables {
        let startDay: Int            // رقم اليوم (أيام منذ ١٩٧٠-٠١-٠١) لأول يوم في الجداول
        let days: Int
        let places: [Place]
        let minutes: Data            // UInt16 لكل (مكان، يوم، صلاة) بالترتيب: الفجر، الشروق، الظهر، العصر، المغرب، العشاء
    }

    private static let lock = NSLock()
    nonisolated(unsafe) private static var cached: Tables??

    private static func tables() -> Tables? {
        lock.lock(); defer { lock.unlock() }
        if let cached { return cached }
        let loaded: Tables? = {
            guard let metaURL = Bundle.main.url(forResource: "oman_ministry", withExtension: "json"),
                  let binURL = Bundle.main.url(forResource: "oman_ministry", withExtension: "bin"),
                  let meta = try? JSONSerialization.jsonObject(with: Data(contentsOf: metaURL)) as? [String: Any],
                  let start = meta["start"] as? String, let days = meta["days"] as? Int,
                  let rows = meta["places"] as? [[Any]],
                  let data = try? Data(contentsOf: binURL, options: .mappedIfSafe) else { return nil }
            let parts = start.split(separator: "-").compactMap { Int($0) }
            guard parts.count == 3 else { return nil }
            let places = rows.compactMap { row -> Place? in
                guard row.count >= 3, let name = row[0] as? String,
                      let lat = (row[1] as? NSNumber)?.doubleValue, let lng = (row[2] as? NSNumber)?.doubleValue else { return nil }
                return Place(name: name, lat: lat, lng: lng)
            }
            guard data.count >= places.count * days * 6 * 2 else { return nil }
            return Tables(startDay: dayNumber(parts[0], parts[1], parts[2]), days: days, places: places, minutes: data)
        }()
        cached = .some(loaded)
        return loaded
    }

    /// أقرب مكان مرجعي من الوزارة إلى الموقع (الاسم والمسافة بالكيلومترات).
    static func nearestPlace(latitude: Double, longitude: Double) -> (name: String, km: Double)? {
        guard let t = tables(), let i = nearestIndex(t, latitude, longitude) else { return nil }
        return (t.places[i].name, distanceKm(latitude, longitude, t.places[i].lat, t.places[i].lng))
    }

    /// مواقيت يوم بالدقائق من منتصف الليل بتوقيت عُمان: الرسمي لأقرب مكان مرجعي + فرق موقع المستخدم الفلكي.
    /// `raw` يعيد الأوقات الفلكية (بالساعات) لإحداثيات معطاة بنفس طريقة الحساب.
    static func times(year: Int, month: Int, day: Int, latitude: Double, longitude: Double,
                      raw: (Double, Double) -> [Prayer: Double]) -> [Prayer: Double]? {
        guard let t = tables(), let i = nearestIndex(t, latitude, longitude),
              distanceKm(latitude, longitude, t.places[i].lat, t.places[i].lng) <= 200 else { return nil }
        let index = dayNumber(year, month, day) - t.startDay
        guard (0..<t.days).contains(index) else { return nil }

        let place = t.places[i]
        let user = raw(latitude, longitude)
        let reference = raw(place.lat, place.lng)
        var result: [Prayer: Double] = [:]
        t.minutes.withUnsafeBytes { buffer in
            let base = ((i * t.days) + index) * 6
            for (k, prayer) in Prayer.allCases.enumerated() {
                let offset = (base + k) * 2
                let official = Double(UInt16(buffer[offset]) | (UInt16(buffer[offset + 1]) << 8))
                var delta = ((user[prayer] ?? .nan) - (reference[prayer] ?? .nan)) * 60
                if !delta.isFinite || abs(delta) > 30 { delta = 0 }
                result[prayer] = official + delta
            }
        }
        return result
    }

    private static func nearestIndex(_ t: Tables, _ lat: Double, _ lng: Double) -> Int? {
        var best: Int?, bestKm = Double.greatestFiniteMagnitude
        for (i, p) in t.places.enumerated() {
            let km = distanceKm(lat, lng, p.lat, p.lng)
            if km < bestKm { bestKm = km; best = i }
        }
        return best
    }

    private static func distanceKm(_ lat1: Double, _ lng1: Double, _ lat2: Double, _ lng2: Double) -> Double {
        let r = Double.pi / 180
        let dLat = (lat2 - lat1) * r, dLng = (lng2 - lng1) * r
        let a = sin(dLat / 2) * sin(dLat / 2) + cos(lat1 * r) * cos(lat2 * r) * sin(dLng / 2) * sin(dLng / 2)
        return 6371 * 2 * atan2(a.squareRoot(), (1 - a).squareRoot())
    }

    /// عدد الأيام منذ ١٩٧٠-٠١-٠١ لتاريخ ميلادي (خوارزمية days-from-civil).
    private static func dayNumber(_ y: Int, _ m: Int, _ d: Int) -> Int {
        let yy = m <= 2 ? y - 1 : y
        let era = (yy >= 0 ? yy : yy - 399) / 400
        let yoe = yy - era * 400
        let mp = (m + 9) % 12
        let doy = (153 * mp + 2) / 5 + d - 1
        let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy
        return era * 146097 + doe - 719468
    }
}
