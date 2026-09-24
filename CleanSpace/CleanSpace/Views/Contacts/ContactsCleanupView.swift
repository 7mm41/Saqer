//
//  ContactsCleanupView.swift
//  CleanSpace
//
//  Review and remove duplicate contacts (matched by phone number). Pick which
//  entry to keep in each group; everything else is deleted only after an explicit
//  confirmation.
//

import SwiftUI
#if canImport(UIKit)
import UIKit
#endif

struct ContactsCleanupView: View {
    @Environment(AppEnvironment.self) private var env
    @State private var model: ContactsCleanupViewModel?
    @State private var showConfirm = false

    var body: some View {
        Group {
            if let model {
                content(model)
            } else {
                LoadingView(label: "Preparing…")
            }
        }
        .navigationTitle("Duplicate Contacts")
        .navigationBarTitleDisplayMode(.inline)
        .background(Color(.systemGroupedBackground))
        .task {
            if model == nil {
                let m = ContactsCleanupViewModel(service: env.contacts)
                model = m
                await m.start()
            }
        }
    }

    @ViewBuilder
    private func content(_ model: ContactsCleanupViewModel) -> some View {
        switch model.phase {
        case .idle, .requesting:
            LoadingView(label: "Requesting access…")
        case .scanning:
            LoadingView(label: "Scanning contacts by number…")
        case .deleting:
            LoadingView(label: "Removing duplicates…")
        case .denied:
            deniedView
        case .failed(let message):
            failedView(message, model: model)
        case .ready:
            if model.groups.isEmpty {
                EmptyStateView(
                    systemImage: "checkmark.seal",
                    title: "No duplicate numbers",
                    message: "Every contact has a unique phone number. Nothing to merge."
                )
            } else {
                readyView(model)
            }
        }
    }

    // MARK: Ready

