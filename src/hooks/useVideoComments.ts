import { useCallback, useEffect, useRef, useState } from 'react';
import { youtubeService } from '../services/youtube';
import { VideoComment, YouTubeAppError } from '../types/youtube';

const commentsMemoryCache = new Map<string, VideoComment[]>();
const repliesMemoryCache = new Map<string, VideoComment[]>();

export function clearCommentsMemoryCache(): void {
  commentsMemoryCache.clear();
  repliesMemoryCache.clear();
}

export interface UseVideoCommentsReturn {
  comments: VideoComment[];
  loading: boolean;
  error: YouTubeAppError | null;
  refresh: () => Promise<void>;
  expandedReplies: Record<string, boolean>;
  repliesByCommentId: Record<string, VideoComment[]>;
  loadingReplies: Record<string, boolean>;
  errorReplies: Record<string, string | null>;
  toggleReplies: (comment: VideoComment) => Promise<void>;
  retryReplies: (comment: VideoComment) => Promise<void>;
}

/**
 * Hook para cargar y gestionar los comentarios de un vídeo de YouTube
 * y el despliegue bajo demanda de las respuestas de cada comentario.
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

  const [expandedReplies, setExpandedReplies] = useState<Record<string, boolean>>({});
  const [repliesByCommentId, setRepliesByCommentId] = useState<
    Record<string, VideoComment[]>
  >({});
  const [loadingReplies, setLoadingReplies] = useState<Record<string, boolean>>({});
  const [errorReplies, setErrorReplies] = useState<Record<string, string | null>>({});

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
        const cached = commentsMemoryCache.get(targetId) ?? [];
        setComments(cached);
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

        // Pre-poblar en caché las respuestas inline si vienen incluidas
        const preloadedReplies: Record<string, VideoComment[]> = {};
        for (const item of fetched) {
          if (item.replies && item.replies.length > 0) {
            preloadedReplies[item.id] = item.replies;
            repliesMemoryCache.set(item.id, item.replies);
          }
        }
        if (Object.keys(preloadedReplies).length > 0) {
          setRepliesByCommentId((prev) => ({ ...prev, ...preloadedReplies }));
        }
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

  const fetchRepliesForComment = useCallback(
    async (comment: VideoComment, forceRefresh = false) => {
      const commentId = comment.id;
      if (!commentId) return;

      if (!forceRefresh && repliesMemoryCache.has(commentId)) {
        const cached = repliesMemoryCache.get(commentId) ?? [];
        if (
          cached.length > 0 &&
          (!comment.replyCount || cached.length >= comment.replyCount)
        ) {
          setRepliesByCommentId((prev) => ({ ...prev, [commentId]: cached }));
          setErrorReplies((prev) => ({ ...prev, [commentId]: null }));
          return;
        }
      }

      setLoadingReplies((prev) => ({ ...prev, [commentId]: true }));
      setErrorReplies((prev) => ({ ...prev, [commentId]: null }));

      try {
        const fetched = await youtubeService.getCommentReplies(comment);
        repliesMemoryCache.set(commentId, fetched);
        setRepliesByCommentId((prev) => ({ ...prev, [commentId]: fetched }));
      } catch (err) {
        const msg =
          err instanceof Error
            ? err.message
            : 'No se pudieron cargar las respuestas.';
        setErrorReplies((prev) => ({ ...prev, [commentId]: msg }));
      } finally {
        setLoadingReplies((prev) => ({ ...prev, [commentId]: false }));
      }
    },
    []
  );

  const toggleReplies = useCallback(
    async (comment: VideoComment) => {
      const commentId = comment.id;
      if (!commentId) return;

      const isCurrentlyExpanded = Boolean(expandedReplies[commentId]);
      if (isCurrentlyExpanded) {
        setExpandedReplies((prev) => ({ ...prev, [commentId]: false }));
        return;
      }

      setExpandedReplies((prev) => ({ ...prev, [commentId]: true }));

      const existingReplies =
        repliesByCommentId[commentId] ??
        repliesMemoryCache.get(commentId) ??
        comment.replies;

      if (
        existingReplies &&
        existingReplies.length > 0 &&
        (!comment.replyCount || existingReplies.length >= comment.replyCount) &&
        !comment.repliesContinuationToken
      ) {
        setRepliesByCommentId((prev) => ({
          ...prev,
          [commentId]: existingReplies,
        }));
        return;
      }

      await fetchRepliesForComment(comment, false);
    },
    [expandedReplies, fetchRepliesForComment, repliesByCommentId]
  );

  const retryReplies = useCallback(
    async (comment: VideoComment) => {
      await fetchRepliesForComment(comment, true);
    },
    [fetchRepliesForComment]
  );

  useEffect(() => {
    setExpandedReplies({});
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
    expandedReplies,
    repliesByCommentId,
    loadingReplies,
    errorReplies,
    toggleReplies,
    retryReplies,
  };
}
