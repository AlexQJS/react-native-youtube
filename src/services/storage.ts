import AsyncStorage from '@react-native-async-storage/async-storage';
import { config } from '../config/config';
import {
  CacheEntry,
  FavoriteChannel,
  PlaybackProgressEntry,
  PlaybackProgressMap,
  VideoItem,
  WatchHistoryItem,
} from '../types/youtube';
import { isVideoCompleted, shouldSaveProgress } from '../utils/format';

type FavoritesListener = (favorites: FavoriteChannel[]) => void;
type ProgressListener = (progress: PlaybackProgressMap) => void;
type HistoryListener = (history: WatchHistoryItem[]) => void;

const favoritesListeners = new Set<FavoritesListener>();
const progressListeners = new Set<ProgressListener>();
const historyListeners = new Set<HistoryListener>();

let memoryFavorites: FavoriteChannel[] | null = null;
let memoryProgress: PlaybackProgressMap | null = null;
let memoryHistory: WatchHistoryItem[] | null = null;

function notifyFavorites(favorites: FavoriteChannel[]) {
  favoritesListeners.forEach((listener) => {
    try {
      listener(favorites);
    } catch {
      // Evitar que un listener defectuoso rompa el flujo
    }
  });
}

function notifyProgress(progress: PlaybackProgressMap) {
  progressListeners.forEach((listener) => {
    try {
      listener(progress);
    } catch {
      // Evitar que un listener defectuoso rompa el flujo
    }
  });
}

function notifyHistory(history: WatchHistoryItem[]) {
  historyListeners.forEach((listener) => {
    try {
      listener(history);
    } catch {
      // Evitar que un listener defectuoso rompa el flujo
    }
  });
}

/**
 * Sanitiza un canal favorito para guardar únicamente los campos necesarios
 * definidos en la especificación.
 */
function sanitizeChannel(raw: unknown): FavoriteChannel | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const candidate = raw as Record<string, unknown>;
  const id = typeof candidate.id === 'string' ? candidate.id.trim() : '';
  const name = typeof candidate.name === 'string' ? candidate.name.trim() : '';
  const thumbnail = typeof candidate.thumbnail === 'string' ? candidate.thumbnail.trim() : '';
  const description =
    typeof candidate.description === 'string' && candidate.description.trim().length > 0
      ? candidate.description.trim()
      : undefined;
  const watchCountRaw = Number(candidate.watchCount);
  const watchCount =
    Number.isFinite(watchCountRaw) && watchCountRaw > 0
      ? Math.floor(watchCountRaw)
      : undefined;
  const lastWatchedAtRaw = Number(candidate.lastWatchedAt);
  const lastWatchedAt =
    Number.isFinite(lastWatchedAtRaw) && lastWatchedAtRaw > 0
      ? Math.floor(lastWatchedAtRaw)
      : undefined;

  if (!id || !name) {
    return null;
  }

  return {
    id,
    name,
    thumbnail,
    ...(description !== undefined ? { description } : {}),
    ...(watchCount !== undefined ? { watchCount } : {}),
    ...(lastWatchedAt !== undefined ? { lastWatchedAt } : {}),
  };
}

/**
 * Ordena los canales favoritos por frecuencia de visualización (mayor watchCount primero)
 * y, en caso de empate, por el visto más recientemente (mayor lastWatchedAt primero).
 */
function sortFavoritesByFrequency(channels: FavoriteChannel[]): FavoriteChannel[] {
  return [...channels].sort((a, b) => {
    const countDiff = (b.watchCount ?? 0) - (a.watchCount ?? 0);
    if (countDiff !== 0) {
      return countDiff;
    }
    return (b.lastWatchedAt ?? 0) - (a.lastWatchedAt ?? 0);
  });
}

/**
 * Sanitiza un mapa de progreso de reproducción descartando entradas corruptas.
 */
function sanitizeProgressMap(raw: unknown): PlaybackProgressMap {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {};
  }

  const result: PlaybackProgressMap = {};
  const entries = Object.entries(raw as Record<string, unknown>);

  for (const [videoId, value] of entries) {
    if (!videoId || !value || typeof value !== 'object' || Array.isArray(value)) {
      continue;
    }
    const entry = value as Record<string, unknown>;
    const position = Number(entry.position);
    const duration = Number(entry.duration);
    const updatedAt = Number(entry.updatedAt);

    if (
      Number.isFinite(position) &&
      position >= 0 &&
      Number.isFinite(duration) &&
      duration >= 0 &&
      Number.isFinite(updatedAt)
    ) {
      result[videoId] = {
        position: Math.floor(position),
        duration: Math.floor(duration),
        updatedAt,
        ...(typeof entry.completed === 'boolean' ? { completed: entry.completed } : {}),
      };
    }
  }

  return result;
}