    private func readyView(_ model: ContactsCleanupViewModel) -> some View {
        VStack(spacing: 0) {
            if let info = model.infoMessage {
                Label(info, systemImage: "checkmark.circle.fill")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(.green)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(12)
                    .background(.green.opacity(0.12))
            }
            ScrollView {
                LazyVStack(spacing: 14) {
                    summary(model)
                    ForEach(model.groups) { group in
                        groupCard(group, model: model)
                    }
                }
                .padding(16)
            }
            deleteBar(model)
        }
        .confirmationDialog(
            "Delete \(model.selectedCount) contact\(model.selectedCount == 1 ? "" : "s")?",
            isPresented: $showConfirm, titleVisibility: .visible
        ) {
            Button("Delete \(model.selectedCount)", role: .destructive) {
                Task { await model.deleteSelected() }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("This permanently removes the selected contacts from this device. The one you keep in each group stays.")
        }
    }

    private func summary(_ model: ContactsCleanupViewModel) -> some View {
        HStack(spacing: 14) {
            Image(systemName: "person.2.slash")
                .font(.title2).foregroundStyle(.teal)
                .frame(width: 44, height: 44)
                .background(.teal.opacity(0.15), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            VStack(alignment: .leading, spacing: 2) {
                Text("\(model.groupCount) duplicate group\(model.groupCount == 1 ? "" : "s")")
                    .font(.headline)
                Text("\(model.duplicateContactCount) contacts share a number with another")
                    .font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
        }
        .padding(14)
        .background(Color(.secondarySystemGroupedBackground),
                    in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    private func groupCard(_ group: ContactDuplicateGroup, model: ContactsCleanupViewModel) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Image(systemName: "phone.fill").font(.caption)
                Text(group.sharedNumber).font(.subheadline.weight(.semibold))
                Spacer()
                Text("\(group.count)")
                    .font(.caption.weight(.bold))
                    .padding(.horizontal, 8).padding(.vertical, 2)
                    .background(.teal.opacity(0.15), in: Capsule())
            }
            .foregroundStyle(.teal)
            .padding(.horizontal, 14).padding(.top, 12).padding(.bottom, 8)

            ForEach(group.contacts) { contact in
                contactRow(contact, group: group, model: model)
                if contact.id != group.contacts.last?.id {
                    Divider().padding(.leading, 62)
                }
            }
        }
        .background(Color(.secondarySystemGroupedBackground),
                    in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    private func contactRow(_ contact: ContactItem,
                            group: ContactDuplicateGroup,
                            model: ContactsCleanupViewModel) -> some View {
        let willDelete = model.isSelected(contact.id)
        return HStack(spacing: 12) {
            ZStack {
                Circle().fill(willDelete ? Color.gray.opacity(0.25) : Color.teal.opacity(0.2))
                Text(contact.initials)
                    .font(.subheadline.weight(.bold))
                    .foregroundStyle(willDelete ? Color.secondary : Color.teal)
            }
            .frame(width: 38, height: 38)

            VStack(alignment: .leading, spacing: 2) {
                Text(contact.displayName)
                    .font(.subheadline.weight(.medium))
                    .strikethrough(willDelete, color: .secondary)
                    .foregroundStyle(willDelete ? .secondary : .primary)
                Text(contact.numbers.joined(separator: " · "))
                    .font(.caption).foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            Spacer()

            Button {
                model.toggle(contact.id)
            } label: {
                if willDelete {
                    Label("Delete", systemImage: "trash.fill")
                        .labelStyle(.iconOnly)
                        .foregroundStyle(.red)
                } else {
                    Label("Keep", systemImage: "checkmark.circle.fill")
                        .labelStyle(.iconOnly)
                        .foregroundStyle(.green)
                }
            }
            .font(.title3)
            .buttonStyle(.plain)
        }
        .contentShape(Rectangle())
        .padding(.horizontal, 14).padding(.vertical, 10)
        .contextMenu {
            Button {
                model.keepOnly(contact.id, in: group)
            } label: {
                Label("Keep only this one", systemImage: "star")
            }
        }
    }

    private func deleteBar(_ model: ContactsCleanupViewModel) -> some View {
        VStack(spacing: 8) {
            Button {
                showConfirm = true
            } label: {
                Text(model.selectedCount == 0
                     ? "Select contacts to delete"
                     : "Delete \(model.selectedCount) duplicate\(model.selectedCount == 1 ? "" : "s")")
                    .font(.headline)
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .tint(.red)
            .controlSize(.large)
            .disabled(model.selectedCount == 0)
            Text("Tap a contact to keep it. Long-press to keep only that one.")
                .font(.caption2).foregroundStyle(.secondary)
        }
        .padding(16)
        .background(.bar)
    }

    // MARK: Denied / failed

    private var deniedView: some View {
        VStack(spacing: 16) {
            Image(systemName: "person.crop.circle.badge.xmark")
                .font(.system(size: 50, weight: .light)).foregroundStyle(.teal)
            Text("Contacts Access Needed").font(.title2.weight(.bold))
            Text("To find and clean duplicate contacts, allow access to Contacts. Everything stays on your device.")
                .font(.subheadline).foregroundStyle(.secondary)
                .multilineTextAlignment(.center).padding(.horizontal, 30)
            Button("Open Settings") { openSettings() }
                .buttonStyle(.borderedProminent).controlSize(.large)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(30)
    }

    private func failedView(_ message: String, model: ContactsCleanupViewModel) -> some View {
        VStack(spacing: 14) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.system(size: 44)).foregroundStyle(.orange)
            Text("Couldn't complete").font(.title3.weight(.semibold))
            Text(message).font(.footnote).foregroundStyle(.secondary)
                .multilineTextAlignment(.center).padding(.horizontal, 30)
            Button("Try Again") { Task { await model.scan() } }
                .buttonStyle(.bordered).controlSize(.large)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(30)
    }

    private func openSettings() {
        #if canImport(UIKit)
        if let url = URL(string: UIApplication.openSettingsURLString) {
            UIApplication.shared.open(url)
        }
        #endif
    }
}
