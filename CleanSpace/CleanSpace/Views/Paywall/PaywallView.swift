//
//  PaywallView.swift
//  CleanSpace
//
//  The CleanSpace Pro upgrade sheet. Presents the $0.99/month subscription,
//  purchase + restore, and the App Store-required auto-renew disclosure and
//  Terms / Privacy links.
//

import SwiftUI
import StoreKit

struct PaywallView: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss

    // Replace with your real hosted policy URLs before submitting to App Review.
    private let termsURL = URL(string: "https://cleanspace.app/terms")!
    private let privacyURL = URL(string: "https://cleanspace.app/privacy")!

    private var store: StoreService { env.store }

    private let benefits: [(String, String)] = [
        ("infinity", "Unlimited cleanups — delete as many photos as you like"),
        ("bolt.fill", "No 500-photo free-tier limit"),
        ("lock.shield.fill", "Still 100% on-device — nothing ever leaves your iPhone"),
        ("heart.fill", "Support a small, ad-free indie app")
    ]

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 26) {
                    header
                    benefitsList
                    priceBlock
                    legal
                }
                .padding(24)
            }
            .background(Color(.systemGroupedBackground))
            .navigationTitle("")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Close") { dismiss() }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Restore") { Task { await restore() } }
                        .font(.subheadline)
                }
            }
            .onChange(of: store.isPro) { _, isPro in
                if isPro { dismiss() }   // upgrade succeeded elsewhere; close.
            }
        }
    }

    // MARK: Header

    private var header: some View {
        VStack(spacing: 12) {
            ZStack {
                RoundedRectangle(cornerRadius: 22, style: .continuous)
                    .fill(LinearGradient(colors: [.indigo, .purple],
                                         startPoint: .topLeading, endPoint: .bottomTrailing))
                    .frame(width: 84, height: 84)
                    .shadow(color: .indigo.opacity(0.35), radius: 12, y: 6)
                Image(systemName: "sparkles")
                    .font(.system(size: 40, weight: .semibold))
                    .foregroundStyle(.white)
            }
            Text("CleanSpace Pro")
                .font(.largeTitle.weight(.bold))
            Text("Unlock unlimited cleanups and reclaim every gigabyte.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .padding(.top, 8)
    }

    // MARK: Benefits

    private var benefitsList: some View {
        VStack(alignment: .leading, spacing: 16) {
            ForEach(benefits, id: \.0) { benefit in
                HStack(spacing: 14) {
                    Image(systemName: benefit.0)
                        .font(.title3)
                        .foregroundStyle(.indigo)
                        .frame(width: 30)
                    Text(benefit.1)
                        .font(.callout)
                        .fixedSize(horizontal: false, vertical: true)
                    Spacer(minLength: 0)
                }
            }
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.secondarySystemGroupedBackground),
                    in: RoundedRectangle(cornerRadius: 20, style: .continuous))
    }

    // MARK: Price + CTA

    private var priceBlock: some View {
        VStack(spacing: 14) {
            if store.isLoadingProducts && store.product == nil {
                ProgressView().padding(.vertical, 8)
            } else {
                VStack(spacing: 2) {
                    Text(store.pricePerPeriodText)
                        .font(.title2.weight(.bold))
                    Text("Auto-renews monthly · cancel anytime")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }

            Button {
                Task { await purchase() }
            } label: {
                HStack {
                    if store.isPurchasing { ProgressView().tint(.white) }
                    Text(store.isPurchasing ? "Processing…" : "Subscribe for \(store.priceText)")
                }
                .font(.headline)
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .disabled(store.isPurchasing)

            if let error = store.lastError {
                Text(error)
                    .font(.caption)
                    .foregroundStyle(.red)
                    .multilineTextAlignment(.center)
            }
        }
    }

    // MARK: Legal

    private var legal: some View {
        VStack(spacing: 10) {
            Text("Payment is charged to your Apple ID at confirmation of purchase. The subscription renews automatically unless it is canceled at least 24 hours before the end of the current period. Manage or cancel anytime in Settings › Apple ID › Subscriptions.")
                .font(.caption2)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
            HStack(spacing: 16) {
                Link("Terms of Use", destination: termsURL)
                Text("·").foregroundStyle(.secondary)
                Link("Privacy Policy", destination: privacyURL)
            }
            .font(.caption)
        }
    }

    // MARK: Actions

    private func purchase() async {
        store.lastError = nil
        let ok = await store.purchase()
        if ok { dismiss() }
    }

    private func restore() async {
        store.lastError = nil
        await store.restore()
        if store.isPro { dismiss() }
    }
}
