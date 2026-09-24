//
//  ContactItem.swift
//  CleanSpace
//
//  A Sendable snapshot of a device contact plus its normalized phone numbers,
//  and a group of contacts that are considered duplicates because they SHARE a
//  phone number (matched by number, not by name).
//

import Foundation

struct ContactItem: Identifiable, Hashable, Sendable {
    /// CNContact.identifier
    let id: String
    let fullName: String
    /// Display phone numbers, as stored on the contact.
    let numbers: [String]
    /// Normalized match keys (digits-only suffix) used to detect duplicates.
    let normalizedNumbers: [String]
    let hasImage: Bool
    /// Completeness score — higher = more fields — used to pick the keeper.
    let fieldScore: Int

    var displayName: String { fullName.isEmpty ? "No Name" : fullName }

    var initials: String {
        let parts = fullName.split(separator: " ").prefix(2)
        let letters = parts.compactMap { $0.first }.map(String.init)
        return letters.isEmpty ? "#" : letters.joined().uppercased()
    }

    var primaryNumber: String { numbers.first ?? "—" }
}

struct ContactDuplicateGroup: Identifiable, Sendable {
    let id: UUID
    var contacts: [ContactItem]
    /// A human-readable number the group has in common.
    var sharedNumber: String
    /// localIdentifier of the contact suggested to keep (the most complete one).
    var suggestedKeepID: String?

    init(id: UUID = UUID(), contacts: [ContactItem], sharedNumber: String, suggestedKeepID: String? = nil) {
        self.id = id
        self.contacts = contacts
        self.sharedNumber = sharedNumber
        self.suggestedKeepID = suggestedKeepID
    }

    var count: Int { contacts.count }
    /// Everyone except the suggested keeper — the deletion candidates.
    var removableIDs: [String] {
        let keep = suggestedKeepID ?? contacts.first?.id
        return contacts.filter { $0.id != keep }.map(\.id)
    }
}
