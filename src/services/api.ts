import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const STORAGE_KEYS = {
  authToken: '@stepable/auth_token',
  installationId: '@stepable/installation_id',
};

export type TokenResponse = {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: number;
  user: {
    id: string;
    displayName: string;
    email: string | null;
    role: string;
    accountType: string;
  };
};

export type WeatherCurrentResponse = {
  latitude: number;
  longitude: number;
  temperatureC: number;
  relativeHumidity: number;
  weatherCode: number;
  weatherCondition: string;
  windSpeedKmh: number;
  isSafeForWalking: boolean;
  advisory: string | null;
};

export type ReportCreateRequest = {
  category: string;
  severity?: 'low' | 'medium' | 'high' | string;
  title?: string;
  description?: string;
  latitude: number;
  longitude: number;
  photoUrl?: string | null;
};

export type ReportResponse = {
  id: string;
  userId?: string | null;
  category: string;
  severity: string;
  title?: string | null;
  description?: string | null;
  latitude: number;
  longitude: number;
  photoUrl?: string | null;
  status: string;
  resolutionNotes?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PresignUploadResponse = {
  uploadUrl: string;
  publicUrl: string;
  fileKey: string;
  fileName?: string | null;
  contentType?: string | null;
  sizeBytes?: number | null;
};

export type PlaceCoordinates = {
  latitude: number;
  longitude: number;
  placeId?: string | null;
};

export type PlaceRead = {
  id: string;
  title: string;
  address: string;
  category: string;
  coordinates: PlaceCoordinates;
  safeScore: number;
  icon: string;
  color: string;
  isSaved: boolean;
};

export type PlaceCategoryRead = {
  id: string;
  nameTh: string;
  nameEn: string;
  icon: string;
  color: string;
  displayOrder: number;
};

export type RouteStep = {
  instruction: string;
  distanceMeters: number;
  durationSeconds: number;
  name?: string | null;
  type?: number | null;
  modifier?: string | null;
  hazardWarning?: string | null;
};

export type GeoJSONGeometry = {
  type: string;
  coordinates: [number, number][]; // [longitude, latitude]
};

export type BackendRouteAlternative = {
  routeId: string;
  type: string; // 'recommended' | 'fastest' | 'accessible'
  title: string;
  distanceMeters: number;
  durationSeconds: number;
  distanceText?: string | null;
  durationText?: string | null;
  safeScore: number;
  accessibilityScore: number;
  geometry: GeoJSONGeometry;
  steps: RouteStep[];
  features: string[];
  warnings: string[];
};

export type RoutePlanRequest = {
  origin: { latitude: number; longitude: number; placeId?: string | null };
  destination: { latitude: number; longitude: number; placeId?: string | null };
  filter?: string;
  preferences?: {
    wheelchair?: boolean;
    avoidStairs?: boolean;
    avoidSlopes?: boolean;
    avoidDark?: boolean;
    safeFirst?: boolean;
    walkingSpeedMps?: number;
  } | null;
  alternatives?: number;
};

export type RoutePlanResponse = {
  planId: string;
  origin: { latitude: number; longitude: number };
  destination: { latitude: number; longitude: number };
  routes: BackendRouteAlternative[];
};

/**
 * Returns the base API URL for the StepAble backend.
 * Priority:
 * 1. process.env.EXPO_PUBLIC_API_URL
 * 2. Android emulator: http://10.0.2.2:8000/api/v1
 * 3. Default (Web / iOS / local): http://127.0.0.1:8000/api/v1
 */
export function getApiBaseUrl(): string {
  const envUrl = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/$/, '');
  if (envUrl) {
    return envUrl.endsWith('/api/v1') ? envUrl : `${envUrl}/api/v1`;
  }
  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:8000/api/v1';
  }
  return 'http://127.0.0.1:8000/api/v1';
}

/**
 * Retrieves or initializes a unique installation ID for this client.
 */
