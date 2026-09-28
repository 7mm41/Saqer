import Foundation

extension AppServices {
    /// The Sarena API at `baseURL` (e.g. `https://sarena.om`), with live updates.
    static func api(baseURL: URL) -> AppServices {
        let client = APIClient(baseURL: baseURL)
        return AppServices(
            auth: APIAuthService(client: client),
            catalog: APICatalogService(client: client),
            booking: APIBookingService(client: client),
            membership: APIMembershipService(client: client),
            config: APIAppConfigService(client: client),
            push: APIPushRegistration(client: client),
            live: ServerSentEventsClient(client: client),
            isDemo: false
        )
    }

    /// Info.plist › `SarenaAPIBaseURL` selects the API; empty keeps the
    /// on-device demo backend. `SARENA_API_BASE_URL` in the scheme's
    /// environment overrides it for local testing (e.g. `http://localhost:3000`).
    static func configured(bundle: Bundle = .main, environment: [String: String] = ProcessInfo.processInfo.environment) -> AppServices {
        let value = environment["SARENA_API_BASE_URL"] ?? bundle.object(forInfoDictionaryKey: "SarenaAPIBaseURL") as? String ?? ""
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, let url = URL(string: trimmed), url.scheme?.hasPrefix("http") == true else {
            return .mock
        }
        return .api(baseURL: url)
    }
}
