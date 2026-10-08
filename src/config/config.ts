/**
 * Configuración centralizada de la aplicación.
 * Todos los colores, tipografías, tamaños, espaciados, tiempos de caché,
 * intervalos de reproducción, historial y parámetros de la API se definen aquí.
 */

const lightColors = {
  background: '#F8F9FA',
  surface: '#FFFFFF',
  surfaceElevated: '#F1F3F5',
  primary: '#FF0000',
  primaryLight: '#FFE5E5',
  text: '#0F0F0F',
  textSecondary: '#606060',
  textMuted: '#909090',
  border: '#E5E5E5',
  error: '#D93025',
  errorBackground: '#FCE8E6',
  warning: '#F29900',
  warningBackground: '#FEF7E0',
  success: '#1E8E3E',
  progressTrack: 'rgba(0, 0, 0, 0.25)',
  progressFill: '#FF0000',
  skeleton: '#E2E5E7',
  badgeBackground: 'rgba(0, 0, 0, 0.82)',
  badgeText: '#FFFFFF',
  overlay: 'rgba(0, 0, 0, 0.6)',
};

const darkColors: typeof lightColors = {
  background: '#0F0F0F',
  surface: '#1A1A1A',
  surfaceElevated: '#272727',
  primary: '#FF0000',
  primaryLight: 'rgba(255, 0, 0, 0.18)',
  text: '#F1F1F1',
  textSecondary: '#AAAAAA',
  textMuted: '#717171',
  border: '#2E2E2E',
  error: '#F28B82',
  errorBackground: 'rgba(217, 48, 37, 0.18)',
  warning: '#FDD663',
  warningBackground: 'rgba(242, 153, 0, 0.18)',
  success: '#81C995',
  progressTrack: 'rgba(0, 0, 0, 0.28)',
  progressFill: '#FF0000',
  skeleton: '#272727',
  badgeBackground: 'rgba(0, 0, 0, 0.85)',
  badgeText: '#FFFFFF',
  overlay: 'rgba(0, 0, 0, 0.75)',
};

export type ThemeColors = typeof darkColors;

