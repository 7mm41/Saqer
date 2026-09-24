//
//  Preferences.swift
//  CleanSpace
//
//  Small, observable wrapper over UserDefaults for user settings and one-time
//  flags. Nothing here is sensitive — no media, no identifiers leave the device.
//

import Foundation
import Observation

@MainActor
@Observable
final class Preferences {
    private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        self.hasCompletedOnboarding = defaults.bool(forKey: Keys.onboarding)
        self.autoSelectEnabled = defaults.object(forKey: Keys.autoSelect) as? Bool ?? true
        self.hapticsEnabled = defaults.object(forKey: Keys.haptics) as? Bool ?? true
    }

    var hasCompletedOnboarding: Bool {
        didSet { defaults.set(hasCompletedOnboarding, forKey: Keys.onboarding) }
    }
    var autoSelectEnabled: Bool {
        didSet { defaults.set(autoSelectEnabled, forKey: Keys.autoSelect) }
    }
    var hapticsEnabled: Bool {
        didSet { defaults.set(hapticsEnabled, forKey: Keys.haptics) }
    }

    private enum Keys {
        static let onboarding = "hasCompletedOnboarding"
        static let autoSelect = "autoSelectEnabled"
        static let haptics = "hapticsEnabled"
    }
}
