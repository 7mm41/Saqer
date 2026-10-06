import type { CapacitorConfig } from '@capacitor/cli';

// The bundle identifier is a placeholder until the owner registers the Apple developer account (see docs/ios.md).
// The Xcode project is ios/Katf.xcodeproj at the repository root. Capacitor's CLI only knows its own default
// layout, so `pnpm ios:sync` (scripts/ios-sync.mjs) lets it write into a scratch folder (.cap-ios) and then
// copies the results into ios/Katf. Do not run `cap sync` / `cap open` directly.
const config: CapacitorConfig = {
  appId: 'om.katf.pro',
  appName: 'Katf Pro',
  webDir: 'dist',
  backgroundColor: '#0f1b21',
  ios: {
    path: '.cap-ios',
    contentInset: 'never',
    scheme: 'Katf', // the Xcode scheme (used by the Capacitor CLI only)
    limitsNavigationsToAppBoundDomains: false,
  },
  plugins: {
    PushNotifications: { presentationOptions: ['badge', 'sound', 'alert'] },
  },
};

export default config;
