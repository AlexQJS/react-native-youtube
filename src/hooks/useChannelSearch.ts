import { useCallback, useEffect, useRef, useState } from 'react';
import { config } from '../config/config';
import { youtubeService } from '../services/youtube';
import { FavoriteChannel, VideoItem, YouTubeAppError } from '../types/youtube';
import { createDebounce } from '../utils/debounce';

export interface UseChannelSearchReturn {
  query: string;
  results: FavoriteChannel[];
  videoResults: VideoItem[];
  loading: boolean;
  error: YouTubeAppError | null;
  hasSearched: boolean;
  setQuery: (text: string) => void;
  retry: () => Promise<void>;
  clearSearch: () => void;
}

/**
 * Hook para buscar canales y vídeos de YouTube con debounce, control de peticiones obsoletas
 * y gestión tipada de estados de carga, error y búsqueda vacía.
 */
export function useChannelSearch(): UseChannelSearchReturn {
  const [query, setQueryState] = useState<string>('');
  const [results, setResults] = useState<FavoriteChannel[]>([]);
  const [videoResults, setVideoResults] = useState<VideoItem[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<YouTubeAppError | null>(null);
  const [hasSearched, setHasSearched] = useState<boolean>(false);

  const requestIdRef = useRef<number>(0);

  const executeSearch = useCallback(async (searchText: string) => {
    const trimmed = searchText.trim();
    if (!trimmed || trimmed.length < config.search.minQueryLength) {
      setResults([]);
      setVideoResults([]);
      setLoading(false);
      setError(null);
      setHasSearched(false);
      return;
    }

    const currentRequestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);

    try {
      const [channelsRes, videosRes] = await Promise.allSettled([
        youtubeService.searchChannels(trimmed),
        youtubeService.searchVideos(trimmed),
      ]);

      if (currentRequestId !== requestIdRef.current) {
        return;
      }

      const channels =
        channelsRes.status === 'fulfilled' ? channelsRes.value : [];
      const videos =
        videosRes.status === 'fulfilled' ? videosRes.value : [];

      if (
        channelsRes.status === 'rejected' &&
        (videosRes.status === 'rejected' || videos.length === 0)
      ) {
        throw channelsRes.reason;
      }

      setResults(channels);
      setVideoResults(videos);
      setHasSearched(true);
    } catch (err) {
      if (currentRequestId !== requestIdRef.current) {
        return;
      }
      const appError =
        err instanceof YouTubeAppError
          ? err
          : new YouTubeAppError(
              'Ocurrió un error al buscar en YouTube.',
              'UNKNOWN_ERROR',
              true
            );
      setError(appError);
      setResults([]);
      setVideoResults([]);
      setHasSearched(true);
    } finally {
      if (currentRequestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, []);

  const debouncerRef = useRef(
    createDebounce((text: string) => {
      executeSearch(text);
    }, config.search.debounceMs)
  );

  useEffect(() => {
    return () => {
      debouncerRef.current.cancel();
    };
  }, []);

  const setQuery = useCallback((text: string) => {
    setQueryState(text);
    const trimmed = text.trim();

    if (!trimmed || trimmed.length < config.search.minQueryLength) {
      debouncerRef.current.cancel();
      requestIdRef.current++;
      setResults([]);
      setVideoResults([]);
      setLoading(false);
      setError(null);
      setHasSearched(false);
      return;
    }

    setLoading(true);
    setError(null);
    debouncerRef.current.call(trimmed);
  }, []);

  const retry = useCallback(async () => {
    debouncerRef.current.cancel();
    await executeSearch(query);
  }, [executeSearch, query]);

  const clearSearch = useCallback(() => {
    debouncerRef.current.cancel();
    requestIdRef.current++;
    setQueryState('');
    setResults([]);
    setVideoResults([]);
    setLoading(false);
    setError(null);
    setHasSearched(false);
  }, []);

  return {
    query,
    results,
    videoResults,
    loading,
    error,
    hasSearched,
    setQuery,
    retry,
    clearSearch,
  };
}
