import SwiftUI

/// "حسابي" — one place for the member's profile, member savings and the
/// Sarena membership (a single annual plan).
struct AccountView: View {
    @State private var viewModel: AccountViewModel
    @Environment(\.locale) private var locale
    @Environment(AppRouter.self) private var router: AppRouter?

    init(store: MembershipStore, session: SessionStore, wallet: WalletStore, isDemo: Bool) {
        _viewModel = State(initialValue: AccountViewModel(store: store, session: session, wallet: wallet, isDemo: isDemo))
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

                    if viewModel.isDemo {
                        Label("Demo mode — no payment is taken.", systemImage: "info.circle")
                            .font(.sarena(.caption))
                            .foregroundStyle(.secondary)
                    }
                }
                .padding(.horizontal, Theme.gutter)
                .padding(.bottom, Theme.Spacing.xxl)
            }
            .sarenaScreenBackground()
            .navigationTitle("My Account")
            .toolbarBackground(.hidden, for: .navigationBar)
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
                ProgressView().tint(.white)
            } else if viewModel.isRenewal {
                Label("Renew for \(viewModel.plan.price.omr(locale)) / year", systemImage: "arrow.clockwise")
            } else {
                Label("Subscribe for \(viewModel.plan.price.omr(locale)) / year", systemImage: "crown.fill")
            }
        }
        .buttonStyle(viewModel.isActive && !(viewModel.membership?.isEndingSoon() ?? false)
            ? SarenaButtonStyle(kind: .glass)
            : SarenaButtonStyle(kind: .prominent))
        .disabled(viewModel.isProcessing || viewModel.isLoading)
        // Attached to the button so it appears right next to it (iOS 26 shows it as a popover).
        .confirmationDialog(confirmationTitle, isPresented: $viewModel.isConfirming, titleVisibility: .visible) {
            Button("Confirm") { Task { await viewModel.confirmSubscription() } }
            Button("Cancel", role: .cancel) {}
        } message: {
            if viewModel.isActive {
                Text("\(viewModel.plan.price.omr(locale)) for one more year. It starts when your current membership ends, so you keep every remaining day.")
            } else {
                Text("\(viewModel.plan.price.omr(locale)) for one year of member prices at every Sarena venue and event.")
            }
        }
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
                Image(systemName: "crown.fill")
                    .font(.system(size: 30, weight: .bold))
                    .frame(width: 64, height: 64)
                    .background(Circle().fill(.white.opacity(0.25)))
                    .overlay(Circle().strokeBorder(.white.opacity(0.7), lineWidth: 1))
                VStack(alignment: .leading, spacing: 4) {
                    Text(verbatim: plan.name(locale))
                        .font(.sarena(.title3, weight: .heavy))
                        .lineLimit(2)
                        .minimumScaleFactor(0.8)
                    statusBadge
                }
                Spacer(minLength: 0)
            }

            if isLoading {
                ProgressView()
                    .tint(.white)
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
                    }
                    .font(.sarena(.subheadline, weight: .medium))
                }
            }
        }
        .foregroundStyle(.white)
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(Theme.Spacing.xl)
        .background {
            RoundedRectangle(cornerRadius: Theme.Radius.hero, style: .continuous)
                .fill(LinearGradient(
                    colors: isActive
                        ? [Theme.Palette.glow, Theme.Palette.orange, Theme.Palette.ember]
                        : [Theme.Palette.orange.opacity(0.9), Theme.Palette.ember, Theme.Palette.festivalPink.opacity(0.85)],
                    startPoint: .topLeading, endPoint: .bottomTrailing
                ))
        }
        .glassSurface(.tinted(Theme.Palette.orange, opacity: 0.2, cornerRadius: Theme.Radius.hero))
        .animation(.smooth, value: membership)
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder
    private var statusBadge: some View {
        switch membership.map({ $0.isActive() ? Membership.Status.active : ($0.status == .cancelled ? .cancelled : .expired) }) {
        case .active:
            GlassBadge(text: "Active", systemImage: "checkmark.seal.fill", tint: .white)
        case .expired:
            GlassBadge(text: "Expired", systemImage: "clock.badge.exclamationmark", tint: .white)
        case .cancelled:
            GlassBadge(text: "Cancelled", systemImage: "xmark.circle", tint: .white)
        case nil:
            GlassBadge(text: "Not a member yet", systemImage: "sparkles", tint: .white)
        }
    }

    private func validity(_ membership: Membership) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Valid until")
                        .font(.sarena(.caption, weight: .semibold))
                        .opacity(0.85)
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
                        .opacity(0.85)
                }
            }
            ProgressView(value: progress)
                .tint(.white)
                .background(Capsule().fill(.white.opacity(0.25)))
            if membership.isEndingSoon() {
                Label("Ending soon — renew to keep your member prices.", systemImage: "exclamationmark.circle.fill")
                    .font(.sarena(.caption, weight: .bold))
            }
        }
    }

    private var priceBlock: some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text(verbatim: plan.price.omr(locale))
                    .font(.system(size: 40, weight: .heavy, design: .rounded))
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                Text(plan.isYearly ? "/ year" : "/ period")
                    .font(.sarena(.headline, weight: .semibold))
                    .opacity(0.85)
            }
            Text("Just \(plan.monthlyEquivalent.omr(locale)) a month")
                .font(.sarena(.subheadline, weight: .semibold))
                .opacity(0.9)
            Text(verbatim: plan.description(locale))
                .font(.sarena(.caption))
                .opacity(0.85)
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
        AccountView(store: store, session: session, wallet: wallet, isDemo: true)
    }
}
