'use client';

import { useEffect, useRef } from 'react';

export type Kitchen = {
  id: string;
  name: string;
  area: string;
  lat: number;
  lng: number;
  radiusKm: number;
  isOpen: boolean;
  isVerified: boolean;
};

export type Point = { lat: number; lng: number; area: string; covered: boolean };

/**
 * Kitchens with the circle they will actually deliver inside, over the
 * customers who are trying to order.
 *
 * Leaflet is loaded from the CDN at runtime rather than bundled: this is the
 * only screen in the console that draws a map, and a mapping library is a
 * poor thing to put in every other page's JavaScript.
 *
 * A customer nobody can reach is drawn in the warning colour and on top, so
 * the gaps read before the coverage does — the point of the screen is the
 * absence, not the presence.
 */
export function CoverageMap({
  kitchens,
  customers,
}: {
  kitchens: Kitchen[];
  customers: Point[];
}) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!host.current) return;

    /* The map itself, not a "have I run" flag: React invokes this effect
       twice in development, and a boolean guard there leaves the second pass
       with nothing to do and the first pass cancelled. */
    let map: any = null;
    let cancelled = false;

    const load = (): Promise<void> =>
      new Promise((resolve, reject) => {
        const w = window as unknown as { L?: unknown };
        if (w.L) return resolve();

        const css = document.createElement('link');
        css.rel = 'stylesheet';
        css.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css';
        document.head.appendChild(css);

        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('leaflet failed to load'));
        document.head.appendChild(script);
      });

    load()
      .then(() => {
        if (cancelled || !host.current) return;
        const L = (window as unknown as { L: any }).L;

        map = L.map(host.current, { scrollWheelZoom: false });

        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap',
          maxZoom: 18,
        }).addTo(map);

        const bounds: [number, number][] = [];

        for (const k of kitchens) {
          bounds.push([k.lat, k.lng]);
          /* The circle is the product rule made visible: outside it, this
             kitchen does not exist as far as a customer is concerned. */
          L.circle([k.lat, k.lng], {
            radius: k.radiusKm * 1000,
            color: k.isOpen ? '#4F7150' : '#9A9A9A',
            weight: 1,
            fillColor: k.isOpen ? '#4F7150' : '#9A9A9A',
            fillOpacity: 0.06,
          }).addTo(map);

          L.circleMarker([k.lat, k.lng], {
            radius: 4,
            color: '#C7381A',
            weight: 2,
            fillColor: '#C7381A',
            fillOpacity: 1,
          })
            .bindPopup(
              `<strong>${k.name}</strong><br>${k.area} · ${k.radiusKm} km${
                k.isOpen ? '' : ' · closed'
              }`,
            )
            .addTo(map);
        }

        /* Covered first, stranded second, so the gaps land on top. */
        for (const list of [customers.filter((c) => c.covered), customers.filter((c) => !c.covered)]) {
          for (const c of list) {
            bounds.push([c.lat, c.lng]);
            L.circleMarker([c.lat, c.lng], {
              radius: c.covered ? 3 : 5,
              color: c.covered ? '#8AA37E' : '#B8850F',
              weight: c.covered ? 0 : 2,
              fillColor: c.covered ? '#8AA37E' : '#B8850F',
              fillOpacity: c.covered ? 0.5 : 1,
            })
              .bindPopup(
                c.covered
                  ? `A customer in ${c.area || 'an unnamed area'} — reachable`
                  : `<strong>Nobody delivers here</strong><br>${c.area || 'an unnamed area'}`,
              )
              .addTo(map);
          }
        }

        if (bounds.length) map.fitBounds(bounds, { padding: [30, 30] });
        else map.setView([23.78, 90.4], 12);
      })
      .catch(() => {
        if (host.current) {
          host.current.innerHTML =
            '<div style="padding:24px;font-size:13px">The map could not load. The rest of this page still works.</div>';
        }
      });

    return () => {
      cancelled = true;
      if (map) {
        map.remove();
        map = null;
      }
    };
  }, [kitchens, customers]);

  return (
    <div
      ref={host}
      className="h-[520px] w-full rounded-[10px] border border-line"
      style={{ background: 'var(--sunken, #F2EFE9)' }}
    />
  );
}
