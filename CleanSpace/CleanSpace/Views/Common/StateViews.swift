//
//  StateViews.swift
//  CleanSpace
//
//  Shared empty / loading / access-required states.
//

import SwiftUI

struct EmptyStateView: View {
    var systemImage: String = "sparkles"
    var title: String
    var message: String

    var body: some View {
        VStack(spacing: 14) {
            Image(systemName: systemImage)
                .font(.system(size: 44, weight: .light))
                .foregroundStyle(.tint)
            Text(title).font(.title3.weight(.semibold))
            Text(message)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .padding(40)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

struct LoadingView: View {
    var label: String = "Loading…"
    var body: some View {
        VStack(spacing: 12) {
            ProgressView()
            Text(label).font(.footnote).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

/// Persistent, friendly screen shown whenever photo access is missing or limited.
struct AccessRequiredView: View {
    var isLimited: Bool
    var onOpenSettings: () -> Void

    var body: some View {
        VStack(spacing: 18) {
            Image(systemName: "lock.shield")
                .font(.system(size: 52, weight: .light))
                .foregroundStyle(.tint)
            Text(isLimited ? "Full Access Needed" : "Photo Access Required")
                .font(.title2.weight(.bold))
            Text(isLimited
                 ? "CleanSpace can only see a few selected photos. To scan for look-alikes and free up space, allow Full Access — everything still stays on your device."
                 : "CleanSpace needs access to your photo library to find duplicates and free up space. Nothing ever leaves your device.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal)
            Button(action: onOpenSettings) {
                Text("Open Settings")
                    .font(.headline)
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .padding(.horizontal, 40)
        }
        .padding(30)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}
