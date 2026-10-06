/**
 * Native capabilities (iPhone app) with web fallbacks (PWA): secure token storage, camera,
 * location, push, haptics and biometric unlock.
 */
import { Capacitor } from '@capacitor/core';

export const isNative = () => Capacitor.isNativePlatform();

// ---------------------------------------------------------------- secure storage (Keychain on iOS)
export async function secureGet(key: string): Promise<string | null> {
  if (isNative()) {
    const { SecureStorage } = await import('@aparajita/capacitor-secure-storage');
    return ((await SecureStorage.get(key).catch(() => null)) as string | null) ?? null;
  }
  try {
    return localStorage.getItem(`katf.${key}`);
  } catch {
    return null;
  }
}
export async function secureSet(key: string, value: string | null) {
  if (isNative()) {
    const { SecureStorage } = await import('@aparajita/capacitor-secure-storage');
    if (value == null) await SecureStorage.remove(key).catch(() => {});
    else await SecureStorage.set(key, value);
    return;
  }
  try {
    if (value == null) localStorage.removeItem(`katf.${key}`);
    else localStorage.setItem(`katf.${key}`, value);
  } catch {
    /* ignore */
  }
}

export async function deviceId(): Promise<string> {
  let id = await secureGet('device');
  if (!id) {
    id = (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`).replace(/[^A-Za-z0-9-]/g, '');
    await secureSet('device', id);
  }
  return id;
}

// ---------------------------------------------------------------- camera
/** Native camera when available; otherwise a file input with capture. Resolves to a File, or null if cancelled. */
export async function takePhoto(): Promise<File | null> {
  if (isNative()) {
    const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera');
    try {
      const p = await Camera.getPhoto({ resultType: CameraResultType.Uri, source: CameraSource.Prompt, quality: 80, width: 2048, correctOrientation: true, saveToGallery: false });
      if (!p.webPath) return null;
      const blob = await (await fetch(p.webPath)).blob();
      return new File([blob], `photo.${p.format || 'jpeg'}`, { type: blob.type || 'image/jpeg' });
    } catch {
      return null;
    }
  }
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png,image/webp';
    input.capture = 'environment';
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.click();
  });
}

// ---------------------------------------------------------------- location
export async function currentPosition(): Promise<{ lat: number; lng: number; accuracy: number }> {
  if (isNative()) {
    const { Geolocation } = await import('@capacitor/geolocation');
    const p = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 20000 });
    return { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy };
  }
  return new Promise((resolve, reject) =>
    navigator.geolocation.getCurrentPosition((p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }), reject, { enableHighAccuracy: true, timeout: 20000 }),
  );
}

// ---------------------------------------------------------------- haptics and sound
export async function buzz(strong = false) {
  if (isNative()) {
    const { Haptics, ImpactStyle, NotificationType } = await import('@capacitor/haptics');
    if (strong) await Haptics.notification({ type: NotificationType.Warning }).catch(() => {});
    else await Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
  } else navigator.vibrate?.(strong ? [200, 100, 200] : 30);
}

/** A short two-tone chime for new requests (no audio file needed). */
export function chime() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ac = new Ctx();
    [880, 1175].forEach((f, i) => {
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.frequency.value = f;
      o.type = 'sine';
      g.gain.setValueAtTime(0.0001, ac.currentTime + i * 0.22);
      g.gain.exponentialRampToValueAtTime(0.3, ac.currentTime + i * 0.22 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + i * 0.22 + 0.2);
      o.connect(g).connect(ac.destination);
      o.start(ac.currentTime + i * 0.22);
      o.stop(ac.currentTime + i * 0.22 + 0.22);
    });
  } catch {
    /* audio may be blocked until the first tap */
  }
}

// ---------------------------------------------------------------- push
export async function registerPush(subscribe: (s: { kind: 'webpush' | 'apns'; endpoint: string; keys?: Record<string, string> | null }) => Promise<void>, vapidKey: string | null): Promise<'on' | 'denied' | 'unsupported'> {
  if (isNative()) {
    const { PushNotifications } = await import('@capacitor/push-notifications');
    const perm = await PushNotifications.requestPermissions();
    if (perm.receive !== 'granted') return 'denied';
    return new Promise((resolve) => {
      void PushNotifications.addListener('registration', async (t) => {
        await subscribe({ kind: 'apns', endpoint: t.value });
        resolve('on');
      });
      void PushNotifications.addListener('registrationError', () => resolve('unsupported'));
      void PushNotifications.addListener('pushNotificationActionPerformed', (a) => {
        const link = (a.notification.data as { link?: string } | undefined)?.link;
        if (link) window.location.href = link.replace(/^https?:\/\/[^/]+/, '').replace(/^\/tech(?=\/)/, '');
      });
      void PushNotifications.register();
    });
  }
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !vapidKey) return 'unsupported';
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return 'denied';
  const reg = await navigator.serviceWorker.ready;
  const key = Uint8Array.from(atob(vapidKey.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (vapidKey.length % 4)) % 4)), (c) => c.charCodeAt(0));
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key }));
  const j = sub.toJSON();
  await subscribe({ kind: 'webpush', endpoint: j.endpoint!, keys: (j.keys as Record<string, string>) ?? null });
  return 'on';
}

// ---------------------------------------------------------------- biometric unlock
export async function biometricAvailable(): Promise<boolean> {
  if (!isNative()) return false;
  const { BiometricAuth } = await import('@aparajita/capacitor-biometric-auth');
  const r = await BiometricAuth.checkBiometry().catch(() => null);
  return Boolean(r?.isAvailable);
}

export async function biometricUnlock(reason: string): Promise<boolean> {
  if (!isNative()) return true;
  const { BiometricAuth } = await import('@aparajita/capacitor-biometric-auth');
  try {
    await BiometricAuth.authenticate({ reason, allowDeviceCredential: true });
    return true;
  } catch {
    return false;
  }
}

export function mapsLink(lat: number, lng: number) {
  const ios = /iPhone|iPad|Macintosh/.test(navigator.userAgent);
  return ios ? `https://maps.apple.com/?daddr=${lat},${lng}` : `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}
