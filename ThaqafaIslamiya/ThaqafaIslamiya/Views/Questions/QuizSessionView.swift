//
//  QuizSessionView.swift
//  ثقافة إسلامية
//
//  جولة أسئلة بملء الشاشة: اختيار من متعدد أو كتابة الكلمة الناقصة، مع تلميح،
//  وتصحيح فوري وشرح من الكتاب، وسلسلة الإجابات الصحيحة، وملخّص النتيجة في النهاية.
//

import SwiftUI

struct QuizSessionView: View {
    @State private var model: QuizSessionViewModel
    @Environment(\.dismiss) private var dismiss
    @Environment(ProgressStore.self) private var progress
    @Environment(QuestionBankViewModel.self) private var bank
    @Environment(\.layoutDirection) private var direction
    @FocusState private var typing: Bool

    init(config: QuizSessionConfig) {
        _model = State(initialValue: QuizSessionViewModel(config: config))
    }

    private let tint: [Color] = [.indigo, .pink]

    var body: some View {
        ZStack {
            LiquidBackground(colors: tint)

            VStack(spacing: 16) {
                topBar
                if model.isFinished {
                    summary
                        .transition(.scale(scale: 0.9).combined(with: .opacity))
                } else {
                    ScrollView {
                        questionCard
                            .id(model.index)
                            .transition(.asymmetric(insertion: .move(edge: .trailing).combined(with: .opacity),
                                                    removal: .move(edge: .leading).combined(with: .opacity)))
                            .padding(.bottom, 20)
                    }
                    .scrollDismissesKeyboard(.interactively)
                    .scrollIndicators(.hidden)
                }
            }
            .padding(.horizontal, 18)
            .padding(.top, 8)
            .frame(maxWidth: 720)
        }
        .appHaptic(trigger: model.hasAnswered) { _, answered in
            guard answered else { return nil }
            return model.isCorrect ? SensoryFeedback.success : SensoryFeedback.error
        }
    }

    // MARK: - Top bar

