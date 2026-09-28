import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

// URLSession-backed services for the Sarena API (see `backend/`). They are
// selected when Info.plist › SarenaAPIBaseURL is set.

private struct SignInResponse: Decodable {
    let token: String
    let user: User
}

private struct UserResponse: Decodable {
    let user: User
    let membership: Membership?
}

private struct Empty: Encodable {}

struct APIAuthService: AuthServicing {
    let client: APIClient

    func signIn(email: String, password: String) async throws -> User {
        struct Body: Encodable { let email: String; let password: String }
        return try await signIn { try await client.post("auth/login", body: Body(email: email, password: password)) }
    }

    func requestCode(phone: String) async throws -> OTPChallenge {
        struct Body: Encodable { let phone: String }
        struct Response: Decodable { let phone: String; let codeLength: Int; let resendAvailableAt: Date }
        do {
            let response: Response = try await client.post("auth/otp/request", body: Body(phone: Validation.normalizedOmaniPhone(phone)))
            return OTPChallenge(phone: response.phone, codeLength: response.codeLength, resendAvailableAt: response.resendAvailableAt)
        } catch let error as APIError {
            throw Self.authError(error)
        }
    }

    func verifyCode(_ code: String, phone: String) async throws -> User {
        struct Body: Encodable { let phone: String; let code: String }
        let body = Body(phone: Validation.normalizedOmaniPhone(phone), code: Validation.normalizedDigits(code))
        return try await signIn { try await client.post("auth/otp/verify", body: body) }
    }

    func register(_ form: RegistrationForm) async throws -> User {
        struct Body: Encodable { let fullName: String; let email: String; let phone: String; let password: String }
        let body = Body(fullName: form.fullName.trimmingCharacters(in: .whitespacesAndNewlines),
                        email: form.email.trimmingCharacters(in: .whitespacesAndNewlines),
                        phone: Validation.normalizedOmaniPhone(form.phone), password: form.password)
        return try await signIn { try await client.post("auth/register", body: body) }
    }

    func refreshed(_ user: User) async throws -> User {
        let response: UserResponse = try await client.get("me")
        return response.user
    }

    func signOut() async {
        struct OK: Decodable {}
        _ = try? await client.post("auth/logout", as: OK.self)
        client.tokens.clear()
    }

    private func signIn(_ request: () async throws -> SignInResponse) async throws -> User {
        do {
            let response = try await request()
            client.tokens.save(response.token)
            return response.user
        } catch let error as APIError {
            throw Self.authError(error)
        }
    }

    static func authError(_ error: APIError) -> AuthError {
        switch error.code {
        case "invalid_credentials": .invalidCredentials
        case "email_taken": .emailAlreadyRegistered
        case "phone_taken": .phoneAlreadyRegistered
        case "phone_not_registered": .phoneNotRegistered
        case "invalid_code": .invalidCode
        case "account_suspended": .suspended
        case "too_many_requests": .tooManyRequests
        default: .network
        }
    }
}

/// Venues are re-checked on every foreground and live event; the ETag makes
/// an unchanged catalogue an empty 304 response.
actor APICatalogService: CatalogServicing {
    private let client: APIClient
    private var cached: (etag: String, venues: [Venue])?

    init(client: APIClient) {
        self.client = client
    }

    func fetchVenues() async throws -> [Venue] {
        struct Response: Decodable { let venues: [Venue] }
        var request = client.makeRequest("GET", "venues")
        request.cachePolicy = .reloadIgnoringLocalCacheData
        if let cached {
            request.setValue(cached.etag, forHTTPHeaderField: "If-None-Match")
        }
        let (data, response) = try await client.data(for: request)
        if response.statusCode == 304, let cached {
            return cached.venues
        }
        guard (200..<300).contains(response.statusCode) else {
            throw APIClient.error(from: data, status: response.statusCode)
        }
        let venues = try APIClient.decoder.decode(Response.self, from: data).venues
        if let etag = response.value(forHTTPHeaderField: "ETag") {
            cached = (etag, venues)
        }
        return venues
    }
}

struct APIMembershipService: MembershipServicing {
    let client: APIClient

    func plans() async throws -> [MembershipPlan] {
        struct Response: Decodable { let plans: [MembershipPlan] }
        return try await client.get("plans", as: Response.self).plans
    }

    func membership(for user: User) async throws -> Membership? {
        try await client.get("me", as: UserResponse.self).membership
    }

    func subscribe(to plan: MembershipPlan, for user: User) async throws -> Membership {
        struct Body: Encodable { let planId: String }
        struct Response: Decodable { let membership: Membership }
        do {
            return try await client.post("membership/subscribe", body: Body(planId: plan.id), as: Response.self).membership
        } catch let error as APIError where error.code == "payments_unavailable" {
            throw MembershipError.paymentsUnavailable
        } catch let error as APIError where error.status == 0 {
            throw MembershipError.network
        }
    }
}

struct APIBookingService: BookingServicing {
    let client: APIClient

    private struct BookingResponse: Decodable { let booking: PromoCode }

    func book(venue: Venue, ticket: TicketOption, quantity: Int, for user: User) async throws -> PromoCode {
        struct Body: Encodable { let offerId: String; let quantity: Int }
        do {
            return try await client.post("bookings", body: Body(offerId: ticket.id, quantity: quantity), as: BookingResponse.self).booking
        } catch let error as APIError {
            switch error.code {
            case "membership_required": throw BookingError.membershipRequired
            case "sold_out": throw BookingError.soldOut
            case "not_found": throw BookingError.unavailable
            default: throw BookingError.network
            }
        }
    }

    func codes(for user: User) async throws -> [PromoCode] {
        struct Response: Decodable { let bookings: [PromoCode] }
        return try await client.get("me/bookings", as: Response.self).bookings
    }

    func markUsed(_ code: PromoCode, for user: User) async throws -> PromoCode {
        do {
            return try await client.post("me/bookings/\(code.id)/mark-used", as: BookingResponse.self).booking
        } catch let error as APIError where error.code == "not_found" {
            throw BookingError.unavailable
        }
    }
}
