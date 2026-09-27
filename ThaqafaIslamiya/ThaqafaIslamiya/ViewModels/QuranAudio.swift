//
//  QuranAudio.swift
//  ثقافة إسلامية
//
//  التلاوة:
//  - `QuranAudioPlayer`: يبدأ من أول آية في الصفحة (بتوقيت دقيق لكل آية)، ويتابع الآيات والسور،
//    ويعمل في الخلفية مع أزرار شاشة القفل.
//    مصدر الصوت بالترتيب: مدمج في التطبيق ← محمّل على الجهاز ← بث مباشر (ويُحفظ للاستماع دون إنترنت لاحقًا).
//  - `QuranDownloads`: تحميل سورة أو المصحف كاملًا لقارئ ليعمل دون إنترنت دائمًا.
//

import Foundation
import AVFoundation
import MediaPlayer
import Observation

// MARK: - Downloads

@Observable
final class QuranDownloads: NSObject {
    /// تقدّم التحميل لكل ملف: المفتاح "<reciter>-<sss>"، والقيمة 0…1.
    private(set) var progress: [String: Double] = [:]
    /// القارئ الذي يُحمَّل مصحفه كاملًا الآن.
    private(set) var bulkReciter: String?
    private(set) var bulkDone = 0
    private(set) var bulkTotal = 0
    /// يتغيّر بعد كل تحميل/حذف لتحديث الواجهات.
    private(set) var revision = 0

    @ObservationIgnored private var tasks: [String: URLSessionDownloadTask] = [:]
    @ObservationIgnored private var observations: [String: NSKeyValueObservation] = [:]
    @ObservationIgnored private var bulkTask: Task<Void, Never>?

    private static let root: URL = {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        var url = base.appendingPathComponent("Quran", isDirectory: true)
        try? FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        try? url.setResourceValues(values)
        return url
    }()

    private func key(_ reciter: QuranReciter, _ surah: Int) -> String { "\(reciter.key)-" + String(format: "%03d", surah) }

    private func fileURL(_ reciter: QuranReciter, _ surah: Int) -> URL {
        Self.root.appendingPathComponent(reciter.key, isDirectory: true)
            .appendingPathComponent(String(format: "%03d.mp3", surah))
    }

    func bundledURL(_ reciter: QuranReciter, _ surah: Int) -> URL? {
        Bundle.main.url(forResource: reciter.bundledName(surah), withExtension: "m4a")
    }

    func localURL(_ reciter: QuranReciter, _ surah: Int) -> URL? {
        let url = fileURL(reciter, surah)
        return FileManager.default.fileExists(atPath: url.path) ? url : nil
    }

    /// متاحة دون إنترنت (مدمجة أو محمّلة).
    func isOffline(_ reciter: QuranReciter, _ surah: Int) -> Bool {
        _ = revision
        return bundledURL(reciter, surah) != nil || localURL(reciter, surah) != nil
    }

    func offlineCount(_ reciter: QuranReciter) -> Int {
        _ = revision
        return (1...114).filter { reciter.has($0) && isOffline(reciter, $0) }.count
    }

    func availableCount(_ reciter: QuranReciter) -> Int { (1...114).filter(reciter.has).count }

    func progress(_ reciter: QuranReciter, _ surah: Int) -> Double? { progress[key(reciter, surah)] }

    /// يحمّل سورة واحدة (إن لم تكن متاحة دون إنترنت).
    func download(_ reciter: QuranReciter, _ surah: Int, completion: ((Bool) -> Void)? = nil) {
        let k = key(reciter, surah)
        guard reciter.has(surah), !isOffline(reciter, surah), tasks[k] == nil, let remote = reciter.remoteURL(surah) else {
            completion?(isOffline(reciter, surah))
            return
        }
        let destination = fileURL(reciter, surah)
        progress[k] = 0
        let task = URLSession.shared.downloadTask(with: remote) { [weak self] temp, response, error in
            var ok = false
            if let temp, error == nil, ((response as? HTTPURLResponse)?.statusCode ?? 200) < 400 {
                try? FileManager.default.createDirectory(at: destination.deletingLastPathComponent(), withIntermediateDirectories: true)
                try? FileManager.default.removeItem(at: destination)
                ok = (try? FileManager.default.moveItem(at: temp, to: destination)) != nil
            }
            DispatchQueue.main.async {
                guard let self else { return }
                self.tasks[k] = nil
                self.observations[k] = nil
                self.progress[k] = nil
                self.revision += 1
                completion?(ok)
            }
        }
        observations[k] = task.progress.observe(\.fractionCompleted) { [weak self] p, _ in
            DispatchQueue.main.async { self?.progress[k] = p.fractionCompleted }
        }
        tasks[k] = task
        task.resume()
    }

