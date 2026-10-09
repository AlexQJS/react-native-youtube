import { useCallback, useEffect, useState } from 'react';
import { useColorScheme } from 'react-native';
import { config, ThemeColors } from '../config/config';
import { storage, ThemeMode } from '../services/storage';

export interface UseThemeColorsReturn {
  colors: ThemeColors;
  isDark: boolean;
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => Promise<void>;
  toggleTheme: () => Promise<void>;
}

/**
 * Devuelve la paleta de colores activa según la preferencia guardada por el usuario
 * (light / dark) o el modo del sistema / por defecto, leyendo los tokens desde src/config/config.ts.
 */
export function useThemeColors(): UseThemeColorsReturn {
  const systemScheme = useColorScheme();
  const [userMode, setUserMode] = useState<ThemeMode | null>(() =>
    storage.getSyncThemeMode()
  );

  useEffect(() => {
    let mounted = true;

    const currentSync = storage.getSyncThemeMode();
    if (currentSync && currentSync !== userMode) {
      setUserMode(currentSync);
    }

    if (!storage.isThemeLoaded()) {
      storage.getThemeMode().catch(() => {});
    }

    const unsubscribe = storage.subscribeThemeMode((nextMode) => {
      if (mounted) {
        setUserMode(nextMode);
      }
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [userMode]);

  const fallbackMode: ThemeMode =
    systemScheme === 'light' || systemScheme === 'dark'
      ? systemScheme
      : config.theme.defaultMode;

  const activeMode: ThemeMode = userMode ?? fallbackMode;

  const setThemeMode = useCallback(async (mode: ThemeMode) => {
    setUserMode(mode);
    await storage.saveThemeMode(mode);
  }, []);

  const toggleTheme = useCallback(async () => {
    const nextMode: ThemeMode = activeMode === 'dark' ? 'light' : 'dark';
    setUserMode(nextMode);
    await storage.saveThemeMode(nextMode);
  }, [activeMode]);

  return {
    colors: config.theme.schemes[activeMode],
    isDark: activeMode === 'dark',
    themeMode: activeMode,
    setThemeMode,
    toggleTheme,
  };
}
