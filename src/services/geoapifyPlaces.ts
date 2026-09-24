import { getLanguage } from '../i18n/core';
import type { Coordinates, MapBounds } from './geo';
import { isInSupportedProvince } from './supportedProvinces';

export const hasGeoapifyKey = Boolean(process.env.EXPO_PUBLIC_GEOAPIFY_API_KEY?.trim());

export type GeoapifyPlace = {
  id: string;
  name: string;
  coordinates: Coordinates;
  tags: Record<string, string>;
  categories: string[];
};

type Feature = {
  geometry?: { coordinates?: number[] };
  properties?: {
    place_id?: string;
    name?: string;
    name_international?: Record<string, string>;
    address_line2?: string;
    website?: string;
    opening_hours?: string;
    contact?: { phone?: string };
    categories?: string[];
    datasource?: { raw?: Record<string, unknown> };
  };
};

const categories = [
  'healthcare.hospital,education.university,accommodation.hotel,airport,public_transport.train,leisure.park,commercial.shopping_mall',
  'healthcare.clinic_or_praxis,healthcare.pharmacy,education.college,education.school,accommodation.hostel,public_transport.subway,commercial.supermarket,entertainment.museum,service.police,service.vehicle.fuel,catering.restaurant,catering.cafe',
];

async function searchPlaces(categoryList: string, bounds: MapBounds, limit: number): Promise<GeoapifyPlace[]> {
  const key = process.env.EXPO_PUBLIC_GEOAPIFY_API_KEY?.trim();
  if (!key) throw new Error('Geoapify API key is missing');
  const longitude = (bounds.west + bounds.east) / 2;
  const latitude = (bounds.south + bounds.north) / 2;
  const parameters = new URLSearchParams({
    categories: categoryList,
    filter: `rect:${bounds.west},${bounds.north},${bounds.east},${bounds.south}`,
    bias: `proximity:${longitude},${latitude}`,
    limit: String(limit),
    apiKey: key,
  });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(`https://api.geoapify.com/v2/places?${parameters}`, { signal: controller.signal });
    if (!response.ok) throw new Error(`Geoapify places failed (${response.status})`);
    const data = (await response.json()) as { features?: Feature[] };
    if (!Array.isArray(data.features)) throw new Error('Geoapify returned an invalid response');
    const english = getLanguage() === 'en';
    return data.features.flatMap((feature) => {
      const properties = feature.properties;
      const longitude = Number(feature.geometry?.coordinates?.[0] ?? properties?.datasource?.raw?.lon);
      const latitude = Number(feature.geometry?.coordinates?.[1] ?? properties?.datasource?.raw?.lat);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return [];
      const coordinates = { latitude, longitude };
      if (!isInSupportedProvince(coordinates)) return [];
      const raw = properties?.datasource?.raw ?? {};
      const tags = Object.fromEntries(Object.entries(raw).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
      if (properties?.address_line2) tags['addr:full'] ??= properties.address_line2;
      if (properties?.website) tags.website ??= properties.website;
      if (properties?.opening_hours) tags.opening_hours ??= properties.opening_hours;
      if (properties?.contact?.phone) tags.phone ??= properties.contact.phone;
      const osmType = { n: 'node', w: 'way', r: 'relation' }[String(raw.osm_type)] ?? String(raw.osm_type ?? '');
      const id = raw.osm_id && osmType ? `osm-${osmType}-${raw.osm_id}` : `geoapify-${properties?.place_id ?? `${latitude}-${longitude}`}`;
      return [{
        id,
        name: (english ? properties?.name_international?.en : properties?.name_international?.th) ?? properties?.name ?? tags.name ?? '',
        coordinates,
        tags,
        categories: properties?.categories ?? [],
      }];
    });
  } finally {
    clearTimeout(timeout);
  }
}

export async function findImportantGeoapify(bounds: MapBounds): Promise<GeoapifyPlace[]> {
  const results = await Promise.allSettled([
    searchPlaces(categories[0], bounds, 200),
    searchPlaces(categories[1], bounds, 150),
  ]);
  const successful = results.filter((result): result is PromiseFulfilledResult<GeoapifyPlace[]> => result.status === 'fulfilled');
  if (!successful.length) throw (results[0] as PromiseRejectedResult).reason;
  const places = [...new Map(successful.flatMap((result) => result.value).map((place) => [place.id, place])).values()];
  if (!places.length) {
    const failed = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
    if (failed) throw failed.reason;
  }
  return places;
}
