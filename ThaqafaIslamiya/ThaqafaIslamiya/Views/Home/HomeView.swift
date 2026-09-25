//
//  HomeView.swift
//  ثقافة إسلامية
//
//  الشاشة الرئيسية بثيم الزجاج السائل:
//  ترحيب + تقدّم عام، بحث، الدروس التفاعلية (الوضوء، الاغتسال، الصلاة، التيمم)، ثم أقسام الكتاب مرتبة حسب أجزائه.
//

import SwiftUI

struct HomeView: View {
    @Environment(LibraryViewModel.self) private var library
    @Environment(ProgressStore.self) private var progress
    @Environment(AppRouter.self) private var router
    @Environment(\.horizontalSizeClass) private var sizeClass

    @State private var appeared = false

    private var isWide: Bool { sizeClass == .regular }

    var body: some View {
        @Bindable var library = library

        ZStack {
            LiquidBackground()

            ScrollView {
                VStack(alignment: .leading, spacing: 28) {
                    header
                    SearchField(text: $library.searchText)

                    if let error = library.loadError {
                        errorCard(error)
                    } else if library.isSearching {
                        searchResults
                    } else {
                        lessonsSection
                        chaptersSection
                    }
                }
                .padding(.horizontal, isWide ? 40 : 18)
                .padding(.vertical, 12)
                .frame(maxWidth: 1100)
                .frame(maxWidth: .infinity)
            }
            .scrollDismissesKeyboard(.immediately)
        }
        .toolbar(.hidden, for: .navigationBar)
        .onAppear {
            withAnimation(.spring(response: 0.7, dampingFraction: 0.8).delay(0.1)) { appeared = true }
        }
    }

    // MARK: - Header

    private var header: some View {
        HStack(alignment: .center, spacing: 16) {
            VStack(alignment: .leading, spacing: 6) {
                Text("السلام عليكم 👋")
                    .font(.title3.weight(.semibold))
                    .foregroundStyle(.secondary)
                Text("ثقافة إسلامية")
                    .font(.system(size: isWide ? 44 : 34, weight: .heavy, design: .rounded))
                    .foregroundStyle(LinearGradient.diagonal([.teal, .indigo]))
                Text(library.book?.title ?? "تلقين الصبيان ما يلزم الإنسان")
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(.secondary)
            }

            Spacer(minLength: 8)

            Button { router.open(.about) } label: {
                overallProgress
            }
            .buttonStyle(PressableCardStyle())
            .accessibilityLabel("تقدّمك وعن الكتاب")
        }
        .padding(20)
        .glassCard(cornerRadius: 32, tint: .teal)
        .offset(y: appeared ? 0 : -30)
        .opacity(appeared ? 1 : 0)
    }

    private var overallProgress: some View {
        let value = progress.overallProgress(total: library.totalMasailCount)
        return ZStack {
            ProgressRing(progress: value, colors: [.teal, .indigo, .pink], lineWidth: 9)
            VStack(spacing: 0) {
                Text("\(Int(value * 100).arabicDigits)٪")
                    .font(.headline.weight(.bold))
                Text("تقدّمي")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
        .frame(width: isWide ? 92 : 76, height: isWide ? 92 : 76)
    }

    // MARK: - Lessons

    private var lessonsSection: some View {
        VStack(alignment: .leading, spacing: 14) {
            SectionHeader(title: "رحلات تفاعلية", subtitle: "تعلّم خطوة بخطوة بالبطاقات", symbol: "sparkles")

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 16) {
                    ForEach(Array(library.lessons.enumerated()), id: \.element.id) { index, lesson in
                        Button { router.present(lesson) } label: {
                            LessonCard(lesson: lesson, isCompleted: progress.isCompleted(lesson), isWide: isWide)
                        }
                        .buttonStyle(PressableCardStyle())
                        .offset(y: appeared ? 0 : 40)
                        .opacity(appeared ? 1 : 0)
                        .animation(.spring(response: 0.6, dampingFraction: 0.75).delay(0.08 * Double(index)), value: appeared)
                    }
                }
                .padding(.vertical, 12)
                .padding(.horizontal, 4)
            }
            .scrollClipDisabled()
        }
    }

