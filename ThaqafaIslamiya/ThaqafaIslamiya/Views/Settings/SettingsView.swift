//
//  SettingsView.swift
//  ثقافة إسلامية
//
//  تبويب «الإعدادات»: اللغة، والمظهر (فاتح/داكن)، وخلفية التطبيق، وأيقونة التطبيق على الشاشة الرئيسية،
//  والقراءة والصوت (التشكيل، القراءة التلقائية، السرعة)، والاهتزاز، والتذكير اليومي، والتقدّم،
//  والدعم الفني، وهوية المطوّر: صقر ستور © ٢٠٢٦.
//

import SwiftUI
import UIKit

struct SettingsView: View {
    @Environment(AppSettings.self) private var settings
    @Environment(VoicePlayer.self) private var voice
    @Environment(ProgressStore.self) private var progress
    @Environment(\.horizontalSizeClass) private var sizeClass

    @State private var currentIcon = AppIconChoice.from(alternateName: UIApplication.shared.alternateIconName)
    @State private var confirmReset = false
    @State private var reminderDenied = false
    @State private var copied = false

    private var isWide: Bool { sizeClass == .regular }

    var body: some View {
        @Bindable var settings = settings

        ZStack {
            LiquidBackground()

            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    appHeader

                    section(L10n.t("settings.language"), symbol: "globe") {
                        GlassGroup(spacing: 12) {
                            LazyVGrid(columns: [GridItem(.adaptive(minimum: 150), spacing: 12)], spacing: 12) {
                                ForEach(AppLanguage.allCases) { language in
                                    languageTile(language)
                                }
                            }
                        }
                    }

                    section(L10n.t("settings.appearance"), symbol: "circle.lefthalf.filled") {
                        HStack(spacing: 10) {
                            ForEach(Appearance.allCases) { appearance in
                                choiceTile(title: appearance.title, symbol: appearance.symbol,
                                           selected: settings.appearance == appearance) {
                                    settings.appearance = appearance
                                }
                            }
                        }
                    }

                    section(L10n.t("settings.background"), symbol: "paintpalette.fill") {
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 14) {
                                ForEach(BackgroundTheme.allCases) { theme in
                                    themeSwatch(theme)
                                }
                            }
                            .padding(.vertical, 6)
                            .padding(.horizontal, 2)
                        }
                    }

                    if UIApplication.shared.supportsAlternateIcons {
                        section(L10n.t("settings.appIcon"), symbol: "app.badge.fill") {
                            ScrollView(.horizontal, showsIndicators: false) {
                                HStack(spacing: 14) {
                                    ForEach(AppIconChoice.allCases) { icon in
                                        iconTile(icon)
                                    }
                                }
                                .padding(.vertical, 6)
                                .padding(.horizontal, 2)
                            }
                        }
                    }

                    section(L10n.t("settings.audio"), symbol: "waveform") {
                        VStack(spacing: 0) {
                            if settings.language == .arabic {
                                toggleRow(L10n.t("settings.tashkeel"), symbol: "textformat.characters",
                                          footer: L10n.t("settings.tashkeelFooter"), isOn: $settings.showTashkeel)
                                Divider().opacity(0.5)
                            }
                            toggleRow(L10n.t("settings.autoNarrate"), symbol: "speaker.wave.2.bubble.fill",
                                      footer: L10n.t("settings.autoNarrateFooter"), isOn: $settings.autoNarrate)
                            Divider().opacity(0.5)
                            speedRow(rate: $settings.speechRate)
                        }
                        .padding(.horizontal, 16)
                        .glassCard(cornerRadius: 24, tint: .teal, elevated: false)
                    }

