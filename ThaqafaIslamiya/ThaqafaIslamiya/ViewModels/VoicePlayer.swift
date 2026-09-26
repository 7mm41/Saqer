//
//  VoicePlayer.swift
//  ثقافة إسلامية
//
//  القراءة الصوتية دون إنترنت:
//  ١. مقاطع صوتية طبيعية مدمجة (أصوات عصبية مولَّدة مسبقًا ومشكولة للعربية) بصيغة m4a:
//       voice_<lang>_step_<stepId>  — الخطوات
//       voice_<lang>_m_<masalaId>   — المسائل
//       voice_dua_<stepId>          — الأدعية بالعربية
//  ٢. إن لم يوجد مقطع: أفضل صوت نظام مثبّت للّغة (Premium ثم Enhanced) بسرعة طبيعية غير متقطّعة.
//

import AVFoundation
import Observation

@Observable
final class VoicePlayer: NSObject {
    /// مفتاح المقطع الذي يُقرأ الآن (لإظهار زر الإيقاف على العنصر الصحيح فقط).
    private(set) var activeKey: String?

    @ObservationIgnored private var player: AVAudioPlayer?
    private let synthesizer = AVSpeechSynthesizer()
    @ObservationIgnored private var voiceCache: [String: AVSpeechSynthesisVoice] = [:]
    @ObservationIgnored private var urlCache: [String: URL?] = [:]

    override init() {
        super.init()
        synthesizer.delegate = self
    }

    func isPlaying(_ key: String) -> Bool { activeKey == key }

    /// يشغّل المقطع أو يوقفه إن كان هو نفسه قيد التشغيل.
    func toggle(clip: String, text: String, language: AppLanguage) {
        if activeKey == clip {
            stop()
        } else {
            play(clip: clip, text: text, language: language)
        }
    }

    func play(clip: String, text: String, language: AppLanguage) {
        stop()
        activeKey = clip
        if let url = url(for: clip), let player = try? AVAudioPlayer(contentsOf: url) {
            player.delegate = self
            player.prepareToPlay()
            player.play()
            self.player = player
        } else {
            speak(text, language: language)
        }
    }

    func stop() {
        player?.stop()
        player = nil
        if synthesizer.isSpeaking { synthesizer.stopSpeaking(at: .immediate) }
        activeKey = nil
    }

    /// هل يوجد مقطع مدمج بهذا الاسم؟
    func hasClip(_ clip: String) -> Bool { url(for: clip) != nil }

    // MARK: - Private

    private func url(for clip: String) -> URL? {
        if let cached = urlCache[clip] { return cached }
        let url = Bundle.main.url(forResource: clip, withExtension: "m4a")
        urlCache[clip] = url
        return url
    }

    private func speak(_ text: String, language: AppLanguage) {
        let utterance = AVSpeechUtterance(string: text)
        utterance.voice = bestVoice(for: language)
        // سرعة النظام الطبيعية: الإبطاء الزائد هو ما يجعل الكلمات تبدو متقطّعة.
        utterance.rate = AVSpeechUtteranceDefaultSpeechRate
        utterance.pitchMultiplier = 1.0
        utterance.postUtteranceDelay = 0.1
        synthesizer.speak(utterance)
    }

    /// أعلى جودة متاحة على الجهاز لهذه اللغة (Premium > Enhanced > Default).
    private func bestVoice(for language: AppLanguage) -> AVSpeechSynthesisVoice? {
        if let cached = voiceCache[language.rawValue] { return cached }
        let prefix = language.rawValue
        let candidates = AVSpeechSynthesisVoice.speechVoices().filter {
            $0.language == language.speechCode || $0.language.hasPrefix(prefix + "-") || $0.language == prefix
        }
        let voice = candidates.max { rank($0) < rank($1) }
            ?? AVSpeechSynthesisVoice(language: language.speechCode)
        if let voice { voiceCache[language.rawValue] = voice }
        return voice
    }

    private func rank(_ voice: AVSpeechSynthesisVoice) -> Int {
        switch voice.quality {
        case .premium: 3
        case .enhanced: 2
        default: voice.voiceTraits.contains(.isNoveltyVoice) ? 0 : 1
        }
    }

    private func finished() {
        player = nil
        activeKey = nil
    }
}

extension VoicePlayer: AVAudioPlayerDelegate {
    func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        guard player === self.player else { return }
        finished()
    }
}

extension VoicePlayer: AVSpeechSynthesizerDelegate {
    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        guard player == nil else { return }
        finished()
    }
}
