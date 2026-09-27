import SwiftUI

/// Promo code wallet: "Active Codes" ready to scan and "Used Codes" history.
struct WalletView: View {
    @State private var viewModel: WalletViewModel
    @Environment(\.locale) private var locale

    init(wallet: WalletStore) {
        _viewModel = State(initialValue: WalletViewModel(wallet: wallet))
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: Theme.Spacing.xl) {
                    savingsCard

                    GlassSegmentedControl(
                        options: WalletViewModel.Segment.allCases,
                        selection: $viewModel.segment,
                        title: \.title,
                        count: { viewModel.count(for: $0) }
                    )

                    codesList
                }
                .padding(.horizontal, Theme.gutter)
                .padding(.bottom, Theme.Spacing.xxl)
            }
            .sarenaScreenBackground()
            .navigationTitle("Wallet")
            .toolbarBackground(.hidden, for: .navigationBar)
            .sheet(item: $viewModel.presentedCode) { code in
                PromoCodeSheet(code: code) { viewModel.markUsed(code) }
            }
        }
    }

    // MARK: Savings

    private var savingsCard: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            HStack {
                Label("Member savings", systemImage: "chart.line.uptrend.xyaxis")
                    .font(.sarena(.subheadline, weight: .bold))
                    .foregroundStyle(.white.opacity(0.9))
                Spacer()
                SarenaLogoView(size: 40, floats: false)
            }
            Text(verbatim: viewModel.totalSavings.omr(locale))
                .font(.system(size: 42, weight: .heavy, design: .rounded))
                .foregroundStyle(.white)
                .minimumScaleFactor(0.6)
                .lineLimit(1)
                .contentTransition(.numericText())
            Text("Total saved with Sarena")
                .font(.sarena(.subheadline, weight: .medium))
                .foregroundStyle(.white.opacity(0.85))
            HStack(spacing: Theme.Spacing.m) {
                StatPill(value: viewModel.count(for: .active), title: "Ready to use", systemImage: "qrcode")
                StatPill(value: viewModel.redeemedCount, title: "Redeemed", systemImage: "checkmark.seal.fill")
            }
        }
        .padding(Theme.Spacing.xl)
        .background {
            RoundedRectangle(cornerRadius: Theme.Radius.hero, style: .continuous)
                .fill(LinearGradient(colors: [Theme.Palette.orange, Theme.Palette.ember, Theme.Palette.festivalPink.opacity(0.8)],
                                     startPoint: .topLeading, endPoint: .bottomTrailing))
                .opacity(0.8)
        }
        .glassSurface(.tinted(Theme.Palette.orange, opacity: 0.2, cornerRadius: Theme.Radius.hero))
        .floatingGlass(amplitude: 5, tilt: 7)
        .padding(.top, Theme.Spacing.s)
    }

    // MARK: Codes

    @ViewBuilder
    private var codesList: some View {
        if viewModel.codes.isEmpty {
            emptyState
        } else {
            LazyVStack(spacing: Theme.Spacing.l) {
                ForEach(viewModel.codes) { code in
                    PromoCodeCard(
                        code: code,
                        isCopied: viewModel.copiedCodeID == code.id,
                        onCopy: { viewModel.copy(code) },
                        onShow: { viewModel.presentedCode = code }
                    )
                    .transition(.asymmetric(insertion: .scale(scale: 0.96).combined(with: .opacity), removal: .opacity))
                }
            }
            .animation(.snappy, value: viewModel.segment)
            .animation(.snappy, value: viewModel.codes)
        }
    }

    @ViewBuilder
    private var emptyState: some View {
        Group {
            switch viewModel.segment {
            case .active:
                ContentUnavailableView(
                    "No active codes",
                    systemImage: "ticket",
                    description: Text("Book a deal from Discover and your code will appear here instantly.")
                )
            case .used:
                ContentUnavailableView(
                    "No used codes yet",
                    systemImage: "clock.arrow.circlepath",
                    description: Text("Codes you redeem at venues are kept here as your history.")
                )
            }
        }
        .padding(.vertical, Theme.Spacing.xl)
        .glassSurface(.card)
    }
}

private struct StatPill: View {
    let value: Int
    let title: LocalizedStringKey
    let systemImage: String
    @Environment(\.locale) private var locale

    var body: some View {
        HStack(spacing: Theme.Spacing.s) {
            Image(systemName: systemImage)
            Text(verbatim: value.localizedNumber(locale))
                .fontWeight(.heavy)
                .contentTransition(.numericText(value: Double(value)))
            Text(title)
        }
        .font(.sarena(.caption, weight: .semibold))
        .foregroundStyle(.white)
        .padding(.horizontal, Theme.Spacing.m)
        .padding(.vertical, Theme.Spacing.s)
        .background(Capsule().fill(.white.opacity(0.2)))
        .overlay(Capsule().strokeBorder(.white.opacity(0.35), lineWidth: 1))
    }
}

#Preview {
    PreviewContainer {
        WalletViewPreview()
    }
}

private struct WalletViewPreview: View {
    @Environment(WalletStore.self) private var wallet
    var body: some View { WalletView(wallet: wallet) }
}
