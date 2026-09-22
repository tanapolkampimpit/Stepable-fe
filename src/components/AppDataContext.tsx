import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import * as Location from 'expo-location';
import { distanceMeters, reverseGeocodeOsm, type Coordinates, type WalkingRoute } from '../services/geo';

const STORAGE_KEYS = {
  preferences: '@stepable/preferences',
  savedPlaces: '@stepable/saved-places',
  reports: '@stepable/reports',
};

export type UserPreferences = {
  safeFirst: boolean;
  avoidSteps: boolean;
  wheelchair: boolean;
  avoidDark: boolean;
  voiceNavigation: boolean;
  vibration: boolean;
  fontScale: 0.9 | 1 | 1.15 | 1.3;
};

export type SavedPlace = { id: string; label: string; coordinates: Coordinates };
export type LocalReport = {
  id: string;
  type: string;
  severity: 'ต่ำ' | 'ปานกลาง' | 'สูง';
  description: string;
  coordinates: Coordinates;
  createdAt: string;
  imageUri?: string;
};
export type CurrentLocation = Coordinates & { accuracy: number | null };
export type CurrentWeather = { temperature: number; code: number; humidity?: number; timezone: string };
export type NavigationPlan = { destination: SavedPlace; origin: Coordinates; route: WalkingRoute; routePreference: string };

const defaultPreferences: UserPreferences = {
  safeFirst: true,
  avoidSteps: true,
  wheelchair: false,
  avoidDark: true,
  voiceNavigation: true,
  vibration: true,
  fontScale: 1,
};

type AppDataValue = {
  location: CurrentLocation | null;
  placeLabel: string;
  locationStatus: 'loading' | 'granted' | 'denied' | 'error' | 'unknown';
  locationMessage: string;
  isLocating: boolean;
  refreshLocation: () => Promise<Coordinates | null>;
  weather: CurrentWeather | null;
  weatherMessage: string;
  refreshWeather: () => void;
  timeNow: number;
  preferences: UserPreferences;
  updatePreferences: (update: Partial<UserPreferences>) => void;
  savedPlaces: SavedPlace[];
  savePlace: (place: SavedPlace) => Promise<void>;
  removeSavedPlace: (id: string) => Promise<void>;
  reports: LocalReport[];
  addReport: (report: Omit<LocalReport, 'id' | 'createdAt'>) => Promise<void>;
  navigationPlan: NavigationPlan | null;
  setNavigationPlan: (plan: NavigationPlan | null) => void;
};

const AppDataContext = createContext<AppDataValue | null>(null);

