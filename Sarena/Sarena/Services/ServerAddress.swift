import Foundation

/// Where the app finds the Sarena server, in this order:
/// 1. `SARENA_API_BASE_URL` in the Xcode scheme's environment (local testing, e.g. `http://localhost:3000`);
/// 2. an address chosen from a `sarena://connect?server=…` link — the control panel's
///    "Connect the app" button — so a new server (or a new tunnel address) needs no rebuild;
/// 3. Info.plist › `SarenaAPIBaseURL`. Empty everywhere = the on-device demo backend.
enum ServerAddress {
    static let storageKey = "sarena.serverURL"

    static func current(
        bundle: Bundle = .main,
        environment: [String: String] = ProcessInfo.processInfo.environment,
        defaults: UserDefaults = .standard
    ) -> URL? {
        let candidates = [
            environment["SARENA_API_BASE_URL"],
            linksAllowed(bundle: bundle) ? defaults.string(forKey: storageKey) : nil,
            bundle.object(forInfoDictionaryKey: "SarenaAPIBaseURL") as? String,
        ]
        return candidates.lazy.compactMap { $0.flatMap(normalized) }.first
    }

    /// Info.plist › `SarenaAllowServerLinks` (on unless set to NO, e.g. for the App Store build).
    static func linksAllowed(bundle: Bundle = .main) -> Bool {
        bundle.object(forInfoDictionaryKey: "SarenaAllowServerLinks") as? Bool ?? true
    }

    /// `https://host[:port]` from anything the person may paste or link
    /// (`host.example`, `https://host.example/admin/`); nil unless http(s) with a host.
    static func normalized(_ text: String) -> URL? {
        var trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        if !trimmed.contains("://") { trimmed = "https://" + trimmed }
        guard let components = URLComponents(string: trimmed),
              let scheme = components.scheme?.lowercased(), scheme == "https" || scheme == "http",
              let host = components.host, !host.isEmpty else { return nil }
        var origin = URLComponents()
        origin.scheme = scheme
        origin.host = host.lowercased()
        origin.port = components.port
        return origin.url
    }

    /// The server in `sarena://connect?server=https://…`, or nil for any other link.
    static func fromConnectLink(_ url: URL) -> URL? {
        guard url.scheme?.lowercased() == "sarena", url.host()?.lowercased() == "connect",
              let value = URLComponents(url: url, resolvingAgainstBaseURL: false)?
                .queryItems?.first(where: { $0.name == "server" })?.value else { return nil }
        return normalized(value)
    }

    /// Remembers the server chosen from a link (nil returns to Info.plist's).
    static func save(_ url: URL?, defaults: UserDefaults = .standard) {
        if let url { defaults.set(url.absoluteString, forKey: storageKey) } else { defaults.removeObject(forKey: storageKey) }
    }
}
