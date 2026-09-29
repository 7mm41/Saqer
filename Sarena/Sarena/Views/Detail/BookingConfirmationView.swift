import SwiftUI

/// Celebration sheet after "Book Now": the new code, its QR and the saving.
struct BookingConfirmationView: View {
    let code: PromoCode
    var onViewWallet: () -> Void

    @Environment(\.dismiss) private var dismiss
    @Environment(\.locale) private var locale
    @State private var appeared = false

    var body: some View {
        ScrollView {
            VStack(spacing: Theme.Spacing.xl) {
                successMark
                    .padding(.top, Theme.Spacing.xl)

                VStack(spacing: Theme.Spacing.s) {
                    Text("You're booked!")
                        .font(.sarena(.largeTitle, weight: .heavy))
                    Text("Your code is in your Wallet. Show it at the entrance to get your member price.")
                        .font(.sarena(.subheadline))
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                }

                VStack(spacing: Theme.Spacing.l) {
                    QRCodeTile(payload: code.qrPayload, size: 180)
                    Text(verbatim: code.code)
                        .font(.system(.title2, design: .monospaced).weight(.heavy))
                        .tracking(2)
                        .textSelection(.enabled)
                    Text(verbatim: code.venueName(locale))
                        .font(.sarena(.headline))
                        .foregroundStyle(.secondary)
                }
                .padding(Theme.Spacing.xl)
                .frame(maxWidth: .infinity)
                .glassSurface(.card, in: TicketShape(notchPosition: 0.72))

                Label {
                    Text("You saved \(code.savings.omr(locale)) on this booking")
                } icon: {
                    Image(systemName: "sparkles")
                }
                .font(.sarena(.subheadline, weight: .bold))
                .foregroundStyle(Theme.Palette.success)
                .padding(.horizontal, Theme.Spacing.l)
                .padding(.vertical, Theme.Spacing.m)
                .glassSurface(.tinted(Theme.Palette.success, opacity: 0.16, cornerRadius: 99, shadow: .none), in: Capsule())

                if let startsAt = code.eventStartsAt, startsAt > .now {
                    ReminderCard(eventStartsAt: startsAt)
                }

                VStack(spacing: Theme.Spacing.m) {
                    Button {
                        onViewWallet()
                        dismiss()
                    } label: {
                        Label("View in Wallet", systemImage: "wallet.pass.fill")
                    }
                    .buttonStyle(.sarenaProminent)

                    Button("Done") { dismiss() }
                        .buttonStyle(.sarenaGlass)
                }
            }
            .padding(.horizontal, Theme.Spacing.xl)
            .padding(.bottom, Theme.Spacing.xl)
        }
        .scrollIndicators(.hidden)
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
        .presentationCornerRadius(Theme.Radius.hero)
        .presentationBackground(.ultraThinMaterial)
        .onAppear {
            withAnimation(.spring(response: 0.6, dampingFraction: 0.6).delay(0.1)) { appeared = true }
        }
    }

    private var successMark: some View {
        ZStack {
            Circle()
                .fill(RadialGradient(colors: [Theme.Palette.success.opacity(0.4), Theme.Palette.success.opacity(0)],
                                     center: .center, startRadius: 30, endRadius: 80))
                .frame(width: 160, height: 160)
            Circle()
                .fill(Theme.brandGradient)
                .frame(width: 92, height: 92)
                .overlay(Circle().fill(LinearGradient(colors: [.white.opacity(0.5), .clear], startPoint: .top, endPoint: .center)).padding(5))
                .overlay(Circle().strokeBorder(.white.opacity(0.6), lineWidth: 1))
            Image(systemName: "checkmark")
                .font(.system(size: 40, weight: .heavy))
                .foregroundStyle(.white)
        }
        .scaleEffect(appeared ? 1 : 0.4)
        .opacity(appeared ? 1 : 0)
        .accessibilityHidden(true)
    }
}

/// "We'll remind you" — asks for notification permission at the moment it
/// clearly helps (right after booking an event), then shows when it fires.
private struct ReminderCard: View {
    let eventStartsAt: Date

    @Environment(AppConfigStore.self) private var appConfig
    @Environment(\.locale) private var locale
    @State private var notifications = NotificationsManager.shared

    private var reminderDate: Date {
        ReminderPlanner.mainReminder(start: eventStartsAt, settings: appConfig.reminders, calendar: .current).date
    }

    var body: some View {
        HStack(spacing: Theme.Spacing.m) {
            Image(systemName: notifications.isAuthorized ? "bell.badge.fill" : "bell.fill")
                .font(.title2)
                .foregroundStyle(Theme.Palette.orange)
                .symbolEffect(.bounce, value: notifications.isAuthorized)
            VStack(alignment: .leading, spacing: 2) {
                if notifications.isAuthorized {
                    Text("Reminder set")
                        .font(.sarena(.subheadline, weight: .bold))
                    Text(verbatim: reminderDate.formatted(Date.FormatStyle(date: .abbreviated, time: .shortened).locale(locale)))
                        .font(.sarena(.caption))
                        .foregroundStyle(.secondary)
                } else {
                    Text("Don't miss it")
                        .font(.sarena(.subheadline, weight: .bold))
                    Text("Allow notifications and we'll remind you before it starts.")
                        .font(.sarena(.caption))
                        .foregroundStyle(.secondary)
                }
            }
            Spacer(minLength: 0)
            if !notifications.isAuthorized, notifications.authorization != .denied {
                Button("Allow") {
                    Task { await notifications.requestAuthorization() }
                }
                .font(.sarena(.subheadline, weight: .bold))
                .foregroundStyle(Theme.Palette.orange)
            }
        }
        .padding(Theme.Spacing.l)
        .frame(maxWidth: .infinity, alignment: .leading)
        .glassSurface(.card)
    }
}
