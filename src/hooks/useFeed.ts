import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { storage } from '../services/storage';
import { youtubeService } from '../services/youtube';
import { FavoriteChannel, VideoItem, YouTubeAppError } from '../types/youtube';

export interface UseFeedReturn {
  videos: VideoItem[];
  loading: boolean;
  refreshing: boolean;
  error: YouTubeAppError | null;
  isOfflineData: boolean;
  lastUpdatedAt: number | null;
  refresh: () => Promise<void>;
}

/**
 * Hook para gestionar el Feed de vídeos de los canales favoritos:
 * - Utiliza caché local para evitar peticiones innecesarias al cambiar de pestaña.
 * - Soporta pull-to-refresh (forzando actualización).
 * - Si hay un fallo de red pero existen datos en caché, muestra los datos locales
 *   e informa mediante `isOfflineData = true`.
 */
export function useFeed(favorites: FavoriteChannel[], favoritesLoading = false): UseFeedReturn {
  const signature = useMemo(
    () =>
      favorites
        .map((c) => c.id)
        .sort()
        .join(','),
    [favorites]
  );

  const initialSyncCache = useMemo(
    () =>
      !favoritesLoading && signature
        ? storage.getSyncFeedCache(signature)
        : null,
    // Solo evaluar en la inicialización
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const hasInitialReadyCache = Boolean(
    !favoritesLoading &&
      (favorites.length === 0 ||
        (initialSyncCache &&
          initialSyncCache.videos.length > 0 &&
          !initialSyncCache.isStale))
  );

  const [videos, setVideos] = useState<VideoItem[]>(
    () => initialSyncCache?.videos ?? []
  );
  const [loading, setLoading] = useState<boolean>(() => !hasInitialReadyCache);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<YouTubeAppError | null>(null);
  const [isOfflineData, setIsOfflineData] = useState<boolean>(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(
    () => initialSyncCache?.updatedAt ?? null
  );

  const favoritesRef = useRef<FavoriteChannel[]>(favorites);
  favoritesRef.current = favorites;

  const lastLoadedSignatureRef = useRef<string | null>(
    hasInitialReadyCache ? signature : null
  );

  const fetchFeed = useCallback(
    async (forceRefresh = false) => {
      if (favoritesLoading) {
        return;
      }

      const currentFavorites = favoritesRef.current;

      if (currentFavorites.length === 0) {
        setVideos([]);
        setError(null);
        setIsOfflineData(false);
        setLoading(false);
        setRefreshing(false);
        lastLoadedSignatureRef.current = '';
        storage.markInitialFeedReady();
        return;
      }

      if (forceRefresh) {
        setRefreshing(true);
      } else if (lastLoadedSignatureRef.current !== signature) {
        setLoading(true);
      }

      setError(null);

      // 1. Consultar caché local primero
      const cached = await storage.getFeedCache(signature);
      if (cached && cached.videos.length > 0 && !forceRefresh) {
        setVideos(cached.videos);
        setLastUpdatedAt(cached.updatedAt);

        // Si la caché aún es válida, no lanzamos petición de red
        if (!cached.isStale) {
          setIsOfflineData(false);
          setLoading(false);
          setRefreshing(false);
          lastLoadedSignatureRef.current = signature;
          storage.markInitialFeedReady();
          return;
        }
        storage.markInitialFeedReady();
      }

      // 2. Obtener vídeos actualizados desde YouTube
      try {
        const freshVideos = await youtubeService.getFeedForChannels(currentFavorites);
        setVideos(freshVideos);
        setIsOfflineData(false);
        const now = Date.now();
        setLastUpdatedAt(now);
        lastLoadedSignatureRef.current = signature;

        await storage.saveFeedCache(freshVideos, signature);
        await storage.saveCachedVideos(freshVideos);
      } catch (err) {
        const appError =
          err instanceof YouTubeAppError
            ? err
            : new YouTubeAppError(
                'No se pudieron cargar los vídeos recientes.',
                'UNKNOWN_ERROR',
                true
              );

        // Si tenemos datos en caché, los mantenemos en modo offline/desactualizado
        if (cached && cached.videos.length > 0) {
          setVideos(cached.videos);
          setLastUpdatedAt(cached.updatedAt);
          setIsOfflineData(true);
          if (appError.code !== 'NETWORK_ERROR') {
            setError(appError);
          }
        } else {
          setError(appError);
          if (appError.code === 'NETWORK_ERROR') {
            setIsOfflineData(true);
          }
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
        storage.markInitialFeedReady();
      }
    },
    [favoritesLoading, signature]
  );

  useEffect(() => {
    if (!favoritesLoading) {
      fetchFeed(false);
    }
  }, [favoritesLoading, signature, fetchFeed]);

  const refresh = useCallback(async () => {
    await fetchFeed(true);
  }, [fetchFeed]);

  return {
    videos,
    loading: favoritesLoading || loading,
    refreshing,
    error,
    isOfflineData,
    lastUpdatedAt,
    refresh,
  };
}
