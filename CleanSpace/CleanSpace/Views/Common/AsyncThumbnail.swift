//
//  AsyncThumbnail.swift
//  CleanSpace
//
//  Loads a downscaled thumbnail for a PHAsset id and renders it with a shimmering
//  placeholder. Bounded by `targetSize`, so grids never hold full-res images.
//

import SwiftUI
#if canImport(UIKit)
import UIKit
#endif

struct AsyncThumbnail: View {
    let assetID: String
    var targetSize: CGSize = CGSize(width: 300, height: 300)
    var contentMode: ContentMode = .fill

    @State private var image: PlatformImage?
    @State private var didFail = false

    var body: some View {
        ZStack {
            if let image {
                Image(uiImage: image)
                    .resizable()
                    .aspectRatio(contentMode: contentMode)
                    .transition(.opacity)
            } else if didFail {
                placeholder(system: "photo")
            } else {
                ShimmerView()
            }
        }
        .clipped()
        .task(id: assetID) { await load() }
    }

    private func load() async {
        image = nil
        didFail = false
        let result = await ThumbnailProvider.shared.thumbnail(for: assetID, targetSize: targetSize)
        withAnimation(.easeOut(duration: 0.25)) {
            if let result { image = result } else { didFail = true }
        }
    }

    private func placeholder(system: String) -> some View {
        ZStack {
            Rectangle().fill(.quaternary)
            Image(systemName: system).font(.title2).foregroundStyle(.secondary)
        }
    }
}

/// A lightweight shimmer used while thumbnails resolve.
struct ShimmerView: View {
    @State private var phase: CGFloat = -1

    var body: some View {
        GeometryReader { geo in
            Rectangle()
                .fill(.quaternary)
                .overlay(
                    LinearGradient(
                        colors: [.clear, .white.opacity(0.35), .clear],
                        startPoint: .leading, endPoint: .trailing
                    )
                    .frame(width: geo.size.width * 0.6)
                    .offset(x: phase * geo.size.width * 1.6)
                    .blendMode(.plusLighter)
                )
                .onAppear {
                    withAnimation(.linear(duration: 1.1).repeatForever(autoreverses: false)) {
                        phase = 1
                    }
                }
        }
    }
}
