import Observation
import UIKit
import UserNotifications

/// Push and local notifications:
///
/// * asks for permission at a meaningful moment (after the first booking, or
///   from Settings), never at first launch;
/// * sends the APNs token to the Sarena API so the dashboard's automatic
///   notifications (new events, discounts, membership ending...) reach this phone;
/// * schedules the on-phone reminders for booked events (`ReminderScheduler`);
/// * opens the right screen when a notification is tapped.
@Observable
@MainActor
final class NotificationsManager: NSObject {
    static let shared = NotificationsManager()

    private(set) var authorization: UNAuthorizationStatus = .notDetermined
    /// Set when a notification about a venue is tapped; Home opens it.
    var pendingVenueID: String?
    /// Set when a reminder is tapped; the Wallet opens.
    var opensWallet = false

    @ObservationIgnored private var deviceToken: String?
    @ObservationIgnored private var registration: (any PushRegistrationServicing)?
    @ObservationIgnored private var registeredToken: String?
    @ObservationIgnored private var isSignedIn = false
    @ObservationIgnored private let center = UNUserNotificationCenter.current()
    /// On-phone reminders for booked events.
    @ObservationIgnored let reminders: ReminderScheduler

    var isAuthorized: Bool {
        authorization == .authorized || authorization == .provisional || authorization == .ephemeral
    }

    private override init() {
        reminders = ReminderScheduler(center: UserNotificationScheduler())
        super.init()
    }

    /// Called once at launch by the app delegate.
    func activate(registration: any PushRegistrationServicing) {
        self.registration = registration
        center.delegate = self
        Task { await refreshAuthorization() }
    }

    func refreshAuthorization() async {
        authorization = await center.notificationSettings().authorizationStatus
        if isAuthorized {
            UIApplication.shared.registerForRemoteNotifications()
        }
    }

    /// Shows the system prompt (only while undetermined). Returns whether notifications are on.
    @discardableResult
    func requestAuthorization() async -> Bool {
        if authorization == .notDetermined {
            _ = try? await center.requestAuthorization(options: [.alert, .sound, .badge])
        }
        await refreshAuthorization()
        return isAuthorized
    }

    // MARK: Push token

    func didRegister(deviceToken data: Data) {
        deviceToken = data.map { String(format: "%02x", $0) }.joined()
        Task { await syncRegistration() }
    }

    func sessionChanged(signedIn: Bool) async {
        if !signedIn, let token = registeredToken {
            // Stop this phone receiving the previous member's notifications.
            await registration?.unregister(token: token)
            registeredToken = nil
            await reminders.clear()
        }
        isSignedIn = signedIn
        await syncRegistration()
    }

    private func syncRegistration() async {
        guard isSignedIn, let token = deviceToken, token != registeredToken, let registration else { return }
        let locale = Locale.preferredLanguages.first ?? "ar"
        if (try? await registration.register(token: token, locale: locale)) != nil {
            registeredToken = token
        }
    }
}

extension NotificationsManager: UNUserNotificationCenterDelegate {
    /// Show banners even while the app is open.
    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter, willPresent notification: UNNotification
    ) async -> UNNotificationPresentationOptions {
        [.banner, .list, .sound]
    }

    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse) async {
        let info = response.notification.request.content.userInfo
        let venueID = info["venueId"] as? String
        let isReminder = response.notification.request.identifier.hasPrefix(ReminderPlanner.prefix)
        await MainActor.run {
            if let venueID {
                pendingVenueID = venueID
            } else if isReminder {
                opensWallet = true
            }
        }
    }
}

/// `LocalNotificationScheduling` backed by `UNUserNotificationCenter`.
struct UserNotificationScheduler: LocalNotificationScheduling {
    func pendingIdentifiers() async -> [String] {
        await UNUserNotificationCenter.current().pendingNotificationRequests().map(\.identifier)
    }

    func add(_ reminder: PlannedReminder) async {
        let content = UNMutableNotificationContent()
        content.title = reminder.title
        content.body = reminder.body
        content.sound = .default
        content.threadIdentifier = "sarena.reminders"
        let components = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute, .second], from: reminder.fireDate)
        let trigger = UNCalendarNotificationTrigger(dateMatching: components, repeats: false)
        try? await UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: reminder.id, content: content, trigger: trigger))
    }

    func remove(identifiers: [String]) async {
        UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: identifiers)
    }
}

/// Receives the APNs token and hands notifications to `NotificationsManager`.
final class AppDelegate: NSObject, UIApplicationDelegate {
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        MainActor.assumeIsolated {
            NotificationsManager.shared.didRegister(deviceToken: deviceToken)
        }
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        // Simulators without push support and missing entitlements end up here; nothing to do.
    }
}
