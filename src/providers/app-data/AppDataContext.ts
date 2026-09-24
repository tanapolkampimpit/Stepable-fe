import { createContext } from 'react';
import type { AppDataValue } from './types';

export const AppDataContext = createContext<AppDataValue | null>(null);
