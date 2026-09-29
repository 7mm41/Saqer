import SwiftUI

/// "حسابي" — one place for the member's profile, member savings and the
/// Sarena membership (a single annual plan).
struct AccountView: View {
    @State private var viewModel: AccountViewModel
    @Environment(\.locale) private var locale
    @Environment(AppRouter.self) private var router: AppRouter?
    @Environment(\.services) private var services
    @Environment(AppConfigStore.self) private var appConfig

    init(store: MembershipStore, session: SessionStore, wallet: WalletStore) {
        _viewModel = State(initialValue: AccountViewModel(store: store, session: session, wallet: wallet))
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: Theme.Spacing.xl) {
                    if let user = viewModel.user {
                        MemberCard(user: user, isActiveMember: viewModel.isActive)
                    }

                    SavingsCard(
                        totalSavings: viewModel.totalSavings,
                        readyCount: viewModel.readyCount,
                        redeemedCount: viewModel.redeemedCount
                    ) {
                        router?.selectedTab = .wallet
                    }

                    SectionHeader(title: "Membership", subtitle: "One plan · every member price, all year")
                        .padding(.top, Theme.Spacing.s)

                    MembershipCard(
                        plan: viewModel.plan,
                        membership: viewModel.membership,
                        progress: viewModel.progress(),
                        isLoading: viewModel.isLoading
                    )

                    subscribeButton

                    // The membership card in Apple Wallet: partners scan its QR to confirm the membership.
                    if viewModel.isActive, appConfig.config.walletEnabled, let passes = services.walletPasses {
                        VStack(spacing: Theme.Spacing.s) {
                            AddToAppleWallet { language in try await passes.membershipPass(language: language) }
                            Text("Show the card's QR at any partner to prove your membership.")
                                .font(.sarena(.caption))
                                .foregroundStyle(.secondary)
                                .multilineTextAlignment(.center)
                        }
                    }
                }
                .padding(.horizontal, Theme.gutter)
                .padding(.bottom, Theme.Spacing.xxl)
            }
            .sarenaScreenBackground()
            .navigationTitle("My Account")
            .sarenaNavigationBar()
            .alert("Couldn't complete the subscription", isPresented: isShowingFailure, presenting: viewModel.failure) { _ in
                Button("OK", role: .cancel) {}
            } message: { failure in
                Text(failure.message)
            }
            .sensoryFeedback(.success, trigger: viewModel.subscribedAt)
        }
    }

    private var isShowingFailure: Binding<Bool> {
        Binding(
            get: { viewModel.failure != nil },
            set: { if !$0 { viewModel.failure = nil } }
        )
    }

    // MARK: Subscribe / renew

    private var subscribeButton: some View {
        Button {
            viewModel.requestSubscription()
        } label: {
            if viewModel.isProcessing {
                ProgressView().tint(isMainAction ? Color.white : Theme.Palette.orange)
            } else if viewModel.isRenewal {
                Label("Renew for \(viewModel.plan.effectivePrice.omr(locale)) / year", systemImage: "arrow.clockwise")
            } else {
                Label("Subscribe for \(viewModel.plan.effectivePrice.omr(locale)) / year", systemImage: "crown.fill")
            }
        }
        .buttonStyle(SarenaButtonStyle(kind: isMainAction ? .prominent : .glass))
        .disabled(viewModel.isProcessing || viewModel.isLoading)
        // Attached to the button so it appears right next to it (iOS 26 shows it as a popover).
        .confirmationDialog(confirmationTitle, isPresented: $viewModel.isConfirming, titleVisibility: .visible) {
            Button("Confirm") { Task { await viewModel.confirmSubscription() } }
            Button("Cancel", role: .cancel) {}
        } message: {
            if viewModel.isActive {
                Text("\(viewModel.plan.effectivePrice.omr(locale)) for one more year. It starts when your current membership ends, so you keep every remaining day.")
            } else {
                Text("\(viewModel.plan.effectivePrice.omr(locale)) for one year of member prices at every Sarena venue and event.")
            }
        }
    }

    /// Subscribing (or renewing near the end) is the screen's main action; an
    /// early renewal is offered quietly.
    private var isMainAction: Bool {
        !(viewModel.isActive && !(viewModel.membership?.isEndingSoon() ?? false))
    }

    private var confirmationTitle: Text {
        viewModel.isRenewal ? Text("Renew your membership?") : Text("Become a Sarena member?")
    }
}

/// The annual membership: status, validity with a progress bar, price and perks.
struct MembershipCard: View {
    let plan: MembershipPlan
    let membership: Membership?
    let progress: Double
    var isLoading = false

    @Environment(\.locale) private var locale

