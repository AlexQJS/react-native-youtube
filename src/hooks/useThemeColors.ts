import { useColorScheme } from 'react-native';
import { config, ThemeColors } from '../config/config';

/**
 * Devuelve la paleta de colores activa según el modo claro/oscuro del sistema,
 * leyendo todos los tokens desde src/config/config.ts.
 */
export function useThemeColors(): { colors: ThemeColors; isDark: boolean } {
  const systemScheme = useColorScheme();
  const mode =
    systemScheme === 'light' || systemScheme === 'dark'
      ? systemScheme
      : config.theme.defaultMode;

  return {
    colors: config.theme.schemes[mode],
    isDark: mode === 'dark',
  };
}
