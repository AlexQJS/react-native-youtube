import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { storage } from '../services/storage';
import { youtubeService } from '../services/youtube';
import {
  FavoriteChannel,
  VideoItem,
  WatchHistoryItem,
  YouTubeAppError,
} from '../types/youtube';

export interface UseRecommendedFeedReturn {
  videos: VideoItem[];
  loading: boolean;
  refreshing: boolean;
  error: YouTubeAppError | null;
  isOfflineData: boolean;
  lastUpdatedAt: number | null;
  refresh: () => Promise<void>;
}

/**
 * Hook to manage the Recommended "Feed" tab:
 * - Recommends videos tailored to user's favorite channels and watch history.
 * - Falls back to trending/popular YouTube content when no history/favorites exist.
 * - Utilizes local cache to prevent redundant network requests.
 * - Supports pull-to-refresh.
 * - Displays cached data with isOfflineData flag on network failures.
 */
export function useRecommendedFeed(
  favorites: FavoriteChannel[] = [],
  history: WatchHistoryItem[] = []
): UseRecommendedFeedReturn {
  const signature = useMemo(() => {
    const favPart = favorites
      .slice(0, 3)
      .map((f) => f.id)
      .sort()
      .join(',');
    const histPart = history
      .slice(0, 3)
      .map((h) => h.video.id)
      .sort()
      .join(',');
    return `${favPart}|${histPart}`;
  }, [favorites, history]);

  const initialSyncCache = useMemo(
    () => storage.getSyncRecommendedFeedCache(signature),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const hasInitialReadyCache = Boolean(
    initialSyncCache &&
      initialSyncCache.videos.length > 0 &&
      !initialSyncCache.isStale
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
  const historyRef = useRef<WatchHistoryItem[]>(history);
  historyRef.current = history;

  const lastLoadedSignatureRef = useRef<string | null>(
    hasInitialReadyCache ? signature : null
  );

  const fetchRecommended = useCallback(
    async (forceRefresh = false) => {
      if (forceRefresh) {
        setRefreshing(true);
      } else if (lastLoadedSignatureRef.current !== signature) {
        setLoading(true);
      }

      setError(null);

      // 1. Check local cache first
      const cached = await storage.getRecommendedFeedCache(signature);
      if (cached && cached.videos.length > 0 && !forceRefresh) {
        setVideos(cached.videos);
        setLastUpdatedAt(cached.updatedAt);

        if (!cached.isStale) {
          setIsOfflineData(false);
          setLoading(false);
          setRefreshing(false);
          lastLoadedSignatureRef.current = signature;
          return;
        }
      }

      // 2. Fetch fresh recommendations from YouTube service
      try {
        const freshVideos = await youtubeService.getRecommendedVideos({
          favorites: favoritesRef.current,
          history: historyRef.current,
        });

        setVideos(freshVideos);
        setIsOfflineData(false);
        const now = Date.now();
        setLastUpdatedAt(now);
        lastLoadedSignatureRef.current = signature;

        await storage.saveRecommendedFeedCache(freshVideos, signature);
        await storage.saveCachedVideos(freshVideos);
      } catch (err) {
        const appError =
          err instanceof YouTubeAppError
            ? err
            : new YouTubeAppError(
                'No se pudieron cargar los vídeos recomendados.',
                'UNKNOWN_ERROR',
                true
              );

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
      }
    },
    [signature]
  );

  useEffect(() => {
    fetchRecommended(false);
  }, [fetchRecommended]);

  const refresh = useCallback(async () => {
    await fetchRecommended(true);
  }, [fetchRecommended]);

  return {
    videos,
    loading,
    refreshing,
    error,
    isOfflineData,
    lastUpdatedAt,
    refresh,
  };
}
