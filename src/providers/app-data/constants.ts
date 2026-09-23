import type { UserPreferences } from './types';

export const STORAGE_KEYS = {
  preferences: '@stepable/preferences',
  savedPlaces: '@stepable/saved-places',
  reports: '@stepable/reports',
} as const;

export const DEFAULT_PREFERENCES: UserPreferences = {
  safeFirst: true,
  avoidSteps: true,
  wheelchair: false,
  avoidDark: true,
  voiceNavigation: true,
  vibration: true,
  fontScale: 1,
};
