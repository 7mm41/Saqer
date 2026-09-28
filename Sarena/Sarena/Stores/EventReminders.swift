import Foundation

/// A local notification the phone will show by itself (no server or signal needed).
struct PlannedReminder: Equatable, Sendable {
    let id: String
    let fireDate: Date
    let title: String
    let body: String
}

/// Plans reminders for the member's booked codes, using the timings set in
/// the dashboard (`ReminderSettings`):
///
/// * **Events:** the morning of the event day (`morningHour`), or earlier so
///   it always comes at least `hoursBefore` hours before the start. An event at
///   10:00 is reminded at 05:00 — or, if that would be before 07:00, at 20:00
///   the evening before. Then a last nudge `finalReminderMinutes` before.
/// * **Other codes:** the morning two days before the code expires.
enum ReminderPlanner {
    static let prefix = "sarena.reminder."
    /// iOS keeps at most 64 pending local notifications per app.
    static let limit = 60
    private static let earliestHour = 7
    private static let eveningHour = 20

    static func plan(
        codes: [PromoCode],
        settings: ReminderSettings,
        now: Date = .now,
        calendar: Calendar = .current,
        locale: Locale
    ) -> [PlannedReminder] {
        let arabic = locale.language.languageCode?.identifier == "ar"
        var reminders: [PlannedReminder] = []
        for code in codes where code.status == .active && code.expiresAt > now {
            let venue = arabic ? code.venueName.ar : code.venueName.en
            if let start = code.eventStartsAt {
                guard start > now else { continue }
                let time = start.formatted(Date.FormatStyle(date: .omitted, time: .shortened, locale: locale,
                                                            calendar: calendar, timeZone: calendar.timeZone))
                let main = mainReminder(start: start, settings: settings, calendar: calendar)
                if main.date > now {
                    reminders.append(PlannedReminder(
                        id: "\(prefix)\(code.id).main",
                        fireDate: main.date,
                        title: main.isEveningBefore
                            ? (arabic ? "غداً: \(venue)" : "Tomorrow: \(venue)")
                            : (arabic ? "اليوم: \(venue)" : "Today: \(venue)"),
                        body: arabic
                            ? "تبدأ الساعة \(time). كودك \(code.code) جاهز في المحفظة."
                            : "Starts at \(time). Your code \(code.code) is ready in your Wallet."
                    ))
                }
                if settings.finalReminderMinutes > 0 {
                    let final = start.addingTimeInterval(-Double(settings.finalReminderMinutes) * 60)
                    if final > now, final > main.date {
                        let lead = leadTime(minutes: settings.finalReminderMinutes, arabic: arabic)
                        reminders.append(PlannedReminder(
                            id: "\(prefix)\(code.id).final",
                            fireDate: final,
                            title: arabic ? "\(venue) تبدأ بعد \(lead)" : "\(venue) starts in \(lead)",
                            body: arabic ? "جهّز كودك عند المدخل: \(code.code)" : "Have your code ready at the entrance: \(code.code)"
                        ))
                    }
                }
            } else {
                let twoDaysBefore = calendar.date(byAdding: .day, value: -2, to: code.expiresAt) ?? code.expiresAt
                guard let fire = calendar.date(bySettingHour: settings.morningHour, minute: 0, second: 0, of: twoDaysBefore),
                      fire > now else { continue }
                let date = code.expiresAt.formatted(Date.FormatStyle(date: .abbreviated, time: .omitted, locale: locale,
                                                                     calendar: calendar, timeZone: calendar.timeZone))
                reminders.append(PlannedReminder(
                    id: "\(prefix)\(code.id).expiry",
                    fireDate: fire,
                    title: arabic ? "استخدم كودك قبل انتهائه" : "Use your code before it expires",
                    body: arabic ? "\(venue) · صالح حتى \(date)" : "\(venue) · valid until \(date)"
                ))
            }
        }
        return Array(reminders.sorted { $0.fireDate < $1.fireDate }.prefix(limit))
    }

    /// The main reminder for an event starting at `start`.
    static func mainReminder(start: Date, settings: ReminderSettings, calendar: Calendar) -> (date: Date, isEveningBefore: Bool) {
        let minimumLead = Double(settings.hoursBefore) * 3_600
        var date = calendar.date(bySettingHour: settings.morningHour, minute: 0, second: 0, of: start) ?? start
        if start.timeIntervalSince(date) < minimumLead {
            date = start.addingTimeInterval(-minimumLead)
        }
        let sameDay = calendar.isDate(date, inSameDayAs: start)
        if !sameDay || calendar.component(.hour, from: date) < earliestHour {
            // Too early in the morning: remind the evening before instead.
            let dayBefore = calendar.date(byAdding: .day, value: -1, to: calendar.startOfDay(for: start)) ?? start
            let evening = calendar.date(bySettingHour: eveningHour, minute: 0, second: 0, of: dayBefore) ?? date
            return (min(evening, date), true)
        }
        return (date, false)
    }

    private static func leadTime(minutes: Int, arabic: Bool) -> String {
        if minutes % 60 == 0 {
            let hours = minutes / 60
            if arabic { return hours == 1 ? "ساعة" : hours == 2 ? "ساعتين" : "\(hours) ساعات" }
            return hours == 1 ? "1 hour" : "\(hours) hours"
        }
        return arabic ? "\(minutes) دقيقة" : "\(minutes) minutes"
    }
}

/// Where planned reminders go (UNUserNotificationCenter on the phone).
protocol LocalNotificationScheduling: Sendable {
    func pendingIdentifiers() async -> [String]
    func add(_ reminder: PlannedReminder) async
    func remove(identifiers: [String]) async
}

/// Keeps the phone's pending reminders in step with the wallet, the
/// dashboard's timings and the app language.
@MainActor
final class ReminderScheduler {
    private let center: any LocalNotificationScheduling
    private var scheduled: [PlannedReminder]?

    init(center: any LocalNotificationScheduling) {
        self.center = center
    }

    func sync(codes: [PromoCode], settings: ReminderSettings, locale: Locale, now: Date = .now, calendar: Calendar = .current) async {
        let plan = ReminderPlanner.plan(codes: codes, settings: settings, now: now, calendar: calendar, locale: locale)
        guard plan != scheduled else { return }
        scheduled = plan
        let wanted = Set(plan.map(\.id))
        let stale = await center.pendingIdentifiers().filter { $0.hasPrefix(ReminderPlanner.prefix) && !wanted.contains($0) }
        if !stale.isEmpty { await center.remove(identifiers: stale) }
        // Re-adding an identifier replaces it (new time or language).
        for reminder in plan { await center.add(reminder) }
    }

    /// Signed out: nothing should fire for the previous member.
    func clear() async {
        scheduled = nil
        let ours = await center.pendingIdentifiers().filter { $0.hasPrefix(ReminderPlanner.prefix) }
        if !ours.isEmpty { await center.remove(identifiers: ours) }
    }
}
