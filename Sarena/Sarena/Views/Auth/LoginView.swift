import SwiftUI

/// Members-only gate: sign in with an Omani mobile number (SMS code) or email,
/// or create a free account.
struct LoginView: View {
    @State private var viewModel: LoginViewModel
    @State private var showsRegistration = false
    @Environment(\.locale) private var locale

    private let auth: any AuthServicing
    private let session: SessionStore

    init(auth: any AuthServicing, session: SessionStore, isDemo: Bool = false) {
        self.auth = auth
        self.session = session
        _viewModel = State(initialValue: LoginViewModel(auth: auth, session: session, isDemo: isDemo))
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: Theme.Spacing.xxl) {
                    hero
                    signInPanel
                    if viewModel.isDemo {
                        DemoAccountCard {
                            Task { await viewModel.useDemoAccount() }
                        }
                    }
                    benefits
                    registrationPrompt
                }
                .padding(.horizontal, Theme.gutter)
                .padding(.vertical, Theme.Spacing.xxl)
                .frame(maxWidth: 520)
                .frame(maxWidth: .infinity)
            }
            .scrollDismissesKeyboard(.interactively)
            .sarenaScreenBackground()
            .toolbar(.hidden, for: .navigationBar)
            .sarenaStatusBarBackdrop()
            .navigationDestination(isPresented: $showsRegistration) {
                RegisterView(auth: auth, session: session)
            }
        }
    }

    // MARK: Sections

    private var hero: some View {
        VStack(spacing: Theme.Spacing.m) {
            SarenaWordmark(logoSize: 104)
            Text("Exclusive deals. Members only.")
                .font(.sarena(.headline, weight: .semibold))
                .foregroundStyle(.secondary)
            GlassBadge(text: "Prices unlock after sign-in", systemImage: "lock.fill")
        }
        .padding(.top, Theme.Spacing.l)
    }

    private var signInPanel: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.l) {
            VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
                Text("Welcome back")
                    .font(.sarena(.title2, weight: .bold))
                Text("Sign in to see today's member prices.")
                    .font(.sarena(.subheadline))
                    .foregroundStyle(.secondary)
            }

            GlassSegmentedControl(
                options: LoginViewModel.Method.allCases,
                selection: Binding(get: { viewModel.method }, set: { viewModel.switchMethod(to: $0) }),
                title: \.title
            )

            // Both forms share one slot and cross-fade in place: the old one fades
            // out first, then the new one fades in while the panel resizes. Nothing
            // slides, so neither form ever shows over the content below the panel.
            ZStack(alignment: .top) {
                switch viewModel.method {
                case .phone: phoneForm.transition(Self.formSwap)
                case .email: emailForm.transition(Self.formSwap)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            if let error = viewModel.error {
                ErrorBanner(message: error.message)
            }
        }
        .padding(Theme.Spacing.xl)
        .glassSurface(.panel)
        .animation(.snappy, value: viewModel.method)
        .animation(.snappy, value: viewModel.challenge)
        .animation(.snappy, value: viewModel.error)
    }

    private static let formSwap = AnyTransition.asymmetric(
        insertion: .opacity.animation(.easeOut(duration: 0.2).delay(0.1)),
        removal: .opacity.animation(.easeIn(duration: 0.1))
    )

    // MARK: Phone

    @ViewBuilder
    private var phoneForm: some View {
        if let challenge = viewModel.challenge {
            VStack(alignment: .leading, spacing: Theme.Spacing.m) {
                Text("Enter the verification code")
                    .font(.sarena(.headline, weight: .bold))
                Text("We sent an SMS to \(Self.displayPhone(challenge.phone))")
                    .font(.sarena(.subheadline))
                    .foregroundStyle(.secondary)

                OTPCodeField(code: $viewModel.code, length: challenge.codeLength)
                    .onChange(of: viewModel.code) { _, newValue in
                        if newValue.count == challenge.codeLength {
                            Task { await viewModel.verifyCode() }
                        }
                    }

                Button {
                    Task { await viewModel.verifyCode() }
                } label: {
                    if viewModel.isLoading {
                        ProgressView().tint(.white)
                    } else {
                        Label("Verify & Sign In", systemImage: "checkmark.shield.fill")
                    }
                }
                .buttonStyle(.sarenaProminent)
                .disabled(!viewModel.canVerifyCode)

                HStack {
                    Button("Change number") { viewModel.editPhoneNumber() }
                    Spacer()
                    TimelineView(.periodic(from: .now, by: 1)) { context in
                        let seconds = Int(challenge.resendAvailableAt.timeIntervalSince(context.date).rounded(.up))
                        if seconds > 0 {
                            Text("Resend code in \(seconds)s")
                                .foregroundStyle(.secondary)
                                .monospacedDigit()
                        } else {
                            Button("Resend code") { Task { await viewModel.requestCode() } }
                        }
                    }
                }
                .font(.sarena(.footnote, weight: .semibold))
                .foregroundStyle(Theme.Palette.orange)
                .buttonStyle(.plain)
            }
        } else {
            VStack(alignment: .leading, spacing: Theme.Spacing.m) {
                GlassTextField(
                    title: "Mobile number",
                    systemImage: "phone.fill",
                    text: $viewModel.phone,
                    prefix: "+968",
                    keyboard: .phonePad,
                    contentType: .telephoneNumber
                )
                if viewModel.showsPhoneHint {
                    FieldHint(text: "Omani mobile numbers have 8 digits and start with 7 or 9.")
                }
                Button {
                    Task { await viewModel.requestCode() }
                } label: {
                    if viewModel.isLoading {
                        ProgressView().tint(.white)
                    } else {
                        Label("Send Code", systemImage: "message.fill")
                    }
                }
                .buttonStyle(.sarenaProminent)
                .disabled(!viewModel.canRequestCode)

                Text("We'll text you a one-time code. No password needed.")
                    .font(.sarena(.caption))
                    .foregroundStyle(.secondary)
            }
        }
    }

    /// "+968 9123 4567", isolated left-to-right so it reads correctly inside Arabic sentences.
    static func displayPhone(_ digits: String) -> String {
        let grouped = digits.count == 8 ? "\(digits.prefix(4)) \(digits.suffix(4))" : digits
        return "\u{2066}+968 \(grouped)\u{2069}"
    }

    // MARK: Email

    private var emailForm: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            GlassTextField(
                title: "Email",
                systemImage: "envelope.fill",
                text: $viewModel.email,
                keyboard: .emailAddress,
                contentType: .username
            )
            GlassTextField(
                title: "Password",
                systemImage: "lock.fill",
                text: $viewModel.password,
                isSecure: true,
                contentType: .password,
                submitLabel: .go
            ) {
                Task { await viewModel.signInWithEmail() }
            }
            Button {
                Task { await viewModel.signInWithEmail() }
            } label: {
                if viewModel.isLoading {
                    ProgressView().tint(.white)
                } else {
                    Label("Sign In", systemImage: "arrow.forward")
                }
            }
            .buttonStyle(.sarenaProminent)
            .disabled(!viewModel.canSubmitEmail)
        }
    }

    // MARK: Marketing

    private var benefits: some View {
        HStack(spacing: Theme.Spacing.m) {
            BenefitTile(title: "Up to \(50.localizedPercent(locale)) off", systemImage: "percent")
            BenefitTile(title: "Instant codes", systemImage: "qrcode")
            BenefitTile(title: "Oman's top venues", systemImage: "star.fill")
        }
    }

    private var registrationPrompt: some View {
        VStack(spacing: Theme.Spacing.m) {
            Text("New to Sarena?")
                .font(.sarena(.subheadline, weight: .medium))
                .foregroundStyle(.secondary)
            Button {
                showsRegistration = true
            } label: {
                Label("Create a free account", systemImage: "person.crop.circle.badge.plus")
            }
            .buttonStyle(.sarenaGlass)
        }
    }
}

