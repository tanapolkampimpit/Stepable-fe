import { createContext, useContext } from 'react';
import type { UserPreferences } from './types';

export const FontScaleContext = createContext<UserPreferences['fontScale']>(1);

export function useFontScale() {
  return useContext(FontScaleContext);
}
