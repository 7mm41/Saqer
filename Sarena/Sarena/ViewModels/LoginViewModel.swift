import SwiftUI

@Observable
@MainActor
final class LoginViewModel {
    enum Method: String, CaseIterable, Identifiable {
        case phone
        case email

        var id: String { rawValue }

        var title: LocalizedStringKey {
            switch self {
            case .phone: "Mobile Number"
            case .email: "Email"
            }
        }
    }

    var method: Method = .phone

    // Email
    var email = ""
    var password = ""

    // Phone
    var phone = ""
    var code = ""
    /// Set once an SMS code was sent — switches the phone form to the code step.
    private(set) var challenge: OTPChallenge?

    private(set) var isLoading = false
    var error: AuthError?

    private let auth: any AuthServicing
    private let session: SessionStore

    init(auth: any AuthServicing, session: SessionStore) {
        self.auth = auth
        self.session = session
    }

    // MARK: Validation

    var canSubmitEmail: Bool {
        Validation.isValidEmail(email) && !password.isEmpty && !isLoading
    }

    var canRequestCode: Bool {
        Validation.isValidOmaniPhone(phone) && !isLoading
    }

    var canVerifyCode: Bool {
        guard let challenge else { return false }
        return Validation.normalizedDigits(code).count == challenge.codeLength && !isLoading
    }

    var showsPhoneHint: Bool { !phone.isEmpty && !Validation.isValidOmaniPhone(phone) }

    // MARK: Actions

    func signInWithEmail() async {
        guard canSubmitEmail else { return }
        await perform {
            try await self.auth.signIn(email: self.email, password: self.password)
        }
    }

    func requestCode() async {
        guard canRequestCode else { return }
        isLoading = true
        error = nil
        defer { isLoading = false }
        do {
            challenge = try await auth.requestCode(phone: phone)
            code = ""
        } catch let authError as AuthError {
            error = authError
        } catch {
            self.error = .network
        }
    }

    func verifyCode() async {
        guard canVerifyCode, let challenge else { return }
        await perform {
            try await self.auth.verifyCode(self.code, phone: challenge.phone)
        }
        if error != nil { code = "" }
    }

    /// Back to the number step (e.g. to fix a typo).
    func editPhoneNumber() {
        challenge = nil
        code = ""
        error = nil
    }

    func switchMethod(to method: Method) {
        self.method = method
        error = nil
    }

    private func perform(_ operation: @escaping () async throws -> User) async {
        isLoading = true
        error = nil
        defer { isLoading = false }
        do {
            let user = try await operation()
            session.didAuthenticate(user)
        } catch let authError as AuthError {
            error = authError
        } catch {
            self.error = .network
        }
    }
}
