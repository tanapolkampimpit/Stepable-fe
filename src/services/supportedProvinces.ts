import type { Coordinates, MapBounds } from './geo';
import boundaries from '../data/supportedProvinces.json';

// Bangkok (10) and Chon Buri (20) boundaries from Thailand's Department of
// Disaster Prevention and Mitigation province feature layer. The bundled
// geometry is simplified to about 50 m to keep the mobile asset small.
// https://gis-portal.disaster.go.th/arcgis/rest/services/MapDX/DPM_TH_Boundary/FeatureServer/1
type Ring = number[][];
type Polygon = Ring[];
type Geometry = { type: 'Polygon'; coordinates: Polygon } | { type: 'MultiPolygon'; coordinates: Polygon[] };

const provinces = [boundaries['10'], boundaries['20']] as Geometry[];

function pointInRing(longitude: number, latitude: number, ring: Ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > latitude) !== (yj > latitude) && longitude < ((xj - xi) * (latitude - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function pointInPolygon(longitude: number, latitude: number, polygon: Polygon) {
  return pointInRing(longitude, latitude, polygon[0])
    && !polygon.slice(1).some((hole) => pointInRing(longitude, latitude, hole));
}

export function isInSupportedProvince({ latitude, longitude }: Coordinates) {
  return provinces.some((geometry) => geometry.type === 'Polygon'
    ? pointInPolygon(longitude, latitude, geometry.coordinates)
    : geometry.coordinates.some((polygon) => pointInPolygon(longitude, latitude, polygon)));
}

export function intersectsSupportedProvince(bounds: MapBounds) {
  return provinces.some((geometry) => {
    const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
    return polygons.some((polygon) => {
      const outerRing = polygon[0];
      const longitudes = outerRing.map(([longitude]) => longitude);
      const latitudes = outerRing.map(([, latitude]) => latitude);
      return Math.max(...longitudes) >= bounds.west && Math.min(...longitudes) <= bounds.east
        && Math.max(...latitudes) >= bounds.south && Math.min(...latitudes) <= bounds.north;
    });
  });
}
