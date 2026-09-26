//
//  IllustrationView.swift
//  ثقافة إسلامية
//
//  يعرض الرسم التوضيحي لخطوة أو قسم بالأولوية التالية (كلها محلية داخل التطبيق، بلا إنترنت):
//    ١. صورة في Assets.xcassets بالاسم نفسه (إن أضفتَها أنت لتستبدل الرسم المتحرك).
//    ٢. رسم متحرك (فيديو MP4 قصير متكرر) في مجلد Assets/Animations بالاسم نفسه، مثل wudu_06.mp4.
//    ٣. رمز SF Symbol متحرك كبديل أخير.
//

import SwiftUI
import UIKit
import AVFoundation

struct IllustrationView: View {
    let imageName: String
    let symbol: String
    var colors: [Color] = [.teal, .indigo]
    var symbolSize: CGFloat = 72
    /// تغيّر هذه القيمة يُشغّل حركة ارتداد الرمز.
    var bounceTrigger: Int = 0
    /// تشغيل الرسم المتحرك أو إيقافه مؤقتًا (مثل البطاقات الخلفية في المكدّس).
    var isPlaying: Bool = true
    var cornerRadius: CGFloat = 28

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        if UIImage(named: imageName) != nil {
            Image(imageName)
                .resizable()
                .scaledToFit()
                .accessibilityHidden(true)
        } else if let url = AnimationLibrary.url(for: imageName) {
            LoopingVideoView(url: url, isPlaying: isPlaying && !reduceMotion)
                .aspectRatio(1, contentMode: .fit)
                .clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                        .strokeBorder(.white.opacity(0.7), lineWidth: 2)
                )
                .shadow(color: .black.opacity(0.12), radius: 12, y: 6)
                .accessibilityHidden(true)
        } else {
            ZStack {
                Circle()
                    .fill(LinearGradient.diagonal(colors.map { $0.opacity(0.35) }))
                    .overlay(Circle().strokeBorder(.white.opacity(0.5), lineWidth: 1.5))
                    .blur(radius: 0.5)
                Image(systemName: symbol)
                    .font(.system(size: symbolSize, weight: .semibold))
                    .symbolRenderingMode(.hierarchical)
                    .foregroundStyle(LinearGradient.diagonal(colors))
                    .symbolEffect(.bounce, value: bounceTrigger)
                    .shadow(color: (colors.first ?? .teal).opacity(0.4), radius: 12, y: 6)
            }
            .aspectRatio(1, contentMode: .fit)
            .accessibilityHidden(true)
        }
    }
}

// MARK: - Animation lookup

/// يبحث عن الرسوم المتحركة المدمجة داخل حزمة التطبيق.
enum AnimationLibrary {
    private static var cache: [String: URL?] = [:]

    static func url(for name: String) -> URL? {
        if let cached = cache[name] { return cached }
        let url = Bundle.main.url(forResource: name, withExtension: "mp4")
        cache[name] = url
        return url
    }

    static func hasAnimation(_ name: String) -> Bool { url(for: name) != nil }
}

// MARK: - Looping muted video

/// مشغّل فيديو صامت يتكرر بلا نهاية (AVPlayerLooper) لعرض الرسوم المتحركة.
struct LoopingVideoView: UIViewRepresentable {
    let url: URL
    var isPlaying: Bool = true

    final class Coordinator {
        var player: AVQueuePlayer?
        var looper: AVPlayerLooper?
        var url: URL?
    }

    final class PlayerView: UIView {
        override class var layerClass: AnyClass { AVPlayerLayer.self }
        var playerLayer: AVPlayerLayer { layer as! AVPlayerLayer }
    }

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> PlayerView {
        let view = PlayerView()
        view.backgroundColor = .clear
        view.playerLayer.videoGravity = .resizeAspectFill
        attach(url, to: view, coordinator: context.coordinator)
        return view
    }

    func updateUIView(_ view: PlayerView, context: Context) {
        if context.coordinator.url != url {
            attach(url, to: view, coordinator: context.coordinator)
        }
        if isPlaying {
            context.coordinator.player?.play()
        } else {
            context.coordinator.player?.pause()
        }
    }

    static func dismantleUIView(_ view: PlayerView, coordinator: Coordinator) {
        coordinator.player?.pause()
        coordinator.looper?.disableLooping()
        coordinator.player = nil
        coordinator.looper = nil
    }

    private func attach(_ url: URL, to view: PlayerView, coordinator: Coordinator) {
        coordinator.player?.pause()
        let player = AVQueuePlayer()
        player.isMuted = true
        player.preventsDisplaySleepDuringVideoPlayback = false
        coordinator.looper = AVPlayerLooper(player: player, templateItem: AVPlayerItem(url: url))
        coordinator.player = player
        coordinator.url = url
        view.playerLayer.player = player
        if isPlaying { player.play() }
    }
}

#Preview {
    VStack {
        IllustrationView(imageName: "wudu_06", symbol: "nose.fill")
        IllustrationView(imageName: "missing_name", symbol: "drop.fill")
    }
    .frame(width: 260)
    .padding()
}