export const config = {
  app: {
    name: 'Video Feed',
    version: '1.0.0',
  },

  splash: {
    brandName: 'Jelly Feed',
    tagline: 'Tus canales favoritos de YouTube',
    backgroundColor: '#32c5fa',
    accentColor: '#FFFFFF',
    textColor: '#FFFFFF',
    logoSize: 136,
    durationMs: 1300,
    fadeOutDurationMs: 350,
  },

  theme: {
    defaultMode: 'dark' as 'light' | 'dark',
    colors: darkColors,
    schemes: {
      light: lightColors,
      dark: darkColors,
    },
    typography: {
      fontFamily: {
        regular: 'System',
        medium: 'System',
        bold: 'System',
      },
      fontSizes: {
        xs: 11,
        sm: 13,
        md: 15,
        lg: 17,
        xl: 20,
        xxl: 24,
      },
      lineHeights: {
        xs: 15,
        sm: 18,
        md: 21,
        lg: 24,
        xl: 28,
        xxl: 32,
      },
      fontWeights: {
        regular: '400' as const,
        medium: '500' as const,
        semibold: '600' as const,
        bold: '700' as const,
      },
    },
    spacing: {
      xxs: 2,
      xs: 4,
      sm: 8,
      md: 12,
      lg: 16,
      xl: 24,
      xxl: 32,
    },
    radii: {
      xs: 4,
      sm: 8,
      md: 12,
      lg: 16,
      full: 9999,
    },
    sizes: {
      thumbnailAspectRatio: 16 / 9,
      shortsAspectRatio: 9 / 16,
      channelAvatarSm: 36,
      channelAvatarMd: 56,
      channelAvatarLg: 72,
      progressBarHeight: 4,
      playerProgressBarHeight: 6,
      miniPlayerHeight: 192,
      miniPlayerWidth: 248,
      miniPlayerVideoWidth: 248,
      miniPlayerButtonSize: 38,
      iconSm: 16,
      iconMd: 22,
      iconLg: 28,
      iconXl: 48,
      buttonHeight: 40,
      inputHeight: 46,
      tabBarHeight: 60,
      borderWidth: 1,
    },
  },

  playback: {
    /** Intervalo en segundos para guardar el progreso periódicamente */
    progressSaveInterval: 10,
    /** Segundos mínimos reproducidos para considerar que un vídeo ha comenzado */
    minSecondsToSave: 5,
    /** Porcentaje (0 a 1) a partir del cual se considera el vídeo como completado */
    completionRatioThreshold: 0.95,
    /** Margen en segundos antes del final para considerar el vídeo terminado */
    completionRemainingSeconds: 10,
    /** Opciones de tiempo para la funcionalidad Sleep Mode dentro del reproductor */
    sleepTimerOptions: [
      { id: '5m', label: '5 min', durationSeconds: 5 * 60 },
      { id: '15m', label: '15 min', durationSeconds: 15 * 60 },
      { id: '30m', label: '30 min', durationSeconds: 30 * 60 },
      { id: '1h', label: '1 h', durationSeconds: 60 * 60 },
      { id: '2h', label: '2 h', durationSeconds: 2 * 60 * 60 },
      {
        id: 'end_of_video',
        label: 'Hasta que termine el vídeo',
        durationSeconds: null,
      },
    ] as const,
  },

  feed: {
    /** Número máximo de vídeos mostrados en el Feed */
    maxVideos: 50,
    /** Número máximo de vídeos a solicitar por cada canal favorito */
    videosPerChannel: 15,
    /**
     * Activa o desactiva el filtrado de Shorts en el Feed:
     * - true: por defecto muestra solo vídeos normales y añade el botón de filtro "Shorts" al lado de "Todos".
     * - false: muestra todos los vídeos mezclados y oculta el botón "Shorts".
     */
    enableShortsFilter: true,
    /** Número de columnas para el layout en cuadrícula de la pestaña Shorts */
    shortsColumns: 2,
    /** Duración máxima (segundos) para clasificar un vídeo como Short cuando hay duración disponible */
    shortsMaxDurationSeconds: 60,
  },

  history: {
    /** Número máximo de vídeos almacenados y mostrados en la pestaña Historial */
    maxItems: 200,
  },

  search: {
    /** Tiempo de espera (ms) antes de lanzar búsqueda tras escribir */
    debounceMs: 400,
    /** Resultados máximos por búsqueda de canales */
    maxResults: 15,
    /** Resultados máximos por búsqueda de vídeos */
    maxVideoResults: 15,
    /** Longitud mínima del texto para ejecutar la búsqueda */
    minQueryLength: 2,
  },

  cache: {
    /** Duración de la caché del Feed en milisegundos (10 minutos) */
    feedTtlMs: 10 * 60 * 1000,
    /** Duración de la caché de detalles de vídeos en milisegundos (30 minutos) */
    videoDetailsTtlMs: 30 * 60 * 1000,
    /** Duración de la caché de canales en milisegundos (60 minutos) */
    channelTtlMs: 60 * 60 * 1000,
  },

  api: {
    baseUrl: 'https://www.googleapis.com/youtube/v3',
    rssFeedBaseUrl: 'https://www.youtube.com/feeds/videos.xml',
    embedHost: 'https://www.youtube-nocookie.com',
    embedOrigin: 'https://www.youtube-nocookie.com',
    apiKey: process.env.EXPO_PUBLIC_YOUTUBE_API_KEY ?? '',
    timeoutMs: 12000,
  },

  storageKeys: {
    favoriteChannels: '@yt_feed/favoriteChannels',
    playbackProgress: '@yt_feed/playbackProgress',
    watchHistory: '@yt_feed/watchHistory',
    feedCache: '@yt_feed/feedCache_v3',
    videoDetailsCache: '@yt_feed/videoDetailsCache_v3',
    customApiKey: '@yt_feed/customApiKey',
  },
};

export type AppConfig = typeof config;
