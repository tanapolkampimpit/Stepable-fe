import { distanceMeters, type Coordinates, type MapBounds, type MapPlace } from './geo';
import { getLanguage } from '../i18n/core';
import { Platform } from 'react-native';

export type NearbyCategory = 'ramps' | 'crossings' | 'parks';

const OVERPASS_APIS = [
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass-api.de/api/interpreter',
];

type OsmElement = {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

export type ImportantOsmPlace = {
  id: string;
  name: string;
  coordinates: Coordinates;
  tags: Record<string, string>;
};

async function fetchOverpass(query: string): Promise<OsmElement[]> {
  let lastError: unknown;
  for (const endpoint of OVERPASS_APIS) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          ...(Platform.OS === 'web' ? {} : { 'User-Agent': 'StepAble/1.0 (https://github.com/tanapolkampimpit/Stepable-fe)' }),
        },
        body: `data=${encodeURIComponent(query)}`,
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`OpenStreetMap search failed (${response.status})`);
      const data = (await response.json()) as { elements?: OsmElement[]; remark?: string };
      if (data.remark) throw new Error(data.remark);
      if (!Array.isArray(data.elements)) throw new Error('OpenStreetMap returned an invalid response');
      return data.elements;
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError ?? new Error('OpenStreetMap search failed');
}

export async function findImportantOsm(bounds: MapBounds): Promise<ImportantOsmPlace[]> {
  const area = `(${bounds.south},${bounds.west},${bounds.north},${bounds.east})`;
  const query = `[out:json][timeout:25];(
    nwr["amenity"~"^(hospital|clinic|doctors|pharmacy|university|college|school|kindergarten|library|restaurant|fast_food|cafe|bus_station|fuel|bank|atm|police|fire_station|post_office|townhall|place_of_worship)$"]${area};
    nwr["healthcare"~"^(hospital|clinic|doctor|pharmacy)$"]${area};
    nwr["tourism"~"^(hotel|hostel|guest_house|motel|museum|attraction)$"]${area};
    nwr["aeroway"~"^(aerodrome|terminal)$"]${area};
    nwr["railway"="station"]${area};
    nwr["shop"~"^(supermarket|convenience|mall)$"]${area};
    nwr["leisure"="park"]${area};
  );out body center;`;
  const elements = await fetchOverpass(query);
  const english = getLanguage() === 'en';
  return elements.flatMap((element) => {
    const latitude = element.lat ?? element.center?.lat;
    const longitude = element.lon ?? element.center?.lon;
    if (typeof latitude !== 'number' || typeof longitude !== 'number') return [];
    const tags = element.tags ?? {};
    return [{
      id: `osm-${element.type}-${element.id}`,
      name: (english ? tags['name:en'] : undefined) ?? tags.name ?? tags.brand ?? '',
      coordinates: { latitude, longitude },
      tags,
    }];
  });
}

function categorySelectors(category: NearbyCategory, around: string) {
  switch (category) {
    case 'ramps':
      return `nwr["ramp:wheelchair"="yes"]${around};nwr["ramp"="yes"]["wheelchair"!="no"]${around};node["kerb"~"^(lowered|flush)$"]${around};`;
    case 'crossings':
      return `node["highway"="crossing"]${around};`;
    case 'parks':
      return `nwr["leisure"="park"]${around};`;
  }
}

export async function findNearbyOsm(category: NearbyCategory, bounds: MapBounds, near: Coordinates, fallbackLabel: string): Promise<(MapPlace & { osmTags: Record<string, string> })[]> {
  const area = `(${bounds.south},${bounds.west},${bounds.north},${bounds.east})`;
  const query = `[out:json][timeout:25];(${categorySelectors(category, area)});out body center;`;
  const elements = await fetchOverpass(query);
  return elements.flatMap((element) => {
    const latitude = element.lat ?? element.center?.lat;
    const longitude = element.lon ?? element.center?.lon;
    if (typeof latitude !== 'number' || typeof longitude !== 'number') return [];
    const coordinates = { latitude, longitude };
    return [{
      id: `osm-${element.type}-${element.id}`,
      name: element.tags?.name ?? fallbackLabel,
      description: '',
      category,
      coordinates,
      osmTags: element.tags ?? {},
      distanceMeters: distanceMeters(near, coordinates),
    }];
  }).sort((a, b) => (a.distanceMeters ?? 0) - (b.distanceMeters ?? 0));
}
