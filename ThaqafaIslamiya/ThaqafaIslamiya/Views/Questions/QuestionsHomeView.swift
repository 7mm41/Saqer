//
//  QuestionsHomeView.swift
//  ثقافة إسلامية
//
//  تبويب «الأسئلة»: بنك من أكثر من ١٠٠٠ سؤال من الكتاب تظهر عشوائيًا —
//  اختيار من متعدد وكتابة — مع سؤال اليوم، وتصفية حسب النوع والقسم، وإحصاءات التقدّم.
//

import SwiftUI

struct QuestionsHomeView: View {
    @Environment(QuestionBankViewModel.self) private var bank
    @Environment(LibraryViewModel.self) private var library
    @Environment(ProgressStore.self) private var progress
    @Environment(AppRouter.self) private var router
    @Environment(\.horizontalSizeClass) private var sizeClass

    @State private var appeared = false

    private var isWide: Bool { sizeClass == .regular }

    var body: some View {
        ZStack {
            LiquidBackground(colors: [.indigo, .pink])

            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    hero
                    statsGrid
                    if let daily = bank.dailyQuestion {
                        DailyQuestionCard(question: daily) {
                            router.present(QuizSessionConfig(questions: [daily], mode: .daily))
                        }
                    }
                    roundBuilder(bank: bank)
                }
                .padding(.horizontal, isWide ? 40 : 18)
                .padding(.vertical, 12)
                .frame(maxWidth: 820)
                .frame(maxWidth: .infinity)
            }
        }
        .navigationTitle(L10n.t("tab.questions"))
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(.hidden, for: .navigationBar)
        .onAppear { withAnimation(.spring(response: 0.6, dampingFraction: 0.8)) { appeared = true } }
    }

    // MARK: - Hero

    private var hero: some View {
        HStack(spacing: 16) {
            ZStack {
                Circle().fill(LinearGradient.diagonal([.indigo, .pink]))
                Image(systemName: "sparkles.rectangle.stack.fill")
                    .font(.system(size: 30, weight: .semibold))
                    .foregroundStyle(.white)
                    .symbolEffect(.bounce, value: appeared)
            }
            .frame(width: 66, height: 66)

            VStack(alignment: .leading, spacing: 4) {
                Text(L10n.t("bank.title"))
                    .font(.title2.weight(.heavy))
                Group {
                    if bank.isLoading {
                        Text(L10n.t("bank.loading"))
                    } else {
                        Text(L10n.t("bank.subtitle", bank.count.digits))
                    }
                }
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .contentTransition(.numericText())
            }
            Spacer(minLength: 0)
        }
        .padding(20)
        .glassCard(cornerRadius: 30, tint: .indigo)
        .opacity(appeared ? 1 : 0)
        .offset(y: appeared ? 0 : -20)
    }

    // MARK: - Stats

    private var statsGrid: some View {
        let columns = [GridItem(.adaptive(minimum: isWide ? 170 : 150), spacing: 12)]
        return LazyVGrid(columns: columns, spacing: 12) {
            StatTile(symbol: "checkmark.circle.fill", colors: [.teal, .mint],
                     value: progress.answeredCount.digits, title: L10n.t("stats.answered"))
            StatTile(symbol: "target", colors: [.green, .teal],
                     value: L10n.t("common.percent", Int((progress.accuracy * 100).rounded()).digits), title: L10n.t("stats.accuracy"))
            StatTile(symbol: "bolt.fill", colors: [.orange, .yellow],
                     value: progress.bestStreak.digits, title: L10n.t("stats.bestStreak"))
            StatTile(symbol: "flame.fill", colors: [.red, .orange],
                     value: progress.currentDayStreak.digits, title: L10n.t("stats.days"))
        }
    }

    // MARK: - Round builder

    private func roundBuilder(bank: QuestionBankViewModel) -> some View {
        @Bindable var bank = bank
        return VStack(alignment: .leading, spacing: 16) {
            SectionHeader(title: L10n.t("bank.newRound"), subtitle: L10n.t("bank.newRoundSubtitle"), symbol: "shuffle")

            // نوع الأسئلة
            GlassGroup(spacing: 10) {
                HStack(spacing: 10) {
                    ForEach(QuestionBankViewModel.KindFilter.allCases) { filter in
                        let selected = bank.kindFilter == filter
                        Button {
                            withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) { bank.kindFilter = filter }
                        } label: {
                            VStack(spacing: 6) {
                                Image(systemName: filter.symbol).font(.title3)
                                Text(filter.title).font(.caption.weight(.bold)).lineLimit(1).minimumScaleFactor(0.8)
                                Text(count(for: filter).digits).font(.caption2).foregroundStyle(.secondary)
                            }
                            .foregroundStyle(selected ? Color.white : Color.primary)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 12)
                            .background {
                                if selected {
                                    RoundedRectangle(cornerRadius: 20, style: .continuous)
                                        .fill(LinearGradient.diagonal([.indigo, .pink]))
                                }
                            }
                            .glassCard(cornerRadius: 20, tint: selected ? .indigo : .white, interactive: true, elevated: false)
                        }
                        .buttonStyle(PressableCardStyle())
                        .accessibilityAddTraits(selected ? .isSelected : [])
                    }
                }
            }

            // القسم وعدد الأسئلة
            VStack(spacing: 0) {
                HStack {
                    Label(L10n.t("bank.chapter"), systemImage: "books.vertical.fill")
                        .font(.subheadline.weight(.semibold))
                    Spacer()
                    Menu {
                        Button(L10n.t("bank.allChapters")) { bank.chapterFilter = nil }
                        Divider()
                        ForEach(library.chapters) { chapter in
                            Button(chapter.title) { bank.chapterFilter = chapter.id }
                        }
                    } label: {
                        HStack(spacing: 6) {
                            Text(bank.chapterFilter.flatMap { library.chapter(id: $0)?.title } ?? L10n.t("bank.allChapters"))
                                .lineLimit(1)
                            Image(systemName: "chevron.up.chevron.down").font(.caption2)
                        }
                        .font(.subheadline.weight(.semibold))
                        .padding(.horizontal, 12).padding(.vertical, 7)
                        .glassCapsule(tint: .indigo)
                    }
                }
                .padding(.vertical, 12)

                Divider().opacity(0.5)

                HStack {
                    Label(L10n.t("bank.roundLength"), systemImage: "number")
                        .font(.subheadline.weight(.semibold))
                    Spacer()
                    Picker(L10n.t("bank.roundLength"), selection: $bank.roundLength) {
                        ForEach([5, 10, 20, 30], id: \.self) { n in Text(n.digits).tag(n) }
                    }
                    .pickerStyle(.segmented)
                    .frame(maxWidth: 220)
                }
                .padding(.vertical, 12)
            }
            .padding(.horizontal, 16)
            .glassCard(cornerRadius: 24, elevated: false)

            Button {
                if let config = bank.makeRound(seen: progress.seenQuestions) {
                    router.present(config)
                }
            } label: {
                HStack(spacing: 10) {
                    Image(systemName: "play.fill")
                    Text(L10n.t("bank.start", bank.filtered.count.digits))
                }
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(ProminentGlassButtonStyle(colors: [.indigo, .pink]))
            .disabled(bank.filtered.isEmpty)
            .opacity(bank.filtered.isEmpty ? 0.5 : 1)
        }
    }

    private func count(for filter: QuestionBankViewModel.KindFilter) -> Int {
        switch filter {
        case .all: bank.count
        case .choice: bank.choiceCount
        case .written: bank.writtenCount
        }
    }
}