export function AppDataProvider({ children }: { children: ReactNode }) {
  const [location, setLocation] = useState<CurrentLocation | null>(null);
  const [placeLabel, setPlaceLabel] = useState('ตำแหน่งยังไม่พร้อม');
  const [locationStatus, setLocationStatus] = useState<AppDataValue['locationStatus']>('loading');
  const [locationMessage, setLocationMessage] = useState('กำลังขอตำแหน่งปัจจุบันจากอุปกรณ์');
  const [isLocating, setIsLocating] = useState(false);
  const [weather, setWeather] = useState<CurrentWeather | null>(null);
  const [weatherMessage, setWeatherMessage] = useState('กำลังโหลดอากาศตามตำแหน่งจริง');
  const [timeNow, setTimeNow] = useState(0);
  const [preferences, setPreferences] = useState(defaultPreferences);
  const [savedPlaces, setSavedPlaces] = useState<SavedPlace[]>([]);
  const [reports, setReports] = useState<LocalReport[]>([]);
  const reportsRef = useRef<LocalReport[]>([]);
  const [navigationPlan, setNavigationPlan] = useState<NavigationPlan | null>(null);
  const [storageReady, setStorageReady] = useState(false);
  const locationSubscription = useRef<Location.LocationSubscription | null>(null);
  const lastReverseGeocode = useRef<Coordinates | null>(null);
  const lastWeatherFetch = useRef<{ coordinates: Coordinates; timestamp: number } | null>(null);

  const refreshWeather = useCallback(() => {
    lastWeatherFetch.current = null;
    setTimeNow(Date.now());
  }, []);

  const applyLocation = useCallback((next: Location.LocationObject) => {
    const updated: CurrentLocation = {
      latitude: next.coords.latitude,
      longitude: next.coords.longitude,
      accuracy: next.coords.accuracy,
    };
    setLocation((previous) => previous && distanceMeters(previous, updated) < 15 ? previous : updated);
    setLocationStatus('granted');
    setLocationMessage('ตำแหน่งอัปเดตจาก GPS ของอุปกรณ์');
  }, []);

  const refreshLocation = useCallback(async () => {
    setIsLocating(true);
    setLocationMessage('กำลังหาตำแหน่งจริงจากอุปกรณ์');
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        setLocationStatus('denied');
        setLocationMessage('ต้องอนุญาตตำแหน่งขณะใช้แอป จึงจะแสดงตำแหน่งจริงได้');
        return null;
      }

      setLocationStatus('granted');
      const lastKnown = await Location.getLastKnownPositionAsync({ maxAge: 60_000 });
      if (lastKnown) applyLocation(lastKnown);
      const current = await Location.getCurrentPositionAsync({ accuracy: Location.LocationAccuracy.Balanced });
      applyLocation(current);
      return { latitude: current.coords.latitude, longitude: current.coords.longitude };
    } catch {
      setLocationStatus('error');
      setLocationMessage('อ่านตำแหน่งไม่ได้ ตรวจสอบว่าเปิด Location/GPS แล้วลองอีกครั้ง');
      return null;
    } finally {
      setIsLocating(false);
    }
  }, [applyLocation]);

  useEffect(() => {
    let disposed = false;
    const startForegroundLocation = async () => {
      const permission = await Location.getForegroundPermissionsAsync();
      if (disposed) return;
      if (permission.status === 'granted') {
        setLocationStatus('granted');
        void refreshLocation();
      } else {
        void refreshLocation();
      }
    };
    void startForegroundLocation();
    return () => {
      disposed = true;
      locationSubscription.current?.remove();
      locationSubscription.current = null;
    };
  }, [refreshLocation]);

  useEffect(() => {
    if (locationStatus !== 'granted' || locationSubscription.current) return;
    let cancelled = false;
    void Location.watchPositionAsync(
      {
        accuracy: Location.LocationAccuracy.Balanced,
        distanceInterval: 20,
        timeInterval: 8_000,
      },
      applyLocation,
      () => setLocationMessage('ตำแหน่งสดหยุดชั่วคราว ระบบจะแสดงตำแหน่งล่าสุดที่อ่านได้'),
    ).then((subscription) => {
      if (cancelled) subscription.remove();
      else locationSubscription.current = subscription;
    }).catch(() => setLocationMessage('ตำแหน่งสดใช้ไม่ได้ แสดงตำแหน่งล่าสุดที่อ่านได้'));

    return () => {
      cancelled = true;
      locationSubscription.current?.remove();
      locationSubscription.current = null;
    };
  }, [applyLocation, locationStatus]);

  useEffect(() => {
    const initialTime = setTimeout(() => setTimeNow(Date.now()), 0);
    const timer = setInterval(() => setTimeNow(Date.now()), 30_000);
    return () => { clearTimeout(initialTime); clearInterval(timer); };
  }, []);

  useEffect(() => {
    if (!location) return;
    const last = lastReverseGeocode.current;
    if (last && distanceMeters(last, location) < 250) return;
    let cancelled = false;
    const requestedAt = { latitude: location.latitude, longitude: location.longitude };
    lastReverseGeocode.current = requestedAt;
    void reverseGeocodeOsm(location).then((place) => {
      if (!cancelled && place) setPlaceLabel(place);
      else if (!cancelled) setPlaceLabel(`${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}`);
    }).catch(() => {
      if (!cancelled) setPlaceLabel(`${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}`);
    });
    return () => { cancelled = true; };
  }, [location]);

  useEffect(() => {
    if (!location) return;
    const last = lastWeatherFetch.current;
    const movedFarEnough = !last || distanceMeters(last.coordinates, location) >= 1_500;
    const expired = !last || Date.now() - last.timestamp > 15 * 60_000;
    if (!movedFarEnough && !expired) return;
    const coordinates = { latitude: location.latitude, longitude: location.longitude };
    let cancelled = false;
    lastWeatherFetch.current = { coordinates, timestamp: Date.now() };
    setWeatherMessage('กำลังอัปเดตอากาศตามพิกัดจริง');
    const url = new URL('https://api.open-meteo.com/v1/forecast');
    url.search = new URLSearchParams({
      latitude: String(coordinates.latitude),
      longitude: String(coordinates.longitude),
      current: 'temperature_2m,weather_code,relative_humidity_2m',
      timezone: 'auto',
    }).toString();
    void fetch(url.toString()).then(async (response) => {
      if (!response.ok) throw new Error('Weather service unavailable');
      const data = await response.json() as {
        timezone?: string;
        current?: { temperature_2m?: number; weather_code?: number; relative_humidity_2m?: number };
      };
      if (!data.current || typeof data.current.temperature_2m !== 'number' || !data.timezone) {
        throw new Error('Invalid weather response');
      }
      if (!cancelled) {
        setWeather({
          temperature: data.current.temperature_2m,
          code: data.current.weather_code ?? 0,
          humidity: data.current.relative_humidity_2m,
          timezone: data.timezone,
        });
        setWeatherMessage('อากาศล่าสุดจาก Open-Meteo ตามพิกัดปัจจุบัน');
      }
    }).catch(() => {
      if (!cancelled) setWeatherMessage('โหลดอากาศไม่ได้ ตรวจอินเทอร์เน็ตแล้วแตะเพื่อโหลดใหม่');
    });
    return () => { cancelled = true; };
  }, [location, timeNow]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      AsyncStorage.getItem(STORAGE_KEYS.preferences),
      AsyncStorage.getItem(STORAGE_KEYS.savedPlaces),
      AsyncStorage.getItem(STORAGE_KEYS.reports),
    ]).then(([storedPreferences, storedSaved, storedReports]) => {
      if (cancelled) return;
      if (storedPreferences) setPreferences({ ...defaultPreferences, ...JSON.parse(storedPreferences) as Partial<UserPreferences> });
      if (storedSaved) setSavedPlaces(JSON.parse(storedSaved) as SavedPlace[]);
      if (storedReports) {
        const parsedReports = JSON.parse(storedReports) as LocalReport[];
        reportsRef.current = parsedReports;
        setReports(parsedReports);
      }
      setStorageReady(true);
    }).catch(() => setStorageReady(true));
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (storageReady) void AsyncStorage.setItem(STORAGE_KEYS.preferences, JSON.stringify(preferences));
  }, [preferences, storageReady]);
  useEffect(() => {
    if (storageReady) void AsyncStorage.setItem(STORAGE_KEYS.savedPlaces, JSON.stringify(savedPlaces));
  }, [savedPlaces, storageReady]);
  useEffect(() => {
    if (storageReady) void AsyncStorage.setItem(STORAGE_KEYS.reports, JSON.stringify(reports));
  }, [reports, storageReady]);

  const updatePreferences = useCallback((update: Partial<UserPreferences>) => {
    setPreferences((previous) => ({ ...previous, ...update }));
  }, []);
  const savePlace = useCallback(async (place: SavedPlace) => {
    setSavedPlaces((previous) => [...previous.filter((item) => item.id !== place.id), place]);
  }, []);
  const removeSavedPlace = useCallback(async (id: string) => {
    setSavedPlaces((previous) => previous.filter((item) => item.id !== id));
  }, []);
  const addReport = useCallback(async (report: Omit<LocalReport, 'id' | 'createdAt'>) => {
    const savedReport: LocalReport = { ...report, id: `${Date.now()}`, createdAt: new Date().toISOString() };
    const nextReports = [savedReport, ...reportsRef.current];
    reportsRef.current = nextReports;
    setReports(nextReports);
    await AsyncStorage.setItem(STORAGE_KEYS.reports, JSON.stringify(nextReports));
  }, []);

  const value = useMemo<AppDataValue>(() => ({
    location,
    placeLabel,
    locationStatus,
    locationMessage,
    isLocating,
    refreshLocation,
    weather,
    weatherMessage,
    refreshWeather,
    timeNow,
    preferences,
    updatePreferences,
    savedPlaces,
    savePlace,
    removeSavedPlace,
    reports,
    addReport,
    navigationPlan,
    setNavigationPlan,
  }), [
    location, placeLabel, locationStatus, locationMessage, isLocating, refreshLocation,
    weather, weatherMessage, refreshWeather, timeNow, preferences, updatePreferences, savedPlaces,
    savePlace, removeSavedPlace, reports, addReport, navigationPlan,
  ]);

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export function useAppData() {
  const value = useContext(AppDataContext);
  if (!value) throw new Error('useAppData must be used inside AppDataProvider');
  return value;
}
