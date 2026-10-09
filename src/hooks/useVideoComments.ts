import { useCallback, useEffect, useRef, useState } from 'react';
import { youtubeService } from '../services/youtube';
import { VideoComment, YouTubeAppError } from '../types/youtube';

const commentsMemoryCache = new Map<string, VideoComment[]>();

export function clearCommentsMemoryCache(): void {
  commentsMemoryCache.clear();
}

export interface UseVideoCommentsReturn {
  comments: VideoComment[];
  loading: boolean;
  error: YouTubeAppError | null;
  refresh: () => Promise<void>;
}

/**
 * Hook para cargar y gestionar los comentarios de un vídeo de YouTube.
 */
export function useVideoComments(videoId?: string): UseVideoCommentsReturn {
  const normalizedId = videoId?.trim() ?? '';
  const [comments, setComments] = useState<VideoComment[]>(() =>
    normalizedId ? commentsMemoryCache.get(normalizedId) ?? [] : []
  );
  const [loading, setLoading] = useState<boolean>(() =>
    Boolean(normalizedId && !commentsMemoryCache.has(normalizedId))
  );
  const [error, setError] = useState<YouTubeAppError | null>(null);

  const requestIdRef = useRef<number>(0);

  const loadComments = useCallback(
    async (targetId: string, forceRefresh = false) => {
      if (!targetId) {
        setComments([]);
        setLoading(false);
        setError(null);
        return;
      }

      if (!forceRefresh && commentsMemoryCache.has(targetId)) {
        setComments(commentsMemoryCache.get(targetId) ?? []);
        setLoading(false);
        setError(null);
        return;
      }

      const currentRequestId = ++requestIdRef.current;
      setLoading(true);
      setError(null);

      try {
        const fetched = await youtubeService.getVideoComments(targetId);
        if (currentRequestId !== requestIdRef.current) {
          return;
        }
        commentsMemoryCache.set(targetId, fetched);
        setComments(fetched);
      } catch (err) {
        if (currentRequestId !== requestIdRef.current) {
          return;
        }
        const appError =
          err instanceof YouTubeAppError
            ? err
            : new YouTubeAppError(
                'No se pudieron cargar los comentarios de este vídeo.',
                'UNKNOWN_ERROR',
                true
              );
        setError(appError);
        setComments([]);
      } finally {
        if (currentRequestId === requestIdRef.current) {
          setLoading(false);
        }
      }
    },
    []
  );

  useEffect(() => {
    if (!normalizedId) {
      requestIdRef.current++;
      setComments([]);
      setLoading(false);
      setError(null);
      return;
    }

    loadComments(normalizedId, false);
  }, [normalizedId, loadComments]);

  const refresh = useCallback(async () => {
    if (!normalizedId) {
      return;
    }
    await loadComments(normalizedId, true);
  }, [normalizedId, loadComments]);

  return {
    comments,
    loading,
    error,
    refresh,
  };
}