// MARK: - Stat tile

struct StatTile: View {
    let symbol: String
    let colors: [Color]
    let value: String
    let title: String

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: symbol)
                .font(.title3.weight(.bold))
                .foregroundStyle(.white)
                .frame(width: 42, height: 42)
                .background(LinearGradient.diagonal(colors), in: RoundedRectangle(cornerRadius: 13, style: .continuous))
            VStack(alignment: .leading, spacing: 2) {
                Text(value)
                    .font(.title3.weight(.heavy))
                    .contentTransition(.numericText())
                Text(title)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
            }
            Spacer(minLength: 0)
        }
        .padding(12)
        .glassCard(cornerRadius: 22, tint: colors.first ?? .teal, elevated: false)
        .accessibilityElement(children: .combine)
    }
}

// MARK: - Daily question card

/// بطاقة «سؤال اليوم» (في الرئيسية وتبويب الأسئلة).
struct DailyQuestionCard: View {
    let question: BankQuestion
    var action: () -> Void

    @Environment(\.layoutDirection) private var direction

    var body: some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    Label(L10n.t("bank.daily"), systemImage: "sun.max.fill")
                        .font(.caption.weight(.heavy))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 10).padding(.vertical, 5)
                        .background(LinearGradient.diagonal([.orange, .pink]), in: Capsule())
                    Spacer()
                    Image(systemName: "arrow.forward.circle.fill")
                        .font(.title2)
                        .foregroundStyle(.orange)
                        .flipsForRightToLeftLayoutDirection(true)
                }
                Text(question.q)
                    .font(.headline)
                    .foregroundStyle(.primary)
                    .multilineTextAlignment(.leading)
                if let quote = question.x {
                    Text(quote)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)
                        .environment(\.layoutDirection, question.quoteIsArabic ? .rightToLeft : direction)
                }
            }
            .padding(18)
            .frame(maxWidth: .infinity, alignment: .leading)
            .glassCard(cornerRadius: 26, tint: .orange, interactive: true)
        }
        .buttonStyle(PressableCardStyle())
    }
}

#Preview {
    NavigationStack { QuestionsHomeView() }
        .withAppEnvironment(.preview())
}