    // MARK: - Chapters

    private var gridColumns: [GridItem] {
        [GridItem(.adaptive(minimum: isWide ? 230 : 155), spacing: 16)]
    }

    private var chaptersSection: some View {
        VStack(alignment: .leading, spacing: 22) {
            SectionHeader(title: "أقسام الكتاب", subtitle: "\(library.totalMasailCount.arabicDigits) مسألة في \(library.chapters.count.arabicDigits) قسمًا", symbol: "books.vertical.fill")

            ForEach(library.parts, id: \.self) { part in
                VStack(alignment: .leading, spacing: 12) {
                    Text(part)
                        .font(.headline)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 6)
                        .glassCapsule(tint: .indigo, interactive: false)

                    LazyVGrid(columns: gridColumns, spacing: 16) {
                        ForEach(library.chapters(inPart: part)) { chapter in
                            Button { router.open(.chapter(id: chapter.id)) } label: {
                                ChapterCard(chapter: chapter, progress: progress.progress(for: chapter))
                            }
                            .buttonStyle(PressableCardStyle())
                        }
                    }
                }
            }
        }
        .opacity(appeared ? 1 : 0)
        .animation(.easeOut(duration: 0.6).delay(0.25), value: appeared)
    }

    // MARK: - Search

    private var searchResults: some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionHeader(title: "نتائج البحث", subtitle: "\(library.searchResults.count.arabicDigits) نتيجة", symbol: "magnifyingglass")

            if library.searchResults.isEmpty {
                Text("لم نجد مسألة بهذا الاسم، جرّب كلمة أخرى 🌱")
                    .frame(maxWidth: .infinity)
                    .padding(30)
                    .glassCard()
            } else {
                ForEach(library.searchResults) { result in
                    Button { router.open(.masala(id: result.masala.id)) } label: {
                        MasalaRow(masala: result.masala,
                                  caption: result.chapter.title,
                                  colors: result.chapter.colors.themeColors,
                                  isLearned: progress.isLearned(result.masala))
                    }
                    .buttonStyle(PressableCardStyle())
                }
            }
        }
    }

    private func errorCard(_ message: String) -> some View {
        Label(message, systemImage: "exclamationmark.triangle.fill")
            .padding(24)
            .glassCard(tint: .red)
    }
}

// MARK: - Search Field

struct SearchField: View {
    @Binding var text: String
    @FocusState private var focused: Bool

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: "magnifyingglass")
                .foregroundStyle(.secondary)
            TextField("ابحث عن مسألة… (الوضوء، الزكاة، الجار)", text: $text)
                .focused($focused)
                .submitLabel(.search)
            if !text.isEmpty {
                Button {
                    withAnimation { text = "" }
                } label: {
                    Image(systemName: "xmark.circle.fill").foregroundStyle(.secondary)
                }
                .accessibilityLabel("مسح البحث")
            }
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 14)
        .glassCapsule(tint: focused ? .teal : .white, interactive: false)
        .animation(.easeInOut(duration: 0.2), value: focused)
    }
}

// MARK: - Section Header

struct SectionHeader: View {
    let title: String
    var subtitle: String? = nil
    var symbol: String = "sparkles"

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: symbol)
                .font(.title3)
                .foregroundStyle(LinearGradient.diagonal([.teal, .indigo]))
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.title2.weight(.bold))
                if let subtitle {
                    Text(subtitle).font(.footnote).foregroundStyle(.secondary)
                }
            }
        }
        .accessibilityElement(children: .combine)
    }
}

#Preview {
    NavigationStack { HomeView() }
        .environment(LibraryViewModel())
        .environment(ProgressStore())
        .environment(AppRouter())
        .environment(\.layoutDirection, .rightToLeft)
}
