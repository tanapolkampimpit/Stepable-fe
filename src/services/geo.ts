import { t, getLanguage } from '../i18n/core';
import { planRoute, fetchPlaces, type BackendRouteAlternative } from './api';

export type Coordinates = { latitude: number; longitude: number };

export type MapPlace = {
  id: string;
  name: string;
  description: string;
  category: string;
  coordinates: Coordinates;
  distanceMeters?: number;
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
  title?: string;
  features?: string[];
  warnings?: string[];
  safeScore?: number;
  accessibilityScore?: number;
  alternatives?: BackendRouteAlternative[];
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
  const cleanQuery = query.trim();
  if (!cleanQuery) return [];

  // Default geographic anchor to Sriracha if user location is not ready
  const refPoint: Coordinates = near || { latitude: 13.1678, longitude: 100.9312 };

  let backendPlaces: MapPlace[] = [];
  try {
    const fetched = await fetchPlaces({
      query: cleanQuery,
      latitude: refPoint.latitude,
      longitude: refPoint.longitude,
      limit: 30,
    });
    backendPlaces = fetched.map((p) => {
      const dist = distanceMeters(refPoint, p.coordinates);
      return {
        id: `backend-${p.id}`,
        name: p.title,
        description: `${p.address} · ความปลอดภัย ${p.safeScore}%`,
        category: p.category || 'สถานที่แนะนำในศรีราชา',
        coordinates: { latitude: p.coordinates.latitude, longitude: p.coordinates.longitude },
        distanceMeters: dist,
      };
    });
  } catch {
    // If backend place search fails, continue to Photon
  }

  let photonPlaces: MapPlace[] = [];
  try {
    const params = new URLSearchParams({
      q: cleanQuery,
      limit: '30',
      lang: getLanguage() === 'en' ? 'en' : 'default',
      lat: String(refPoint.latitude),
      lon: String(refPoint.longitude),
    });
    const response = await fetch(`${PHOTON_API}/api/?${params.toString()}`, {
      headers: { Accept: 'application/geo+json, application/json' },
    });
    if (response.ok) {
      const data = (await response.json()) as { features?: PhotonFeature[] };
      photonPlaces = (data.features ?? []).flatMap((feature) => {
        const props = feature.properties;
        const point = feature.geometry?.coordinates;
        if (!props?.name || !point || point.length < 2) return [];
        const [longitude, latitude] = point;
        const coords = { latitude, longitude };
        const dist = distanceMeters(refPoint, coords);
        const placeLine = [props.street, props.housenumber, props.locality ?? props.district ?? props.city ?? props.county]
          .filter(Boolean)
          .join(' ');
        const category = [props.osm_key, props.osm_value].filter(Boolean).join(' · ');

        return [{
          id: `${props.osm_type ?? 'place'}-${props.osm_id ?? `${latitude}-${longitude}`}`,
          name: props.name,
          description: [placeLine, props.state, props.country].filter(Boolean).join(', '),
          category: category || props.type || t('service.openstreetmapPlace'),
          coordinates: coords,
          distanceMeters: dist,
        }];
      });
    }
  } catch {
    // fallback
  }

  // Combine backend places first, then photon places without duplicates
  const combined = [...backendPlaces];
  for (const p of photonPlaces) {
    if (!combined.some((item) => item.name.toLowerCase() === p.name.toLowerCase())) {
      combined.push(p);
    }
  }

  // Sort strictly by distance to user (closest first)
  combined.sort((a, b) => (a.distanceMeters ?? 0) - (b.distanceMeters ?? 0));

  return combined;
}