export async function getInstallationId(): Promise<string> {
  try {
    const existing = await AsyncStorage.getItem(STORAGE_KEYS.installationId);
    if (existing) return existing;
    const newId = `inst_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    await AsyncStorage.setItem(STORAGE_KEYS.installationId, newId);
    return newId;
  } catch {
    return `inst_fallback_${Date.now()}`;
  }
}

let inMemoryToken: string | null = null;

/**
 * Requests a guest token from the StepAble backend and stores it.
 */
export async function loginAsGuest(): Promise<TokenResponse> {
  const baseUrl = getApiBaseUrl();
  const installationId = await getInstallationId();

  const response = await fetch(`${baseUrl}/auth/guest`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      installationId,
      deviceInfo: `${Platform.OS} client`,
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`Guest auth failed (${response.status}): ${errText}`);
  }

  const data = (await response.json()) as TokenResponse;
  inMemoryToken = data.accessToken;
  await AsyncStorage.setItem(STORAGE_KEYS.authToken, JSON.stringify(data)).catch(() => undefined);
  return data;
}

/**
 * Returns a valid access token, authenticating as a guest if none exists.
 */
export async function getAuthToken(): Promise<string> {
  if (inMemoryToken) return inMemoryToken;

  try {
    const saved = await AsyncStorage.getItem(STORAGE_KEYS.authToken);
    if (saved) {
      const parsed = JSON.parse(saved) as TokenResponse;
      if (parsed.accessToken) {
        inMemoryToken = parsed.accessToken;
        return parsed.accessToken;
      }
    }
  } catch {
    // Continue to login
  }

  const guest = await loginAsGuest();
  return guest.accessToken;
}

/**
 * Wrapper for API requests with auto Bearer token injection and retry on 401.
 */
export async function apiFetch<T>(
  path: string,
  options: RequestInit & { requiresAuth?: boolean } = {},
): Promise<T> {
  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
  const requiresAuth = options.requiresAuth ?? true;

  const headers = new Headers(options.headers || {});
  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json');
  }

  if (requiresAuth && !headers.has('Authorization')) {
    try {
      const token = await getAuthToken();
      headers.set('Authorization', `Bearer ${token}`);
    } catch (authErr) {
      console.warn('Could not acquire guest token:', authErr);
    }
  }

  let response = await fetch(url, { ...options, headers });

  // Handle 401 unauthorized once by re-logging in as guest
  if (response.status === 401 && requiresAuth) {
    inMemoryToken = null;
    await AsyncStorage.removeItem(STORAGE_KEYS.authToken).catch(() => undefined);
    try {
      const newToken = await loginAsGuest();
      headers.set('Authorization', `Bearer ${newToken.accessToken}`);
      response = await fetch(url, { ...options, headers });
    } catch {
      // Return original response
    }
  }

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null) as { message?: string; detail?: string } | null;
    const msg = errorBody?.message || errorBody?.detail || `API error ${response.status} from ${path}`;
    throw new Error(msg);
  }

  return (await response.json()) as T;
}

/* =========================================================================
   Weather API
   ========================================================================= */

export async function fetchCurrentWeather(
  latitude = 13.1678,
  longitude = 100.9312,
  forceRefresh = false,
): Promise<WeatherCurrentResponse> {
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    force_refresh: String(forceRefresh),
  });
  return apiFetch<WeatherCurrentResponse>(`/weather/current?${params.toString()}`, {
    requiresAuth: false,
  });
}

/* =========================================================================
   Reports & Uploads API
   ========================================================================= */

export async function fetchReports(params?: {
  status?: string;
  category?: string;
  limit?: number;
}): Promise<ReportResponse[]> {
  const searchParams = new URLSearchParams();
  if (params?.status) searchParams.set('status', params.status);
  if (params?.category) searchParams.set('category', params.category);
  if (params?.limit) searchParams.set('limit', String(params.limit));

  const query = searchParams.toString() ? `?${searchParams.toString()}` : '';
  return apiFetch<ReportResponse[]>(`/reports${query}`, { requiresAuth: false });
}

export async function submitReport(
  payload: ReportCreateRequest,
  idempotencyKey?: string,
): Promise<ReportResponse> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (idempotencyKey) {
    headers['Idempotency-Key'] = idempotencyKey;
  }
  return apiFetch<ReportResponse>('/reports', {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
    requiresAuth: true,
  });
}

/**
 * Directly uploads an image file to the StepAble backend (/uploads/file)
 * and returns the permanent publicUrl and file metadata.
 */
export async function uploadReportPhoto(imageUri: string): Promise<PresignUploadResponse> {
  const baseUrl = getApiBaseUrl();
  const formData = new FormData();

  if (Platform.OS === 'web') {
    const res = await fetch(imageUri);
    const blob = await res.blob();
    formData.append('file', blob, 'report-photo.jpg');
  } else {
    formData.append('file', {
      uri: imageUri,
      name: 'report-photo.jpg',
      type: 'image/jpeg',
    } as unknown as Blob);
  }

  const response = await fetch(`${baseUrl}/uploads/file`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const err = await response.json().catch(() => null) as { message?: string } | null;
    throw new Error(err?.message || `Upload failed with status ${response.status}`);
  }

  return (await response.json()) as PresignUploadResponse;
}

/* =========================================================================
   Places & Categories API
   ========================================================================= */

export async function fetchPlaceCategories(): Promise<PlaceCategoryRead[]> {
  return apiFetch<PlaceCategoryRead[]>('/place-categories', { requiresAuth: false });
}

export async function fetchPlaces(params?: {
  query?: string;
  category_id?: string;
  latitude?: number;
  longitude?: number;
  limit?: number;
}): Promise<PlaceRead[]> {
  const searchParams = new URLSearchParams();
  if (params?.query) searchParams.set('query', params.query);
  if (params?.category_id) searchParams.set('category_id', params.category_id);
  if (params?.latitude !== undefined) searchParams.set('latitude', String(params.latitude));
  if (params?.longitude !== undefined) searchParams.set('longitude', String(params.longitude));
  if (params?.limit !== undefined) searchParams.set('limit', String(params.limit));

  const query = searchParams.toString() ? `?${searchParams.toString()}` : '';
  return apiFetch<PlaceRead[]>(`/places${query}`, { requiresAuth: false });
}

/* =========================================================================
   Route Planning API
   ========================================================================= */

export async function planRoute(request: RoutePlanRequest): Promise<RoutePlanResponse> {
  return apiFetch<RoutePlanResponse>('/routes/plan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
    requiresAuth: true,
  });
}

/* =========================================================================
   Label & Category Mapping Helpers
   ========================================================================= */

export function thaiToCategory(thai: string): string {
  switch (thai) {
    case 'ทางเท้าชำรุด':
      return 'damage';
    case 'สิ่งกีดขวาง':
      return 'obstacle';
    case 'ทางมืด':
      return 'lighting';
    case 'ไม่มีทางลาด':
      return 'no_ramp';
    case 'ฝาท่อชำรุด':
      return 'drain_cover';
    case 'ทางม้าลายอันตราย':
      return 'crosswalk';
    default:
      return 'damage';
  }
}

export function categoryToThai(category: string): string {
  switch (category) {
    case 'damage':
      return 'ทางเท้าชำรุด';
    case 'obstacle':
      return 'สิ่งกีดขวาง';
    case 'lighting':
      return 'ทางมืด';
    case 'no_ramp':
      return 'ไม่มีทางลาด';
    case 'drain_cover':
      return 'ฝาท่อชำรุด';
    case 'crosswalk':
      return 'ทางม้าลายอันตราย';
    default:
      return category || 'ปัญหาทางเท้า';
  }
}

export function thaiToSeverity(thai: string): 'low' | 'medium' | 'high' {
  switch (thai) {
    case 'ต่ำ':
      return 'low';
    case 'สูง':
      return 'high';
    case 'ปานกลาง':
    default:
      return 'medium';
  }
}

export function severityToThai(severity: string): 'ต่ำ' | 'ปานกลาง' | 'สูง' {
  switch (severity) {
    case 'low':
      return 'ต่ำ';
    case 'high':
      return 'สูง';
    case 'medium':
    default:
      return 'ปานกลาง';
  }
}

export function statusToThai(status?: string): string {
  switch (status) {
    case 'submitted':
      return 'ส่งแล้ว';
    case 'triaged':
      return 'ตรวจสอบแล้ว (AI)';
    case 'in_progress':
      return 'กำลังแก้ไข';
    case 'resolved':
      return 'แก้ไขเสร็จแล้ว';
    case 'rejected':
      return 'ยกเลิก/ไม่พบปัญหา';
    default:
      return status ? `สถานะ: ${status}` : 'ส่งแล้ว';
  }
}
