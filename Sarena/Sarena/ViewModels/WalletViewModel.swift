import SwiftUI
import UIKit

@Observable
@MainActor
final class WalletViewModel {
    enum Segment: String, CaseIterable, Identifiable {
        case active
        case used

        var id: String { rawValue }

        var title: LocalizedStringKey {
            switch self {
            case .active: "Active Codes"
            case .used: "Used Codes"
            }
        }
    }

    var segment: Segment = .active
    /// Code shown full-screen with its QR.
    var presentedCode: PromoCode?
    private(set) var copiedCodeID: PromoCode.ID?

    private let wallet: WalletStore

    init(wallet: WalletStore) {
        self.wallet = wallet
    }

    var codes: [PromoCode] {
        switch segment {
        case .active: wallet.activeCodes
        case .used: wallet.usedCodes
        }
    }

    func count(for segment: Segment) -> Int {
        switch segment {
        case .active: wallet.activeCodes.count
        case .used: wallet.usedCodes.count
        }
    }

    var totalSavings: Decimal { wallet.totalSavings }

    var redeemedCount: Int { wallet.codes.filter { $0.status == .used }.count }

    func copy(_ code: PromoCode) {
        UIPasteboard.general.string = code.code
        copiedCodeID = code.id
        Task {
            try? await Task.sleep(for: .seconds(1.6))
            if copiedCodeID == code.id { copiedCodeID = nil }
        }
    }

    /// Demo stand-in for the venue scanning the code.
    func markUsed(_ code: PromoCode) {
        wallet.markUsed(code.id)
        presentedCode = nil
    }
}
