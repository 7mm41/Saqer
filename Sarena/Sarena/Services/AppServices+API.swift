import Foundation

extension AppServices {
    /// The Sarena API at `baseURL`, with live updates.
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
            walletPasses: APIWalletPasses(client: client)
        )
    }

    /// The Sarena API at https://sarena.tech: the only server the app ever uses.
    static func configured() -> AppServices {
        .api(baseURL: ServerAddress.production)
    }
}
