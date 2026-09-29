import PassKit
import SwiftUI

/// "Add to Apple Wallet": downloads a pass from the server (the membership
/// card, or one code) and shows Apple's add-pass sheet. The pass carries a QR
/// the venue scans in the control panel to confirm the membership or redeem
/// the code. Hidden when the device can't add passes or the server doesn't
/// make them (no Pass Type ID certificate yet, or the on-device demo).
struct AddToAppleWallet: View {
    /// Fetches the signed `.pkpass`; `language` is "ar" or "en".
    let load: (_ language: String) async throws -> Data

    @Environment(\.locale) private var locale
    @State private var pass: PassItem?
    @State private var isLoading = false
    @State private var failed = false

    var body: some View {
        if PKAddPassesViewController.canAddPasses() {
            ZStack {
                AddPassButton { Task { await fetch() } }
                    .frame(height: 50)
                    .opacity(isLoading ? 0.35 : 1)
                    .allowsHitTesting(!isLoading)
                if isLoading { ProgressView() }
            }
            .accessibilityLabel(Text("Add to Apple Wallet"))
            .sheet(item: $pass) { item in
                AddPassSheet(pass: item.pass) { pass = nil }
                    .ignoresSafeArea()
            }
            .alert("Couldn't add to Apple Wallet", isPresented: $failed) {
                Button("OK", role: .cancel) {}
            } message: {
                Text("Check your connection and try again.")
            }
        }
    }

    private func fetch() async {
        isLoading = true
        defer { isLoading = false }
        do {
            let data = try await load(locale.language.languageCode?.identifier == "ar" ? "ar" : "en")
            pass = PassItem(pass: try PKPass(data: data))
        } catch {
            failed = true
        }
    }

    private struct PassItem: Identifiable {
        let id = UUID()
        let pass: PKPass
    }
}

/// Apple's own button: its look and wording are required by Apple's guidelines,
/// and it follows the device language.
private struct AddPassButton: UIViewRepresentable {
    let action: () -> Void

    func makeUIView(context: Context) -> PKAddPassButton {
        let button = PKAddPassButton(addPassButtonStyle: .black)
        button.addTarget(context.coordinator, action: #selector(Coordinator.tapped), for: .touchUpInside)
        return button
    }

    func updateUIView(_ button: PKAddPassButton, context: Context) {
        context.coordinator.action = action
    }

    func makeCoordinator() -> Coordinator { Coordinator(action: action) }

    final class Coordinator: NSObject {
        var action: () -> Void
        init(action: @escaping () -> Void) { self.action = action }
        @objc func tapped() { action() }
    }
}

/// Apple's sheet that previews the pass and adds it to Wallet.
private struct AddPassSheet: UIViewControllerRepresentable {
    let pass: PKPass
    let onFinish: () -> Void

    func makeUIViewController(context: Context) -> UIViewController {
        guard let controller = PKAddPassesViewController(pass: pass) else { return UIViewController() }
        controller.delegate = context.coordinator
        return controller
    }

    func updateUIViewController(_ controller: UIViewController, context: Context) {}

    func makeCoordinator() -> Coordinator { Coordinator(onFinish: onFinish) }

    final class Coordinator: NSObject, PKAddPassesViewControllerDelegate {
        let onFinish: () -> Void
        init(onFinish: @escaping () -> Void) { self.onFinish = onFinish }
        func addPassesViewControllerDidFinish(_ controller: PKAddPassesViewController) { onFinish() }
    }
}
