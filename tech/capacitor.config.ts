import type { CapacitorConfig } from '@capacitor/cli';

// The bundle identifier is a placeholder until the owner registers the Apple developer account (see docs/ios.md).
const config: CapacitorConfig = {
  appId: 'om.katf.pro',
  appName: 'Katf Pro',
  webDir: 'dist',
  backgroundColor: '#0f1b21',
  ios: {
    contentInset: 'never',
    scheme: 'Katf Pro',
    limitsNavigationsToAppBoundDomains: false,
  },
  plugins: {
    PushNotifications: { presentationOptions: ['badge', 'sound', 'alert'] },
  },
};

export default config;