                    section(L10n.t("settings.general"), symbol: "slider.horizontal.3") {
                        VStack(spacing: 0) {
                            toggleRow(L10n.t("settings.haptics"), symbol: "iphone.radiowaves.left.and.right",
                                      footer: nil, isOn: $settings.haptics)
                            Divider().opacity(0.5)
                            toggleRow(L10n.t("settings.reminder"), symbol: "bell.badge.fill",
                                      footer: reminderDenied ? L10n.t("settings.reminderDenied") : L10n.t("settings.reminderFooter"),
                                      isOn: reminderBinding)
                            if settings.reminderEnabled {
                                DatePicker(L10n.t("settings.reminderTime"), selection: $settings.reminderDate,
                                           displayedComponents: .hourAndMinute)
                                    .font(.subheadline.weight(.semibold))
                                    .padding(.vertical, 10)
                                    .onChange(of: settings.reminderMinutes) { _, minutes in
                                        ReminderScheduler.schedule(minutes: minutes)
                                    }
                            }
                        }
                        .padding(.horizontal, 16)
                        .glassCard(cornerRadius: 24, tint: .indigo, elevated: false)
                    }

                    section(L10n.t("settings.progress"), symbol: "chart.bar.fill") {
                        VStack(spacing: 12) {
                            NavigationLink { AboutView() } label: {
                                rowLabel(L10n.t("settings.progressDetails"), symbol: "chart.line.uptrend.xyaxis")
                            }
                            Divider().opacity(0.5)
                            Button(role: .destructive) { confirmReset = true } label: {
                                rowLabel(L10n.t("about.reset"), symbol: "arrow.counterclockwise", destructive: true)
                            }
                        }
                        .padding(16)
                        .glassCard(cornerRadius: 24, elevated: false)
                    }

                    section(L10n.t("settings.support"), symbol: "lifepreserver.fill") {
                        VStack(spacing: 12) {
                            if let url = AppInfo.supportMailURL(subject: L10n.t("settings.supportSubject")) {
                                Link(destination: url) {
                                    rowLabel(L10n.t("settings.contactSupport"), symbol: "envelope.fill",
                                             detail: AppInfo.supportEmail)
                                }
                            }
                            Divider().opacity(0.5)
                            Button {
                                UIPasteboard.general.string = AppInfo.supportEmail
                                withAnimation { copied = true }
                            } label: {
                                rowLabel(copied ? L10n.t("settings.copied") : L10n.t("settings.copyEmail"),
                                         symbol: copied ? "checkmark.circle.fill" : "doc.on.doc.fill")
                            }
                            Divider().opacity(0.5)
                            ShareLink(item: L10n.t("settings.shareText", L10n.t("app.name"), AppInfo.developerArabic)) {
                                rowLabel(L10n.t("settings.share"), symbol: "square.and.arrow.up.fill")
                            }
                            Divider().opacity(0.5)
                            NavigationLink { AboutView() } label: {
                                rowLabel(L10n.t("about.book"), symbol: "book.closed.fill")
                            }
                        }
                        .padding(16)
                        .glassCard(cornerRadius: 24, tint: .orange, elevated: false)
                    }

