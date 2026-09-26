//
//  IllustrationView.swift
//  ثقافة إسلامية
//
//  يعرض الرسم التوضيحي لخطوة أو قسم بالأولوية التالية (كلها محلية داخل التطبيق، بلا إنترنت):
//    ١. صورة في Assets.xcassets بالاسم نفسه (إن أضفتَها أنت لتستبدل الرسم المتحرك).
//    ٢. رسم متحرك ثلاثي الأبعاد (فيديو MP4 قصير متكرر) في Assets/Animations بالاسم نفسه، مثل wudu_06.mp4.
//       عند `playsVideo == false` (البطاقات غير النشطة والمصغّرات) تُعرض صورة الملصق `<name>_poster.jpg`
//       بدل إنشاء مشغّل فيديو — وهذا يوفّر الذاكرة والمعالج ويجعل التمرير أسلس.
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
    /// تشغيل الفيديو (true) أو عرض صورة الملصق الثابتة فقط (false).
    var playsVideo: Bool = true
    var cornerRadius: CGFloat = 28

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        switch AnimationLibrary.source(for: imageName) {
        case .asset:
            Image(imageName)
                .resizable()
                .scaledToFit()
                .accessibilityHidden(true)
        case .video(let url, let poster):
            framed {
                if playsVideo && !reduceMotion {
                    LoopingVideoView(url: url, poster: poster)
                } else if let poster {
                    Image(uiImage: poster).resizable().scaledToFill()
                } else {
                    LoopingVideoView(url: url, poster: nil, isPlaying: false)
                }
            }
        case .none:
            symbolFallback
        }
    }

    private func framed<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
        let shape = RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
        return content()
            .aspectRatio(1, contentMode: .fit)
            .clipShape(shape)
            .overlay(shape.strokeBorder(.white.opacity(0.6), lineWidth: 1.5))
            .accessibilityHidden(true)
    }

    private var symbolFallback: some View {
        ZStack {
            Circle()
                .fill(LinearGradient.diagonal(colors.map { $0.opacity(0.35) }))
                .overlay(Circle().strokeBorder(.white.opacity(0.5), lineWidth: 1.5))
            Image(systemName: symbol)
                .font(.system(size: symbolSize, weight: .semibold))
                .symbolRenderingMode(.hierarchical)
                .foregroundStyle(LinearGradient.diagonal(colors))
                .symbolEffect(.bounce, value: bounceTrigger)
        }
        .aspectRatio(1, contentMode: .fit)
        .accessibilityHidden(true)
    }
}

// MARK: - Illustration lookup (cached)

/// يبحث عن الرسوم المدمجة داخل حزمة التطبيق مرة واحدة لكل اسم ويحفظ النتيجة.
enum AnimationLibrary {
    enum Source {
        case asset
        case video(URL, poster: UIImage?)
        case none
    }

    nonisolated(unsafe) private static var cache: [String: Source] = [:]

    static func source(for name: String) -> Source {
        if let cached = cache[name] { return cached }
        let source: Source
        if UIImage(named: name) != nil {
            source = .asset
        } else if let url = Bundle.main.url(forResource: name, withExtension: "mp4") {
            let poster = Bundle.main.path(forResource: "\(name)_poster", ofType: "jpg").flatMap(UIImage.init(contentsOfFile:))
            source = .video(url, poster: poster)
        } else {
            source = .none
        }
        cache[name] = source
        return source
    }

    static func hasAnimation(_ name: String) -> Bool {
        if case .video = source(for: name) { return true }
        return false
    }

    static func hasIllustration(_ name: String) -> Bool {
        if case .none = source(for: name) { return false }
        return true
    }
}

// MARK: - Looping muted video

/// مشغّل فيديو صامت يتكرر بلا نهاية (AVPlayerLooper). يُظهر صورة الملصق حتى يجهز أول إطار فلا يومض.
struct LoopingVideoView: UIViewRepresentable {
    let url: URL
    var poster: UIImage?
    var isPlaying: Bool = true

    final class Coordinator {
        var player: AVQueuePlayer?
        var looper: AVPlayerLooper?
        var url: URL?
        var readyObservation: NSKeyValueObservation?
    }

    final class PlayerView: UIView {
        override class var layerClass: AnyClass { AVPlayerLayer.self }
        var playerLayer: AVPlayerLayer { layer as! AVPlayerLayer }
        let posterView = UIImageView()

        override init(frame: CGRect) {
            super.init(frame: frame)
            posterView.contentMode = .scaleAspectFill
            posterView.clipsToBounds = true
            addSubview(posterView)
        }

        required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

        override func layoutSubviews() {
            super.layoutSubviews()
            posterView.frame = bounds
        }
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
        coordinator.readyObservation = nil
        coordinator.player?.pause()
        coordinator.looper?.disableLooping()
        coordinator.player = nil
        coordinator.looper = nil
    }

    private func attach(_ url: URL, to view: PlayerView, coordinator: Coordinator) {
        coordinator.player?.pause()
        view.posterView.image = poster
        view.posterView.isHidden = poster == nil

        let player = AVQueuePlayer()
        player.isMuted = true
        player.preventsDisplaySleepDuringVideoPlayback = false
        player.automaticallyWaitsToMinimizeStalling = false
        coordinator.looper = AVPlayerLooper(player: player, templateItem: AVPlayerItem(url: url))
        coordinator.player = player
        coordinator.url = url
        view.playerLayer.player = player
        coordinator.readyObservation = view.playerLayer.observe(\.isReadyForDisplay, options: [.new]) { [weak view] layer, _ in
            guard layer.isReadyForDisplay else { return }
            DispatchQueue.main.async { view?.posterView.isHidden = true }
        }
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