function sanitizeHistoryList(raw: unknown): WatchHistoryItem[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const seen = new Set<string>();
  const result: WatchHistoryItem[] = [];

  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const candidate = item as Record<string, unknown>;
    const video = candidate.video as Record<string, unknown> | undefined;
    if (!video || typeof video !== 'object') continue;

    const id = typeof video.id === 'string' ? video.id.trim() : '';
    const title = typeof video.title === 'string' ? video.title.trim() : '';
    if (!id || !title || seen.has(id)) continue;

    seen.add(id);

    const watchedAt = Number(candidate.watchedAt);
    const position = Number(candidate.position);
    const duration = Number(candidate.duration);

    result.push({
      video: {
        id,
        title,
        thumbnail: typeof video.thumbnail === 'string' ? video.thumbnail : '',
        channelId: typeof video.channelId === 'string' ? video.channelId : '',
        channelTitle: typeof video.channelTitle === 'string' ? video.channelTitle : '',
        publishedAt: typeof video.publishedAt === 'string' ? video.publishedAt : '',
        ...(typeof video.description === 'string' ? { description: video.description } : {}),
        ...(typeof video.durationSeconds === 'number'
          ? { durationSeconds: video.durationSeconds }
          : {}),
        ...(typeof video.durationFormatted === 'string'
          ? { durationFormatted: video.durationFormatted }
          : {}),
        ...(typeof video.isShort === 'boolean' ? { isShort: video.isShort } : {}),
        ...(typeof video.viewCount === 'number' ? { viewCount: video.viewCount } : {}),
      },
      watchedAt: Number.isFinite(watchedAt) ? watchedAt : Date.now(),
      position: Number.isFinite(position) && position >= 0 ? Math.floor(position) : 0,
      duration: Number.isFinite(duration) && duration >= 0 ? Math.floor(duration) : 0,
      ...(typeof candidate.completed === 'boolean'
        ? { completed: candidate.completed }
        : {}),
    });
  }

  result.sort((a, b) => b.watchedAt - a.watchedAt);
  return result.slice(0, config.history.maxItems);
}

