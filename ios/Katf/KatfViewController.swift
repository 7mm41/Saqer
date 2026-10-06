import UIKit
import Capacitor

/// The app's web view. It adds one small in-app plugin, `KatfConfig`, so the web code can read
/// settings that belong to this build (the server address) instead of having them baked into the
/// web bundle.
class KatfViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(KatfConfigPlugin())
    }
}

/// `KatfConfig.get()` → `{ apiUrl }`. The value comes from the `KatfAPIURL` key in Info.plist, which is
/// set from the `KATF_API_URL` build setting (Xcode → target Katf → Build Settings → User-Defined).
@objc(KatfConfigPlugin)
public class KatfConfigPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "KatfConfigPlugin"
    public let jsName = "KatfConfig"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "get", returnType: CAPPluginReturnPromise)
    ]

    @objc func get(_ call: CAPPluginCall) {
        let apiUrl = Bundle.main.object(forInfoDictionaryKey: "KatfAPIURL") as? String ?? ""
        call.resolve(["apiUrl": apiUrl])
    }
}
