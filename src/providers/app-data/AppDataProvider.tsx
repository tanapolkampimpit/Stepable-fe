import { migrateReports } from '../../i18n/reports';
import { t, useLanguage, useMessageState, message } from '../../i18n';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import * as Location from 'expo-location';
import { distanceMeters, reverseGeocodeOsm, type Coordinates } from '../../services/geo';
import { fetchCurrentWeather, fetchReports, categoryToThai, severityToThai } from '../../services/api';
import { AppDataContext } from './AppDataContext';
import { DEFAULT_PREFERENCES, STORAGE_KEYS } from './constants';
import type {
  AppDataValue,
  CurrentLocation,
  CurrentWeather,
  LocalReport,
  NavigationPlan,
  SavedPlace,
  UserPreferences,
} from './types';

export function AppDataProvider({ children }: { children: ReactNode }) {
  const { language } = useLanguage();
  const [location, setLocation] = useState<CurrentLocation | null>(null);
  const [placeLabel, setPlaceLabel] = useState(t('location.locationUnavailable'));
  const [locationStatus, setLocationStatus] = useState<AppDataValue['locationStatus']>('loading');
  const [locationMessage, setLocationMessage] = useMessageState(message('location.requestingYourDeviceLocation'));
  const [isLocating, setIsLocating] = useState(false);
  const [weather, setWeather] = useState<CurrentWeather | null>(null);
  const [weatherMessage, setWeatherMessage] = useMessageState(message('location.loadingWeatherForYourLocation'));
  const [timeNow, setTimeNow] = useState(0);
  const [preferences, setPreferences] = useState(DEFAULT_PREFERENCES);
  const [savedPlaces, setSavedPlaces] = useState<SavedPlace[]>([]);
  const [reports, setReports] = useState<LocalReport[]>([]);
  const reportsRef = useRef<LocalReport[]>([]);
  const [navigationPlan, setNavigationPlan] = useState<NavigationPlan | null>(null);
  const [storageReady, setStorageReady] = useState(false);
  const locationSubscription = useRef<Location.LocationSubscription | null>(null);
  const lastReverseGeocode = useRef<(Coordinates & { language: string }) | null>(null);
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
    // Keep enough GPS resolution for turn-by-turn distance cues. The watcher
    // still controls the normal/navigation update cadence below.
    setLocation((previous) => previous && distanceMeters(previous, updated) < 5 ? previous : updated);
    setLocationStatus('granted');
    setLocationMessage(message('location.locationUpdatedFromDeviceGps'));
  }, [setLocationMessage]);

  const refreshLocation = useCallback(async () => {
    setIsLocating(true);
    setLocationMessage(message('location.gettingYourDeviceLocation'));
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        setLocationStatus('denied');
        setLocationMessage(message('location.allowLocationAccessWhileUsingTheApp'));
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
      setLocationMessage(message('location.couldNotReadLocationEnableGpsAnd'));
      return null;
    } finally {
      setIsLocating(false);
    }
  }, [applyLocation, setLocationMessage]);

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
        accuracy: navigationPlan ? Location.LocationAccuracy.High : Location.LocationAccuracy.Balanced,
        distanceInterval: navigationPlan ? 5 : 20,
        timeInterval: navigationPlan ? 3_000 : 8_000,
      },
      applyLocation,
      () => setLocationMessage(message('location.liveLocationPausedShowingTheLastKnown')),
    ).then((subscription) => {
      if (cancelled) subscription.remove();
      else locationSubscription.current = subscription;
    }).catch(() => setLocationMessage(message('location.liveLocationUnavailableShowingTheLastKnown')));

    return () => {
      cancelled = true;
      locationSubscription.current?.remove();
      locationSubscription.current = null;
    };
  }, [applyLocation, locationStatus, navigationPlan, setLocationMessage]);

  useEffect(() => {
    const initialTime = setTimeout(() => setTimeNow(Date.now()), 0);
    const timer = setInterval(() => setTimeNow(Date.now()), 30_000);
    return () => { clearTimeout(initialTime); clearInterval(timer); };
  }, []);

  useEffect(() => {
    if (!location) return;
    const last = lastReverseGeocode.current;
    if (last && last.language === language && distanceMeters(last, location) < 250) return;
    let cancelled = false;
    const requestedAt = { latitude: location.latitude, longitude: location.longitude };
    lastReverseGeocode.current = { ...requestedAt, language };
    void reverseGeocodeOsm(location).then((place) => {
      if (!cancelled && place) setPlaceLabel(place);
      else if (!cancelled) setPlaceLabel(`${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}`);
    }).catch(() => {
      if (!cancelled) setPlaceLabel(`${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}`);
    });
    return () => { cancelled = true; };
  }, [location, language]);

  useEffect(() => {
    if (!location) return;
    const last = lastWeatherFetch.current;
    const movedFarEnough = !last || distanceMeters(last.coordinates, location) >= 1_500;
    const expired = !last || Date.now() - last.timestamp > 15 * 60_000;
    if (!movedFarEnough && !expired) return;
    const coordinates = { latitude: location.latitude, longitude: location.longitude };
    let cancelled = false;
    lastWeatherFetch.current = { coordinates, timestamp: Date.now() };
    setWeatherMessage(message('location.updatingWeatherForYourLocation'));
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
    setWeatherMessage('กำลังอัปเดตสภาพอากาศจาก StepAble API');

    // Try StepAble Backend API first
    void fetchCurrentWeather(coordinates.latitude, coordinates.longitude)
      .then((data) => {
        if (cancelled) return;
        setWeather({
          temperature: data.temperatureC,
          code: data.weatherCode,
          humidity: data.relativeHumidity,
          timezone: 'Asia/Bangkok',
          condition: data.weatherCondition,
          advisory: data.advisory ?? undefined,
          isSafeForWalking: data.isSafeForWalking,
        });
        setWeatherMessage(message('location.latestOpenMeteoWeatherForYourLocation'));
      }
    }).catch(() => {
      if (!cancelled) setWeatherMessage(message('location.couldNotLoadWeatherCheckYourConnection'));
    });
        setWeatherMessage(data.advisory || `สภาพอากาศ: ${data.weatherCondition}`);
      })
      .catch(() => {
        // Fallback to Open-Meteo if backend weather is unavailable
        const url = new URL('https://api.open-meteo.com/v1/forecast');
        url.search = new URLSearchParams({
          latitude: String(coordinates.latitude),
          longitude: String(coordinates.longitude),
          current: 'temperature_2m,weather_code,relative_humidity_2m',
          timezone: 'auto',
        }).toString();
        void fetch(url.toString())
          .then(async (response) => {
            if (!response.ok) throw new Error('Weather service unavailable');
            const data = (await response.json()) as {
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
              setWeatherMessage('สภาพอากาศตามพิกัดปัจจุบัน');
            }
          })
          .catch(() => {
            if (!cancelled) setWeatherMessage('โหลดอากาศไม่ได้ แตะเพื่อลองใหม่');
          });
      });

    return () => { cancelled = true; };
  }, [location, timeNow, setWeatherMessage]);

  const refreshReports = useCallback(async () => {
    try {
      const serverReports = await fetchReports({ limit: 100 });
      const mappedServerReports: LocalReport[] = serverReports.map((item) => ({
        id: item.id,
        type: categoryToThai(item.category),
        severity: severityToThai(item.severity),
        description: item.description || item.title || '',
        coordinates: { latitude: item.latitude, longitude: item.longitude },
        createdAt: item.createdAt,
        imageUri: item.photoUrl || undefined,
        status: item.status,
      }));

      // Combine with local unsynced reports by ID deduplication
      const existing = reportsRef.current;
      const combined = [...mappedServerReports];
      for (const loc of existing) {
        if (!combined.some((c) => c.id === loc.id)) {
          combined.push(loc);
        }
      }
      reportsRef.current = combined;
      setReports(combined);
      await AsyncStorage.setItem(STORAGE_KEYS.reports, JSON.stringify(combined)).catch(() => undefined);
    } catch {
      // Keep existing local reports if backend is offline
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      AsyncStorage.getItem(STORAGE_KEYS.preferences),
      AsyncStorage.getItem(STORAGE_KEYS.savedPlaces),
      AsyncStorage.getItem(STORAGE_KEYS.reports),
    ]).then(([storedPreferences, storedSaved, storedReports]) => {
      if (cancelled) return;
      if (storedPreferences) setPreferences({ ...DEFAULT_PREFERENCES, ...JSON.parse(storedPreferences) as Partial<UserPreferences> });
      if (storedSaved) setSavedPlaces(JSON.parse(storedSaved) as SavedPlace[]);
      if (storedReports) {
        const parsedReports = migrateReports(JSON.parse(storedReports));
        reportsRef.current = parsedReports;
        setReports(parsedReports);
      }
      setStorageReady(true);
      // Fetch latest reports from StepAble backend
      void refreshReports();
    }).catch(() => setStorageReady(true));
    return () => { cancelled = true; };
  }, [refreshReports]);

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
    refreshReports,
    addReport,
    navigationPlan,
    setNavigationPlan,
  }), [
    location, placeLabel, locationStatus, locationMessage, isLocating, refreshLocation,
    weather, weatherMessage, refreshWeather, timeNow, preferences, updatePreferences, savedPlaces,
    savePlace, removeSavedPlace, reports, refreshReports, addReport, navigationPlan,
  ]);

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}
