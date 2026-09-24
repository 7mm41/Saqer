//
//  SwipeCardView.swift
//  CleanSpace
//
//  A single draggable photo card. Swipe right/up to keep, left/down to bin.
//  Fires a haptic as it crosses the decision threshold and flings itself off in
//  the chosen direction before reporting the decision.
//

import SwiftUI

struct SwipeCardView: View {
    let item: MediaItem
    let isSuggestedKeep: Bool
    var isTop: Bool = true
    var onDecision: (_ keep: Bool) -> Void

    @State private var offset: CGSize = .zero
    @State private var crossedThreshold = false

    private let threshold: CGFloat = 120

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .top) {
                AsyncThumbnail(
                    assetID: item.id,
                    targetSize: CGSize(width: geo.size.width, height: geo.size.height),
                    contentMode: .fill
                )
                .frame(width: geo.size.width, height: geo.size.height)
                .clipShape(RoundedRectangle(cornerRadius: 26, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: 26, style: .continuous)
                        .stroke(.white.opacity(0.12), lineWidth: 1)
                )

                decisionOverlays
                metadataBar
                if isSuggestedKeep { heroBadge }
            }
            .frame(width: geo.size.width, height: geo.size.height)
            .shadow(color: .black.opacity(0.18), radius: 14, y: 8)
            .offset(offset)
            .rotationEffect(.degrees(Double(offset.width / 22)))
            .gesture(dragGesture, including: isTop ? .all : .subviews)
            .animation(.interactiveSpring(response: 0.35, dampingFraction: 0.8), value: offset)
        }
    }

    // MARK: Overlays

    private var decisionOverlays: some View {
        ZStack {
            stamp(text: "KEEP", color: .green, systemImage: "checkmark")
                .opacity(Double(max(0, keepProgress)))
            stamp(text: "DELETE", color: .red, systemImage: "trash")
                .opacity(Double(max(0, binProgress)))
        }
        .padding(20)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
    }

    private func stamp(text: String, color: Color, systemImage: String) -> some View {
        Label(text, systemImage: systemImage)
            .font(.system(size: 22, weight: .heavy))
            .foregroundStyle(color)
            .padding(.horizontal, 14).padding(.vertical, 8)
            .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 12))
            .overlay(RoundedRectangle(cornerRadius: 12).stroke(color, lineWidth: 3))
            .rotationEffect(.degrees(-12))
            .frame(maxWidth: .infinity, alignment: color == .green ? .leading : .trailing)
    }

    private var metadataBar: some View {
        VStack {
            Spacer(minLength: 0)
            HStack {
                Label(Format.bytes(item.byteSize), systemImage: item.isVideo ? "film" : "photo")
                Spacer()
                Text("\(item.pixelWidth)×\(item.pixelHeight)")
            }
            .font(.caption.weight(.medium))
            .foregroundStyle(.white)
            .padding(12)
            .background(
                LinearGradient(colors: [.clear, .black.opacity(0.55)],
                               startPoint: .top, endPoint: .bottom)
            )
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
        .clipShape(RoundedRectangle(cornerRadius: 26, style: .continuous))
        .allowsHitTesting(false)
    }

    private var heroBadge: some View {
        HStack {
            Label("Best shot", systemImage: "star.fill")
                .font(.caption.weight(.bold))
                .foregroundStyle(.white)
                .padding(.horizontal, 12).padding(.vertical, 6)
                .background(.indigo, in: Capsule())
            Spacer()
        }
        .padding(14)
    }

    // MARK: Gesture

    private var keepProgress: CGFloat { max(offset.width, -offset.height) / threshold }
    private var binProgress: CGFloat { max(-offset.width, offset.height) / threshold }

    private var dragGesture: some Gesture {
        DragGesture()
            .onChanged { value in
                offset = value.translation
                let past = abs(value.translation.width) > threshold || abs(value.translation.height) > threshold
                if past && !crossedThreshold {
                    crossedThreshold = true
                    HapticsManager.shared.swipeThreshold()
                } else if !past {
                    crossedThreshold = false
                }
            }
            .onEnded { value in
                let dx = value.translation.width
                let dy = value.translation.height
                let horizontal = abs(dx) > abs(dy)
                let decided: Bool?   // true = keep, false = bin, nil = snap back
                if horizontal {
                    decided = dx > threshold ? true : (dx < -threshold ? false : nil)
                } else {
                    decided = dy < -threshold ? true : (dy > threshold ? false : nil)
                }
                guard let keep = decided else {
                    offset = .zero
                    crossedThreshold = false
                    return
                }
                fling(keep: keep, horizontal: horizontal, dx: dx, dy: dy)
            }
    }

    private func fling(keep: Bool, horizontal: Bool, dx: CGFloat, dy: CGFloat) {
        let target: CGSize = horizontal
            ? CGSize(width: dx > 0 ? 700 : -700, height: dy)
            : CGSize(width: dx, height: dy < 0 ? -900 : 900)
        withAnimation(.easeOut(duration: 0.28)) { offset = target }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.22) {
            onDecision(keep)
        }
    }
}