                    DeveloperFooter()
                        .padding(.top, 4)
                }
                .padding(.horizontal, isWide ? 40 : 18)
                .padding(.vertical, 12)
                .padding(.bottom, 20)
                .frame(maxWidth: 760)
                .frame(maxWidth: .infinity)
            }
        }
        .navigationTitle(L10n.t("settings.title"))
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(.hidden, for: .navigationBar)
        .confirmationDialog(L10n.t("about.resetConfirm"), isPresented: $confirmReset, titleVisibility: .visible) {
            Button(L10n.t("about.resetAction"), role: .destructive) { progress.resetAll() }
            Button(L10n.t("common.cancel"), role: .cancel) {}
        }
    }

    // MARK: - Header

    private var appHeader: some View {
        HStack(spacing: 16) {
            AppMark(size: 76, imageName: currentIcon.previewImage)
            VStack(alignment: .leading, spacing: 4) {
                Text(L10n.t("app.name"))
                    .font(.title2.weight(.heavy))
                Text(L10n.t("settings.version", AppInfo.version))
                    .font(.caption)
                    .foregroundStyle(.secondary)
                SaqerStoreBadge(compact: true)
                    .padding(.top, 4)
            }
            Spacer(minLength: 0)
        }
        .padding(18)
        .glassCard(cornerRadius: 30, tint: .teal)
    }

    // MARK: - Building blocks

    private func section<Content: View>(_ title: String, symbol: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionHeader(title: title, symbol: symbol)
            content()
        }
    }

    private func rowLabel(_ title: String, symbol: String, detail: String? = nil, destructive: Bool = false) -> some View {
        HStack(spacing: 12) {
            Image(systemName: symbol)
                .font(.body.weight(.semibold))
                .foregroundStyle(destructive ? Color.red : Color.teal)
                .frame(width: 28)
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(destructive ? Color.red : Color.primary)
                if let detail {
                    Text(detail).font(.caption).foregroundStyle(.secondary)
                }
            }
            Spacer()
            Image(systemName: "chevron.forward")
                .font(.caption.weight(.bold))
                .foregroundStyle(.tertiary)
        }
        .contentShape(Rectangle())
    }

    private func toggleRow(_ title: String, symbol: String, footer: String?, isOn: Binding<Bool>) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Toggle(isOn: isOn) {
                Label(title, systemImage: symbol)
                    .font(.subheadline.weight(.semibold))
            }
            .tint(.teal)
            if let footer {
                Text(footer)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 12)
    }

    private func speedRow(rate: Binding<Double>) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Label(L10n.t("settings.speed"), systemImage: "gauge.with.dots.needle.50percent")
                    .font(.subheadline.weight(.semibold))
                Spacer()
                Text(speedText(rate.wrappedValue))
                    .font(.subheadline.monospacedDigit().weight(.bold))
                    .foregroundStyle(.teal)
                    .contentTransition(.numericText())
                if abs(rate.wrappedValue - 1) > 0.001 {
                    Button(L10n.t("settings.speedReset")) {
                        withAnimation { rate.wrappedValue = 1 }
                    }
                    .font(.caption.weight(.bold))
                    .buttonStyle(.bordered)
                    .controlSize(.mini)
                }
            }
            Slider(value: rate, in: 0.75...1.25, step: 0.05) {
                Text(L10n.t("settings.speed"))
            } minimumValueLabel: {
                Image(systemName: "tortoise.fill").font(.caption)
            } maximumValueLabel: {
                Image(systemName: "hare.fill").font(.caption)
            }
            .tint(.teal)
        }
        .padding(.vertical, 12)
    }

    /// السرعة كنسبة من الطبيعية: ٠٪، +١٠٪، −٥٪…
    private func speedText(_ rate: Double) -> String {
        let percent = Int(((rate - 1) * 100).rounded())
        let sign = percent > 0 ? "+" : (percent < 0 ? "−" : "")
        return sign + L10n.t("common.percent", abs(percent).digits)
    }

    private func languageTile(_ language: AppLanguage) -> some View {
        let selected = settings.language == language
        return Button {
            voice.stop()
            withAnimation(.spring(response: 0.4, dampingFraction: 0.8)) { settings.language = language }
        } label: {
            HStack(spacing: 12) {
                Text(language.glyph)
                    .font(.headline.weight(.heavy))
                    .foregroundStyle(selected ? .white : .primary)
                    .frame(width: 42, height: 42)
                    .background {
                        Circle().fill(selected ? AnyShapeStyle(LinearGradient.diagonal([.teal, .indigo]))
                                               : AnyShapeStyle(Color.white.opacity(0.25)))
                    }
                VStack(alignment: .leading, spacing: 2) {
                    Text(language.nativeName).font(.headline).foregroundStyle(.primary)
                    Text(language.englishName).font(.caption).foregroundStyle(.secondary)
                }
                Spacer(minLength: 0)
                if selected {
                    Image(systemName: "checkmark.circle.fill").foregroundStyle(.teal)
                        .transition(.scale.combined(with: .opacity))
                }
            }
            .padding(12)
            .glassCard(cornerRadius: 22, tint: selected ? .teal : .white, interactive: true, elevated: false)
        }
        .buttonStyle(PressableCardStyle())
        .accessibilityAddTraits(selected ? .isSelected : [])
    }

    private func choiceTile(title: String, symbol: String, selected: Bool, action: @escaping () -> Void) -> some View {
        Button {
            withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) { action() }
        } label: {
            VStack(spacing: 8) {
                Image(systemName: symbol).font(.title2)
                Text(title).font(.caption.weight(.bold)).lineLimit(1).minimumScaleFactor(0.8)
            }
            .foregroundStyle(selected ? Color.white : Color.primary)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .background {
                if selected {
                    RoundedRectangle(cornerRadius: 20, style: .continuous).fill(LinearGradient.diagonal([.teal, .indigo]))
                }
            }
            .glassCard(cornerRadius: 20, tint: selected ? .teal : .white, interactive: true, elevated: false)
        }
        .buttonStyle(PressableCardStyle())
        .accessibilityAddTraits(selected ? .isSelected : [])
    }

    private func themeSwatch(_ theme: BackgroundTheme) -> some View {
        let selected = settings.theme == theme
        return Button {
            withAnimation(.easeInOut(duration: 0.5)) { settings.theme = theme }
        } label: {
            VStack(spacing: 8) {
                ZStack {
                    Circle()
                        .fill(AngularGradient(colors: theme.colors + [theme.colors[0]], center: .center))
                        .frame(width: 62, height: 62)
                        .blur(radius: 0.5)
                    Circle().strokeBorder(.white.opacity(0.8), lineWidth: selected ? 3 : 1)
                        .frame(width: 62, height: 62)
                    if selected {
                        Image(systemName: "checkmark")
                            .font(.headline.weight(.heavy))
                            .foregroundStyle(.white)
                            .shadow(radius: 2)
                    }
                }
                .scaleEffect(selected ? 1.08 : 1)
                Text(theme.title)
                    .font(.caption.weight(selected ? .bold : .medium))
                    .foregroundStyle(.primary)
            }
        }
        .buttonStyle(PressableCardStyle())
        .accessibilityLabel(theme.title)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }

    private func iconTile(_ icon: AppIconChoice) -> some View {
        let selected = currentIcon == icon
        return Button {
            guard !selected else { return }
            UIApplication.shared.setAlternateIconName(icon.alternateName) { error in
                if error == nil {
                    DispatchQueue.main.async { withAnimation(.spring) { currentIcon = icon } }
                }
            }
        } label: {
            VStack(spacing: 8) {
                AppMark(size: 64, imageName: icon.previewImage)
                    .overlay {
                        RoundedRectangle(cornerRadius: 64 * 0.225, style: .continuous)
                            .strokeBorder(Color.teal, lineWidth: selected ? 3 : 0)
                            .padding(-4)
                    }
                Text(icon.title)
                    .font(.caption.weight(selected ? .bold : .medium))
                    .foregroundStyle(.primary)
            }
            .padding(4)
        }
        .buttonStyle(PressableCardStyle())
        .accessibilityLabel(icon.title)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }

    private var reminderBinding: Binding<Bool> {
        Binding {
            settings.reminderEnabled
        } set: { enabled in
            if enabled {
                Task {
                    let granted = await ReminderScheduler.enable(minutes: settings.reminderMinutes)
                    await MainActor.run {
                        withAnimation {
                            settings.reminderEnabled = granted
                            reminderDenied = !granted
                        }
                    }
                }
            } else {
                ReminderScheduler.disable()
                withAnimation { settings.reminderEnabled = false }
            }
        }
    }
}

#Preview {
    NavigationStack { SettingsView() }
        .withAppEnvironment(.preview())
}
