//
//  PermissionRequestView.swift
//  CleanSpace
//
//  Explains *why* full access is needed and requests it. Handles the denied path
//  in place with a Settings deep-link.
//

import SwiftUI

struct PermissionRequestView: View {
    @Environment(AppEnvironment.self) private var env
    var onGranted: () -> Void

    @State private var requesting = false
    @State private var showDenied = false

    var body: some View {
        VStack(spacing: 0) {
            Spacer()
            Image(systemName: "photo.stack")
                .font(.system(size: 58, weight: .light))
                .foregroundStyle(.tint)
            Text("Allow Photo Access")
                .font(.title.weight(.bold))
                .padding(.top, 18)
            Text("CleanSpace needs **Full Access** to scan your library and remove the photos you choose. Full Access is required because iOS only lets an app delete photos it can see.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 34)
                .padding(.top, 10)

            privacyCard
                .padding(.horizontal, 28)
                .padding(.top, 26)

            Spacer()

            if showDenied {
                Text("Access was denied. You can enable it in Settings.")
                    .font(.footnote).foregroundStyle(.orange)
                    .padding(.bottom, 8)
                Button("Open Settings") { env.permissions.openSettings() }
                    .buttonStyle(.bordered)
                    .controlSize(.large)
                    .padding(.horizontal, 28)
                    .padding(.bottom, 40)
            } else {
                Button(action: request) {
                    HStack {
                        if requesting { ProgressView().tint(.white) }
                        Text(requesting ? "Requesting…" : "Allow Access")
                    }
                    .font(.headline)
                    .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
                .disabled(requesting)
                .padding(.horizontal, 28)
                .padding(.bottom, 40)
            }
        }
    }

    private var privacyCard: some View {
        HStack(spacing: 14) {
            Image(systemName: "lock.fill").foregroundStyle(.green)
            Text("Your photos never leave this device. CleanSpace has no servers and no internet permission.")
                .font(.footnote)
                .foregroundStyle(.secondary)
        }
        .padding(16)
        .background(.green.opacity(0.10), in: RoundedRectangle(cornerRadius: 16))
    }

    private func request() {
        requesting = true
        Task {
            let status = await env.permissions.request()
            requesting = false
            switch status {
            case .authorized, .limited:
                onGranted()
            default:
                withAnimation { showDenied = true }
            }
        }
    }
}
