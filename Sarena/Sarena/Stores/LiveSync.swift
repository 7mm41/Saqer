import Foundation
import Observation

/// Keeps the app in step with the server while it is open: anything changed
/// in the dashboard (a new event, a price, a photo, the membership plan), a
/// code redeemed at the venue or a membership granted shows up by itself —
/// no pull-to-refresh, no signing out and back in.
///
/// * On every return to the foreground everything is re-checked (cheap: the
///   catalogue answers 304 when unchanged).
/// * While in the foreground a Server-Sent Events stream pushes changes as
///   they happen; it reconnects with back-off and re-syncs after a gap.
/// * Signed out (welcome and sign-in screens), a public stream still brings
///   the seasonal look and plan changes.
@Observable
@MainActor
final class LiveSync {
    /// True while the push stream is connected (for diagnostics / UI hints).
    private(set) var isConnected = false

    @ObservationIgnored private let live: (any LiveUpdatesServicing)?
    @ObservationIgnored private let session: SessionStore
    @ObservationIgnored private let catalog: CatalogStore
    @ObservationIgnored private let membership: MembershipStore
    @ObservationIgnored private let wallet: WalletStore
    @ObservationIgnored private let appConfig: AppConfigStore?
    @ObservationIgnored private var catalogReload: Task<Void, Never>?
    @ObservationIgnored private let sleep: @Sendable (Duration) async throws -> Void

    init(
        live: (any LiveUpdatesServicing)?,
        session: SessionStore,
        catalog: CatalogStore,
        membership: MembershipStore,
        wallet: WalletStore,
        appConfig: AppConfigStore? = nil,
        sleep: @escaping @Sendable (Duration) async throws -> Void = { try await Task.sleep(for: $0) }
    ) {
        self.live = live
        self.session = session
        self.catalog = catalog
        self.membership = membership
        self.wallet = wallet
        self.appConfig = appConfig
        self.sleep = sleep
    }

    /// Re-checks everything the member sees (signed out: the public parts).
    func refreshAll() async {
        guard session.user != nil else {
            async let plans: Void = membership.reloadPlans()
            async let look: Void = refreshConfig()
            _ = await (plans, look)
            return
        }
        async let profile: Void = session.refresh()
        async let venues: Void = catalog.reload()
        async let current: Void = membership.refresh()
        async let plans: Void = membership.reloadPlans()
        async let codes: Void = wallet.refresh()
        async let look: Void = refreshConfig()
        _ = await (profile, venues, current, plans, codes, look)
    }

    private func refreshConfig() async {
        await appConfig?.refresh()
    }

    /// Runs until cancelled (the scene leaves the foreground, or the member
    /// signs in or out — the caller then starts the matching stream).
    func run() async {
        guard let live else { return }
        let signedIn = session.user != nil
        var attempt = 0
        var hasConnected = false
        while !Task.isCancelled, (session.user != nil) == signedIn {
            do {
                for try await event in live.connect() {
                    if event == .ready {
                        isConnected = true
                        attempt = 0
                        // After a gap, events may have been missed.
                        if hasConnected { await refreshAll() }
                        hasConnected = true
                    } else {
                        await handle(event)
                    }
                }
            } catch {
                // Fall through to the back-off below.
            }
            isConnected = false
            guard !Task.isCancelled, (session.user != nil) == signedIn else { break }
            attempt += 1
            // 2 s, 4 s, 8 s ... capped at 60 s.
            let delay = min(60, 1 << min(attempt, 6))
            do { try await sleep(.seconds(delay)) } catch { break }
        }
        isConnected = false
    }

    func handle(_ event: LiveEvent) async {
        guard session.user != nil else {
            // Signed out: only the public parts are on screen.
            switch event {
            case .config: await appConfig?.refresh()
            case .plans: await membership.reloadPlans()
            default: break
            }
            return
        }
        switch event {
        case .ready:
            break
        case .catalog:
            scheduleCatalogReload()
        case .offerRemaining(let offerID, let remaining):
            catalog.updateRemaining(offerID: offerID, remaining: remaining)
        case .plans:
            await membership.reloadPlans()
        case .config:
            await appConfig?.refresh()
        case .membership:
            await membership.refresh()
        case .bookings:
            await wallet.refresh()
        case .account:
            // A revoked session answers 401 here and signs the member out.
            await session.refresh()
        }
    }

    /// Dashboard edits often come in bursts (a venue, then its tickets):
    /// reload once they settle.
    private func scheduleCatalogReload() {
        catalogReload?.cancel()
        catalogReload = Task { [weak self, sleep] in
            try? await sleep(.milliseconds(400))
            guard !Task.isCancelled else { return }
            await self?.catalog.reload()
        }
    }
}
