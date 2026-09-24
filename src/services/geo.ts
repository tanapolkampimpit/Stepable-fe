import { getAiApiUrl } from './ai';

export type Coordinates = { latitude: number; longitude: number };

export type MapPlace = {
  id: string;
  name: string;
  description: string;
  category: string;
  coordinates: Coordinates;
};

export type WalkingPreferences = {
  avoidSteps?: boolean;
  wheelchair?: boolean;
  shortest?: boolean;
};

export type WalkingManeuver = {
  instruction: string;
  verbal_succinct_transition_instruction?: string;
  verbal_post_transition_instruction?: string;
  length: number;
  time: number;
  begin_shape_index: number;
  end_shape_index: number;
  type: number;
};

export type WalkingRoute = {
  coordinates: Coordinates[];
  distanceKm: number;
  durationSeconds: number;
  maneuvers: WalkingManeuver[];
  riskScore: number | null;
  riskLevel: 'low' | 'medium' | 'high' | 'unknown';
  maxRiskScore: number | null;
  evaluatedEdges: number;
  coverage: number;
  riskAvailable: boolean;
  riskMessage: string;
  scoreSource: 'ml' | 'unavailable';
  modelVersion: string;
  candidateCount: number;
  candidateIndex: number;
  selectionMode: 'recommended' | 'shortest' | 'accessible';
  selectionReason: string;
};

export type RouteProgress = {
  nearestIndex: number;
  maneuverIndex: number;
  remainingKm: number;
  remainingFraction: number;
  offRoute: boolean;
};

type PhotonFeature = {
  geometry?: { coordinates?: [number, number] };
  properties?: {
    osm_type?: string;
    osm_id?: number;
    name?: string;
    street?: string;
    housenumber?: string;
    postcode?: string;
    locality?: string;
    district?: string;
    city?: string;
    county?: string;
    state?: string;
    country?: string;
    osm_key?: string;
    osm_value?: string;
    type?: string;
  };
};

const PHOTON_API = 'https://photon.komoot.io';

export async function searchOsmPlaces(query: string, near?: Coordinates): Promise<MapPlace[]> {
  const params = new URLSearchParams({ q: query.trim(), limit: '12', lang: 'default' });
  if (near) {
    params.set('lat', String(near.latitude));
    params.set('lon', String(near.longitude));
  }

  const response = await fetch(`${PHOTON_API}/api/?${params.toString()}`, {
    headers: { Accept: 'application/geo+json, application/json' },
  });
  if (!response.ok) throw new Error('ค้นหาสถานที่ไม่สำเร็จ ลองอีกครั้ง');

  const data = (await response.json()) as { features?: PhotonFeature[] };
  return (data.features ?? []).flatMap((feature) => {
    const props = feature.properties;
    const point = feature.geometry?.coordinates;
    if (!props?.name || !point || point.length < 2) return [];
    const [longitude, latitude] = point;
    const placeLine = [props.street, props.housenumber, props.locality ?? props.district ?? props.city ?? props.county]
      .filter(Boolean)
      .join(' ');
    const category = [props.osm_key, props.osm_value].filter(Boolean).join(' · ');

    return [{
      id: `${props.osm_type ?? 'place'}-${props.osm_id ?? `${latitude}-${longitude}`}`,
      name: props.name,
      description: [placeLine, props.state, props.country].filter(Boolean).join(', '),
      category: category || props.type || 'สถานที่จาก OpenStreetMap',
      coordinates: { latitude, longitude },
    }];
  });
}

export async function reverseGeocodeOsm(coordinates: Coordinates): Promise<string | null> {
  const params = new URLSearchParams({
    lat: String(coordinates.latitude),
    lon: String(coordinates.longitude),
    limit: '1',
    lang: 'default',
  });
  const response = await fetch(`${PHOTON_API}/reverse?${params.toString()}`, {
    headers: { Accept: 'application/geo+json, application/json' },
  });
  if (!response.ok) return null;

  const data = (await response.json()) as { features?: PhotonFeature[] };
  const place = data.features?.[0]?.properties;
  if (!place) return null;
  return [place.name, place.locality ?? place.district ?? place.city ?? place.county, place.state]
    .filter((value, index, values) => Boolean(value) && values.indexOf(value) === index)
    .slice(0, 2)
    .join(', ') || null;
}

