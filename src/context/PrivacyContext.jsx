import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'sp_admin_amounts_hidden';
const PrivacyContext = createContext({ amountsHidden: false, toggleAmountsHidden: () => {} });

export function PrivacyProvider({ children }) {
  const [amountsHidden, setAmountsHidden] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) === '1'; } catch { return false; }
  });

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, amountsHidden ? '1' : '0'); } catch {}
  }, [amountsHidden]);

  const toggleAmountsHidden = useCallback(() => setAmountsHidden(v => !v), []);

  return (
    <PrivacyContext.Provider value={{ amountsHidden, toggleAmountsHidden }}>
      {children}
    </PrivacyContext.Provider>
  );
}

export function useAmountsHidden() {
  return useContext(PrivacyContext);
}
