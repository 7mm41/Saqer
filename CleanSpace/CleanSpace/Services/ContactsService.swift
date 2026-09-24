//
//  ContactsService.swift
//  CleanSpace
//
//  Finds and removes duplicate contacts. Duplicates are matched BY PHONE NUMBER:
//  if two contacts share a normalized number they are considered the same person,
//  regardless of name. Numbers are transitively linked (union-find), so A↔B and
//  B↔C collapse into one group {A,B,C}.
//
//  Requires NSContactsUsageDescription in Info.plist. Deletion goes through
//  CNSaveRequest; the UI always confirms before anything is removed.
//

import Foundation
import Contacts

final class ContactsService: @unchecked Sendable {

    // MARK: Authorization

    func authorizationStatus() -> CNAuthorizationStatus {
        CNContactStore.authorizationStatus(for: .contacts)
    }

    var isAuthorized: Bool { authorizationStatus() == .authorized }

    @discardableResult
    func requestAccess() async -> Bool {
        await withCheckedContinuation { (continuation: CheckedContinuation<Bool, Never>) in
            CNContactStore().requestAccess(for: .contacts) { granted, _ in
                continuation.resume(returning: granted)
            }
        }
    }

    // MARK: Number normalization

    /// Digits-only match key: the last 9 digits (handles +966 / 0-prefix / spacing
    /// variants of the same number). Returns nil for numbers too short to trust.
    static func normalize(_ raw: String) -> String? {
        let digits = raw.filter(\.isNumber)
        guard digits.count >= 7 else { return nil }
        return String(digits.suffix(9))
    }

    // MARK: Fetch + dedupe

    /// Enumerates every contact that has at least one usable phone number and
    /// clusters them by shared number. Groups with ≥ 2 contacts are returned,
    /// largest first. Throws if enumeration fails (e.g., access revoked).
    func fetchDuplicatesByNumber() throws -> [ContactDuplicateGroup] {
        let store = CNContactStore()
        let keys: [CNKeyDescriptor] = [
            CNContactIdentifierKey as CNKeyDescriptor,
            CNContactGivenNameKey as CNKeyDescriptor,
            CNContactFamilyNameKey as CNKeyDescriptor,
            CNContactOrganizationNameKey as CNKeyDescriptor,
            CNContactPhoneNumbersKey as CNKeyDescriptor,
            CNContactEmailAddressesKey as CNKeyDescriptor,
            CNContactImageDataAvailableKey as CNKeyDescriptor
        ]
        let request = CNContactFetchRequest(keysToFetch: keys)
        request.sortOrder = .userDefault

        var items: [ContactItem] = []
        var sampleForKey: [String: String] = [:]   // normalized -> a display number

        try store.enumerateContacts(with: request) { contact, _ in
            let displayNumbers = contact.phoneNumbers.map { $0.value.stringValue }
            let normalized = displayNumbers.compactMap { raw -> String? in
                guard let key = Self.normalize(raw) else { return nil }
                if sampleForKey[key] == nil { sampleForKey[key] = raw }
                return key
            }
            let uniqueNormalized = Array(Set(normalized))
            guard !uniqueNormalized.isEmpty else { return }

            let name = CNContactFormatter.string(from: contact, style: .fullName)
                ?? contact.organizationName
            items.append(ContactItem(
                id: contact.identifier,
                fullName: name ?? "",
                numbers: displayNumbers,
                normalizedNumbers: uniqueNormalized,
                hasImage: contact.imageDataAvailable,
                fieldScore: Self.score(contact)
            ))
        }

        return cluster(items: items, sampleForKey: sampleForKey)
    }

    private static func score(_ contact: CNContact) -> Int {
        var s = 0
        if !contact.givenName.isEmpty { s += 2 }
        if !contact.familyName.isEmpty { s += 2 }
        if !contact.organizationName.isEmpty { s += 1 }
        s += contact.emailAddresses.count
        s += contact.phoneNumbers.count
        if contact.imageDataAvailable { s += 3 }
        return s
    }

    // MARK: Union-find clustering by shared number

    private func cluster(items: [ContactItem], sampleForKey: [String: String]) -> [ContactDuplicateGroup] {
        guard !items.isEmpty else { return [] }
        var parent = Array(0..<items.count)

        func find(_ x: Int) -> Int {
            var r = x
            while parent[r] != r { parent[r] = parent[parent[r]]; r = parent[r] }
            return r
        }
        func union(_ a: Int, _ b: Int) {
            let ra = find(a), rb = find(b)
            if ra != rb { parent[ra] = rb }
        }

        // Link every pair of contacts that share a normalized number.
        var firstIndexForKey: [String: Int] = [:]
        for (i, item) in items.enumerated() {
            for key in item.normalizedNumbers {
                if let j = firstIndexForKey[key] {
                    union(i, j)
                } else {
                    firstIndexForKey[key] = i
                }
            }
        }

        // Gather components.
        var components: [Int: [Int]] = [:]
        for i in items.indices { components[find(i), default: []].append(i) }

        var groups: [ContactDuplicateGroup] = []
        for (_, indices) in components where indices.count >= 2 {
            let members = indices.map { items[$0] }
            // Shared number = the most common normalized key across the group.
            let keyCounts = members
                .flatMap(\.normalizedNumbers)
                .reduce(into: [String: Int]()) { $0[$1, default: 0] += 1 }
            let sharedKey = keyCounts.max { $0.value < $1.value }?.key ?? ""
            let sample = sampleForKey[sharedKey] ?? sharedKey
            let keeper = members.max { ($0.fieldScore, $0.numbers.count) < ($1.fieldScore, $1.numbers.count) }
            groups.append(ContactDuplicateGroup(
                contacts: members.sorted { $0.fieldScore > $1.fieldScore },
                sharedNumber: sample,
                suggestedKeepID: keeper?.id
            ))
        }
        return groups.sorted { $0.count > $1.count }
    }

    // MARK: Deletion

    /// Deletes the given contacts. iOS may present its own confirmation the first
    /// time the app deletes; errors (e.g., access revoked) are thrown to the caller.
    func delete(ids: [String]) throws {
        guard !ids.isEmpty else { return }
        let store = CNContactStore()
        let keys = [CNContactIdentifierKey as CNKeyDescriptor]
        let save = CNSaveRequest()
        let predicate = CNContact.predicateForContacts(withIdentifiers: ids)
        let matches = try store.unifiedContacts(matching: predicate, keysToFetch: keys)
        for contact in matches {
            if let mutable = contact.mutableCopy() as? CNMutableContact {
                save.delete(mutable)
            }
        }
        try store.execute(save)
    }
}
