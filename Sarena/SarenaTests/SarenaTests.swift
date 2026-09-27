import SwiftUI
import XCTest
@testable import Sarena

final class ModelTests: XCTestCase {
    func testDiscountPercentAndSavings() {
        let ticket = TicketOption(id: "t", tier: .vip, originalPrice: .baisa(9_000), memberPrice: .baisa(5_500), perks: [], remaining: 3)
        XCTAssertEqual(ticket.savings, .baisa(3_500))
        XCTAssertEqual(ticket.discountPercent, 39)
        XCTAssertTrue(ticket.isLowStock)
    }

    func testEveryCategoryHasAVenue() {
        for category in OfferCategory.allCases {
            XCTAssertFalse(Venue.samples.filter { $0.category == category }.isEmpty, "\(category) has no venue")
        }
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

final class AuthServiceTests: XCTestCase {
    private func makeService() -> MockAuthService {
        let defaults = UserDefaults(suiteName: "SarenaTests.\(UUID().uuidString)")!
        return MockAuthService(latency: .zero, defaults: defaults)
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

    func testRegistrationRejectsDuplicates() async throws {
        let service = makeService()
        let form = RegistrationForm(fullName: "New Member", email: "new@sarena.om", phone: "92223333", password: "sarena2026")
        _ = try await service.register(form)
        do {
            _ = try await service.register(form)
            XCTFail("Expected emailAlreadyRegistered")
        } catch {
            XCTAssertEqual(error as? AuthError, .emailAlreadyRegistered)
        }
    }
}

@MainActor
final class WalletAndBookingTests: XCTestCase {
    private func makeWallet() -> WalletStore {
        WalletStore(
            directory: FileManager.default.temporaryDirectory.appending(path: UUID().uuidString, directoryHint: .isDirectory),
            defaults: UserDefaults(suiteName: "SarenaTests.\(UUID().uuidString)")!,
            seedsWelcomeCodes: false
        )
    }

    func testBookingAddsAnActiveCodeToTheWallet() async {
        let wallet = makeWallet()
        let session = SessionStore(auth: MockAuthService(latency: .zero), keychain: KeychainStore(service: "SarenaTests.\(UUID().uuidString)"))
        session.didAuthenticate(User.preview)
        wallet.load(for: User.preview.id)

        let venue = Venue.samples[0]
        let viewModel = VenueDetailViewModel(venue: venue, booking: MockBookingService(latency: .zero), session: session, wallet: wallet)
        viewModel.quantity = 2
        await viewModel.book()

        XCTAssertNotNil(viewModel.confirmedCode)
        XCTAssertEqual(wallet.activeCodes.count, 1)
        XCTAssertEqual(wallet.activeCodes.first?.quantity, 2)
        XCTAssertEqual(wallet.totalSavings, viewModel.savings)
    }

    func testMarkUsedMovesCodeToHistory() async throws {
        let wallet = makeWallet()
        wallet.load(for: UUID())
        let code = try await MockBookingService(latency: .zero)
            .book(venue: Venue.samples[1], ticket: Venue.samples[1].tickets[0], quantity: 1, for: User.preview)
        wallet.add(code)

        let viewModel = WalletViewModel(wallet: wallet)
        XCTAssertEqual(viewModel.count(for: .active), 1)
        viewModel.markUsed(code)
        XCTAssertEqual(viewModel.count(for: .active), 0)
        XCTAssertEqual(viewModel.count(for: .used), 1)
    }

    func testPromoCodeFormat() {
        let code = MockBookingService.makeCode()
        XCTAssertNotNil(code.wholeMatch(of: #/SRN-[A-Z2-9]{4}-[A-Z2-9]{4}/#))
    }
}