    /// يحمّل كل سور القارئ واحدة تلو الأخرى.
    func downloadAll(_ reciter: QuranReciter) {
        guard bulkReciter == nil else { return }
        let pending = (1...114).filter { reciter.has($0) && !isOffline(reciter, $0) }
        bulkReciter = reciter.key
        bulkTotal = pending.count
        bulkDone = 0
        bulkTask = Task { @MainActor [weak self] in
            for surah in pending {
                guard let self, !Task.isCancelled else { break }
                _ = await withCheckedContinuation { (c: CheckedContinuation<Bool, Never>) in
                    self.download(reciter, surah) { c.resume(returning: $0) }
                }
                self.bulkDone += 1
            }
            self?.bulkReciter = nil
        }
    }

    func cancelAll() {
        bulkTask?.cancel()
        bulkTask = nil
        tasks.values.forEach { $0.cancel() }
        tasks = [:]
        observations = [:]
        progress = [:]
        bulkReciter = nil
    }

    /// يحذف تحميلات قارئ (المدمج في التطبيق يبقى).
    func deleteDownloads(_ reciter: QuranReciter) {
        try? FileManager.default.removeItem(at: Self.root.appendingPathComponent(reciter.key, isDirectory: true))
        revision += 1
    }

    func downloadedBytes(_ reciter: QuranReciter) -> Int64 {
        _ = revision
        let dir = Self.root.appendingPathComponent(reciter.key, isDirectory: true)
        let files = (try? FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: [.fileSizeKey])) ?? []
        return files.reduce(0) { $0 + Int64((try? $1.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0) }
    }
}

// MARK: - Player

@Observable
final class QuranAudioPlayer: NSObject {
    private(set) var isPlaying = false
    private(set) var isLoading = false
    /// الآية التي تُتلى الآن.
    private(set) var current: AyahRef?
    /// القارئ الذي يتلو الآن (قد يختلف عن المختار إن لم يسجّل القارئ المختار هذه السورة).
    private(set) var activeReciter: QuranReciter?
    /// رسالة للمستخدم (مثل: السورة غير محمّلة وليس هناك اتصال).
    var notice: String?

    @ObservationIgnored var store: QuranStore?
    @ObservationIgnored var downloads: QuranDownloads?
    @ObservationIgnored private var player: AVPlayer?
    @ObservationIgnored private var timeObserver: Any?
    @ObservationIgnored private var endObserver: NSObjectProtocol?
    @ObservationIgnored private var statusObservation: NSKeyValueObservation?
    @ObservationIgnored private var timing: [Int] = []
    @ObservationIgnored private var surah = 0
    @ObservationIgnored private var commandsReady = false

    var isActive: Bool { current != nil }

    /// يبدأ التلاوة من آية معيّنة (مثل أول آية في الصفحة).
    func play(from ref: AyahRef, reciter preferred: QuranReciter) {
        guard let store, let downloads else { return }
        let reciter: QuranReciter
        if preferred.has(ref.surah) {
            reciter = preferred
            notice = nil
        } else if let fallback = store.reciters.first(where: { $0.key == "alafasy" }) ?? store.reciters.first(where: { $0.has(ref.surah) }) {
            reciter = fallback
            notice = L10n.t("quran.notRecorded", preferred.displayName(arabic: L10n.language == .arabic),
                            fallback.displayName(arabic: L10n.language == .arabic))
        } else { return }

        let url: URL
        if let bundled = downloads.bundledURL(reciter, ref.surah) {
            url = bundled
        } else if let local = downloads.localURL(reciter, ref.surah) {
            url = local
        } else if let remote = reciter.remoteURL(ref.surah) {
            url = remote
            downloads.download(reciter, ref.surah)          // يُحفظ للاستماع دون إنترنت لاحقًا
        } else { return }

        stopPlayer()
        activeReciter = reciter
        surah = ref.surah
        current = ref
        isLoading = true
        setupSessionAndCommands()

        let item = AVPlayerItem(url: url)
        let player = AVPlayer(playerItem: item)
        player.automaticallyWaitsToMinimizeStalling = url.isFileURL == false
        self.player = player

        statusObservation = item.observe(\.status, options: [.new]) { [weak self] item, _ in
            DispatchQueue.main.async { self?.itemStatusChanged(item, start: ref, reciter: reciter) }
        }
        endObserver = NotificationCenter.default.addObserver(forName: .AVPlayerItemDidPlayToEndTime, object: item, queue: .main) { [weak self] _ in
            self?.surahFinished()
        }
        timeObserver = player.addPeriodicTimeObserver(forInterval: CMTime(value: 1, timescale: 5), queue: .main) { [weak self] time in
            self?.tick(time)
        }
    }

