import { createContext, type ReactNode, useContext, useMemo, useState } from 'react';

type BottomNavigationContextValue = {
  compact: boolean;
  setCompact: (compact: boolean) => void;
};

const BottomNavigationContext = createContext<BottomNavigationContextValue | null>(null);

export function BottomNavigationProvider({ children }: { children: ReactNode }) {
  const [compact, setCompact] = useState(false);
  const value = useMemo(() => ({ compact, setCompact }), [compact]);

  return <BottomNavigationContext.Provider value={value}>{children}</BottomNavigationContext.Provider>;
}

export function useBottomNavigation() {
  const context = useContext(BottomNavigationContext);

  if (!context) {
    throw new Error('useBottomNavigation must be used inside BottomNavigationProvider');
  }

  return context;
}
