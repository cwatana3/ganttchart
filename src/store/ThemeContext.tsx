import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

interface ThemeContextValue {
  light: boolean;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({ light: false, toggle: () => {} });

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [light, setLight] = useState(() => {
    try {
      return localStorage.getItem('gannt-theme') === 'light';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', light ? 'light' : 'dark');
    try {
      localStorage.setItem('gannt-theme', light ? 'light' : 'dark');
    } catch {}
  }, [light]);

  const toggle = () => setLight(!light);

  return (
    <ThemeContext.Provider value={{ light, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
