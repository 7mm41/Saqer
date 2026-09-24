//
//  StoreService.swift
//  CleanSpace
//
//  StoreKit 2 in-app purchase layer for the CleanSpace Pro subscription
//  (com.cleanspace.pro.monthly, $0.99 / month, auto-renewing). Unlocks unlimited
//  photo cleanups; the free tier allows up to `freePhotoQuota` deletions total,
//  tracked per Apple account via iCloud key-value storage.
//
//  Everything is on-device / App Store; no custom server or receipt validation
//  endpoint is needed — StoreKit 2 verifies transactions with the App Store.
//

import Foundation
import StoreKit
import Observation

@MainActor
@Observable
final class StoreService {

    /// Product identifier configured in App Store Connect and in CleanSpace.storekit.
    static let proProductID = "com.cleanspace.pro.monthly"
    /// Free tier: total photos that can be deleted for free per Apple account.
    static let freePhotoQuota = 500

    private(set) var product: Product?
    private(set) var isPro = false
    private(set) var isLoadingProducts = false
    private(set) var isPurchasing = false
    var lastError: String?

    /// Cumulative photos deleted on the free tier. Tracked in iCloud key-value
    /// storage so the quota follows the Apple account across devices/reinstalls,
    /// mirrored to UserDefaults so it also works with no iCloud entitlement.
    private(set) var freePhotosUsed = 0

    private let quotaKey = "cleanspace.freePhotosUsed"
    private let kvs = NSUbiquitousKeyValueStore.default

    /// Photos still deletable for free (effectively unlimited once Pro).
    var freePhotosRemaining: Int {
        isPro ? .max : max(0, Self.freePhotoQuota - freePhotosUsed)
    }

    init() {
        loadQuota()
        // Update the local mirror when iCloud reports a change from another device.
        NotificationCenter.default.addObserver(
            forName: NSUbiquitousKeyValueStore.didChangeExternallyNotification,
            object: kvs, queue: .main
        ) { [weak self] _ in
            MainActor.assumeIsolated { self?.loadQuota() }
        }
        // Listen for transactions that arrive outside an explicit purchase
        // (renewals, purchases made on another device, Ask-to-Buy approvals).
        listenForTransactions()
        Task {
            await loadProducts()
            await updateEntitlement()
        }
    }

    // No deinit: StoreService lives for the app's lifetime, and the transaction
    // listener holds `self` weakly, so there is nothing to tear down.

    // MARK: - Free quota

    private func loadQuota() {
        kvs.synchronize()
        let cloud = Int(kvs.longLong(forKey: quotaKey))
        let local = UserDefaults.standard.integer(forKey: quotaKey)
        freePhotosUsed = max(cloud, local)
    }

    /// Records `count` free deletions against the per-account quota (no-op for Pro).
    func recordFreeDeletions(_ count: Int) {
        guard !isPro, count > 0 else { return }
        freePhotosUsed += count
        kvs.set(Int64(freePhotosUsed), forKey: quotaKey)
        UserDefaults.standard.set(freePhotosUsed, forKey: quotaKey)
        kvs.synchronize()
    }

    var priceText: String { product?.displayPrice ?? "$0.99" }

    /// e.g. "$0.99 / month" for the subscribe button.
    var pricePerPeriodText: String {
        guard let product, let sub = product.subscription else { return "\(priceText) / month" }
        let unit: String
        switch sub.subscriptionPeriod.unit {
        case .day:   unit = "day"
        case .week:  unit = "week"
        case .month: unit = "month"
        case .year:  unit = "year"
        @unknown default: unit = "period"
        }
        return "\(product.displayPrice) / \(unit)"
    }

    // MARK: - Loading

    func loadProducts() async {
        isLoadingProducts = true
        defer { isLoadingProducts = false }
        do {
            let products = try await Product.products(for: [Self.proProductID])
            product = products.first
        } catch {
            lastError = error.localizedDescription
        }
    }

    // MARK: - Purchase / restore

    /// Returns true if the purchase completed and Pro is now active.
    @discardableResult
    func purchase() async -> Bool {
        if product == nil { await loadProducts() }
        guard let product else {
            lastError = "Product unavailable. Please try again."
            return false
        }
        isPurchasing = true
        defer { isPurchasing = false }
        do {
            let result = try await product.purchase()
            switch result {
            case .success(let verification):
                let transaction = try checkVerified(verification)
                await transaction.finish()
                await updateEntitlement()
                return isPro
            case .userCancelled:
                return false
            case .pending:
                // e.g. Ask-to-Buy — entitlement will arrive via the listener.
                return false
            @unknown default:
                return false
            }
        } catch {
            lastError = error.localizedDescription
            return false
        }
    }

    /// Restores previous purchases (App Store account sync).
    func restore() async {
        do {
            try await AppStore.sync()
        } catch {
            lastError = error.localizedDescription
        }
        await updateEntitlement()
    }

    // MARK: - Entitlement

    /// Recomputes `isPro` from the current App Store entitlements.
    func updateEntitlement() async {
        var active = false
        for await result in Transaction.currentEntitlements {
            guard let transaction = try? checkVerified(result) else { continue }
            if transaction.productID == Self.proProductID, transaction.revocationDate == nil {
                active = true
            }
        }
        isPro = active
    }

    private func listenForTransactions() {
        Task { [weak self] in
            for await update in Transaction.updates {
                guard let self else { continue }
                if let transaction = try? self.checkVerified(update) {
                    await transaction.finish()
                    await self.updateEntitlement()
                }
            }
        }
    }

    private nonisolated func checkVerified<T>(_ result: VerificationResult<T>) throws -> T {
        switch result {
        case .verified(let safe):
            return safe
        case .unverified(_, let error):
            throw error
        }
    }
}
