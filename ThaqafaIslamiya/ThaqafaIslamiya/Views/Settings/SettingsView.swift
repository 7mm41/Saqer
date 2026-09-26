//
//  SettingsView.swift
//  ثقافة إسلامية
//
//  ورقة الإعدادات: اختيار لغة التطبيق (العربية، English، فارسی، Türkçe، हिन्दी، বাংলা)
//  وتفعيل القراءة الصوتية التلقائية للخطوات. يتغيّر كل شيء فورًا: النصوص والاتجاه والأرقام والأصوات.
//

import SwiftUI

struct SettingsView: View {
    @Environment(AppSettings.self) private var settings
    @Environment(VoicePlayer.self) private var voice
    @Environment(\.dismiss) private var dismiss

    private let columns = [GridItem(.adaptive(minimum: 150), spacing: 12)]

    var body: some View {
        @Bindable var settings = settings

        NavigationStack {
            ZStack {
                LiquidBackground(colors: [.teal, .indigo, .mint, .pink])

                ScrollView {
                    VStack(alignment: .leading, spacing: 22) {
                        SectionHeader(title: L10n.t("settings.language"), symbol: "globe")

                        GlassGroup(spacing: 12) {
                            LazyVGrid(columns: columns, spacing: 12) {
                                ForEach(AppLanguage.allCases) { language in
                                    languageTile(language)
                                }
                            }
                        }

                        SectionHeader(title: L10n.t("settings.audio"), symbol: "waveform")

                        VStack(alignment: .leading, spacing: 10) {
                            Toggle(isOn: $settings.autoNarrate) {
                                Label(L10n.t("settings.autoNarrate"), systemImage: "speaker.wave.2.bubble.fill")
                                    .font(.headline)
                            }
                            .tint(.teal)
                            Text(L10n.t("settings.autoNarrateFooter"))
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                        }
                        .padding(18)
                        .glassCard(cornerRadius: 24, tint: .teal, elevated: false)
                    }
                    .padding(20)
                    .frame(maxWidth: 640)
                    .frame(maxWidth: .infinity)
                }
            }
            .navigationTitle(L10n.t("settings.title"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(.hidden, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button(L10n.t("common.done")) { dismiss() }
                        .fontWeight(.bold)
                }
            }
        }
        .presentationDetents([.medium, .large])
        .presentationBackground(.clear)
        .presentationCornerRadius(34)
    }

    private func languageTile(_ language: AppLanguage) -> some View {
        let selected = settings.language == language
        return Button {
            voice.stop()
            withAnimation(.spring(response: 0.4, dampingFraction: 0.8)) {
                settings.language = language
            }
        } label: {
            HStack(spacing: 12) {
                Text(language.glyph)
                    .font(.headline.weight(.heavy))
                    .foregroundStyle(selected ? .white : .primary)
                    .frame(width: 42, height: 42)
                    .background {
                        Circle().fill(selected
                                      ? AnyShapeStyle(LinearGradient.diagonal([.teal, .indigo]))
                                      : AnyShapeStyle(Color.white.opacity(0.25)))
                    }
                VStack(alignment: .leading, spacing: 2) {
                    Text(language.nativeName)
                        .font(.headline)
                        .foregroundStyle(.primary)
                    Text(language.englishName)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer(minLength: 0)
                if selected {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundStyle(.teal)
                        .transition(.scale.combined(with: .opacity))
                }
            }
            .padding(12)
            .glassCard(cornerRadius: 22, tint: selected ? .teal : .white, interactive: true, elevated: false)
        }
        .buttonStyle(PressableCardStyle())
        .accessibilityAddTraits(selected ? .isSelected : [])
    }
}
