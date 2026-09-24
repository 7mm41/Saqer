//
//  HapticsManager.swift
//  CleanSpace
//
//  Thin wrapper over UIFeedbackGenerator. Generators are prepared ahead of the
//  gesture so the first tap isn't laggy.
//

import Foundation
#if canImport(UIKit)
import UIKit
#endif

@MainActor
final class HapticsManager {
    static let shared = HapticsManager()

    #if canImport(UIKit)
    private let impactLight = UIImpactFeedbackGenerator(style: .light)
    private let impactMedium = UIImpactFeedbackGenerator(style: .medium)
    private let impactRigid = UIImpactFeedbackGenerator(style: .rigid)
    private let notify = UINotificationFeedbackGenerator()
    private let selection = UISelectionFeedbackGenerator()
    #endif

    private init() {}

    func prepare() {
        #if canImport(UIKit)
        impactLight.prepare()
        impactMedium.prepare()
        impactRigid.prepare()
        #endif
    }

    /// Called as a card crosses the decision threshold — a soft, tactile "click".
    func swipeThreshold() {
        #if canImport(UIKit)
        impactRigid.impactOccurred(intensity: 0.7)
        #endif
    }

    func keep() {
        #if canImport(UIKit)
        impactLight.impactOccurred()
        #endif
    }

    func markForDeletion() {
        #if canImport(UIKit)
        impactMedium.impactOccurred()
        #endif
    }

    func success() {
        #if canImport(UIKit)
        notify.notificationOccurred(.success)
        #endif
    }

    func warning() {
        #if canImport(UIKit)
        notify.notificationOccurred(.warning)
        #endif
    }

    func selectionChanged() {
        #if canImport(UIKit)
        selection.selectionChanged()
        #endif
    }
}
