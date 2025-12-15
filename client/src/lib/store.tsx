import React, { createContext, useContext, useState, ReactNode } from 'react';

// Simple global state for active investigation
interface AppContextType {
  activeInvestigationId: string | null;
  setActiveInvestigationId: (id: string | null) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [activeInvestigationId, setActiveInvestigationId] = useState<string | null>(null);

  return (
    <AppContext.Provider
      value={{
        activeInvestigationId,
        setActiveInvestigationId,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}
