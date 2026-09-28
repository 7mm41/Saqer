import SwiftUI

/// Promo code wallet: "Active Codes" ready to scan and "Used Codes" history.
struct WalletView: View {
    @State private var viewModel: WalletViewModel

    init(wallet: WalletStore) {
        _viewModel = State(initialValue: WalletViewModel(wallet: wallet))
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: Theme.Spacing.xl) {
                    GlassSegmentedControl(
                        options: WalletViewModel.Segment.allCases,
                        selection: $viewModel.segment,
                        title: \.title,
                        count: { viewModel.count(for: $0) }
                    )

                    codesList
                }
                .padding(.horizontal, Theme.gutter)
                .padding(.top, Theme.Spacing.s)
                .padding(.bottom, Theme.Spacing.xxl)
            }
            .refreshable { await viewModel.refresh() }
            .sarenaScreenBackground()
            .navigationTitle("Wallet")
            .toolbarBackground(.hidden, for: .navigationBar)
            .sheet(item: $viewModel.presentedCode) { code in
                PromoCodeSheet(code: code) { Task { await viewModel.markUsed(code) } }
            }
            .alert("Couldn't update the code", isPresented: $viewModel.didFailToMarkUsed) {
                Button("OK", role: .cancel) {}
            } message: {
                Text("Please try again in a moment.")
            }
        }
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

#Preview {
    PreviewContainer {
        WalletViewPreview()
    }
}

private struct WalletViewPreview: View {
    @Environment(WalletStore.self) private var wallet
    var body: some View { WalletView(wallet: wallet) }
}
