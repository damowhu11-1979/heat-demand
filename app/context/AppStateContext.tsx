'use client';
import React, { createContext, useContext, useState } from 'react';

type AppStateContextType = {
  clearAllData: () => void;
};

const AppStateContext = createContext<AppStateContextType | undefined>(undefined);

export const AppStateProvider = ({ children }: { children: React.ReactNode }) => {
  const [refreshKey, setRefreshKey] = useState(0); // Used to reset state

  const clearAllData = () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('mcs.property');
    }
    setRefreshKey((prev) => prev + 1); // Triggers re-mounts of consumers
  };

  return (
    <AppStateContext.Provider value={{ clearAllData }}>
      <div key={refreshKey}>{children}</div>
    </AppStateContext.Provider>
  );
};

export const useAppState = () => {
  const context = useContext(AppStateContext);
  if (!context) {
    throw new Error('useAppState must be used within AppStateProvider');
  }
  return context;
};
