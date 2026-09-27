//
//  WorldPlaces.swift
//  ثقافة إسلامية
//
//  أسماء الأماكن دون إنترنت: قائمة مدمجة بـ٧٥ ألف مكان مأهول (كل قرى عُمان وأحيائها، ومدن الخليج واليمن
//  من ١٠٠٠ نسمة، ومدن العالم من ٥٠٠٠ نسمة) من GeoNames (CC BY 4.0). تُستخدم فقط لتسمية موقع GPS
//  الحالي تلقائيًا (أقرب مكان) ومعرفة البلد لاختيار طريقة الحساب — المواقيت نفسها تُحسب من الإحداثيات بالضبط.
//

import Foundation

/// أقرب مكان معروف إلى موقع المستخدم.
struct NearestPlace: Codable, Equatable {
    let name: String
    let arabic: String
    let region: String
    let regionArabic: String
    let country: String

    /// الاسم بلغة التطبيق: «عبري، الظاهرة» أو «‘Ibrī, Ad Dhahirah».
    func display(arabicScript: Bool) -> String {
        let place = arabicScript && !arabic.isEmpty ? arabic : name
        let area = arabicScript && !regionArabic.isEmpty ? regionArabic : region
        let countryName = Locale.current.localizedString(forRegionCode: country) ?? country
        let separator = arabicScript ? "، " : ", "
        let parts = [place, area.isEmpty || area == place ? nil : area, country == "OM" && arabicScript ? nil : countryName]
        return parts.compactMap { $0 }.joined(separator: separator)
    }
}

enum WorldPlaces {
    private struct Place {
        let name: String, arabic: String, country: String, region: String
        let lat: Double, lng: Double
        let population: Int
    }

    private static let lock = NSLock()
    nonisolated(unsafe) private static var places: [Place]?
    nonisolated(unsafe) private static var regions: [String: [String]] = [:]

    private static func load() -> [Place] {
        lock.lock(); defer { lock.unlock() }
        if let places { return places }
        guard let url = Bundle.main.url(forResource: "world_places", withExtension: "json"),
              let data = try? Data(contentsOf: url, options: .mappedIfSafe),
              let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let rows = root["p"] as? [[Any]] else { places = []; return [] }
        regions = root["r"] as? [String: [String]] ?? [:]
        var loaded: [Place] = []
        loaded.reserveCapacity(rows.count)
        for row in rows where row.count >= 6 {
            guard let lat = (row[4] as? NSNumber)?.doubleValue, let lng = (row[5] as? NSNumber)?.doubleValue else { continue }
            loaded.append(Place(name: row[0] as? String ?? "", arabic: row[1] as? String ?? "",
                                country: row[2] as? String ?? "", region: row[3] as? String ?? "",
                                lat: lat / 1e4, lng: lng / 1e4,
                                population: row.count > 7 ? (row[7] as? NSNumber)?.intValue ?? 0 : 0))
        }
        places = loaded
        return loaded
    }

    /// أقرب مكان إلى الإحداثيات: أقرب بلدة (٥٠٠٠ نسمة فأكثر) في حدود ١٢ كم، وإلا أقرب قرية أو حي.
    /// (يُستدعى من الخلفية؛ مسح سريع لكل الأماكن في أجزاء من الثانية.)
    static func nearest(latitude: Double, longitude: Double) -> NearestPlace? {
        let all = load()
        let cosLat = cos(latitude * .pi / 180)
        var closest: Place?, closestDistance = Double.greatestFiniteMagnitude
        var town: Place?, townDistance = Double.greatestFiniteMagnitude
        for place in all {
            let dLat = place.lat - latitude
            var dLng = place.lng - longitude
            if dLng > 180 { dLng -= 360 } else if dLng < -180 { dLng += 360 }
            let d = dLat * dLat + (dLng * cosLat) * (dLng * cosLat)
            if d < closestDistance { closestDistance = d; closest = place }
            if place.population >= 5000, d < townDistance { townDistance = d; town = place }
        }
        let kilometres = { (d: Double) in d.squareRoot() * 111.2 }
        let chosen = town.flatMap { kilometres(townDistance) <= 12 ? $0 : nil } ?? closest
        guard let best = chosen else { return nil }
        let region = regions["\(best.country).\(best.region)"] ?? []
        return NearestPlace(name: best.name, arabic: best.arabic,
                            region: region.first ?? "", regionArabic: region.count > 1 ? region[1] : "",
                            country: best.country)
    }
}
