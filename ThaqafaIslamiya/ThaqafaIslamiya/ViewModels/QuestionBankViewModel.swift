//
//  QuestionBankViewModel.swift
//  ثقافة إسلامية
//
//  بنك الأسئلة العشوائية: يحمّل `Questions.<lang>.json` في الخلفية، ويبني جولات عشوائية
//  (مع تفضيل الأسئلة التي لم تظهر بعد)، ويختار «سؤال اليوم».
//

import Foundation
import Observation

@Observable
final class QuestionBankViewModel {
    enum KindFilter: String, CaseIterable, Identifiable {
        case all, choice, written
        var id: String { rawValue }
        var title: String { L10n.t("bank.filter.\(rawValue)") }
        var symbol: String {
            switch self {
            case .all: "square.grid.2x2.fill"
            case .choice: "list.bullet.circle.fill"
            case .written: "pencil.and.scribble"
            }
        }
    }

    private(set) var questions: [BankQuestion] = []
    private(set) var isLoading = false
    private(set) var language: AppLanguage?

    var kindFilter: KindFilter = .all
    /// معرّف القسم المختار (nil = كل الأقسام).
    var chapterFilter: String?
    var roundLength = 10

    @ObservationIgnored private var loadTask: Task<Void, Never>?

    var count: Int { questions.count }
    var choiceCount: Int { questions.lazy.filter { $0.kind == .choice }.count }
    var writtenCount: Int { questions.lazy.filter { $0.kind == .written }.count }

    /// يحمّل بنك اللغة مرة واحدة (في الخلفية حتى لا تتأخر الواجهة).
    func load(_ language: AppLanguage) {
        guard self.language != language else { return }
        self.language = language
        isLoading = true
        loadTask?.cancel()
        loadTask = Task { [weak self] in
            let loaded = await Task.detached(priority: .userInitiated) { () -> [BankQuestion] in
                (try? Bundle.main.decode(QuestionBankFile.self, from: "Questions.\(language.rawValue)"))?.questions ?? []
            }.value
            guard !Task.isCancelled else { return }
            await MainActor.run {
                self?.questions = loaded
                self?.isLoading = false
            }
        }
    }

    var filtered: [BankQuestion] {
        questions.filter { q in
            (chapterFilter == nil || q.c == chapterFilter) &&
            (kindFilter == .all || (kindFilter == .choice ? q.kind == .choice : q.kind == .written))
        }
    }

    /// جولة عشوائية: الأسئلة غير المُجابة أولًا، ثم البقية، دون تكرار داخل الجولة.
    func makeRound(seen: Set<String>) -> QuizSessionConfig? {
        let pool = filtered
        guard !pool.isEmpty else { return nil }
        let fresh = pool.filter { !seen.contains($0.id) }.shuffled()
        let old = pool.filter { seen.contains($0.id) }.shuffled()
        let picked = Array((fresh + old).prefix(roundLength))
        return QuizSessionConfig(questions: picked, mode: .round)
    }

    /// سؤال اليوم: ثابت طوال اليوم ويتغيّر كل يوم.
    var dailyQuestion: BankQuestion? {
        guard !questions.isEmpty else { return nil }
        let day = Calendar.current.ordinality(of: .day, in: .era, for: .now) ?? 0
        let choices = questions.filter { $0.kind == .choice && $0.t != "mc" }
        let pool = choices.isEmpty ? questions : choices
        return pool[(day * 7919) % pool.count]
    }
}