export async function reverseGeocodeOsm(coordinates: Coordinates): Promise<string | null> {
  const params = new URLSearchParams({
    lat: String(coordinates.latitude),
    lon: String(coordinates.longitude),
    limit: '1',
    lang: getLanguage() === 'en' ? 'en' : 'default',
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
  try {
    const planResponse = await planRoute({
      origin,
      destination,
      filter: preferences.wheelchair ? 'accessible' : preferences.shortest ? 'fastest' : 'all',
      preferences: {
        wheelchair: Boolean(preferences.wheelchair),
        avoidStairs: Boolean(preferences.avoidSteps || preferences.wheelchair),
        avoidSlopes: Boolean(preferences.wheelchair),
        avoidDark: false,
        safeFirst: !preferences.shortest,
        walkingSpeedMps: 1.2,
      },
      alternatives: 3,
    });

    if (planResponse.routes && planResponse.routes.length > 0) {
      let selected = planResponse.routes[0];
      if (preferences.wheelchair) {
        selected = planResponse.routes.find((r) => r.type === 'accessible') || selected;
      } else if (preferences.shortest) {
        selected = planResponse.routes.find((r) => r.type === 'fastest') || selected;
      } else {
        selected = planResponse.routes.find((r) => r.type === 'recommended') || selected;
      }

      const coordinates: Coordinates[] = selected.geometry.coordinates.map(([lon, lat]) => ({
        latitude: lat,
        longitude: lon,
      }));

      const totalCoords = Math.max(1, coordinates.length);
      const stepCount = Math.max(1, selected.steps.length);
      const maneuvers: WalkingManeuver[] = selected.steps.map((st, idx) => {
        const begin_shape_index = Math.floor((idx / stepCount) * totalCoords);
        const end_shape_index = Math.floor(((idx + 1) / stepCount) * totalCoords);
        const warning = st.hazardWarning ? ` ⚠️ ${st.hazardWarning}` : '';
        const nameSuffix = st.name ? ` (${st.name})` : '';
        return {
          instruction: `${st.instruction}${nameSuffix}${warning}`,
          length: st.distanceMeters / 1000,
          time: st.durationSeconds,
          begin_shape_index,
          end_shape_index,
          type: st.type ?? 1,
        };
      });

      const riskScore = Math.max(0, 100 - (selected.safeScore || 85));
      const riskLevel = selected.safeScore >= 80 ? 'low' : selected.safeScore >= 50 ? 'medium' : 'high';

      return {
        coordinates,
        distanceKm: selected.distanceMeters / 1000,
        durationSeconds: selected.durationSeconds,
        maneuvers: maneuvers.length > 0 ? maneuvers : [{
          instruction: 'เดินตรงไปยังจุดหมาย',
          length: selected.distanceMeters / 1000,
          time: selected.durationSeconds,
          begin_shape_index: 0,
          end_shape_index: totalCoords,
          type: 1,
        }],
        riskScore,
        riskLevel,
        maxRiskScore: riskScore,
        evaluatedEdges: totalCoords,
        coverage: 1,
        riskAvailable: true,
        riskMessage: `คะแนนความปลอดภัย ${selected.safeScore}/100`,
        scoreSource: 'ml',
        modelVersion: 'StepAble-AI-v1',
        candidateCount: planResponse.routes.length,
        candidateIndex: planResponse.routes.indexOf(selected),
        selectionMode: preferences.wheelchair ? 'accessible' : preferences.shortest ? 'shortest' : 'recommended',
        selectionReason: selected.title,
        title: selected.title,
        features: selected.features,
        warnings: selected.warnings,
        safeScore: selected.safeScore,
        accessibilityScore: selected.accessibilityScore,
        alternatives: planResponse.routes,
      };
    }
  } catch (error) {
    console.warn('StepAble routes/plan failed, attempting fallback:', error);
  }

  // Fallback: simple route calculation if backend plan route fails (e.g. coordinates outside test bounds)
  const dist = distanceMeters(origin, destination) / 1000;
  const dur = Math.round((dist * 1000) / 1.2);
  return {
    coordinates: [origin, destination],
    distanceKm: dist,
    durationSeconds: dur,
    maneuvers: [{
      instruction: 'เดินตรงไปยังจุดหมาย',
      length: dist,
      time: dur,
      begin_shape_index: 0,
      end_shape_index: 2,
      type: 1,
    }],
    riskScore: 15,
    riskLevel: 'low',
    maxRiskScore: 15,
    evaluatedEdges: 1,
    coverage: 0.5,
    riskAvailable: false,
    riskMessage: 'เส้นทางสำรอง (ไม่พบข้อมูล AI)',
    scoreSource: 'unavailable',
    modelVersion: 'fallback',
    candidateCount: 1,
    candidateIndex: 0,
    selectionMode: 'recommended',
    selectionReason: 'Fallback',
  };
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
  if (instruction.includes('destination') || maneuver.type === 5) return t('service.arriveAtYourDestination');
  if (instruction.includes('u-turn')) return t('service.makeAUTurn');
  if (instruction.includes('left')) return t('service.turnLeft');
  if (instruction.includes('right')) return t('service.turnRight');
  if (instruction.includes('straight') || instruction.includes('continue') || instruction.includes('walk')) return t('service.continueStraight');
  return t('service.followTheRoute');
}
