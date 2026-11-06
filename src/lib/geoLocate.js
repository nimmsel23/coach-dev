/**
 * Löst GPS-Koordinaten client-seitig in einen menschenlesbaren Ort auf:
 * nächstes Gym (OSM Overpass) > Adresse (Nominatim) > rohe Koordinaten.
 *
 * Läuft im Browser (kein Server-Roundtrip) — funktioniert dadurch identisch
 * im lokalen Dev-Server-Modus UND im Firebase-Hosting-Build, der server.mjs
 * gar nicht erreicht. Kein API-Key nötig, beide Dienste erlauben CORS.
 */

const NEARBY_RADIUS_M = 250;

function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function mapsUrlFor(lat, lng) {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

async function findNearestGym(lat, lng) {
  const query = `[out:json][timeout:8];(` +
    `node(around:${NEARBY_RADIUS_M},${lat},${lng})["leisure"="fitness_centre"];` +
    `way(around:${NEARBY_RADIUS_M},${lat},${lng})["leisure"="fitness_centre"];` +
    `node(around:${NEARBY_RADIUS_M},${lat},${lng})["sport"="fitness"];` +
    `way(around:${NEARBY_RADIUS_M},${lat},${lng})["sport"="fitness"];` +
    `);out center 10;`;
  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: query,
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const nearest = (data.elements || [])
    .map(el => {
      const elLat = el.lat ?? el.center?.lat;
      const elLng = el.lon ?? el.center?.lon;
      if (elLat == null || elLng == null) return null;
      return { name: el.tags?.name || null, lat: elLat, lng: elLng, distance: haversineMeters(lat, lng, elLat, elLng) };
    })
    .filter(Boolean)
    .sort((a, b) => a.distance - b.distance);
  return nearest[0] || null;
}

async function reverseGeocode(lat, lng) {
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) return null;
  const data = await res.json();
  const a = data.address || {};
  const street = [a.road, a.house_number].filter(Boolean).join(' ');
  const city = a.city || a.town || a.village || a.suburb || '';
  const label = [street, city].filter(Boolean).join(', ');
  return label || data.display_name || null;
}

export async function resolveGeoLocation(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  try {
    const gym = await findNearestGym(lat, lng);
    if (gym) return { source: 'gym', label: gym.name || 'Fitnessstudio', mapsUrl: mapsUrlFor(gym.lat, gym.lng) };
  } catch { /* Overpass down/timeout -> Adress-Fallback versuchen */ }
  try {
    const address = await reverseGeocode(lat, lng);
    if (address) return { source: 'address', label: address, mapsUrl: mapsUrlFor(lat, lng) };
  } catch { /* Nominatim down/timeout -> Koordinaten-Fallback */ }
  return { source: 'coords', label: `${lat.toFixed(5)}, ${lng.toFixed(5)}`, mapsUrl: mapsUrlFor(lat, lng) };
}
