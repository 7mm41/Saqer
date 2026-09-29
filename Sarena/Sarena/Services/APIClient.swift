import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

/// An error returned by the Sarena API as `{ "error": { "code", "message" } }`,
/// or a transport failure (`status == 0`).
struct APIError: Error, Equatable, Sendable {
    let status: Int
    let code: String
    let message: String

    static let network = APIError(status: 0, code: "network", message: "The network connection failed.")

    var isUnauthorized: Bool { status == 401 }
    /// The account can no longer be used (signed out elsewhere or suspended).
    var endsSession: Bool { status == 401 || code == "account_suspended" }
}

extension Notification.Name {
    /// Posted when the API rejects the stored token; the session signs out.
    static let sarenaSessionExpired = Notification.Name("SarenaSessionExpired")
}

/// The API token, kept in the Keychain (never in UserDefaults).
struct TokenStore: Sendable {
    private let keychain: KeychainStore
    private static let account = "api-token"

    init(keychain: KeychainStore = KeychainStore(service: "om.sarena.api")) {
        self.keychain = keychain
    }

    var token: String? {
        keychain.data(for: Self.account).flatMap { String(data: $0, encoding: .utf8) }
    }

    func save(_ token: String) {
        keychain.set(Data(token.utf8), for: Self.account)
    }

    func clear() {
        keychain.removeValue(for: Self.account)
    }
}

extension CodingUserInfoKey {
    /// The API's address, so image paths such as `/uploads/poster.jpg` resolve against it.
    static let apiBaseURL = CodingUserInfoKey(rawValue: "sarena.apiBaseURL")!
}

/// Image links from the API. Uploaded images arrive as paths on the server
/// (`/uploads/…`), which keep working when its address changes; links saved
/// with a machine-local address (`http://localhost:3000/uploads/…`) are moved
/// to the API's address too, so they load on a phone.
enum MediaURL {
    private static let localHosts: Set<String> = ["localhost", "127.0.0.1", "0.0.0.0", "::1"]

    static func resolve(_ raw: String?, base: URL?) -> URL? {
        guard let raw = raw?.trimmingCharacters(in: .whitespacesAndNewlines), !raw.isEmpty else { return nil }
        if let url = URL(string: raw), url.scheme != nil {
            if let base, let host = url.host(), localHosts.contains(host), url.path().hasPrefix("/uploads/") {
                return URL(string: url.path(), relativeTo: base)?.absoluteURL
            }
            return url
        }
        guard let base else { return URL(string: raw) }
        return URL(string: raw, relativeTo: base)?.absoluteURL
    }

    /// For `init(from:)`: the string under `key`, resolved against the decoder's API address.
    static func decode<Key: CodingKey>(_ container: KeyedDecodingContainer<Key>, _ key: Key, from decoder: Decoder) -> URL? {
        resolve((try? container.decodeIfPresent(String.self, forKey: key)) ?? nil, base: decoder.userInfo[.apiBaseURL] as? URL)
    }
}

/// Minimal JSON client for the Sarena API (`/v1/...`).
final class APIClient: Sendable {
    let baseURL: URL
    let tokens: TokenStore
    /// Like `APIClient.decoder`, and resolves image paths against `baseURL`.
    let decoder: JSONDecoder
    private let session: URLSession

    init(baseURL: URL, tokens: TokenStore = TokenStore(), session: URLSession = .shared) {
        self.baseURL = baseURL
        self.tokens = tokens
        self.session = session
        self.decoder = Self.makeDecoder(baseURL: baseURL)
    }

    // MARK: Requests

    func get<Response: Decodable>(_ path: String, as type: Response.Type = Response.self) async throws -> Response {
        try await send(makeRequest("GET", path))
    }

    func post<Response: Decodable>(_ path: String, body: some Encodable, as type: Response.Type = Response.self) async throws -> Response {
        var request = makeRequest("POST", path)
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try Self.encoder.encode(body)
        return try await send(request)
    }

    func post<Response: Decodable>(_ path: String, as type: Response.Type = Response.self) async throws -> Response {
        try await send(makeRequest("POST", path))
    }

    /// A request with the JSON headers and, when signed in, the bearer token.
    func makeRequest(_ method: String, _ path: String) -> URLRequest {
        var request = URLRequest(url: baseURL.appending(path: "v1").appending(path: path))
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let preferred = Locale.preferredLanguages.first {
            request.setValue(preferred, forHTTPHeaderField: "Accept-Language")
        }
        if let token = tokens.token {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        return request
    }

    func send<Response: Decodable>(_ request: URLRequest) async throws -> Response {
        let (data, response) = try await data(for: request)
        guard (200..<300).contains(response.statusCode) else {
            throw Self.error(from: data, status: response.statusCode)
        }
        do {
            return try decoder.decode(Response.self, from: data)
        } catch {
            throw APIError(status: response.statusCode, code: "invalid_response", message: "\(error)")
        }
    }

    /// Raw exchange. Rejected tokens end the session everywhere in the app.
    func data(for request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch is CancellationError {
            throw CancellationError()
        } catch let error as URLError where error.code == .cancelled {
            throw CancellationError()
        } catch {
            throw APIError.network
        }
        guard let http = response as? HTTPURLResponse else { throw APIError.network }
        if http.statusCode == 401, request.value(forHTTPHeaderField: "Authorization") != nil {
            NotificationCenter.default.post(name: .sarenaSessionExpired, object: nil)
        }
        return (data, http)
    }

    // MARK: Coding

    static func error(from data: Data, status: Int) -> APIError {
        struct Envelope: Decodable {
            struct Body: Decodable { let code: String; let message: String }
            let error: Body
        }
        if let envelope = try? decoder.decode(Envelope.self, from: data) {
            return APIError(status: status, code: envelope.error.code, message: envelope.error.message)
        }
        return APIError(status: status, code: "http_\(status)", message: HTTPURLResponse.localizedString(forStatusCode: status))
    }

    /// ISO-8601 dates, with or without fractional seconds (`2026-09-28T10:00:00.000Z`).
    static let decoder = makeDecoder(baseURL: nil)

    static func makeDecoder(baseURL: URL?) -> JSONDecoder {
        let decoder = JSONDecoder()
        if let baseURL { decoder.userInfo[.apiBaseURL] = baseURL }
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let text = try container.decode(String.self)
            if let date = try? Date(text, strategy: .iso8601.year().month().day().time(includingFractionalSeconds: true)) {
                return date
            }
            if let date = try? Date(text, strategy: .iso8601) {
                return date
            }
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Invalid date: \(text)")
        }
        return decoder
    }

    static let encoder: JSONEncoder = {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        return encoder
    }()
}
