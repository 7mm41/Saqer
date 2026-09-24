//
//  ContactsCleanupViewModel.swift
//  CleanSpace
//
//  Drives the duplicate-contacts flow: request access → scan (match by number) →
//  let the user pick a keeper per group → delete the rest. Heavy work runs off
//  the main actor; nothing is deleted until the user confirms.
//

import Foundation
import Contacts
import Observation

@MainActor
@Observable
final class ContactsCleanupViewModel {

    enum Phase: Equatable {
        case idle, requesting, scanning, ready, denied, deleting, failed(String)
    }

    private let service: ContactsService
    private(set) var phase: Phase = .idle
    private(set) var groups: [ContactDuplicateGroup] = []
    /// Contact ids currently marked for deletion.
    private(set) var selected: Set<String> = []
    var infoMessage: String?

    init(service: ContactsService) {
        self.service = service
    }

    var duplicateContactCount: Int { groups.reduce(0) { $0 + $1.count } }
    var groupCount: Int { groups.count }
    var selectedCount: Int { selected.count }

    // MARK: Flow

    func start() async {
        switch service.authorizationStatus() {
        case .authorized:
            await scan()
        case .notDetermined:
            phase = .requesting
            if await service.requestAccess() {
                await scan()
            } else {
                phase = .denied
            }
        default:
            phase = .denied
        }
    }

    func scan() async {
        phase = .scanning
        let service = self.service
        do {
            let found = try await Task.detached(priority: .userInitiated) {
                try service.fetchDuplicatesByNumber()
            }.value
            groups = found
            selected = Set(found.flatMap { $0.removableIDs })   // preselect non-keepers
            phase = .ready
        } catch {
            phase = .failed(error.localizedDescription)
        }
    }

    // MARK: Selection

    func isSelected(_ id: String) -> Bool { selected.contains(id) }

    func toggle(_ id: String) {
        if selected.contains(id) { selected.remove(id) } else { selected.insert(id) }
    }

    /// Keep `id`; mark every other contact in its group for deletion.
    func keepOnly(_ id: String, in group: ContactDuplicateGroup) {
        for contact in group.contacts {
            if contact.id == id { selected.remove(contact.id) }
            else { selected.insert(contact.id) }
        }
    }

    // MARK: Deletion

    func deleteSelected() async {
        guard !selected.isEmpty else { return }
        let ids = Array(selected)
        phase = .deleting
        let service = self.service
        do {
            try await Task.detached(priority: .userInitiated) {
                try service.delete(ids: ids)
            }.value
            HapticsManager.shared.success()
            infoMessage = "Removed \(ids.count) duplicate contact\(ids.count == 1 ? "" : "s")."
            await scan()   // refresh remaining duplicates
        } catch {
            HapticsManager.shared.warning()
            phase = .failed(error.localizedDescription)
        }
    }
}
