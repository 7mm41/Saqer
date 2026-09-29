import Foundation

/// The Sarena server. Fixed: the app talks only to https://sarena.tech, and nothing
/// (a link, a setting, a scheme variable) can point it anywhere else.
enum ServerAddress {
    static let production = URL(string: "https://sarena.tech")!

    /// Removes what earlier versions stored: a server chosen from a "Connect the app"
    /// link, and the on-device demo accounts.
    static func forgetLegacySettings(defaults: UserDefaults = .standard) {
        for key in ["sarena.serverURL", "sarena.mock.accounts"] {
            defaults.removeObject(forKey: key)
        }
    }
}
