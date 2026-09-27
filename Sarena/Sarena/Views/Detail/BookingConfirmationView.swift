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
                        .floatingGlass(amplitude: 5, tilt: 8)
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
                .fill(Theme.Palette.success.opacity(0.35))
                .frame(width: 130, height: 130)
                .blur(radius: 30)
            Circle()
                .fill(LinearGradient(colors: [Color(hex: 0x4ADE80), Theme.Palette.success], startPoint: .topLeading, endPoint: .bottomTrailing))
                .frame(width: 92, height: 92)
                .overlay(Circle().fill(LinearGradient(colors: [.white.opacity(0.5), .clear], startPoint: .top, endPoint: .center)).padding(5))
                .overlay(Circle().strokeBorder(.white.opacity(0.6), lineWidth: 1))
            Image(systemName: "checkmark")
                .font(.system(size: 40, weight: .heavy))
                .foregroundStyle(.white)
        }
        .scaleEffect(appeared ? 1 : 0.4)
        .opacity(appeared ? 1 : 0)
        .floatingGlass(amplitude: 5, tilt: 10, period: 2.4)
        .accessibilityHidden(true)
    }
}
