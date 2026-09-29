import SwiftUI
import XCTest
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
@testable import Sarena

// MARK: - Fixtures

private enum Fixtures {
    static func defaults() -> UserDefaults {
        UserDefaults(suiteName: "SarenaTests.\(UUID().uuidString)")!
    }

    static func booking() -> MockBookingService {
        MockBookingService(
            latency: .zero,
            directory: FileManager.default.temporaryDirectory.appending(path: UUID().uuidString, directoryHint: .isDirectory),
            defaults: defaults(),
            seedsWelcomeCodes: false
        )
    }

    static func membershipService() -> MockMembershipService {
        MockMembershipService(latency: .zero, defaults: defaults())
    }

    static let newMember = User(id: UUID(), fullName: "New Member", email: "new@sarena.om", phone: "92223333",
                                memberNumber: "SRN-1", memberSince: .now)

    @MainActor
    static func session(_ user: User? = .preview) -> SessionStore {
        let session = SessionStore(auth: MockAuthService(latency: .zero, defaults: defaults()),
                                   keychain: KeychainStore(service: "SarenaTests.\(UUID().uuidString)"))
        if let user { session.didAuthenticate(user) }
        return session
    }
}

// MARK: - Models

final class ModelTests: XCTestCase {
    func testDiscountPercentAndSavings() {
        let ticket = TicketOption(id: "t", title: LocalizedText("VIP", ar: "كبار الشخصيات"),
                                  originalPrice: .baisa(9_000), memberPrice: .baisa(5_500), perks: [], remaining: 3)
        XCTAssertEqual(ticket.savings, .baisa(3_500))
        XCTAssertEqual(ticket.discountPercent, 39)
        XCTAssertTrue(ticket.isLowStock)
        XCTAssertFalse(ticket.isSoldOut)
    }

    func testEveryCategoryHasAVenueWithTickets() {
        for category in OfferCategory.allCases {
            XCTAssertFalse(Venue.samples.filter { $0.category == category }.isEmpty, "\(category) has no venue")
        }
        for venue in Venue.samples {
            XCTAssertFalse(venue.tickets.isEmpty, "\(venue.id) has no tickets")
            XCTAssertEqual(venue.defaultTicket?.memberPrice, venue.tickets.map(\.memberPrice).min())
        }
    }

    func testSingleAnnualPlanAt15OMR() {
        let plan = MembershipPlan.annual
        XCTAssertEqual(plan.price, 15)
        XCTAssertEqual(plan.durationDays, 365)
        XCTAssertTrue(plan.isYearly)
        XCTAssertEqual(plan.price.baisaValue, 15_000)
    }

    func testBaisaRoundTrip() {
        XCTAssertEqual(Decimal.baisa(2_900).baisaValue, 2_900)
        XCTAssertEqual(Decimal(string: "1.2345")!.baisaValue, 1_235)
    }

    func testAppIconMapsToAlternateNames() {
        XCTAssertNil(AppIcon.classic.alternateIconName)
        XCTAssertEqual(AppIcon.glass.alternateIconName, "AppIcon-Glass")
        XCTAssertEqual(AppIcon(alternateIconName: "AppIcon-Glass"), .glass)
        XCTAssertEqual(AppIcon(alternateIconName: nil), .classic)
    }

    func testArabicLanguageIsRightToLeft() {
        XCTAssertEqual(AppLanguage.arabic.layoutDirection, .rightToLeft)
        XCTAssertEqual(AppLanguage.english.layoutDirection, .leftToRight)
    }

    func testMembershipValidity() {
        let now = Date(timeIntervalSince1970: 1_800_000_000)
        let membership = Membership(id: "m", plan: .annual, status: .active,
                                    startsAt: now.addingTimeInterval(-300 * 86_400), expiresAt: now.addingTimeInterval(20 * 86_400))
        XCTAssertTrue(membership.isActive(at: now))
        XCTAssertEqual(membership.daysRemaining(from: now), 20)
        XCTAssertTrue(membership.isEndingSoon(at: now))
        XCTAssertFalse(membership.isActive(at: now.addingTimeInterval(21 * 86_400)))
    }
}

