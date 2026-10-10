//
//  AppControls.swift
//  ثقافة إسلامية — الأداة
//
//  أزرار مركز التحكم (iOS 18 فأحدث، وتصلح أيضًا لشاشة القفل وزر الإجراء):
//  «القبلة» يفتح بوصلة القبلة مباشرة، و«مواقيت الصلاة» يفتح المواقيت.
//

import SwiftUI
import WidgetKit
import AppIntents

@available(iOS 18.0, *)
struct QiblaControl: ControlWidget {
    private var language: AppLanguage { PrayerSnapshot.load()?.language ?? .deviceDefault }

    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: "com.saqer.ThaqafaIslamiya.qibla") {
            ControlWidgetButton(action: OpenQiblaIntent()) {
                Label(L10n.t("tab.qibla", in: language), systemImage: "location.north.circle.fill")
            }
        }
        .displayName(LocalizedStringResource("\(L10n.t("qibla.title", in: language))"))
        .description(LocalizedStringResource("\(L10n.t("control.qibla.description", in: language))"))
    }
}

@available(iOS 18.0, *)
struct PrayerTimesControl: ControlWidget {
    private var language: AppLanguage { PrayerSnapshot.load()?.language ?? .deviceDefault }

    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: "com.saqer.ThaqafaIslamiya.prayer") {
            ControlWidgetButton(action: OpenPrayerTimesIntent()) {
                Label(L10n.t("prayer.title", in: language), systemImage: "clock.fill")
            }
        }
        .displayName(LocalizedStringResource("\(L10n.t("prayer.title", in: language))"))
        .description(LocalizedStringResource("\(L10n.t("control.prayer.description", in: language))"))
    }
}