    private var isActive: Bool { membership?.isActive() ?? false }

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.l) {
            HStack(alignment: .center, spacing: Theme.Spacing.m) {
                GlassIconOrb(systemImage: "crown.fill", colors: [isActive ? Theme.Palette.orange : Theme.Palette.steel], size: 60)
                VStack(alignment: .leading, spacing: 4) {
                    Text(verbatim: plan.name(locale))
                        .font(.sarena(.title3, weight: .heavy))
                        .lineLimit(2)
                        .minimumScaleFactor(0.8)
                    statusBadge
                }
                Spacer(minLength: 0)
            }

            if let promo = plan.promo {
                promoBadge(promo)
            }

            if isLoading {
                ProgressView()
                    .tint(Theme.Palette.orange)
                    .frame(maxWidth: .infinity)
            } else if let membership, isActive {
                validity(membership)
            } else {
                priceBlock
            }

            VStack(alignment: .leading, spacing: Theme.Spacing.s) {
                ForEach(plan.perks, id: \.self) { perk in
                    Label {
                        Text(verbatim: perk(locale))
                    } icon: {
                        Image(systemName: "checkmark.circle.fill")
                            .foregroundStyle(Theme.Palette.accentText)
                    }
                    .font(.sarena(.subheadline, weight: .medium))
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(Theme.Spacing.xl)
        .glassSurface(.card)
        .animation(.smooth, value: membership)
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder
    private var statusBadge: some View {
        switch membership.map({ $0.isActive() ? Membership.Status.active : ($0.status == .cancelled ? .cancelled : .expired) }) {
        case .active:
            GlassBadge(text: "Active", systemImage: "checkmark.seal.fill")
        case .expired:
            GlassBadge(text: "Expired", systemImage: "clock.badge.exclamationmark", tint: Theme.Palette.steel)
        case .cancelled:
            GlassBadge(text: "Cancelled", systemImage: "xmark.circle", tint: Theme.Palette.steel)
        case nil:
            GlassBadge(text: "Not a member yet", systemImage: "sparkles", tint: Theme.Palette.steel)
        }
    }

    private func validity(_ membership: Membership) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Valid until")
                        .font(.sarena(.caption, weight: .semibold))
                        .foregroundStyle(.secondary)
                    Text(verbatim: membership.expiresAt.shortDate(locale))
                        .font(.sarena(.title2, weight: .heavy))
                }
                Spacer()
                VStack(alignment: .trailing, spacing: 2) {
                    Text(verbatim: membership.daysRemaining().localizedNumber(locale))
                        .font(.sarena(.title2, weight: .heavy))
                        .contentTransition(.numericText())
                    Text("days left")
                        .font(.sarena(.caption, weight: .semibold))
                        .foregroundStyle(.secondary)
                }
            }
            ProgressView(value: progress)
                .tint(Theme.Palette.orange)
            if membership.isEndingSoon() {
                Label("Ending soon — renew to keep your member prices.", systemImage: "exclamationmark.circle.fill")
                    .font(.sarena(.caption, weight: .bold))
                    .foregroundStyle(Theme.Palette.accentText)
            }
        }
    }

    /// A discount set in the dashboard (e.g. National Day): label, old price, end date.
    private func promoBadge(_ promo: MembershipPlan.Promo) -> some View {
        HStack(spacing: Theme.Spacing.s) {
            Label {
                Text(verbatim: promo.label(locale))
            } icon: {
                Image(systemName: "gift.fill")
            }
            .font(.sarena(.caption, weight: .heavy))
            .foregroundStyle(Theme.Palette.accentText)
            .padding(.horizontal, Theme.Spacing.m)
            .padding(.vertical, 6)
            .background(Capsule().fill(Theme.Palette.orangeSoft))
            if let endsAt = promo.endsAt {
                Text("Until \(endsAt.shortDate(locale))")
                    .font(.sarena(.caption, weight: .semibold))
                    .foregroundStyle(.secondary)
            }
        }
    }

    private var priceBlock: some View {
        VStack(alignment: .leading, spacing: 2) {
            if plan.promo != nil {
                Text(verbatim: plan.price.omr(locale))
                    .font(.sarena(.headline, weight: .semibold))
                    .strikethrough(true, color: .secondary)
                    .foregroundStyle(.secondary)
            }
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text(verbatim: plan.effectivePrice.omr(locale))
                    .font(.system(size: 40, weight: .heavy, design: .rounded))
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                Text(plan.isYearly ? "/ year" : "/ period")
                    .font(.sarena(.headline, weight: .semibold))
                    .foregroundStyle(.secondary)
            }
            Text("Just \(plan.monthlyEquivalent.omr(locale)) a month")
                .font(.sarena(.subheadline, weight: .semibold))
                .foregroundStyle(Theme.Palette.accentText)
            Text(verbatim: plan.description(locale))
                .font(.sarena(.caption))
                .foregroundStyle(.secondary)
        }
    }
}

#Preview {
    PreviewContainer {
        AccountViewPreview()
    }
}

private struct AccountViewPreview: View {
    @Environment(SessionStore.self) private var session
    @Environment(MembershipStore.self) private var store
    @Environment(WalletStore.self) private var wallet

    var body: some View {
        AccountView(store: store, session: session, wallet: wallet)
    }
}
