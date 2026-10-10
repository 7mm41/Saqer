//
//  SharedData.swift
//  ثقافة إسلامية
//
//  ما يشترك فيه التطبيق وأدواته (ويدجت شاشة القفل والشاشة الرئيسية، وزر القبلة في مركز التحكم):
//  - ملفات البيانات تُقرأ من حزمة التطبيق نفسها (الأداة داخل App.app/PlugIns فلا تُكرَّر الملفات).
//  - موقع المستخدم وطريقة الحساب ولغة الواجهة يكتبها التطبيق في مجموعة التطبيقات (App Group) لتقرأها الأداة.
//

import Foundation

enum AppGroup {
    static let identifier = "group.com.saqer.ThaqafaIslamiya"

    /// مخزن مشترك بين التطبيق وأدواته — `nil` إن لم تتوفر المجموعة (مثل نسخة IPA وُقّعت دون صلاحية المجموعة)،
    /// وحينها تحدد الأداة موقعها بنفسها.
    static var defaults: UserDefaults? {
        guard FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: identifier) != nil else { return nil }
        return UserDefaults(suiteName: identifier)
    }
}

enum AppResources {
    /// ملف من هذه الحزمة، أو من حزمة التطبيق الحاوية (الأداة في App.app/PlugIns/Widgets.appex).
    static func url(forResource name: String, withExtension ext: String) -> URL? {
        if let url = Bundle.main.url(forResource: name, withExtension: ext) { return url }
        guard Bundle.main.bundleURL.pathExtension == "appex" else { return nil }
        let app = Bundle.main.bundleURL.deletingLastPathComponent().deletingLastPathComponent()
        return Bundle(url: app)?.url(forResource: name, withExtension: ext)
    }
}

/// ما تحتاجه الأداة لحساب المواقيت كما يحسبها التطبيق تمامًا.
struct PrayerSnapshot: Codable, Equatable {
    var latitude: Double
    var longitude: Double
    var method: PrayerMethod
    var asr: AsrSchool
    var placeName: String?
    var language: AppLanguage

    private static let key = "widget.prayerSnapshot"

    static func load() -> PrayerSnapshot? {
        guard let data = AppGroup.defaults?.data(forKey: key) else { return nil }
        return try? JSONDecoder().decode(PrayerSnapshot.self, from: data)
    }

    /// يحفظ اللقطة ويعيد `true` إن تغيّرت (لتحديث الأداة عند الحاجة فقط).
    @discardableResult
    func save() -> Bool {
        guard let defaults = AppGroup.defaults, Self.load() != self,
              let data = try? JSONEncoder().encode(self) else { return false }
        defaults.set(data, forKey: Self.key)
        return true
    }
}

/// روابط فتح التطبيق على شاشة معينة (من الأداة ومركز التحكم): thaqafa://prayer و thaqafa://qibla
enum AppLink {
    static let scheme = "thaqafa"
    static let prayer = URL(string: "thaqafa://prayer")!
    static let qibla = URL(string: "thaqafa://qibla")!
}