export const storage = {
  /**
   * Limpia la caché en memoria (útil para tests o reinicios de sesión).
   */
  resetMemoryCache(): void {
    memoryFavorites = null;
    memoryProgress = null;
    memoryHistory = null;
  },

  /**
   * Suscribe un callback a cambios en la lista de canales favoritos.
   */
  subscribeFavorites(listener: FavoritesListener): () => void {
    favoritesListeners.add(listener);
    return () => {
      favoritesListeners.delete(listener);
    };
  },

  /**
   * Suscribe un callback a cambios en el mapa de progreso de reproducción.
   */
  subscribeProgress(listener: ProgressListener): () => void {
    progressListeners.add(listener);
    return () => {
      progressListeners.delete(listener);
    };
  },

  /**
   * Suscribe un callback a cambios en el historial de reproducción.
   */
  subscribeHistory(listener: HistoryListener): () => void {
    historyListeners.add(listener);
    return () => {
      historyListeners.delete(listener);
    };
  },

  /**
   * Obtiene la lista de canales favoritos almacenados localmente.
   */
  async getFavorites(): Promise<FavoriteChannel[]> {
    if (memoryFavorites !== null) {
      return [...memoryFavorites];
    }

    try {
      const raw = await AsyncStorage.getItem(config.storageKeys.favoriteChannels);
      if (!raw) {
        memoryFavorites = [];
        return [];
      }

      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        await AsyncStorage.removeItem(config.storageKeys.favoriteChannels);
        memoryFavorites = [];
        return [];
      }

      const sanitized = sortFavoritesByFrequency(
        parsed
          .map(sanitizeChannel)
          .filter((item): item is FavoriteChannel => item !== null)
      );

      memoryFavorites = sanitized;
      return [...sanitized];
    } catch {
      try {
        await AsyncStorage.removeItem(config.storageKeys.favoriteChannels);
      } catch {
        // Ignorar fallo secundario
      }
      memoryFavorites = [];
      return [];
    }
  },

  /**
   * Guarda la lista de canales favoritos eliminando duplicados, campos innecesarios
   * y ordenando por frecuencia de visualización (los más vistos arriba).
   */
  async saveFavorites(channels: FavoriteChannel[]): Promise<void> {
    const seen = new Set<string>();
    const sanitized: FavoriteChannel[] = [];

    for (const channel of channels) {
      const clean = sanitizeChannel(channel);
      if (clean && !seen.has(clean.id)) {
        seen.add(clean.id);
        sanitized.push(clean);
      }
    }

    const sorted = sortFavoritesByFrequency(sanitized);
    memoryFavorites = sorted;
    await AsyncStorage.setItem(config.storageKeys.favoriteChannels, JSON.stringify(sorted));
    notifyFavorites([...sorted]);
  },

  /**
   * Añade un canal a favoritos si no existe aún.
   */
  async addFavorite(channel: FavoriteChannel): Promise<FavoriteChannel[]> {
    const current = await this.getFavorites();
    const clean = sanitizeChannel(channel);
    if (!clean) {
      return current;
    }

    const exists = current.some((c) => c.id === clean.id);
    if (exists) {
      return current;
    }

    const updated = [...current, clean];
    await this.saveFavorites(updated);
    return memoryFavorites ? [...memoryFavorites] : updated;
  },

  /**
   * Incrementa el contador de vídeos vistos de un canal suscrito y reordena la lista
   * de suscripciones para que los canales más frecuentes suban a la parte superior.
   */
  async incrementChannelWatch(
    channelId: string,
    channelTitle?: string,
    watchedAt: number = Date.now()
  ): Promise<FavoriteChannel[]> {
    const current = await this.getFavorites();
    if (current.length === 0) {
      return current;
    }

    const normalizedTitle = channelTitle?.trim().toLowerCase() ?? '';
    const idx = current.findIndex(
      (c) =>
        (channelId && c.id === channelId) ||
        (normalizedTitle.length > 0 && c.name.trim().toLowerCase() === normalizedTitle)
    );

    if (idx === -1) {
      return current;
    }

    const target = current[idx];
    const updatedChannel: FavoriteChannel = {
      ...target,
      watchCount: (target.watchCount ?? 0) + 1,
      lastWatchedAt: Math.max(target.lastWatchedAt ?? 0, watchedAt),
    };

    const nextList = [...current];
    nextList[idx] = updatedChannel;
    await this.saveFavorites(nextList);
    return memoryFavorites ? [...memoryFavorites] : nextList;
  },

  /**
   * Elimina un canal de favoritos por su ID.
   */
  async removeFavorite(channelId: string): Promise<FavoriteChannel[]> {
    const current = await this.getFavorites();
    const updated = current.filter((c) => c.id !== channelId);
    await this.saveFavorites(updated);
    return memoryFavorites ? [...memoryFavorites] : updated;
  },

  /**
   * Obtiene el mapa completo de progreso de reproducción.
   */
  async getPlaybackProgress(): Promise<PlaybackProgressMap> {
    if (memoryProgress !== null) {
      return { ...memoryProgress };
    }

    try {
      const raw = await AsyncStorage.getItem(config.storageKeys.playbackProgress);
      if (!raw) {
        memoryProgress = {};
        return {};
      }

      const parsed = JSON.parse(raw);
      const sanitized = sanitizeProgressMap(parsed);
      memoryProgress = sanitized;
      return { ...sanitized };
    } catch {
      try {
        await AsyncStorage.removeItem(config.storageKeys.playbackProgress);
      } catch {
        // Ignorar fallo secundario
      }
      memoryProgress = {};
      return {};
    }
  },

  /**
   * Guarda el mapa completo de progreso de reproducción.
   */
  async savePlaybackProgress(progressMap: PlaybackProgressMap): Promise<void> {
    const sanitized = sanitizeProgressMap(progressMap);
    memoryProgress = sanitized;
    await AsyncStorage.setItem(config.storageKeys.playbackProgress, JSON.stringify(sanitized));
    notifyProgress({ ...sanitized });
  },

  /**
   * Obtiene el progreso guardado para un vídeo específico.
   */
  async getVideoProgress(videoId: string): Promise<PlaybackProgressEntry | null> {
    if (!videoId) {
      return null;
    }
    const all = await this.getPlaybackProgress();
    return all[videoId] ?? null;
  },

  /**
   * Actualiza el progreso de un único vídeo aplicando las reglas de negocio
   * y sincroniza el minutaje en el Historial si el vídeo figura en él.
   */
  async updateVideoProgress(
    videoId: string,
    position: number,
    duration: number,
    timestamp: number = Date.now()
  ): Promise<PlaybackProgressEntry | null> {
    if (!videoId || !Number.isFinite(position) || position < 0) {
      return null;
    }

    const safeDuration = Number.isFinite(duration) && duration > 0 ? Math.floor(duration) : 0;
    const safePosition = Math.floor(
      safeDuration > 0 ? Math.min(position, safeDuration) : position
    );

    if (!shouldSaveProgress(safePosition)) {
      return null;
    }

    const completed = safeDuration > 0 ? isVideoCompleted(safePosition, safeDuration) : false;
    const entry: PlaybackProgressEntry = {
      position: completed && safeDuration > 0 ? safeDuration : safePosition,
      duration: safeDuration,
      updatedAt: timestamp,
      completed,
    };

    const currentMap = await this.getPlaybackProgress();
    const prev = currentMap[videoId];

    if (
      prev &&
      prev.position === entry.position &&
      prev.duration === entry.duration &&
      prev.completed === entry.completed
    ) {
      return entry;
    }

    const updatedMap: PlaybackProgressMap = {
      ...currentMap,
      [videoId]: entry,
    };

    await this.savePlaybackProgress(updatedMap);

    // Sincronizar también la entrada correspondiente en el Historial
    try {
      const history = await this.getWatchHistory();
      const idx = history.findIndex((h) => h.video.id === videoId);
      if (idx !== -1) {
        const updatedHistory = [...history];
        updatedHistory[idx] = {
          ...updatedHistory[idx],
          position: entry.position,
          duration: entry.duration > 0 ? entry.duration : updatedHistory[idx].duration,
          completed: entry.completed,
          watchedAt: timestamp,
        };
        await this.saveWatchHistory(updatedHistory);
      }
    } catch {
      // Ignorar fallo secundario en historial
    }

    return entry;
  },

  /**
   * Elimina o reinicia el progreso de un vídeo para empezar desde el principio.
   */
  async clearVideoProgress(videoId: string): Promise<void> {
    if (!videoId) {
      return;
    }
    const currentMap = await this.getPlaybackProgress();
    if (videoId in currentMap) {
      const nextMap = { ...currentMap };
      delete nextMap[videoId];
      await this.savePlaybackProgress(nextMap);
    }

    try {
      const history = await this.getWatchHistory();
      const idx = history.findIndex((h) => h.video.id === videoId);
      if (idx !== -1) {
        const updatedHistory = [...history];
        updatedHistory[idx] = {
          ...updatedHistory[idx],
          position: 0,
          completed: false,
        };
        await this.saveWatchHistory(updatedHistory);
      }
    } catch {
      // Ignorar
    }
  },

  /**
   * Obtiene el historial de vídeos reproducidos (máximo config.history.maxItems).
   */
  async getWatchHistory(): Promise<WatchHistoryItem[]> {
    if (memoryHistory !== null) {
      return [...memoryHistory];
    }

    try {
      const raw = await AsyncStorage.getItem(config.storageKeys.watchHistory);
      if (!raw) {
        memoryHistory = [];
        return [];
      }
      const parsed = JSON.parse(raw);
      const sanitized = sanitizeHistoryList(parsed);
      memoryHistory = sanitized;
      return [...sanitized];
    } catch {
      try {
        await AsyncStorage.removeItem(config.storageKeys.watchHistory);
      } catch {
        // Ignorar
      }
      memoryHistory = [];
      return [];
    }
  },

  /**
   * Guarda el historial de reproducción limitando al máximo configurado (p.ej. 200 vídeos).
   */
  async saveWatchHistory(items: WatchHistoryItem[]): Promise<void> {
    const sanitized = sanitizeHistoryList(items).slice(0, config.history.maxItems);
    memoryHistory = sanitized;
    await AsyncStorage.setItem(config.storageKeys.watchHistory, JSON.stringify(sanitized));
    notifyHistory([...sanitized]);
  },

  /**
   * Registra un vídeo en la parte superior del Historial al reproducirlo,
   * conservando o actualizando su minutaje, duración y datos del canal.
   */
  async recordVideoWatch(
    video: VideoItem,
    position?: number,
    duration?: number,
    watchedAt: number = Date.now()
  ): Promise<WatchHistoryItem[]> {
    if (!video || !video.id) {
      return await this.getWatchHistory();
    }

    const [currentHistory, savedProgress] = await Promise.all([
      this.getWatchHistory(),
      this.getVideoProgress(video.id),
    ]);

    const existingEntry = currentHistory.find((item) => item.video.id === video.id);

    const effectivePosition =
      position !== undefined && position > 0
        ? Math.floor(position)
        : savedProgress?.position ?? existingEntry?.position ?? 0;

    const effectiveDuration =
      duration !== undefined && duration > 0
        ? Math.floor(duration)
        : savedProgress?.duration ||
          video.durationSeconds ||
          existingEntry?.duration ||
          0;

    const completed =
      effectiveDuration > 0
        ? isVideoCompleted(effectivePosition, effectiveDuration)
        : Boolean(savedProgress?.completed ?? existingEntry?.completed);

    const mergedVideo: VideoItem = {
      ...existingEntry?.video,
      ...video,
    };

    const newItem: WatchHistoryItem = {
      video: mergedVideo,
      watchedAt,
      position: effectivePosition,
      duration: effectiveDuration,
      completed,
    };

    const filtered = currentHistory.filter((item) => item.video.id !== video.id);
    const updated = [newItem, ...filtered].slice(0, config.history.maxItems);

    await Promise.all([
      this.saveWatchHistory(updated),
      this.incrementChannelWatch(
        mergedVideo.channelId,
        mergedVideo.channelTitle,
        watchedAt
      ),
    ]);
    return updated;
  },

  /**
   * Elimina un vídeo individual del Historial.
   */
  async removeFromWatchHistory(videoId: string): Promise<WatchHistoryItem[]> {
    const current = await this.getWatchHistory();
    const updated = current.filter((item) => item.video.id !== videoId);
    await this.saveWatchHistory(updated);
    return updated;
  },

  /**
   * Limpia por completo el Historial de reproducción.
   */
  async clearWatchHistory(): Promise<void> {
    memoryHistory = [];
    await AsyncStorage.removeItem(config.storageKeys.watchHistory);
    notifyHistory([]);
  },

  /**
   * Obtiene la caché local del Feed junto con un indicador de si ha expirado (isStale).
   */
  async getFeedCache(
    channelsSignature?: string
  ): Promise<{ videos: VideoItem[]; updatedAt: number; isStale: boolean } | null> {
    try {
      const raw = await AsyncStorage.getItem(config.storageKeys.feedCache);
      if (!raw) {
        return null;
      }

      const parsed = JSON.parse(raw) as CacheEntry<VideoItem[]>;
      if (!parsed || !Array.isArray(parsed.data) || typeof parsed.updatedAt !== 'number') {
        return null;
      }

      if (channelsSignature && parsed.key && parsed.key !== channelsSignature) {
        return null;
      }

      const ageMs = Date.now() - parsed.updatedAt;
      const isStale = ageMs > config.cache.feedTtlMs;

      return {
        videos: parsed.data,
        updatedAt: parsed.updatedAt,
        isStale,
      };
    } catch {
      return null;
    }
  },

  /**
   * Guarda en caché local los vídeos del Feed junto con la firma de canales favoritos actuales.
   */
  async saveFeedCache(videos: VideoItem[], channelsSignature?: string): Promise<void> {
    try {
      const payload: CacheEntry<VideoItem[]> = {
        data: videos,
        updatedAt: Date.now(),
        key: channelsSignature,
      };
      await AsyncStorage.setItem(config.storageKeys.feedCache, JSON.stringify(payload));
    } catch {
      // No bloquear la UI si falla la caché secundaria
    }
  },

  /**
   * Obtiene información básica en caché de un vídeo individual.
   */
  async getCachedVideo(videoId: string): Promise<VideoItem | null> {
    if (!videoId) {
      return null;
    }
    try {
      const raw = await AsyncStorage.getItem(config.storageKeys.videoDetailsCache);
      if (!raw) {
        return null;
      }
      const parsed = JSON.parse(raw) as Record<string, CacheEntry<VideoItem>>;
      const entry = parsed?.[videoId];
      if (!entry || !entry.data) {
        return null;
      }
      return entry.data;
    } catch {
      return null;
    }
  },

  /**
   * Guarda información básica de vídeos en la caché local.
   */
  async saveCachedVideos(videos: VideoItem[]): Promise<void> {
    if (!videos.length) {
      return;
    }
    try {
      const raw = await AsyncStorage.getItem(config.storageKeys.videoDetailsCache);
      const current: Record<string, CacheEntry<VideoItem>> = raw ? JSON.parse(raw) : {};
      const now = Date.now();

      for (const video of videos) {
        if (video?.id) {
          current[video.id] = {
            data: video,
            updatedAt: now,
          };
        }
      }

      const entries = Object.entries(current)
        .sort((a, b) => b[1].updatedAt - a[1].updatedAt)
        .slice(0, 100);

      await AsyncStorage.setItem(
        config.storageKeys.videoDetailsCache,
        JSON.stringify(Object.fromEntries(entries))
      );
    } catch {
      // Ignorar errores de caché secundaria
    }
  },
};
