import SwiftUI

/// "الاشتراك" — the member's package (Regular / Gold / Family) and switching between them.
struct SubscriptionView: View {
    @State private var viewModel: SubscriptionViewModel
    @Environment(\.locale) private var locale

    init(service: any SubscriptionServicing, store: SubscriptionStore, session: SessionStore, isDemo: Bool) {
        _viewModel = State(initialValue: SubscriptionViewModel(service: service, store: store, session: session, isDemo: isDemo))
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: Theme.Spacing.xl) {
                    currentPlanCard

                    SectionHeader(title: "Choose your package", subtitle: "Switch anytime. Your prices update instantly.")

                    ForEach(viewModel.plans) { plan in
                        PlanCard(
                            plan: plan,
                            isCurrent: viewModel.isCurrent(plan),
                            isProcessing: viewModel.processingPlan == plan
                        ) {
                            viewModel.choose(plan)
                        }
                    }

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
            .navigationTitle("Subscription")
            .toolbarBackground(.hidden, for: .navigationBar)
            .confirmationDialog(
                confirmationTitle,
                isPresented: isConfirming,
                titleVisibility: .visible,
                presenting: viewModel.pendingPlan
            ) { plan in
                Button("Confirm") { Task { await viewModel.confirm(plan) } }
                Button("Cancel", role: .cancel) {}
            } message: { plan in
                if plan.monthlyPrice > 0 {
                    Text("\(plan.monthlyPrice.omr(locale)) / month · renews monthly")
                } else {
                    Text("The free package — member prices at every venue.")
                }
            }
            .alert("Couldn't change your package", isPresented: $viewModel.didFail) {
                Button("OK", role: .cancel) {}
            } message: {
                Text("Please try again in a moment.")
            }
            .sensoryFeedback(.success, trigger: viewModel.justSubscribed)
        }
    }

    private var confirmationTitle: Text {
        guard let plan = viewModel.pendingPlan else { return Text(verbatim: "") }
        return Text("Switch to \(plan.label(locale))?")
    }

    private var isConfirming: Binding<Bool> {
        Binding(
            get: { viewModel.pendingPlan != nil },
            set: { if !$0 { viewModel.pendingPlan = nil } }
        )
    }

    // MARK: Current package

    private var currentPlanCard: some View {
        let subscription = viewModel.current
        let plan = subscription.plan
        return VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            HStack(alignment: .center, spacing: Theme.Spacing.m) {
                Text(verbatim: plan.emoji)
                    .font(.system(size: 40))
                    .frame(width: 72, height: 72)
                    .background(Circle().fill(.white.opacity(0.25)))
                    .overlay(Circle().strokeBorder(.white.opacity(0.7), lineWidth: 1))
                    .parallax(tilt: 12, shift: 4)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Your package")
                        .font(.sarena(.caption, weight: .semibold))
                        .opacity(0.85)
                    Text(verbatim: plan.name(locale))
                        .font(.sarena(.largeTitle, weight: .heavy))
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                }
                Spacer(minLength: 0)
            }
            Text(verbatim: plan.tagline(locale))
                .font(.sarena(.subheadline, weight: .medium))
                .opacity(0.9)
            HStack(spacing: Theme.Spacing.s) {
                if let renewsAt = subscription.renewsAt {
                    GlassBadge(text: "Renews on \(renewsAt.shortDate(locale))", systemImage: "arrow.clockwise", tint: .white)
                    GlassBadge(text: "\(plan.monthlyPrice.omr(locale)) / month", tint: .white)
                } else {
                    GlassBadge(text: "Free forever", systemImage: "gift.fill", tint: .white)
                }
            }
        }
        .foregroundStyle(.white)
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(Theme.Spacing.xl)
        .background {
            RoundedRectangle(cornerRadius: Theme.Radius.hero, style: .continuous)
                .fill(LinearGradient(colors: gradient(for: plan), startPoint: .topLeading, endPoint: .bottomTrailing))
        }
        .glassSurface(.tinted(plan.tint, opacity: 0.2, cornerRadius: Theme.Radius.hero))
        .padding(.top, Theme.Spacing.s)
        .animation(.smooth, value: plan)
        .accessibilityElement(children: .combine)
    }

    private func gradient(for plan: MembershipPlan) -> [Color] {
        switch plan {
        case .regular: [Theme.Palette.glow, Theme.Palette.orange, Theme.Palette.ember]
        case .gold: [Color(hex: 0xFFE08A), Theme.Palette.gold, Color(hex: 0xE39B00)]
        case .family: [Color(hex: 0x7FE3F0), Theme.Palette.lagoon, Color(hex: 0x1565C0)]
        }
    }
}