/// The app decodes exactly what the Sarena API (`backend/`) sends.
final class APIDecodingTests: XCTestCase {
    func testDecodesVenueWithOffersImageAndEventDates() throws {
        let json = #"""
        {"venues":[{"id":"8b0f6f0e-8b0a-4c38-9a53-1f1f7e0e0a11","slug":"muscat-food-festival","category":"festivals",
          "name":{"en":"Muscat Food Festival","ar":"مهرجان مسقط للطعام"},"area":{"en":"Qurum","ar":"القرم"},
          "summary":{"en":"Street food","ar":"أكلات شعبية"},"about":{"en":"Three nights","ar":"ثلاث ليال"},
          "highlights":[],"openingHours":{"en":"6 PM","ar":"٦ م"},"latitude":23.61,"longitude":58.47,"rating":4.5,
          "reviewCount":10,"imageUrl":"https://sarena.om/uploads/poster.jpg","isFeatured":true,"isPublished":true,
          "dealEndsAt":null,"eventStartsAt":"2026-12-01T14:00:00.000Z","eventEndsAt":"2026-12-03T20:00:00Z",
          "offers":[{"id":"o1","title":{"en":"Entry pass","ar":"تذكرة دخول"},"perks":[],"originalPriceBaisa":5000,
            "memberPriceBaisa":3000,"remaining":2,"isActive":true}]}]}
        """#
        struct Response: Decodable { let venues: [Venue] }
        let venue = try XCTUnwrap(APIClient.decoder.decode(Response.self, from: Data(json.utf8)).venues.first)
        XCTAssertEqual(venue.category, .festivals)
        XCTAssertEqual(venue.imageURL?.absoluteString, "https://sarena.om/uploads/poster.jpg")
        XCTAssertEqual(venue.tickets.first?.memberPrice, 3)
        XCTAssertEqual(venue.tickets.first?.remaining, 2)
        XCTAssertEqual(venue.eventStartsAt, Date(timeIntervalSince1970: 1_796_133_600))
        XCTAssertNotNil(venue.eventEndsAt)
        XCTAssertNil(venue.dealEndsAt)
        XCTAssertEqual(venue.maxDiscountPercent, 40)
    }

    func testDecodesMembershipAndBooking() throws {
        let json = #"""
        {"user":{"id":"5A7E1A00-0000-4000-8000-000000000001","fullName":"Demo","email":"demo@sarena.om","phone":"91234567",
          "memberNumber":"SRN-204851","memberSince":"2026-01-01T00:00:00.000Z","role":"member","status":"active"},
         "membership":{"id":"m1","plan":{"id":"p1","name":{"en":"Sarena Annual Membership","ar":"عضوية سرينا السنوية"},
           "description":{"en":"d","ar":"د"},"priceBaisa":15000,"durationDays":365,"perks":[],"isActive":true},
           "status":"active","source":"demo","startsAt":"2026-01-01T00:00:00.000Z","expiresAt":"2027-01-01T00:00:00.000Z"}}
        """#
        struct Response: Decodable { let user: User; let membership: Membership? }
        let response = try APIClient.decoder.decode(Response.self, from: Data(json.utf8))
        XCTAssertEqual(response.user.memberNumber, "SRN-204851")
        XCTAssertEqual(response.membership?.plan.price, 15)
        XCTAssertEqual(response.membership?.status, .active)

        let booking = #"""
        {"id":"b1","code":"SRN-AB12-CD34","venueId":null,"venueName":{"en":"Arena","ar":"الساحة"},"category":"ibriArena",
         "offerTitle":{"en":"General stand","ar":"المدرج العام"},"quantity":2,"paidTotalBaisa":6000,"originalTotalBaisa":10000,
         "status":"used","purchasedAt":"2026-09-01T10:00:00.000Z","expiresAt":"2026-10-01T10:00:00.000Z","usedAt":"2026-09-02T10:00:00.000Z"}
        """#
        let code = try APIClient.decoder.decode(PromoCode.self, from: Data(booking.utf8))
        XCTAssertEqual(code.savings, 4)
        XCTAssertEqual(code.status, .used)
        XCTAssertEqual(code.venueID, "")
        XCTAssertFalse(code.isRedeemable)
    }

    func testErrorEnvelope() {
        let error = APIClient.error(from: Data(#"{"error":{"code":"membership_required","message":"x"}}"#.utf8), status: 402)
        XCTAssertEqual(error, APIError(status: 402, code: "membership_required", message: "x"))
        XCTAssertFalse(error.endsSession)
        XCTAssertTrue(APIError(status: 401, code: "unauthorized", message: "").endsSession)
        XCTAssertEqual(APIAuthService.authError(APIError(status: 409, code: "email_taken", message: "")), .emailAlreadyRegistered)
    }
}

final class ValidationTests: XCTestCase {
    func testEmail() {
        XCTAssertTrue(Validation.isValidEmail("member@sarena.om"))
        XCTAssertFalse(Validation.isValidEmail("member@sarena"))
    }

    func testOmaniPhoneAcceptsArabicDigitsAndCountryCode() {
        XCTAssertTrue(Validation.isValidOmaniPhone("٩١٢٣٤٥٦٧"))
        XCTAssertTrue(Validation.isValidOmaniPhone("+968 9123 4567"))
        XCTAssertEqual(Validation.normalizedOmaniPhone("00968 7123 4567"), "71234567")
        XCTAssertFalse(Validation.isValidOmaniPhone("81234567"))
    }

    func testPasswordStrength() {
        XCTAssertEqual(Validation.strength(of: "short1"), .weak)
        XCTAssertEqual(Validation.strength(of: "sarena2026"), .fair)
        XCTAssertEqual(Validation.strength(of: "Sarena#2026"), .strong)
    }
}

// MARK: - Auth

final class AuthServiceTests: XCTestCase {
    private func makeService() -> MockAuthService {
        MockAuthService(latency: .zero, defaults: Fixtures.defaults())
    }

    func testDemoAccountSignsInWithEmail() async throws {
        let user = try await makeService().signIn(email: DemoAccount.email, password: DemoAccount.password)
        XCTAssertEqual(user.email, DemoAccount.email)
    }

    func testWrongPasswordIsRejected() async {
        do {
            _ = try await makeService().signIn(email: DemoAccount.email, password: "nope")
            XCTFail("Expected invalid credentials")
        } catch {
            XCTAssertEqual(error as? AuthError, .invalidCredentials)
        }
    }

    func testDemoAccountSignsInWithPhoneCode() async throws {
        let service = makeService()
        let challenge = try await service.requestCode(phone: "+968 " + DemoAccount.phone)
        XCTAssertEqual(challenge.phone, DemoAccount.phone)
        let user = try await service.verifyCode(DemoAccount.otp, phone: challenge.phone)
        XCTAssertEqual(user.phone, DemoAccount.phone)
    }

    func testUnknownPhoneCannotRequestCode() async {
        do {
            _ = try await makeService().requestCode(phone: "99999999")
            XCTFail("Expected phoneNotRegistered")
        } catch {
            XCTAssertEqual(error as? AuthError, .phoneNotRegistered)
        }
    }

    @MainActor
    func testDeletingTheAccountSignsOutAndRemovesIt() async throws {
        let defaults = Fixtures.defaults()
        let service = MockAuthService(latency: .zero, defaults: defaults)
        let user = try await service.register(RegistrationForm(fullName: "Temp Member", email: "temp@sarena.om",
                                                               phone: "93334444", password: "sarena2026"))
        let session = SessionStore(auth: service, keychain: KeychainStore(service: "SarenaTests.\(UUID().uuidString)"))
        session.didAuthenticate(user)
        var unlinkedPush = false
        session.beforeSignOut = { unlinkedPush = true }
        try await session.deleteAccount()
        XCTAssertNil(session.user)
        XCTAssertTrue(unlinkedPush)
        do {
            _ = try await service.signIn(email: "temp@sarena.om", password: "sarena2026")
            XCTFail("The account should be gone")
        } catch {
            XCTAssertEqual(error as? AuthError, .invalidCredentials)
        }
    }

    func testRegistrationRejectsDuplicates() async throws {
        let service = makeService()
        let form = RegistrationForm(fullName: "New Member", email: "new@sarena.om", phone: "92223333", password: "sarena2026")
        let user = try await service.register(form)
        let refreshed = try await service.refreshed(user)
        XCTAssertEqual(refreshed, user)
        do {
            _ = try await service.register(form)
            XCTFail("Expected emailAlreadyRegistered")
        } catch {
            XCTAssertEqual(error as? AuthError, .emailAlreadyRegistered)
        }
    }
}

// MARK: - Membership

@MainActor
final class MembershipTests: XCTestCase {
    func testDemoMemberIsActiveNewMembersAreNot() async {
        let store = MembershipStore(service: Fixtures.membershipService())
        await store.load(for: User.preview) // demo@sarena.om
        XCTAssertTrue(store.isActive)
        XCTAssertEqual(store.plan, .annual)

        await store.load(for: Fixtures.newMember)
        XCTAssertFalse(store.isActive)
        XCTAssertNil(store.membership)
        XCTAssertEqual(store.state, .loaded)
    }

    func testSubscribingGivesAYearAndRenewalKeepsRemainingDays() async throws {
        let store = MembershipStore(service: Fixtures.membershipService())
        await store.load(for: Fixtures.newMember)
        let first = try await store.subscribe()
        XCTAssertTrue(store.isActive)
        XCTAssertEqual(first.expiresAt.timeIntervalSince(first.startsAt), 365 * 86_400, accuracy: 1)

        let renewal = try await store.subscribe()
        XCTAssertEqual(renewal.startsAt, first.expiresAt)
        XCTAssertEqual(store.membership, renewal)
    }

    func testAccountSubscribeFlow() async {
        let session = Fixtures.session(Fixtures.newMember)
        let store = MembershipStore(service: Fixtures.membershipService())
        await store.load(for: Fixtures.newMember)
        let account = AccountViewModel(store: store, session: session, wallet: WalletStore(booking: Fixtures.booking()))
        XCTAssertFalse(account.isRenewal)

        account.requestSubscription()
        XCTAssertTrue(account.isConfirming)
        await account.confirmSubscription()
        XCTAssertFalse(account.isConfirming)
        XCTAssertTrue(account.isActive)
        XCTAssertTrue(account.isRenewal)
        XCTAssertNotNil(account.subscribedAt)
        XCTAssertLessThan(account.progress(), 0.01)
    }
}

// MARK: - Wallet & booking

@MainActor
final class WalletAndBookingTests: XCTestCase {
    private func makeDetail(user: User) async -> (VenueDetailViewModel, WalletStore, MembershipStore) {
        let booking = Fixtures.booking()
        let wallet = WalletStore(booking: booking)
        await wallet.load(for: user)
        let membership = MembershipStore(service: Fixtures.membershipService())
        await membership.load(for: user)
        let detail = VenueDetailViewModel(venue: Venue.samples[0], booking: booking, session: Fixtures.session(user),
                                          wallet: wallet, membership: membership)
        return (detail, wallet, membership)
    }

    func testMembersBookTheSelectedTicket() async {
        let (detail, wallet, _) = await makeDetail(user: .preview)
        let vip = Venue.samples[0].tickets[1]
        detail.select(vip)
        detail.quantity = 2
        XCTAssertTrue(detail.canBook)
        await detail.book()

        XCTAssertNotNil(detail.confirmedCode)
        XCTAssertEqual(wallet.activeCodes.count, 1)
        XCTAssertEqual(wallet.activeCodes.first?.quantity, 2)
        XCTAssertEqual(wallet.activeCodes.first?.offerTitle, vip.title)
        XCTAssertEqual(wallet.totalSavings, vip.savings * 2)
    }

    func testBookingNeedsAnActiveMembership() async throws {
        let (detail, wallet, membership) = await makeDetail(user: Fixtures.newMember)
        XCTAssertTrue(detail.needsMembership)
        XCTAssertFalse(detail.canBook)
        await detail.book()
        XCTAssertNil(detail.confirmedCode)
        XCTAssertTrue(wallet.codes.isEmpty)

        try await membership.subscribe()
        XCTAssertFalse(detail.needsMembership)
        XCTAssertTrue(detail.canBook)
    }

    func testDetailFollowsLiveCatalogChanges() async {
        let catalog = CatalogStore(catalog: MockCatalogService(latency: .zero))
        await catalog.reload()
        let membership = MembershipStore(service: Fixtures.membershipService())
        await membership.load(for: .preview)
        let venue = Venue.samples[0]
        let detail = VenueDetailViewModel(venue: venue, booking: Fixtures.booking(), session: Fixtures.session(),
                                          wallet: WalletStore(booking: Fixtures.booking()), membership: membership, catalog: catalog)
        let ticket = venue.tickets[0]
        detail.select(ticket)
        XCTAssertTrue(detail.canBook)

        catalog.updateRemaining(offerID: ticket.id, remaining: 0)
        XCTAssertEqual(detail.ticket?.isSoldOut, true)
        XCTAssertFalse(detail.canBook)
        XCTAssertTrue(detail.isAvailable)
    }

    func testMarkUsedMovesCodeToHistory() async throws {
        let booking = Fixtures.booking()
        let wallet = WalletStore(booking: booking)
        await wallet.load(for: .preview)
        let code = try await booking.book(venue: Venue.samples[1], ticket: Venue.samples[1].tickets[0], quantity: 1, for: .preview)
        wallet.add(code)

        let viewModel = WalletViewModel(wallet: wallet)
        XCTAssertEqual(viewModel.count(for: .active), 1)
        await viewModel.markUsed(code)
        XCTAssertEqual(viewModel.count(for: .active), 0)
        XCTAssertEqual(viewModel.count(for: .used), 1)

        // Persisted by the (mock) backend.
        await wallet.refresh()
        XCTAssertEqual(wallet.usedCodes.first?.id, code.id)
    }

    func testAccountShowsMemberSavings() async throws {
        let booking = Fixtures.booking()
        let wallet = WalletStore(booking: booking)
        await wallet.load(for: .preview)
        let venue = Venue.samples[0]
        let code = try await booking.book(venue: venue, ticket: venue.tickets[0], quantity: 2, for: .preview)
        wallet.add(code)

        let account = AccountViewModel(store: MembershipStore(service: Fixtures.membershipService()),
                                       session: Fixtures.session(), wallet: wallet)
        XCTAssertEqual(account.user, User.preview)
        XCTAssertEqual(account.totalSavings, code.savings)
        XCTAssertEqual(account.readyCount, 1)
        XCTAssertEqual(account.redeemedCount, 0)

        try await wallet.markUsed(code)
        XCTAssertEqual(account.readyCount, 0)
        XCTAssertEqual(account.redeemedCount, 1)
    }

    func testPromoCodeFormat() {
        let code = MockBookingService.makeCode()
        XCTAssertNotNil(code.wholeMatch(of: #/SRN-[A-Z2-9]{4}-[A-Z2-9]{4}/#))
    }
}

// MARK: - Live updates

final class ServerSentEventParserTests: XCTestCase {
    func testParsesSarenaEvents() {
        var parser = ServerSentEventParser()
        let lines = [
            "retry: 3000", "event: ready", "data: {}",
            ": ping",
            "event: catalog", "data: {}",
            "event: offer", #"data: {"offerId":"o1","venueId":"v1","remaining":4}"#,
            "event: admin", #"data: {"topic":"members"}"#,
            "event: account", #"data: {"revoked":true}"#,
        ]
        let events = lines.compactMap { parser.consume($0) }
        XCTAssertEqual(events, [.ready, .catalog, .offerRemaining(offerID: "o1", remaining: 4), .account(revoked: true)])
    }

    func testUnlimitedRemainingIsNil() {
        var parser = ServerSentEventParser()
        _ = parser.consume("event: offer")
        XCTAssertEqual(parser.consume(#"data: {"offerId":"o1","remaining":null}"#), .offerRemaining(offerID: "o1", remaining: nil))
    }
}

/// Replays scripted connections: each `connect()` plays the next batch, then fails.
private final class ScriptedLiveUpdates: LiveUpdatesServicing, @unchecked Sendable {
    private let lock = NSLock()
    private var batches: [[LiveEvent]]
    private var count = 0

    init(_ batches: [[LiveEvent]]) {
        self.batches = batches
    }

    var connections: Int {
        lock.lock()
        defer { lock.unlock() }
        return count
    }

    func connect() -> AsyncThrowingStream<LiveEvent, Error> {
        lock.lock()
        count += 1
        let batch = batches.isEmpty ? nil : batches.removeFirst()
        lock.unlock()
        return AsyncThrowingStream { continuation in
            guard let batch else {
                continuation.finish(throwing: APIError.network)
                return
            }
            for event in batch { continuation.yield(event) }
            continuation.finish()
        }
    }
}

private final class DelayRecorder: @unchecked Sendable {
    var delays: [Duration] = []
}

@MainActor
final class LiveSyncTests: XCTestCase {
    private struct Stores {
        let session: SessionStore
        let catalog: CatalogStore
        let membership: MembershipStore
        let wallet: WalletStore
        let membershipService: MockMembershipService
    }

    private func makeStores() async -> Stores {
        let session = Fixtures.session(Fixtures.newMember)
        let catalog = CatalogStore(catalog: MockCatalogService(latency: .zero))
        await catalog.reload()
        let service = Fixtures.membershipService()
        let membership = MembershipStore(service: service)
        await membership.load(for: Fixtures.newMember)
        let wallet = WalletStore(booking: Fixtures.booking())
        await wallet.load(for: Fixtures.newMember)
        return Stores(session: session, catalog: catalog, membership: membership, wallet: wallet, membershipService: service)
    }

    func testEventsUpdateTheRightStore() async throws {
        let stores = await makeStores()
        let sync = LiveSync(live: nil, session: stores.session, catalog: stores.catalog,
                            membership: stores.membership, wallet: stores.wallet)

        let ticket = Venue.samples[0].tickets[0]
        await sync.handle(.offerRemaining(offerID: ticket.id, remaining: 3))
        XCTAssertEqual(stores.catalog.venue(id: Venue.samples[0].id)?.tickets[0].remaining, 3)

        // Granted from the dashboard → it appears without signing in again.
        _ = try await stores.membershipService.subscribe(to: .annual, for: Fixtures.newMember)
        XCTAssertFalse(stores.membership.isActive)
        await sync.handle(.membership)
        XCTAssertTrue(stores.membership.isActive)
    }

    func testReconnectsWithBackOff() async {
        let stores = await makeStores()
        // Two connections that end, then a failing one.
        let live = ScriptedLiveUpdates([[.ready, .membership], [.ready]])
        let recorder = DelayRecorder()
        let session = stores.session
        let sync = LiveSync(live: live, session: stores.session, catalog: stores.catalog,
                            membership: stores.membership, wallet: stores.wallet,
                            sleep: { @MainActor delay in
                                recorder.delays.append(delay)
                                if recorder.delays.count == 3 { session.endSession() }
                            })
        await sync.run()
        XCTAssertEqual(live.connections, 3)
        // A successful connection resets the back-off; failures double it.
        XCTAssertEqual(recorder.delays, [.seconds(2), .seconds(2), .seconds(4)])
        XCTAssertFalse(sync.isConnected)
    }

    func testSignedOutFollowsPublicChangesOnly() async throws {
        let stores = await makeStores()
        stores.session.endSession()
        let theme = SeasonalTheme(id: "nd", name: "National Day 2026")
        let appConfig = AppConfigStore(service: MockAppConfigService(config: AppConfig(theme: theme, reminders: .standard, links: .init())),
                                       defaults: Fixtures.defaults())
        XCTAssertNil(appConfig.theme)
        // A membership granted meanwhile must not be fetched for a signed-out screen.
        _ = try await stores.membershipService.subscribe(to: .annual, for: Fixtures.newMember)
        let live = ScriptedLiveUpdates([[.ready, .config, .membership, .bookings]])
        let sync = LiveSync(live: live, session: stores.session, catalog: stores.catalog,
                            membership: stores.membership, wallet: stores.wallet, appConfig: appConfig,
                            sleep: { _ in throw CancellationError() })
        await sync.run()
        XCTAssertEqual(live.connections, 1)
        XCTAssertEqual(appConfig.theme?.id, "nd")
        XCTAssertFalse(stores.membership.isActive)
    }
}

// MARK: - Server address & images

final class ServerAddressTests: XCTestCase {
    func testNormalizesWhateverIsPasted() {
        XCTAssertEqual(ServerAddress.normalized("roll-participated-enable-lions.trycloudflare.com")?.absoluteString,
                       "https://roll-participated-enable-lions.trycloudflare.com")
        XCTAssertEqual(ServerAddress.normalized(" https://Sarena.om/admin/#/venues ")?.absoluteString, "https://sarena.om")
        XCTAssertEqual(ServerAddress.normalized("http://192.168.1.20:3000/")?.absoluteString, "http://192.168.1.20:3000")
        XCTAssertNil(ServerAddress.normalized("ftp://sarena.om"))
        XCTAssertNil(ServerAddress.normalized("   "))
    }

    func testReadsOnlyConnectLinks() {
        let link = URL(string: "sarena://connect?server=https%3A%2F%2Fnew-tunnel.trycloudflare.com%2Fadmin%2F")!
        XCTAssertEqual(ServerAddress.fromConnectLink(link)?.absoluteString, "https://new-tunnel.trycloudflare.com")
        XCTAssertNil(ServerAddress.fromConnectLink(URL(string: "sarena://redeem?code=SRN-AB12-CD34")!))
        XCTAssertNil(ServerAddress.fromConnectLink(URL(string: "https://connect?server=https://evil.example")!))
        XCTAssertNil(ServerAddress.fromConnectLink(URL(string: "sarena://connect?server=javascript:alert(1)")!))
    }

    func testTheSchemeThenTheLinkedServerThenInfoPlist() {
        // The test bundle has no SarenaAPIBaseURL (the app's Info.plist does).
        let bundle = Bundle(for: ServerAddressTests.self)
        let defaults = Fixtures.defaults()
        XCTAssertNil(ServerAddress.current(bundle: bundle, environment: [:], defaults: defaults))
        ServerAddress.save(URL(string: "https://linked.example"), defaults: defaults)
        XCTAssertEqual(ServerAddress.current(bundle: bundle, environment: [:], defaults: defaults)?.absoluteString, "https://linked.example")
        XCTAssertEqual(ServerAddress.current(bundle: bundle, environment: ["SARENA_API_BASE_URL": "http://localhost:3000"], defaults: defaults)?
            .absoluteString, "http://localhost:3000")
        ServerAddress.save(nil, defaults: defaults)
        XCTAssertNil(ServerAddress.current(bundle: bundle, environment: [:], defaults: defaults))
    }
}

final class PushRegistrationTests: XCTestCase {
    /// A provisioning profile: the entitlements plist inside a binary signature.
    private func profile(apsEnvironment: String?) -> Data {
        let entitlements = apsEnvironment.map { "<key>aps-environment</key><string>\($0)</string>" } ?? ""
        let plist = """
        <?xml version="1.0" encoding="UTF-8"?>
        <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
        <plist version="1.0"><dict><key>Name</key><string>Sarena</string>\
        <key>Entitlements</key><dict>\(entitlements)</dict></dict></plist>
        """
        return Data([0x30, 0x82, 0x1F, 0x00, 0x06]) + Data(plist.utf8) + Data([0xA0, 0x82, 0x00, 0xFF])
    }

    func testTheGatewayComesFromTheProvisioningProfile() {
        XCTAssertEqual(PushEnvironment.from(provisioningProfile: profile(apsEnvironment: "development")), .sandbox)
        XCTAssertEqual(PushEnvironment.from(provisioningProfile: profile(apsEnvironment: "production")), .production)
        XCTAssertEqual(PushEnvironment.from(provisioningProfile: nil), .production, "App Store builds carry no profile")
        XCTAssertEqual(PushEnvironment.from(provisioningProfile: Data("not a profile".utf8)), .production)
    }

    func testRegistrationSendsTheGatewayAndBundleIdentifier() async throws {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [RecordingURLProtocol.self]
        let client = APIClient(baseURL: URL(string: "https://sarena.test")!,
                               tokens: TokenStore(keychain: KeychainStore(service: "SarenaTests.\(UUID().uuidString)")),
                               session: URLSession(configuration: configuration))
        let registration = APIPushRegistration(client: client, environment: .sandbox, bundleID: "om.sarena.app")
        try await registration.register(token: "abcdef0123456789", locale: "ar-OM")

        let request = try XCTUnwrap(RecordingURLProtocol.lastRequest)
        XCTAssertTrue(request.url?.path.hasSuffix("/v1/me/devices") ?? false)
        let body = try XCTUnwrap(JSONSerialization.jsonObject(with: RecordingURLProtocol.lastBody ?? Data()) as? [String: Any])
        XCTAssertEqual(body["token"] as? String, "abcdef0123456789")
        XCTAssertEqual(body["platform"] as? String, "ios")
        XCTAssertEqual(body["environment"] as? String, "sandbox")
        XCTAssertEqual(body["bundleId"] as? String, "om.sarena.app")
    }
}

/// Answers every request with `{"ok":true}` and keeps the last one.
private final class RecordingURLProtocol: URLProtocol {
    nonisolated(unsafe) static var lastRequest: URLRequest?
    nonisolated(unsafe) static var lastBody: Data?

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        Self.lastRequest = request
        Self.lastBody = request.httpBody ?? request.httpBodyStream.map(Self.read)
        let response = HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: ["Content-Type": "application/json"])!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: Data(#"{"ok":true}"#.utf8))
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}

    private static func read(_ stream: InputStream) -> Data {
        stream.open()
        defer { stream.close() }
        var data = Data()
        var buffer = [UInt8](repeating: 0, count: 1024)
        while stream.hasBytesAvailable {
            let count = stream.read(&buffer, maxLength: buffer.count)
            if count <= 0 { break }
            data.append(buffer, count: count)
        }
        return data
    }
}

final class MediaURLTests: XCTestCase {
    func testUploadedImagesLoadFromTheServerInUse() throws {
        let base = URL(string: "https://tunnel.example")!
        XCTAssertEqual(MediaURL.resolve("/uploads/a.jpg", base: base)?.absoluteString, "https://tunnel.example/uploads/a.jpg")
        XCTAssertEqual(MediaURL.resolve("http://localhost:3000/uploads/a.jpg", base: base)?.absoluteString, "https://tunnel.example/uploads/a.jpg")
        XCTAssertEqual(MediaURL.resolve("https://cdn.example/uploads/p.jpg", base: base)?.absoluteString, "https://cdn.example/uploads/p.jpg")
        XCTAssertNil(MediaURL.resolve("  ", base: base))

        let json = #"""
        {"theme":{"id":"t1","name":"Eid","logoUrl":"/uploads/eid.png","bannerUrl":"http://localhost:3000/uploads/banner.jpg",
          "greeting":null,"accentColor":null,"iconName":null,"startsAt":null,"endsAt":null,"isEnabled":true},
         "reminders":{"morningHour":8,"hoursBefore":5,"finalReminderMinutes":60},
         "links":{"appStoreUrl":"","googlePlayUrl":"","whatsapp":"","email":"","instagram":""},"timeZone":"Asia/Muscat"}
        """#
        let config = try APIClient.makeDecoder(baseURL: base).decode(AppConfig.self, from: Data(json.utf8))
        // Older servers don't mention Apple Wallet: the button stays hidden.
        XCTAssertFalse(config.walletEnabled)
        let withWallet = try APIClient.decoder.decode(AppConfig.self, from: Data(json.replacingOccurrences(
            of: #""timeZone":"Asia/Muscat"}"#, with: #""timeZone":"Asia/Muscat","wallet":{"enabled":true}}"#).utf8))
        XCTAssertTrue(withWallet.walletEnabled)
        XCTAssertEqual(config.theme?.logoURL?.absoluteString, "https://tunnel.example/uploads/eid.png")
        XCTAssertEqual(config.theme?.bannerURL?.absoluteString, "https://tunnel.example/uploads/banner.jpg")
        // Cached copies keep the full address.
        let cached = try JSONDecoder().decode(AppConfig.self, from: JSONEncoder().encode(config))
        XCTAssertEqual(cached.theme?.logoURL, config.theme?.logoURL)
    }
}

// MARK: - Seasonal themes, discounts & reminders

final class AppConfigTests: XCTestCase {
    func testDecodesThemeRemindersAndPlanDiscount() throws {
        let json = #"""
        {"theme":{"id":"t1","name":"National Day 2026","logoUrl":"https://sarena.om/uploads/nd.png","bannerUrl":null,
          "greeting":{"en":"Happy National Day","ar":"عيد وطني سعيد"},"accentColor":"#C8102E","iconName":"AppIcon-NationalDay",
          "startsAt":null,"endsAt":"2026-11-21T20:00:00.000Z","isEnabled":true},
         "reminders":{"morningHour":9,"hoursBefore":6,"finalReminderMinutes":30},
         "links":{"appStoreUrl":"","googlePlayUrl":"","whatsapp":"96890000000","email":"","instagram":""},"timeZone":"Asia/Muscat"}
        """#
        let config = try APIClient.decoder.decode(AppConfig.self, from: Data(json.utf8))
        XCTAssertEqual(config.theme?.iconName, "AppIcon-NationalDay")
        XCTAssertEqual(config.theme?.logoURL?.lastPathComponent, "nd.png")
        XCTAssertNil(config.theme?.bannerURL)
        XCTAssertEqual(config.reminders, ReminderSettings(morningHour: 9, hoursBefore: 6, finalReminderMinutes: 30))

        let plan = #"""
        {"id":"p1","name":{"en":"Annual","ar":"سنوي"},"description":{"en":"d","ar":"د"},"priceBaisa":15000,"durationDays":365,
         "perks":[],"isActive":true,"promo":{"priceBaisa":12000,"label":{"en":"National Day offer","ar":"عرض العيد الوطني"},"endsAt":null}}
        """#
        let decoded = try APIClient.decoder.decode(MembershipPlan.self, from: Data(plan.utf8))
        XCTAssertEqual(decoded.price, 15)
        XCTAssertEqual(decoded.effectivePrice, 12)
        XCTAssertEqual(decoded.promo?.label.en, "National Day offer")
        let noPromo = try APIClient.decoder.decode(MembershipPlan.self, from: Data(plan.replacingOccurrences(
            of: #""promo":{"priceBaisa":12000,"label":{"en":"National Day offer","ar":"عرض العيد الوطني"},"endsAt":null}"#,
            with: #""promo":null"#).utf8))
        XCTAssertNil(noPromo.promo)
        XCTAssertEqual(noPromo.effectivePrice, 15)
    }
}

@MainActor
final class SeasonalThemeTests: XCTestCase {
    func testCachesTheLastConfig() async {
        let defaults = Fixtures.defaults()
        let theme = SeasonalTheme(id: "r", name: "Ramadan", greeting: LocalizedText("Ramadan Kareem", ar: "رمضان كريم"))
        let first = AppConfigStore(service: MockAppConfigService(config: AppConfig(theme: theme, reminders: .standard, links: .init())),
                                   defaults: defaults)
        await first.refresh()
        let offline = AppConfigStore(service: MockAppConfigService(), defaults: defaults)
        XCTAssertEqual(offline.theme?.greeting?.ar, "رمضان كريم", "shown from the first frame on the next launch")
    }
}

final class ReminderPlannerTests: XCTestCase {
    private var calendar: Calendar = {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "Asia/Muscat")!
        return calendar
    }()

    private func date(_ day: Int, _ hour: Int, _ minute: Int = 0) -> Date {
        calendar.date(from: DateComponents(year: 2026, month: 9, day: day, hour: hour, minute: minute))!
    }

    private func code(startingAt start: Date?, id: String = "c1", status: PromoCode.Status = .active) -> PromoCode {
        PromoCode(id: id, code: "SRN-AB12-CD34", venueID: "v", venueName: LocalizedText("Muscat Nights", ar: "ليالي مسقط"),
                  category: .festivals, offerTitle: LocalizedText("Entry", ar: "دخول"), quantity: 1,
                  paidTotal: 1, originalTotal: 2, purchasedAt: date(1, 10), expiresAt: date(28, 23),
                  status: status, eventStartsAt: start)
    }

    func testMorningOfTheEventWhenItIsFarEnoughAhead() {
        let main = ReminderPlanner.mainReminder(start: date(18, 20), settings: .standard, calendar: calendar)
        XCTAssertEqual(main.date, date(18, 8))
        XCTAssertFalse(main.isEveningBefore)
    }

    func testAtLeastFiveHoursBeforeAMiddayEvent() {
        let main = ReminderPlanner.mainReminder(start: date(18, 12), settings: .standard, calendar: calendar)
        XCTAssertEqual(main.date, date(18, 7))
    }

    func testEveningBeforeAnEarlyEvent() {
        let main = ReminderPlanner.mainReminder(start: date(18, 10), settings: .standard, calendar: calendar)
        XCTAssertEqual(main.date, date(17, 20))
        XCTAssertTrue(main.isEveningBefore)
    }

    func testPlansMainAndFinalRemindersInTheAppLanguage() {
        let plan = ReminderPlanner.plan(codes: [code(startingAt: date(18, 20))], settings: .standard,
                                        now: date(10, 12), calendar: calendar, locale: Locale(identifier: "ar"))
        XCTAssertEqual(plan.map(\.fireDate), [date(18, 8), date(18, 19)])
        XCTAssertEqual(plan.first?.title, "اليوم: ليالي مسقط")
        XCTAssertEqual(plan.last?.title, "ليالي مسقط تبدأ بعد ساعة")
        XCTAssertTrue(plan.allSatisfy { $0.id.hasPrefix(ReminderPlanner.prefix) })
    }

    func testSkipsPastUsedAndNonEventCodesGetAnExpiryReminder() {
        let codes = [
            code(startingAt: date(5, 20), id: "past"),
            code(startingAt: date(18, 20), id: "used", status: .used),
            code(startingAt: nil, id: "plain"),
        ]
        let plan = ReminderPlanner.plan(codes: codes, settings: .standard, now: date(10, 12), calendar: calendar,
                                        locale: Locale(identifier: "en"))
        XCTAssertEqual(plan.map(\.id), ["\(ReminderPlanner.prefix)plain.expiry"])
        XCTAssertEqual(plan.first?.fireDate, date(26, 8))
    }

    func testFinalReminderCanBeTurnedOff() {
        var settings = ReminderSettings.standard
        settings.finalReminderMinutes = 0
        let plan = ReminderPlanner.plan(codes: [code(startingAt: date(18, 20))], settings: settings,
                                        now: date(10, 12), calendar: calendar, locale: Locale(identifier: "en"))
        XCTAssertEqual(plan.count, 1)
    }
}

private actor FakeNotificationCenter: LocalNotificationScheduling {
    var pending: [String: PlannedReminder] = [:]

    func pendingIdentifiers() async -> [String] { Array(pending.keys) }
    func add(_ reminder: PlannedReminder) async { pending[reminder.id] = reminder }
    func remove(identifiers: [String]) async { identifiers.forEach { pending[$0] = nil } }
    func insertForeign(_ id: String) { pending[id] = PlannedReminder(id: id, fireDate: .now, title: "", body: "") }
}

@MainActor
final class ReminderSchedulerTests: XCTestCase {
    func testKeepsPendingRemindersInStepWithTheWallet() async {
        let center = FakeNotificationCenter()
        await center.insertForeign("someone-else")
        let scheduler = ReminderScheduler(center: center)
        let start = Date.now.addingTimeInterval(10 * 86_400)
        var code = PromoCode(id: "c1", code: "SRN-AB12-CD34", venueID: "v", venueName: LocalizedText("Arena", ar: "الساحة"),
                             category: .ibriArena, offerTitle: LocalizedText("Seat", ar: "مقعد"), quantity: 1, paidTotal: 1,
                             originalTotal: 2, purchasedAt: .now, expiresAt: start.addingTimeInterval(86_400),
                             status: .active, eventStartsAt: start)
        await scheduler.sync(codes: [code], settings: .standard, locale: Locale(identifier: "en"))
        var ids = await center.pendingIdentifiers()
        XCTAssertEqual(ids.filter { $0.hasPrefix(ReminderPlanner.prefix) }.count, 2)

        // Redeemed at the venue (live update) → its reminders go away.
        code.status = .used
        await scheduler.sync(codes: [code], settings: .standard, locale: Locale(identifier: "en"))
        ids = await center.pendingIdentifiers()
        XCTAssertEqual(ids, ["someone-else"])

        await scheduler.clear()
        ids = await center.pendingIdentifiers()
        XCTAssertEqual(ids, ["someone-else"])
    }
}

// MARK: - Language

@MainActor
final class LanguageCoordinatorTests: XCTestCase {
    func testLanguageSwitchesBehindTheCover() async {
        let defaults = Fixtures.defaults()
        let coordinator = LanguageCoordinator(defaults: defaults, coverDelay: .zero, settleDelay: .zero)
        XCTAssertEqual(coordinator.language, .system)

        var languageWhileCovered: AppLanguage?
        var coverWhileCovered: AppLanguage?
        await coordinator.change(to: .arabic) {
            languageWhileCovered = coordinator.language
            coverWhileCovered = coordinator.coverLanguage
        }

        // Applied while the cover was up, then the cover lifted.
        XCTAssertEqual(languageWhileCovered, .arabic)
        XCTAssertEqual(coverWhileCovered, .arabic)
        XCTAssertEqual(coordinator.language, .arabic)
        XCTAssertNil(coordinator.coverLanguage)
        XCTAssertEqual(coordinator.transitionSeconds, 0)

        // Persisted for the next launch.
        XCTAssertEqual(LanguageCoordinator(defaults: defaults).language, .arabic)
    }

    func testChoosingTheCurrentLanguageSkipsTheCover() async {
        let coordinator = LanguageCoordinator(defaults: Fixtures.defaults(), coverDelay: .zero, settleDelay: .zero)
        var continued = false
        await coordinator.change(to: .system) { continued = true }
        XCTAssertTrue(continued)
        XCTAssertNil(coordinator.coverLanguage)
        XCTAssertEqual(coordinator.language, .system)
    }
}
