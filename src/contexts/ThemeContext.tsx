import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react';
import { useMediaQuery } from '@mui/material';

/** Valid theme mode values stored in localStorage. */
export type ThemeMode = 'light' | 'dark' | 'system';

/** Resolved mode (never 'system') used for MUI theme creation. */
export type ResolvedMode = 'light' | 'dark';

/** Shape of the theme context value exposed to consumers. */
interface ThemeContextValue {
  /** The user-selected mode (may be 'system'). */
  mode: ThemeMode;
  /** The resolved mode after evaluating 'system' against OS preference. */
  resolvedMode: ResolvedMode;
  /** Update the theme mode and persist to localStorage. */
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  mode: 'system',
  resolvedMode: 'light',
  setMode: () => {
    /* no-op default */
  },
});

/** Hook to access the current theme mode and setter. */
export function useThemeMode(): ThemeContextValue {
  return useContext(ThemeContext);
}

const THEME_STORAGE_KEY = 'theme';

/**
 * Read the persisted theme mode from localStorage.
 * Falls back to 'system' if nothing is stored or the value is invalid.
 */
function readStoredTheme(): ThemeMode {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') {
      return stored;
    }
  } catch {
    /* localStorage unavailable (SSR / tests) — fall through */
  }
  return 'system';
}

/**
 * Theme context provider.
 *
 * Wraps the application to provide a global theme mode that persists
 * to localStorage and reacts to the OS-level color scheme preference
 * when set to 'system'.
 */
export function ThemeContextProvider({ children }: { children: ReactNode }) {
  const prefersDark: boolean = useMediaQuery('(prefers-color-scheme: dark)');

  const [mode, setModeState] = useState<ThemeMode>(readStoredTheme);

  /* Keep state in sync with localStorage changes from other tabs. */
  useEffect(() => {
    const handleStorage = (e: StorageEvent): void => {
      if (e.key === THEME_STORAGE_KEY && e.newValue) {
        if (
          e.newValue === 'light' ||
          e.newValue === 'dark' ||
          e.newValue === 'system'
        ) {
          setModeState(e.newValue);
        }
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  /* Listen for OS preference changes (only relevant in 'system' mode). */
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (): void => {
      /* Re-render is automatic via useMediaQuery — no extra state needed */
    };
    mq.addEventListener('change', handleChange);
    return () => mq.removeEventListener('change', handleChange);
  }, []);

  const resolvedMode: ResolvedMode =
    mode === 'system' ? (prefersDark ? 'dark' : 'light') : mode;

  const setMode = useCallback((newMode: ThemeMode): void => {
    setModeState(newMode);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, newMode);
    } catch {
      /* Silently ignore storage errors */
    }
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ mode, resolvedMode, setMode }),
    [mode, resolvedMode, setMode],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}
