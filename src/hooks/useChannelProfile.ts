import { useCallback, useEffect, useRef, useState } from 'react';
import { youtubeService } from '../services/youtube';
import {
  ChannelDetails,
  ChannelPlaylist,
  ChannelProfileTab,
  VideoItem,
  YouTubeAppError,
} from '../types/youtube';

export interface UseChannelProfileOptions {
  initialName?: string;
  initialThumbnail?: string;
  initialDescription?: string;
}

export interface UseChannelProfileResult {
  channel: ChannelDetails | null;
  loadingChannel: boolean;
  videos: VideoItem[];
  loadingVideos: boolean;
  popularVideos: VideoItem[];
  loadingPopular: boolean;
  playlists: ChannelPlaylist[];
  loadingPlaylists: boolean;
  refreshing: boolean;
  error: YouTubeAppError | null;
  refresh: () => Promise<void>;
  loadTab: (tab: ChannelProfileTab) => Promise<void>;
}

export function useChannelProfile(
  channelId: string,
  options?: UseChannelProfileOptions
): UseChannelProfileResult {
  const [channel, setChannel] = useState<ChannelDetails | null>(() => {
    if (!channelId) return null;
    if (options?.initialName || options?.initialThumbnail) {
      return {
        id: channelId,
        name: options.initialName || '',
        thumbnail: options.initialThumbnail || '',
        description: options.initialDescription,
      };
    }
    return null;
  });

  const [loadingChannel, setLoadingChannel] = useState<boolean>(true);
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [loadingVideos, setLoadingVideos] = useState<boolean>(true);
  const [popularVideos, setPopularVideos] = useState<VideoItem[]>([]);
  const [loadingPopular, setLoadingPopular] = useState<boolean>(false);
  const [playlists, setPlaylists] = useState<ChannelPlaylist[]>([]);
  const [loadingPlaylists, setLoadingPlaylists] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<YouTubeAppError | null>(null);

  const popularLoadedRef = useRef(false);
  const playlistsLoadedRef = useRef(false);
  const mountedRef = useRef(true);

  // Clear previous channel data when channelId changes
  useEffect(() => {
    popularLoadedRef.current = false;
    playlistsLoadedRef.current = false;

    setChannel(
      options?.initialName || options?.initialThumbnail
        ? {
            id: channelId,
            name: options.initialName || '',
            thumbnail: options.initialThumbnail || '',
            description: options.initialDescription,
          }
        : null
    );
    setVideos([]);
    setPopularVideos([]);
    setPlaylists([]);
    setError(null);
    setLoadingChannel(true);
    setLoadingVideos(true);
    setLoadingPopular(false);
    setLoadingPlaylists(false);
  }, [channelId, options?.initialDescription, options?.initialName, options?.initialThumbnail]);

  const fetchChannelAndVideos = useCallback(async () => {
    if (!channelId) return;
    setError(null);

    const initialName = options?.initialName || '';
    const initialThumb = options?.initialThumbnail || '';

    // Channel details
    const detailsPromise = youtubeService
      .getChannelDetails(channelId)
      .then((details) => {
        if (!mountedRef.current) return;
        if (details) {
          setChannel(details);
        }
      })
      .catch((err) => {
        if (!mountedRef.current) return;
        if (err instanceof YouTubeAppError) {
          setError(err);
        }
      })
      .finally(() => {
        if (mountedRef.current) setLoadingChannel(false);
      });

    // Channel latest videos
    const videosPromise = youtubeService
      .getChannelVideos({
        id: channelId,
        name: initialName,
        thumbnail: initialThumb,
      })
      .then((items) => {
        if (!mountedRef.current) return;
        setVideos(items);
      })
      .catch((err) => {
        if (!mountedRef.current) return;
        if (err instanceof YouTubeAppError) {
          setError(err);
        }
      })
      .finally(() => {
        if (mountedRef.current) setLoadingVideos(false);
      });

    await Promise.all([detailsPromise, videosPromise]);
  }, [channelId, options?.initialName, options?.initialThumbnail]);

  useEffect(() => {
    mountedRef.current = true;
    popularLoadedRef.current = false;
    playlistsLoadedRef.current = false;

    setLoadingChannel(true);
    setLoadingVideos(true);
    void fetchChannelAndVideos();

    return () => {
      mountedRef.current = false;
    };
  }, [fetchChannelAndVideos]);

  const loadPopularVideos = useCallback(async () => {
    if (!channelId || popularLoadedRef.current) return;
    popularLoadedRef.current = true;
    setLoadingPopular(true);

    try {
      const items = await youtubeService.getChannelPopularVideos({
        id: channelId,
        name: channel?.name || options?.initialName || '',
      });
      if (mountedRef.current) {
        setPopularVideos(items);
      }
    } catch (err) {
      if (mountedRef.current && err instanceof YouTubeAppError) {
        setError(err);
      }
    } finally {
      if (mountedRef.current) {
        setLoadingPopular(false);
      }
    }
  }, [channel?.name, channelId, options?.initialName]);

  const loadPlaylists = useCallback(async () => {
    if (!channelId || playlistsLoadedRef.current) return;
    playlistsLoadedRef.current = true;
    setLoadingPlaylists(true);

    try {
      const items = await youtubeService.getChannelPlaylists(channelId);
      if (mountedRef.current) {
        setPlaylists(items);
      }
    } catch (err) {
      if (mountedRef.current && err instanceof YouTubeAppError) {
        setError(err);
      }
    } finally {
      if (mountedRef.current) {
        setLoadingPlaylists(false);
      }
    }
  }, [channelId]);

  const loadTab = useCallback(
    async (tab: ChannelProfileTab) => {
      if (tab === 'popular') {
        await loadPopularVideos();
      } else if (tab === 'playlists') {
        await loadPlaylists();
      }
    },
    [loadPlaylists, loadPopularVideos]
  );

  const refresh = useCallback(async () => {
    setRefreshing(true);
    popularLoadedRef.current = false;
    playlistsLoadedRef.current = false;
    try {
      await fetchChannelAndVideos();
    } finally {
      if (mountedRef.current) {
        setRefreshing(false);
      }
    }
  }, [fetchChannelAndVideos]);

  return {
    channel,
    loadingChannel,
    videos,
    loadingVideos,
    popularVideos,
    loadingPopular,
    playlists,
    loadingPlaylists,
    refreshing,
    error,
    refresh,
    loadTab,
  };
}
