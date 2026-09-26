//
//  AppInfo.swift
//  ثقافة إسلامية
//
//  هوية التطبيق والمطوّر: صقر ستور.
//

import Foundation

enum AppInfo {
    /// اسم المطوّر كما يظهر في التطبيق.
    static let developerArabic = "صقر ستور"
    static let developerLatin = "Saqer Store"
    static let copyrightYear = 2026
    /// بريد الدعم الفني.
    static let supportEmail = "xiisaqer@gmail.com"

    static var version: String {
        let info = Bundle.main.infoDictionary
        let short = info?["CFBundleShortVersionString"] as? String ?? "1.0"
        let build = info?["CFBundleVersion"] as? String ?? "1"
        return "\(short) (\(build))"
    }

    /// رابط مراسلة الدعم مع عنوان جاهز ومعلومات الإصدار.
    static func supportMailURL(subject: String) -> URL? {
        var components = URLComponents()
        components.scheme = "mailto"
        components.path = supportEmail
        components.queryItems = [
            URLQueryItem(name: "subject", value: subject),
            URLQueryItem(name: "body", value: "\n\n—\n\(L10n.t("app.name")) \(version)"),
        ]
        return components.url
    }
}
