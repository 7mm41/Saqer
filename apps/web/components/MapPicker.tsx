'use client';
import { useEffect, useRef } from 'react';
import 'leaflet/dist/leaflet.css';

/** Drag-the-pin map (Leaflet). The tile server is configurable (MAP_TILE_URL). */
export default function MapPicker({ lat, lng, onChange, tileUrl, label }: { lat: number; lng: number; onChange: (p: { lat: number; lng: number }) => void; tileUrl: string; label: string }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<import('leaflet').Map | null>(null);
  const marker = useRef<import('leaflet').Marker | null>(null);
  const cb = useRef(onChange);
  cb.current = onChange;
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = await import('leaflet');
      if (cancelled || !el.current || map.current) return;
      const m = L.map(el.current, { zoomControl: true, attributionControl: true }).setView([lat, lng], 15);
      L.tileLayer(tileUrl, { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(m);
      const icon = L.divIcon({
        className: '',
        html: '<div style="width:34px;height:34px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:#B95A1F;border:3px solid #fff;box-shadow:0 6px 14px rgba(0,0,0,.3)"></div>',
        iconSize: [34, 34],
        iconAnchor: [17, 34],
      });
      const mk = L.marker([lat, lng], { draggable: true, icon, keyboard: true, title: label }).addTo(m);
      mk.on('dragend', () => {
        const p = mk.getLatLng();
        cb.current({ lat: p.lat, lng: p.lng });
      });
      m.on('click', (e: import('leaflet').LeafletMouseEvent) => {
        mk.setLatLng(e.latlng);
        cb.current({ lat: e.latlng.lat, lng: e.latlng.lng });
      });
      map.current = m;
      marker.current = mk;
    })();
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (marker.current && map.current) {
      const cur = marker.current.getLatLng();
      if (Math.abs(cur.lat - lat) > 1e-7 || Math.abs(cur.lng - lng) > 1e-7) {
        marker.current.setLatLng([lat, lng]);
        map.current.setView([lat, lng], Math.max(map.current.getZoom(), 15));
      }
    }
  }, [lat, lng]);
  return <div ref={el} className="k-map" role="application" aria-label={label} />;
}