    private var topBar: some View {
        HStack(spacing: 12) {
            Button { dismiss() } label: {
                Image(systemName: "xmark")
                    .font(.headline.weight(.bold))
                    .frame(width: 44, height: 44)
                    .glassCircle()
            }
            .buttonStyle(PressableCardStyle())
            .accessibilityLabel(L10n.t("common.close"))

            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    Text(model.config.mode == .daily ? L10n.t("bank.daily")
                         : L10n.t("quiz.questionOf", (model.index + 1).digits, model.total.digits))
                        .font(.subheadline.weight(.bold))
                        .contentTransition(.numericText())
                    Spacer()
                    if model.streak >= 2 {
                        Label(model.streak.digits, systemImage: "flame.fill")
                            .font(.subheadline.weight(.heavy))
                            .foregroundStyle(.orange)
                            .transition(.scale.combined(with: .opacity))
                            .contentTransition(.numericText())
                    }
                }
                GlassProgressBar(progress: model.progress, colors: tint)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .glassCard(cornerRadius: 22, elevated: false)
        }
    }

    // MARK: - Question

    private var questionCard: some View {
        let q = model.current
        return VStack(alignment: .leading, spacing: 16) {
            Label(q.kind == .choice ? L10n.t("bank.kind.choice") : L10n.t("bank.kind.written"),
                  systemImage: q.kind == .choice ? "list.bullet.circle.fill" : "pencil.and.scribble")
                .font(.caption.weight(.heavy))
                .padding(.horizontal, 10).padding(.vertical, 5)
                .glassCapsule(tint: .indigo, interactive: false)

            Text(q.q)
                .font(.title3.weight(.bold))
                .fixedSize(horizontal: false, vertical: true)

            if let quote = q.x {
                quoteView(quote, meaning: q.xm, arabic: q.quoteIsArabic)
            }

            if let source = q.s {
                Label(source, systemImage: "book.closed.fill")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
            }

            switch q.kind {
            case .choice: options(q)
            case .written: writtenInput(q)
            }

            if model.hasAnswered {
                feedback(q)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .padding(20)
        .glassCard(cornerRadius: 32, tint: .indigo)
    }

    private func quoteView(_ text: String, meaning: String?, arabic: Bool) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(text)
                .font(.body.weight(.medium))
                .lineSpacing(6)
                .frame(maxWidth: .infinity, alignment: .leading)
                .fixedSize(horizontal: false, vertical: true)
                .environment(\.layoutDirection, arabic ? .rightToLeft : direction)
            if let meaning {
                Text(meaning)
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(14)
        .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(Color.indigo.opacity(0.08)))
        .overlay(alignment: .leading) {
            Capsule().fill(LinearGradient.diagonal(tint)).frame(width: 4).padding(.vertical, 10)
        }
    }

    private func options(_ q: BankQuestion) -> some View {
        VStack(spacing: 10) {
            ForEach(Array((q.o ?? []).enumerated()), id: \.offset) { index, option in
                Button {
                    let correct = model.select(index)
                    progress.recordAnswer(questionId: q.id, correct: correct)
                    progress.recordStreak(model.streak)
                } label: {
                    HStack(spacing: 12) {
                        Text(optionLetter(index))
                            .font(.subheadline.weight(.heavy))
                            .frame(width: 30, height: 30)
                            .background(Circle().fill(Color.indigo.opacity(0.12)))
                        Text(option)
                            .font(.headline)
                            .foregroundStyle(.primary)
                            .multilineTextAlignment(.leading)
                            .frame(maxWidth: .infinity, alignment: .leading)
                        if model.hasAnswered && index == q.a {
                            Image(systemName: "checkmark.circle.fill").foregroundStyle(.green).font(.title3)
                        } else if model.selectedOption == index {
                            Image(systemName: "xmark.circle.fill").foregroundStyle(.red).font(.title3)
                        }
                    }
                    .padding(14)
                    .glassCard(cornerRadius: 20, tint: optionTint(index, q), interactive: !model.hasAnswered, elevated: false)
                }
                .buttonStyle(PressableCardStyle())
                .disabled(model.hasAnswered)
            }
        }
    }

    private func optionLetter(_ index: Int) -> String {
        let letters = direction == .rightToLeft ? ["أ", "ب", "ج", "د", "هـ"] : ["A", "B", "C", "D", "E"]
        return letters[min(index, letters.count - 1)]
    }

    private func optionTint(_ index: Int, _ q: BankQuestion) -> Color {
        guard model.hasAnswered else { return .white }
        if index == q.a { return .green }
        if index == model.selectedOption { return .red }
        return .white
    }

    private func writtenInput(_ q: BankQuestion) -> some View {
        @Bindable var model = model
        return VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 10) {
                TextField(L10n.t("bank.typeAnswer"), text: $model.typedAnswer)
                    .font(.title3.weight(.semibold))
                    .focused($typing)
                    .submitLabel(.done)
                    .autocorrectionDisabled()
                    .textInputAutocapitalization(.never)
                    .disabled(model.hasAnswered)
                    .onSubmit { submit(q) }
                if !model.hasAnswered, let hint = q.h {
                    Button {
                        withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) { model.showHint.toggle() }
                    } label: {
                        Image(systemName: model.showHint ? "lightbulb.fill" : "lightbulb")
                            .font(.title3)
                            .foregroundStyle(.yellow)
                    }
                    .accessibilityLabel(L10n.t("bank.hint") + ": " + hint)
                }
            }
            .padding(14)
            .glassCard(cornerRadius: 20, tint: writtenTint, elevated: false)

            if model.showHint, let hint = q.h, !model.hasAnswered {
                Label(hint, systemImage: "lightbulb.fill")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.orange)
                    .transition(.opacity.combined(with: .move(edge: .top)))
            }

            if !model.hasAnswered {
                HStack(spacing: 12) {
                    Button { model.reveal(); record(q, correct: false) } label: {
                        Text(L10n.t("bank.dontKnow")).font(.subheadline.weight(.semibold))
                    }
                    .buttonStyle(GlassButtonStyle())

                    Button { submit(q) } label: {
                        Label(L10n.t("bank.check"), systemImage: "checkmark")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(ProminentGlassButtonStyle(colors: tint))
                    .disabled(model.typedAnswer.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
        }
        .onAppear { typing = true }
    }

    private var writtenTint: Color {
        guard let result = model.writtenResult else { return .white }
        return result ? .green : .red
    }

    private func submit(_ q: BankQuestion) {
        guard !model.hasAnswered else { return }
        let correct = model.submitWritten()
        if model.hasAnswered { record(q, correct: correct) }
    }

    private func record(_ q: BankQuestion, correct: Bool) {
        progress.recordAnswer(questionId: q.id, correct: correct)
        progress.recordStreak(model.streak)
        typing = false
    }

    // MARK: - Feedback

    private func feedback(_ q: BankQuestion) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Label(model.isCorrect ? L10n.t("quiz.correct") : L10n.t("quiz.wrong"),
                  systemImage: model.isCorrect ? "hands.clap.fill" : "lightbulb.fill")
                .font(.headline)
                .foregroundStyle(model.isCorrect ? .green : .orange)

            if !model.isCorrect {
                Text(L10n.t("bank.correctAnswer", q.correctAnswerText))
                    .font(.subheadline.weight(.bold))
            }
            Text(q.e)
                .font(.callout)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)

            Button { model.next() } label: {
                HStack {
                    Text(model.isLast ? L10n.t("quiz.result") : L10n.t("quiz.next"))
                    Image(systemName: "chevron.forward")
                }
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(ProminentGlassButtonStyle(colors: tint))
            .padding(.top, 4)
        }
        .padding(14)
        .background(RoundedRectangle(cornerRadius: 20, style: .continuous)
            .fill((model.isCorrect ? Color.green : Color.orange).opacity(0.1)))
    }

    // MARK: - Summary

    private var summary: some View {
        let perfect = model.score == model.total
        return VStack(spacing: 18) {
            Spacer(minLength: 0)
            ZStack {
                ProgressRing(progress: model.accuracy, colors: [.green, .teal, .indigo], lineWidth: 14)
                    .frame(width: 150, height: 150)
                VStack(spacing: 2) {
                    Text(L10n.t("common.percent", Int((model.accuracy * 100).rounded()).digits))
                        .font(.system(size: 36, weight: .heavy, design: .rounded))
                    Text("\(model.score.digits)/\(model.total.digits)")
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(.secondary)
                }
            }
            Text(perfect ? L10n.t("quiz.perfect") : L10n.t("quiz.goodTry"))
                .font(.largeTitle.weight(.heavy))
                .multilineTextAlignment(.center)
            HStack(spacing: 12) {
                StatTile(symbol: "bolt.fill", colors: [.orange, .yellow], value: model.bestStreak.digits,
                         title: L10n.t("stats.roundStreak"))
                StatTile(symbol: "checkmark.circle.fill", colors: [.teal, .mint], value: progress.answeredCount.digits,
                         title: L10n.t("stats.answered"))
            }
            HStack(spacing: 12) {
                Button { dismiss() } label: {
                    Label(L10n.t("done.back"), systemImage: "house.fill")
                }
                .buttonStyle(GlassButtonStyle())
                if model.config.mode == .round {
                    Button {
                        if let next = bank.makeRound(seen: progress.seenQuestions) {
                            model = QuizSessionViewModel(config: next)
                        }
                    } label: {
                        Label(L10n.t("bank.anotherRound"), systemImage: "shuffle")
                    }
                    .buttonStyle(ProminentGlassButtonStyle(colors: tint))
                }
            }
            Spacer(minLength: 0)
        }
        .padding(24)
        .frame(maxWidth: .infinity)
        .overlay { if perfect { ConfettiView() } }
    }
}
