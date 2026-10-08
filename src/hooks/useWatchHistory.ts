import { useCallback, useEffect, useState } from 'react';
import { storage } from '../services/storage';
import { PlaybackProgressMap, WatchHistoryItem } from '../types/youtube';

export interface UseWatchHistoryReturn {
  history: WatchHistoryItem[];
  loading: boolean;
  removeItem: (videoId: string) => Promise<void>;
  clearHistory: () => Promise<void>;
  refreshHistory: () => Promise<void>;
}

/**
 * Hook para consultar y gestionar el Historial de reproducción (hasta config.history.maxItems vídeos),
 * manteniendo sincronizado en tiempo real el minutaje de cada vídeo.
 */
export function useWatchHistory(): UseWatchHistoryReturn {
  const [history, setHistory] = useState<WatchHistoryItem[]>([]);
  const [progressMap, setProgressMap] = useState<PlaybackProgressMap>({});
  const [loading, setLoading] = useState<boolean>(true);

  const loadAll = useCallback(async () => {
    try {
      const [storedHistory, storedProgress] = await Promise.all([
        storage.getWatchHistory(),
        storage.getPlaybackProgress(),
      ]);
      setHistory(storedHistory);
      setProgressMap(storedProgress);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    loadAll();

    const unsubHistory = storage.subscribeHistory((updatedHistory) => {
      if (mounted) {
        setHistory(updatedHistory);
      }
    });

    const unsubProgress = storage.subscribeProgress((updatedProgress) => {
      if (mounted) {
        setProgressMap(updatedProgress);
      }
    });

    return () => {
      mounted = false;
      unsubHistory();
      unsubProgress();
    };
  }, [loadAll]);

  const removeItem = useCallback(async (videoId: string) => {
    const updated = await storage.removeFromWatchHistory(videoId);
    setHistory(updated);
  }, []);

  const clearHistory = useCallback(async () => {
    await storage.clearWatchHistory();
    setHistory([]);
  }, []);

  // Fusionar siempre el progreso más reciente para mostrar el minutaje exacto
  const mergedHistory = history.map((item) => {
    const liveProgress = progressMap[item.video.id];
    if (!liveProgress) {
      return item;
    }
    return {
      ...item,
      position: liveProgress.position,
      duration: liveProgress.duration > 0 ? liveProgress.duration : item.duration,
      completed: liveProgress.completed ?? item.completed,
    };
  });

  return {
    history: mergedHistory,
    loading,
    removeItem,
    clearHistory,
    refreshHistory: loadAll,
  };
}
