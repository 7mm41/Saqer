import Foundation
import Observation

@Observable
@MainActor
final class RegisterViewModel {
    var fullName = ""
    var email = ""
    var phone = ""
    var password = ""
    var confirmPassword = ""
    var acceptsTerms = false
    private(set) var isLoading = false
    var error: AuthError?

    private let auth: any AuthServicing
    private let session: SessionStore

    init(auth: any AuthServicing, session: SessionStore) {
        self.auth = auth
        self.session = session
    }

    // MARK: Field validation (nil = nothing to report yet)

    var isNameValid: Bool { fullName.trimmingCharacters(in: .whitespaces).count >= 3 }
    var isEmailValid: Bool { Validation.isValidEmail(email) }
    var isPhoneValid: Bool { Validation.isValidOmaniPhone(phone) }
    var passwordStrength: Validation.PasswordStrength { Validation.strength(of: password) }
    var isPasswordValid: Bool { passwordStrength >= .fair }
    var passwordsMatch: Bool { !confirmPassword.isEmpty && confirmPassword == password }

    var showsEmailHint: Bool { !email.isEmpty && !isEmailValid }
    var showsPhoneHint: Bool { !phone.isEmpty && !isPhoneValid }
    var showsPasswordHint: Bool { !password.isEmpty && !isPasswordValid }
    var showsConfirmHint: Bool { !confirmPassword.isEmpty && !passwordsMatch }

    var canSubmit: Bool {
        isNameValid && isEmailValid && isPhoneValid && isPasswordValid && passwordsMatch && acceptsTerms && !isLoading
    }

    func register() async {
        guard canSubmit else { return }
        isLoading = true
        error = nil
        defer { isLoading = false }
        let form = RegistrationForm(
            fullName: fullName,
            email: email,
            phone: Validation.normalizedOmaniPhone(phone),
            password: password
        )
        do {
            let user = try await auth.register(form)
            session.didAuthenticate(user)
        } catch let authError as AuthError {
            error = authError
        } catch {
            self.error = .network
        }
    }
}
