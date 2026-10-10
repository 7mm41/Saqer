//
//  ThaqafaWidgets.swift
//  ثقافة إسلامية — الأداة
//
//  أدوات التطبيق: الصلاة القادمة (شاشة القفل والشاشة الرئيسية)، وأزرار القبلة والمواقيت في مركز التحكم.
//

import SwiftUI
import WidgetKit

@main
struct ThaqafaWidgets: WidgetBundle {
    var body: some Widget {
        PrayerWidget()
        if #available(iOS 18.0, *) {
            QiblaControl()
            PrayerTimesControl()
        }
    }
}
