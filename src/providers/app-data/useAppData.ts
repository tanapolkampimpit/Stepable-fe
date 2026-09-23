import { useContext } from 'react';
import { AppDataContext } from './AppDataContext';

export function useAppData() {
  const value = useContext(AppDataContext);
  if (!value) throw new Error('useAppData must be used inside AppDataProvider');
  return value;
}