export function decodePolyline6(encoded: string): Coordinates[] {
  const coordinates: Coordinates[] = [];
  let index = 0;
  let latitude = 0;
  let longitude = 0;

  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < encoded.length);
    latitude += result & 1 ? ~(result >> 1) : result >> 1;

    result = 0;
    shift = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < encoded.length);
    longitude += result & 1 ? ~(result >> 1) : result >> 1;

    coordinates.push({ latitude: latitude / 1e6, longitude: longitude / 1e6 });
  }

  return coordinates;
}

export async function getWalkingRoute(
  origin: Coordinates,
  destination: Coordinates,
  preferences: WalkingPreferences = {},
): Promise<WalkingRoute> {
  const endpoint = getAiApiUrl();
  const hour = new Date().getHours();
  let response: Response;
  try {
    response = await fetch(`${endpoint}/v1/routes/walking`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        origin,
        destination,
        preferences,
        isNight: hour < 6 || hour >= 18,
      }),
    });
  } catch {
    if (/localhost|127\.0\.0\.1/.test(endpoint)) {
      throw new Error(`มือถือเชื่อมต่อ ${endpoint} ไม่ได้: ใช้ IP ของคอมพิวเตอร์ในวง LAN แทน localhost`);
    }
    throw new Error(`เชื่อมต่อ AI server ไม่ได้ที่ ${endpoint}: ตรวจว่า server เปิดอยู่และมือถืออยู่ Wi-Fi เดียวกัน`);
  }
  if (!response.ok) {
    const error = await response.json().catch(() => null) as { detail?: string } | null;
    throw new Error(error?.detail || `AI server ตอบกลับ ${response.status}`);
  }
  return await response.json() as WalkingRoute;
}

export function distanceMeters(from: Coordinates, to: Coordinates): number {
  const radians = (value: number) => (value * Math.PI) / 180;
  const lat1 = radians(from.latitude);
  const lat2 = radians(to.latitude);
  const deltaLat = lat2 - lat1;
  const deltaLon = radians(to.longitude - from.longitude);
  const a = Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Distance along the decoded route, rather than straight-line distance. */
export function distanceBetweenRouteIndices(points: Coordinates[], start: number, end: number): number {
  if (!points.length) return 0;
  let total = 0;
  const from = Math.max(0, Math.min(start, points.length - 1));
  const to = Math.max(from, Math.min(end, points.length - 1));
  for (let index = from; index < to; index += 1) total += distanceMeters(points[index], points[index + 1]);
  return total;
}

/** Match the phone GPS position to the next turn in a Valhalla walking route. */
export function getRouteProgress(route: WalkingRoute, current: Coordinates): RouteProgress {
  let nearestIndex = 0;
  let nearestDistance = Number.POSITIVE_INFINITY;
  route.coordinates.forEach((point, index) => {
    const distance = distanceMeters(current, point);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = index;
    }
  });

  const remainingMeters = distanceBetweenRouteIndices(route.coordinates, nearestIndex, route.coordinates.length - 1);
  const totalMeters = Math.max(route.distanceKm * 1_000, 1);
  const foundManeuverIndex = route.maneuvers.findIndex((maneuver) => maneuver.end_shape_index >= nearestIndex);
  const maneuverIndex = Math.max(0, foundManeuverIndex < 0 ? route.maneuvers.length - 1 : foundManeuverIndex);
  return {
    nearestIndex,
    maneuverIndex,
    remainingKm: remainingMeters / 1_000,
    remainingFraction: Math.min(1, remainingMeters / totalMeters),
    offRoute: nearestDistance > 120,
  };
}

export function getManeuverInstruction(maneuver: WalkingManeuver): string {
  const instruction = `${maneuver.verbal_succinct_transition_instruction ?? ''} ${maneuver.instruction}`.toLowerCase();
  if (instruction.includes('destination') || maneuver.type === 5) return 'ถึงจุดหมาย';
  if (instruction.includes('u-turn')) return 'กลับตัว';
  if (instruction.includes('left')) return 'เลี้ยวซ้าย';
  if (instruction.includes('right')) return 'เลี้ยวขวา';
  if (instruction.includes('straight') || instruction.includes('continue') || instruction.includes('walk')) return 'เดินตรงไป';
  return 'เดินตามเส้นทาง';
}
