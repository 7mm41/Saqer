import UIKit
import Capacitor

/// The app's web view. It adds one small in-app plugin, `KatfConfig`, so the web code can read
/// settings that belong to this build (the server address, whether the offline demo is included)
/// instead of having them baked into the web bundle.
class KatfViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(KatfConfigPlugin())
    }
}

/// `KatfConfig.get()` → `{ apiUrl, offlineDemo }`, from Info.plist keys set by build settings
/// (Xcode → target Katf → Build Settings → User-Defined):
/// - `KatfAPIURL` ← `KATF_API_URL`: the server the app talks to.
/// - `KatfOfflineDemo` ← `KATF_OFFLINE_DEMO`: YES shows the demo account that works without internet
///   (Debug by default). When it is not YES, a build step also removes the demo data from the app.
@objc(KatfConfigPlugin)
public class KatfConfigPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "KatfConfigPlugin"
    public let jsName = "KatfConfig"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "get", returnType: CAPPluginReturnPromise)
    ]

    @objc func get(_ call: CAPPluginCall) {
        let info = Bundle.main.infoDictionary ?? [:]
        call.resolve([
            "apiUrl": info["KatfAPIURL"] as? String ?? "",
            "offlineDemo": (info["KatfOfflineDemo"] as? String) == "YES",
        ])
    }
}
