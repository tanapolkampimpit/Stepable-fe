import type { IssueType, Severity } from '../../i18n/reports';
import type { Dispatch, SetStateAction } from 'react';
import type { Coordinates, WalkingRoute } from '../../services/geo';

export type UserPreferences = {
  safeFirst: boolean;
  avoidSteps: boolean;
  wheelchair: boolean;
  avoidDark: boolean;
  voiceNavigation: boolean;
  vibration: boolean;
  fontScale: 0.9 | 1 | 1.15 | 1.3;
};

export type SavedPlace = {
  id: string;
  label: string;
  coordinates: Coordinates;
};

export type LocalReport = {
  id: string;
  type: IssueType;
  severity: Severity;
  description: string;
  coordinates: Coordinates;
  createdAt: string;
  imageUri?: string;
  status?: string;
};

export type CurrentLocation = Coordinates & { accuracy: number | null };

export type CurrentWeather = {
  temperature: number;
  code: number;
  humidity?: number;
  timezone: string;
  condition?: string;
  advisory?: string;
  isSafeForWalking?: boolean;
};

export type NavigationPlan = {
  destination: SavedPlace;
  origin: Coordinates;
  route: WalkingRoute;
  routePreference: string;
};

export type AppDataValue = {
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
  refreshReports: () => Promise<void>;
  addReport: (report: Omit<LocalReport, 'id' | 'createdAt'>) => Promise<void>;
  navigationPlan: NavigationPlan | null;
  setNavigationPlan: Dispatch<SetStateAction<NavigationPlan | null>>;
};
