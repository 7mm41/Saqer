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
            walletPasses: APIWalletPasses(client: client),
            isDemo: false
        )
    }

    /// The API at `ServerAddress.current`, or the on-device demo backend when none is set.
    static func configured(
        bundle: Bundle = .main,
        environment: [String: String] = ProcessInfo.processInfo.environment,
        defaults: UserDefaults = .standard
    ) -> AppServices {
        guard let url = ServerAddress.current(bundle: bundle, environment: environment, defaults: defaults) else {
            return .mock
        }
        return .api(baseURL: url)
    }
}