/// Testing-only card with the seeded demo member's credentials.
/// Shown only while the app runs on the mock backend (`AppServices.isDemo`).
private struct DemoAccountCard: View {
    let onUse: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            HStack {
                Label("Demo account", systemImage: "testtube.2")
                    .font(.sarena(.headline, weight: .bold))
                Spacer()
                GlassBadge(text: "Testing only", tint: Theme.Palette.steel)
            }
            Grid(alignment: .leading, horizontalSpacing: Theme.Spacing.l, verticalSpacing: Theme.Spacing.s) {
                row("Mobile", LoginView.displayPhone(DemoAccount.phone))
                row("SMS code", DemoAccount.otp)
                row("Email", DemoAccount.email)
                row("Password", DemoAccount.password)
            }
            Button(action: onUse) {
                Label("Use demo account", systemImage: "wand.and.stars")
            }
            .buttonStyle(.sarenaGlass)
        }
        .padding(Theme.Spacing.l)
        .glassSurface(.tinted(Theme.Palette.steel, opacity: 0.12, cornerRadius: Theme.Radius.card, shadow: .floating))
    }

    private func row(_ title: LocalizedStringKey, _ value: String) -> some View {
        GridRow {
            Text(title)
                .font(.sarena(.caption, weight: .semibold))
                .foregroundStyle(.secondary)
            Text(verbatim: value)
                .font(.system(.subheadline, design: .monospaced).weight(.bold))
                .textSelection(.enabled)
        }
    }
}

private struct BenefitTile: View {
    let title: LocalizedStringKey
    let systemImage: String

    var body: some View {
        VStack(spacing: Theme.Spacing.s) {
            Image(systemName: systemImage)
                .font(.title3.weight(.bold))
                .foregroundStyle(Theme.brandGradient)
            Text(title)
                .font(.sarena(.caption, weight: .semibold))
                .multilineTextAlignment(.center)
                .lineLimit(2)
                .minimumScaleFactor(0.8)
        }
        .frame(maxWidth: .infinity, minHeight: 88)
        .padding(.horizontal, Theme.Spacing.s)
        .glassSurface(.tile)
    }
}

#Preview("Login") {
    PreviewContainer(signedIn: false) {
        LoginView(auth: AppServices.preview.auth, session: SessionStore(auth: AppServices.preview.auth), isDemo: true)
    }
}

#Preview("Login · Arabic") {
    PreviewContainer(signedIn: false) {
        LoginView(auth: AppServices.preview.auth, session: SessionStore(auth: AppServices.preview.auth), isDemo: true)
    }
    .appLanguage(.arabic)
}