    private func itemStatusChanged(_ item: AVPlayerItem, start: AyahRef, reciter: QuranReciter) {
        switch item.status {
        case .readyToPlay:
            let duration = item.duration.seconds.isFinite ? item.duration.seconds : nil
            timing = store?.timing(reciter: reciter.key, surah: start.surah, duration: duration) ?? []
            let startMs = timing.indices.contains(start.ayah - 1) ? timing[start.ayah - 1] : 0
            player?.seek(to: CMTime(value: CMTimeValue(startMs), timescale: 1000), toleranceBefore: .zero, toleranceAfter: .zero) { [weak self] _ in
                DispatchQueue.main.async {
                    self?.player?.play()
                    self?.isPlaying = true
                    self?.isLoading = false
                    self?.updateNowPlaying()
                }
            }
        case .failed:
            isLoading = false
            isPlaying = false
            notice = L10n.t("quran.offlineMissing")
            current = nil
        default:
            break
        }
    }

    private func tick(_ time: CMTime) {
        guard isPlaying, !timing.isEmpty else { return }
        let ms = Int(time.seconds * 1000)
        var lo = 0, hi = timing.count - 2
        while lo < hi {
            let mid = (lo + hi + 1) / 2
            if timing[mid] <= ms + 150 { lo = mid } else { hi = mid - 1 }
        }
        let ayah = max(1, lo + 1)
        if current?.ayah != ayah || current?.surah != surah {
            current = AyahRef(surah: surah, ayah: ayah)
            updateNowPlaying()
        }
    }

    private func surahFinished() {
        guard let reciter = activeReciter, surah < 114 else { stop(); return }
        let preferred = store?.reciter ?? reciter
        play(from: AyahRef(surah: surah + 1, ayah: 1), reciter: preferred)
    }

    func pause() {
        player?.pause()
        isPlaying = false
        updateNowPlaying()
    }

    func resume() {
        guard player != nil else { return }
        player?.play()
        isPlaying = true
        updateNowPlaying()
    }

    func togglePause() { isPlaying ? pause() : resume() }

    func step(_ delta: Int) {
        guard let current, let store, let reciter = store.reciter else { return }
        let g = store.globalIndex(current) + delta
        guard (0..<QuranStore.ayahCount).contains(g) else { return }
        let target = store.ref(forGlobal: g)
        if target.surah == surah, timing.indices.contains(target.ayah - 1) {
            player?.seek(to: CMTime(value: CMTimeValue(timing[target.ayah - 1]), timescale: 1000),
                         toleranceBefore: .zero, toleranceAfter: .zero)
            self.current = target
            updateNowPlaying()
        } else {
            play(from: target, reciter: reciter)
        }
    }

    func stop() {
        stopPlayer()
        current = nil
        activeReciter = nil
        isPlaying = false
        isLoading = false
        MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
    }

    private func stopPlayer() {
        if let timeObserver { player?.removeTimeObserver(timeObserver) }
        if let endObserver { NotificationCenter.default.removeObserver(endObserver) }
        timeObserver = nil
        endObserver = nil
        statusObservation = nil
        player?.pause()
        player = nil
        timing = []
    }

    // MARK: Lock screen

    private func setupSessionAndCommands() {
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .spokenAudio)
        try? AVAudioSession.sharedInstance().setActive(true)
        guard !commandsReady else { return }
        commandsReady = true
        let center = MPRemoteCommandCenter.shared()
        center.playCommand.addTarget { [weak self] _ in self?.resume(); return .success }
        center.pauseCommand.addTarget { [weak self] _ in self?.pause(); return .success }
        center.togglePlayPauseCommand.addTarget { [weak self] _ in self?.togglePause(); return .success }
        center.nextTrackCommand.addTarget { [weak self] _ in self?.step(1); return .success }
        center.previousTrackCommand.addTarget { [weak self] _ in self?.step(-1); return .success }
    }

    private func updateNowPlaying() {
        guard let current, let store, let surah = store.surah(current.surah) else { return }
        let arabic = L10n.language == .arabic
        var info: [String: Any] = [
            MPMediaItemPropertyTitle: L10n.t("quran.nowPlaying", arabic ? surah.ar : surah.en, current.ayah.digits),
            MPMediaItemPropertyArtist: activeReciter?.displayName(arabic: arabic) ?? "",
            MPMediaItemPropertyAlbumTitle: L10n.t("quran.title"),
            MPNowPlayingInfoPropertyPlaybackRate: isPlaying ? 1.0 : 0.0,
        ]
        if let player {
            info[MPNowPlayingInfoPropertyElapsedPlaybackTime] = player.currentTime().seconds
            if let d = player.currentItem?.duration.seconds, d.isFinite { info[MPMediaItemPropertyPlaybackDuration] = d }
        }
        MPNowPlayingInfoCenter.default().nowPlayingInfo = info
    }
}
