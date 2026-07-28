import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

export type Theme = 'dark' | 'light';

const STORAGE_KEY = 'client-requests.theme';

type ThemeContextValue = {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readStoredTheme(): Theme | null {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === 'dark' || stored === 'light' ? stored : null;
}

function systemTheme(): Theme {
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  /**
   * Initialised from the same sources the inline script in index.html used, so
   * React's first render agrees with the DOM the browser already painted. Getting
   * this wrong is what produces the flash of the wrong theme on every load.
   */
  const [theme, setThemeState] = useState<Theme>(() => readStoredTheme() ?? systemTheme());

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  /**
   * Follow the OS while the user has not made an explicit choice. Once they pick
   * a theme, their choice is stored and the system stops overriding it — changing
   * someone's theme out from under them at sunset is not a feature.
   */
  useEffect(() => {
    if (readStoredTheme()) return;

    const query = window.matchMedia('(prefers-color-scheme: light)');
    const onChange = (event: MediaQueryListEvent) => setThemeState(event.matches ? 'light' : 'dark');

    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  const setTheme = useCallback((next: Theme) => {
    localStorage.setItem(STORAGE_KEY, next);
    setThemeState(next);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((current) => {
      const next = current === 'dark' ? 'light' : 'dark';
      localStorage.setItem(STORAGE_KEY, next);
      return next;
    });
  }, []);

  const value = useMemo(() => ({ theme, toggleTheme, setTheme }), [theme, toggleTheme, setTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used inside a ThemeProvider.');
  }
  return context;
}
