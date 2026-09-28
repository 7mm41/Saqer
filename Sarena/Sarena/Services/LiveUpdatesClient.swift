import Foundation

/// Streams `GET /v1/live` with the member's token.
struct ServerSentEventsClient: LiveUpdatesServicing {
    let client: APIClient

    func connect() -> AsyncThrowingStream<LiveEvent, Error> {
        AsyncThrowingStream { continuation in
            let task = Task {
                do {
                    var request = client.makeRequest("GET", "live")
                    request.setValue("text/event-stream", forHTTPHeaderField: "Accept")
                    // The server sends a heartbeat every 25 s; anything longer means the link is dead.
                    request.timeoutInterval = 60
                    request.cachePolicy = .reloadIgnoringLocalCacheData
                    let (bytes, response) = try await URLSession.shared.bytes(for: request)
                    guard let http = response as? HTTPURLResponse else { throw APIError.network }
                    guard http.statusCode == 200 else {
                        if http.statusCode == 401 {
                            NotificationCenter.default.post(name: .sarenaSessionExpired, object: nil)
                        }
                        throw APIError(status: http.statusCode, code: "live_unavailable", message: "")
                    }
                    var parser = ServerSentEventParser()
                    for try await line in bytes.lines {
                        if let event = parser.consume(line) {
                            continuation.yield(event)
                        }
                    }
                    continuation.finish()
                } catch {
                    continuation.finish(throwing: error)
                }
            }
            continuation.onTermination = { _ in task.cancel() }
        }
    }
}
