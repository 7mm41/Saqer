//
//  ReminderScheduler.swift
//  ثقافة إسلامية
//
//  تذكير يومي محلي (دون إنترنت) بموعد يختاره المستخدم: «حان وقت درسك اليومي».
//

import Foundation
import UserNotifications

enum ReminderScheduler {
    private static let identifier = "daily.learning.reminder"

    /// يطلب الإذن ثم يجدول التذكير اليومي. يعيد `false` إن رفض المستخدم الإذن.
    static func enable(minutes: Int) async -> Bool {
        let center = UNUserNotificationCenter.current()
        let granted = (try? await center.requestAuthorization(options: [.alert, .sound, .badge])) ?? false
        guard granted else { return false }
        schedule(minutes: minutes)
        return true
    }

    static func schedule(minutes: Int) {
        let center = UNUserNotificationCenter.current()
        center.removePendingNotificationRequests(withIdentifiers: [identifier])
        let content = UNMutableNotificationContent()
        content.title = L10n.t("reminder.title")
        content.body = L10n.t("reminder.body")
        content.sound = .default
        var time = DateComponents()
        time.hour = minutes / 60
        time.minute = minutes % 60
        let trigger = UNCalendarNotificationTrigger(dateMatching: time, repeats: true)
        center.add(UNNotificationRequest(identifier: identifier, content: content, trigger: trigger))
    }

    static func disable() {
        UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: [identifier])
    }
}
