import SwiftUI

/// Six glass boxes backed by one hidden text field, so SMS AutoFill
/// (`.oneTimeCode`) and paste both work.
struct OTPCodeField: View {
    @Binding var code: String
    let length: Int

    @FocusState private var isFocused: Bool

    var body: some View {
        ZStack {
            TextField("", text: $code)
                .keyboardType(.numberPad)
                .textContentType(.oneTimeCode)
                .focused($isFocused)
                .foregroundStyle(.clear)
                .tint(.clear)
                .frame(width: 1, height: 1)
                .opacity(0.02)
                .accessibilityLabel(Text("Verification code"))
                .onChange(of: code) { _, newValue in
                    let digits = String(Validation.normalizedDigits(newValue).prefix(length))
                    if digits != newValue { code = digits }
                }

            HStack(spacing: Theme.Spacing.s) {
                ForEach(0..<length, id: \.self) { index in
                    let isActive = isFocused && index == min(code.count, length - 1)
                    Text(verbatim: character(at: index))
                        .font(.system(.title2, design: .rounded, weight: .heavy))
                        .frame(maxWidth: .infinity)
                        .frame(height: 58)
                        .glassSurface(.field)
                        .overlay {
                            RoundedRectangle(cornerRadius: Theme.Radius.field, style: .continuous)
                                .strokeBorder(Theme.brandGradient, lineWidth: isActive ? 2 : 0)
                        }
                        .scaleEffect(isActive ? 1.05 : 1)
                        .animation(.snappy, value: isActive)
                }
            }
            // Codes read left-to-right in every language.
            .environment(\.layoutDirection, .leftToRight)
            .contentShape(Rectangle())
            .onTapGesture { isFocused = true }
            .accessibilityHidden(true)
        }
        .onAppear { isFocused = true }
    }

    private func character(at index: Int) -> String {
        guard index < code.count else { return "" }
        return String(code[code.index(code.startIndex, offsetBy: index)])
    }
}
