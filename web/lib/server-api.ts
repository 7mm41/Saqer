/** Server-side calls to the API (server components). */
const BASE = process.env.API_INTERNAL_URL ?? 'http://localhost:4000';

export interface PublicConfig {
  settings: Record<string, unknown>;
  rendered: Record<string, string>;
  demoMode: boolean;
  paymentsLive: boolean;
  paymentProvider: string;
  mapTileUrl: string;
  vapidPublicKey: string | null;
}

export async function apiGet<T>(path: string, revalidate = 60): Promise<T | null> {
  try {
    const res = await fetch(`${BASE}${path}`, { next: { revalidate } });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function getConfig(): Promise<PublicConfig> {
  return (
    (await apiGet<PublicConfig>('/api/config', 30)) ?? {
      settings: {},
      rendered: {},
      demoMode: false,
      paymentsLive: false,
      paymentProvider: 'mock',
      mapTileUrl: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      vapidPublicKey: null,
    }
  );
}

export interface Area {
  wilayat: string;
  nameAr: string;
  nameEn: string;
  active: boolean;
  visitFeeOverride?: number | null;
  neighbourhoods: { id: string; ar: string; en: string; lat: number; lng: number; radius?: number }[];
}

export const getAreas = async () => (await apiGet<Area[]>('/api/areas', 60)) ?? [];