/// One package: emoji + name, monthly price, perks and the call to action.
private struct PlanCard: View {
    let plan: MembershipPlan
    let isCurrent: Bool
    let isProcessing: Bool
    let onChoose: () -> Void

    @Environment(\.locale) private var locale

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            HStack(alignment: .center, spacing: Theme.Spacing.m) {
                Text(verbatim: plan.emoji)
                    .font(.system(size: 26))
                    .frame(width: 50, height: 50)
                    .background(Circle().fill(plan.tint.opacity(0.22)))
                    .overlay(Circle().strokeBorder(.white.opacity(0.6), lineWidth: 1))
                VStack(alignment: .leading, spacing: 2) {
                    Text(verbatim: plan.name(locale))
                        .font(.sarena(.title3, weight: .heavy))
                    Text(verbatim: plan.tagline(locale))
                        .font(.sarena(.caption))
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                }
                Spacer(minLength: 0)
                price
            }

            VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
                ForEach(plan.perks, id: \.self) { perk in
                    Label {
                        Text(verbatim: perk(locale))
                    } icon: {
                        Image(systemName: "checkmark.circle.fill")
                            .foregroundStyle(plan.tint)
                    }
                    .font(.sarena(.subheadline))
                }
            }

            Button(action: onChoose) {
                if isProcessing {
                    ProgressView().tint(.white)
                } else if isCurrent {
                    Label("Your current package", systemImage: "checkmark.seal.fill")
                } else {
                    Text("Choose this package")
                }
            }
            .buttonStyle(isCurrent ? SarenaButtonStyle(kind: .glass) : SarenaButtonStyle(kind: .prominent))
            .disabled(isCurrent || isProcessing)
        }
        .padding(Theme.Spacing.l)
        .frame(maxWidth: .infinity, alignment: .leading)
        .glassSurface(isCurrent ? .tinted(plan.tint, opacity: 0.22, cornerRadius: Theme.Radius.card, shadow: .floating) : .card)
        .overlay {
            if isCurrent {
                RoundedRectangle(cornerRadius: Theme.Radius.card, style: .continuous)
                    .strokeBorder(plan.tint, lineWidth: 2)
            }
        }
        .overlay(alignment: .topTrailing) {
            if plan.isFeatured && !isCurrent {
                GlassBadge(text: "Most popular", systemImage: "flame.fill", tint: Theme.Palette.gold, prominent: true)
                    .padding(.trailing, Theme.Spacing.l)
                    .offset(y: -12)
            }
        }
        .accessibilityElement(children: .contain)
    }

    private var price: some View {
        VStack(alignment: .trailing, spacing: 0) {
            if plan.monthlyPrice > 0 {
                Text(verbatim: plan.monthlyPrice.omr(locale))
                    .font(.sarena(.headline, weight: .heavy))
                    .foregroundStyle(Theme.brandGradient)
                Text("per month")
                    .font(.sarena(.caption2))
                    .foregroundStyle(.secondary)
            } else {
                Text("Free")
                    .font(.sarena(.headline, weight: .heavy))
                    .foregroundStyle(Theme.Palette.success)
            }
        }
    }
}

#Preview {
    PreviewContainer {
        SubscriptionViewPreview()
    }
}

private struct SubscriptionViewPreview: View {
    @Environment(SessionStore.self) private var session
    @Environment(SubscriptionStore.self) private var store

    var body: some View {
        SubscriptionView(service: AppServices.preview.subscriptions, store: store, session: session, isDemo: true)
    }
}
