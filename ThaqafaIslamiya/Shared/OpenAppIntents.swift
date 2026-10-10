//
//  OpenAppIntents.swift
//  ثقافة إسلامية
//
//  أوامر تفتح التطبيق على شاشة معينة: زر القبلة في مركز التحكم (وزر الإجراء والاختصارات)، ومواقيت الصلاة.
//  تُضمَّن في التطبيق والأداة معًا (شرط أزرار مركز التحكم)، ويُنفَّذ الأمر داخل التطبيق بعد فتحه.
//

import AppIntents

struct OpenQiblaIntent: AppIntent {
    static let title: LocalizedStringResource = "اتجاه القبلة"
    static let description = IntentDescription("يفتح بوصلة القبلة مباشرة.")
    static let openAppWhenRun = true

    @MainActor
    func perform() async throws -> some IntentResult {
        #if !WIDGET_EXTENSION
        AppRouter.shared.show(.qibla)
        #endif
        return .result()
    }
}

struct OpenPrayerTimesIntent: AppIntent {
    static let title: LocalizedStringResource = "مواقيت الصلاة"
    static let description = IntentDescription("يفتح مواقيت الصلاة حسب موقعك.")
    static let openAppWhenRun = true

    @MainActor
    func perform() async throws -> some IntentResult {
        #if !WIDGET_EXTENSION
        AppRouter.shared.show(.prayer)
        #endif
        return .result()
    }
}
