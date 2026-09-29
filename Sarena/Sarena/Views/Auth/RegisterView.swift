import SwiftUI

struct RegisterView: View {
    @State private var viewModel: RegisterViewModel

    init(auth: any AuthServicing, session: SessionStore) {
        _viewModel = State(initialValue: RegisterViewModel(auth: auth, session: session))
    }

    var body: some View {
        ScrollView {
            VStack(spacing: Theme.Spacing.xl) {
                header
                form
            }
            .padding(.horizontal, Theme.gutter)
            .padding(.bottom, Theme.Spacing.xxl)
            .frame(maxWidth: 520)
            .frame(maxWidth: .infinity)
        }
        .scrollDismissesKeyboard(.interactively)
        .sarenaScreenBackground()
        .navigationTitle("Create Account")
        .navigationBarTitleDisplayMode(.inline)
        .sarenaNavigationBar()
        .animation(.snappy, value: viewModel.error)
    }

    private var header: some View {
        VStack(spacing: Theme.Spacing.s) {
            SarenaLogoView(size: 76)
            Text("Join the club")
                .font(.sarena(.title, weight: .heavy))
            Text("One free account unlocks members-only prices on cinemas, jet skis, clubs, arenas and festivals across Oman.")
                .font(.sarena(.subheadline))
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .padding(.top, Theme.Spacing.m)
    }

    private var form: some View {
        VStack(spacing: Theme.Spacing.m) {
            GlassTextField(
                title: "Full name",
                systemImage: "person.fill",
                text: $viewModel.fullName,
                contentType: .name,
                capitalization: .words
            )

            GlassTextField(
                title: "Email",
                systemImage: "envelope.fill",
                text: $viewModel.email,
                keyboard: .emailAddress,
                contentType: .emailAddress
            )
            if viewModel.showsEmailHint {
                FieldHint(text: "Enter a valid email address.")
            }

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

            GlassTextField(
                title: "Password",
                systemImage: "lock.fill",
                text: $viewModel.password,
                isSecure: true,
                contentType: .newPassword
            )
            if !viewModel.password.isEmpty {
                PasswordStrengthMeter(strength: viewModel.passwordStrength)
            }
            if viewModel.showsPasswordHint {
                FieldHint(text: "Use at least 8 characters with letters and numbers.")
            }

            GlassTextField(
                title: "Confirm password",
                systemImage: "lock.rotation",
                text: $viewModel.confirmPassword,
                isSecure: true,
                contentType: .newPassword,
                submitLabel: .done
            )
            if viewModel.showsConfirmHint {
                FieldHint(text: "Passwords don't match.")
            }

            Toggle(isOn: $viewModel.acceptsTerms) {
                Text("I agree to Sarena's Terms of Use and Privacy Policy.")
            }
            .toggleStyle(GlassCheckboxToggleStyle())
            .padding(.vertical, Theme.Spacing.s)

            if let error = viewModel.error {
                ErrorBanner(message: error.message)
            }

            Button {
                Task { await viewModel.register() }
            } label: {
                if viewModel.isLoading {
                    ProgressView().tint(.white)
                } else {
                    Label("Create Account", systemImage: "sparkles")
                }
            }
            .buttonStyle(.sarenaProminent)
            .disabled(!viewModel.canSubmit)
        }
        .padding(Theme.Spacing.xl)
        .glassSurface(.panel)
        .animation(.snappy, value: viewModel.showsEmailHint)
        .animation(.snappy, value: viewModel.showsPhoneHint)
        .animation(.snappy, value: viewModel.showsPasswordHint)
        .animation(.snappy, value: viewModel.showsConfirmHint)
    }
}

private struct PasswordStrengthMeter: View {
    let strength: Validation.PasswordStrength

    var body: some View {
        HStack(spacing: Theme.Spacing.s) {
            ForEach(0..<3, id: \.self) { index in
                Capsule()
                    .fill(index <= strength.rawValue ? AnyShapeStyle(color) : AnyShapeStyle(.quaternary))
                    .frame(height: 5)
            }
            Text(label)
                .font(.sarena(.caption, weight: .bold))
                .foregroundStyle(color)
                .frame(minWidth: 52, alignment: .trailing)
        }
        .padding(.horizontal, Theme.Spacing.s)
        .animation(.snappy, value: strength)
        .accessibilityElement(children: .combine)
    }

    private var color: Color {
        switch strength {
        case .weak: Theme.Palette.danger
        case .fair: Theme.Palette.orange
        case .strong: Theme.Palette.success
        }
    }

    private var label: LocalizedStringKey {
        switch strength {
        case .weak: "Weak"
        case .fair: "Fair"
        case .strong: "Strong"
        }
    }
}

#Preview {
    PreviewContainer(signedIn: false) {
        NavigationStack {
            RegisterView(auth: AppServices.preview.auth, session: SessionStore(auth: AppServices.preview.auth))
        }
    }
}
