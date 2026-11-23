import React from 'react';
import { act, fireEvent, render, renderHook, waitFor } from '@testing-library/react-native';
import ChannelProfileScreen from '../app/channel/[id]';
import { ChannelCard } from '../components/ChannelCard';
import { PersistentPlayerHost } from '../components/PersistentPlayerHost';
import { PlaylistCard } from '../components/PlaylistCard';
import { VideoCard } from '../components/VideoCard';
import { PlayerProvider } from '../context/PlayerContext';
import { useChannelProfile } from '../hooks/useChannelProfile';
import { storage } from '../services/storage';
import { youtubeService } from '../services/youtube';
import {
  ChannelDetails,
  ChannelPlaylist,
  FavoriteChannel,
  VideoItem,
} from '../types/youtube';

const mockPush = jest.fn();
const mockBack = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    back: mockBack,
    navigate: jest.fn(),
    canGoBack: () => true,
  }),
  useLocalSearchParams: () => ({
    id: 'UC_test_123',
    name: 'Canal de Prueba',
    thumbnail: 'https://example.com/avatar.jpg',
    description: 'Descripción de prueba del canal',
  }),
  useGlobalSearchParams: () => ({
    id: 'UC_test_123',
    name: 'Canal de Prueba',
    thumbnail: 'https://example.com/avatar.jpg',
    description: 'Descripción de prueba del canal',
  }),
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}));

jest.mock('expo-keep-awake', () => ({
  activateKeepAwakeAsync: jest.fn(() => Promise.resolve()),
  deactivateKeepAwake: jest.fn(() => Promise.resolve()),
}));

jest.mock('react-native-webview', () => {
  const ReactLib = require('react');
  const { View } = require('react-native');
  return {
    WebView: ReactLib.forwardRef((props: any, _ref: any) => (
      <View testID="mock-webview" {...props} />
    )),
  };
});

describe('Channel Profile Feature (Screen, Hook, Service & Components)', () => {
  const sampleChannel: ChannelDetails = {
    id: 'UC_test_123',
    name: 'Canal de Prueba',
    handle: '@canaldeprueba',
    thumbnail: 'https://example.com/avatar.jpg',
    bannerUrl: 'https://example.com/banner.jpg',
    description: 'Descripción de prueba del canal',
    subscriberCountText: '1,5 M suscriptores',
    videoCountText: '250 vídeos',
    viewCountText: '10.000.000 visualizaciones',
    publishedAt: '2020-01-01T00:00:00Z',
    country: 'ES',
  };

  const sampleVideos: VideoItem[] = [
    {
      id: 'video_1',
      title: 'Último Vídeo Subido',
      thumbnail: 'https://example.com/video1.jpg',
      channelId: 'UC_test_123',
      channelTitle: 'Canal de Prueba',
      publishedAt: '2026-10-20T10:00:00Z',
      durationFormatted: '12:30',
      durationSeconds: 750,
      viewCount: 15000,
    },
  ];

  const samplePopularVideos: VideoItem[] = [
    {
      id: 'video_pop_1',
      title: 'Vídeo Más Popular',
      thumbnail: 'https://example.com/pop1.jpg',
      channelId: 'UC_test_123',
      channelTitle: 'Canal de Prueba',
      publishedAt: '2024-05-10T10:00:00Z',
      durationFormatted: '25:00',
      durationSeconds: 1500,
      viewCount: 2500000,
    },
  ];

  const samplePlaylists: ChannelPlaylist[] = [
    {
      id: 'PL_sample_1',
      title: 'Lista de Tutoriales',
      thumbnail: 'https://example.com/playlist1.jpg',
      itemCountText: '18 vídeos',
      firstVideoId: 'video_tut_1',
    },
  ];

  beforeEach(async () => {
    storage.resetMemoryCache();
    youtubeService.clearInFlightRequests();
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  describe('useChannelProfile hook', () => {
    it('fetches channel details, latest videos, popular videos, and playlists', async () => {
      jest.spyOn(youtubeService, 'getChannelDetails').mockResolvedValue(sampleChannel);
      jest.spyOn(youtubeService, 'getChannelVideos').mockResolvedValue(sampleVideos);
      jest.spyOn(youtubeService, 'getChannelPopularVideos').mockResolvedValue(samplePopularVideos);
      jest.spyOn(youtubeService, 'getChannelPlaylists').mockResolvedValue(samplePlaylists);

      const { result } = await renderHook(() =>
        useChannelProfile('UC_test_123', {
          initialName: 'Canal de Prueba',
          initialThumbnail: 'https://example.com/avatar.jpg',
        })
      );

      // Initially seeded with initialName
      expect(result.current.channel?.name).toBe('Canal de Prueba');

      await waitFor(() => {
        expect(result.current.loadingChannel).toBe(false);
        expect(result.current.loadingVideos).toBe(false);
      });

      expect(result.current.channel?.handle).toBe('@canaldeprueba');
      expect(result.current.videos).toHaveLength(1);
      expect(result.current.videos[0].title).toBe('Último Vídeo Subido');

      // Lazily load popular videos
      await act(async () => {
        await result.current.loadTab('popular');
      });
      expect(result.current.popularVideos).toHaveLength(1);
      expect(result.current.popularVideos[0].title).toBe('Vídeo Más Popular');

      // Lazily load playlists
      await act(async () => {
        await result.current.loadTab('playlists');
      });
      expect(result.current.playlists).toHaveLength(1);
      expect(result.current.playlists[0].title).toBe('Lista de Tutoriales');
    });

    it('clears previous videos and resets data immediately when channelId changes', async () => {
      jest.spyOn(youtubeService, 'getChannelDetails').mockImplementation(async (id) => ({
        ...sampleChannel,
        id,
        name: id === 'UC_1' ? 'Channel 1' : 'Channel 2',
      }));
      jest.spyOn(youtubeService, 'getChannelVideos').mockImplementation(async (ch) => [
        {
          ...sampleVideos[0],
          id: `vid_${ch.id}`,
          title: `Video of ${ch.name || ch.id}`,
          channelId: ch.id,
        },
      ]);

      const { result, rerender } = await renderHook(
        (props: { id: string }) =>
          useChannelProfile(props.id, { initialName: `Seed ${props.id}` }),
        { initialProps: { id: 'UC_1' } }
      );

      await waitFor(() => {
        expect(result.current.loadingVideos).toBe(false);
        expect(result.current.videos[0]?.id).toBe('vid_UC_1');
      });

      // Change channelId to UC_2
      await rerender({ id: 'UC_2' });

      // When channelId changes, data resets and loads the new channel's videos
      await waitFor(() => {
        expect(result.current.loadingVideos).toBe(false);
        expect(result.current.videos[0]?.id).toBe('vid_UC_2');
      });
    });
  });

  describe('ChannelProfileScreen UI', () => {
    it('renders channel header, info, and switches tabs properly', async () => {
      jest.spyOn(youtubeService, 'getChannelDetails').mockResolvedValue(sampleChannel);
      jest.spyOn(youtubeService, 'getChannelVideos').mockResolvedValue(sampleVideos);
      jest.spyOn(youtubeService, 'getChannelPopularVideos').mockResolvedValue(samplePopularVideos);
      jest.spyOn(youtubeService, 'getChannelPlaylists').mockResolvedValue(samplePlaylists);

      const { getByTestId, getByText, getAllByText } = await render(
        <PlayerProvider>
          <ChannelProfileScreen />
        </PlayerProvider>
      );

      // Verify header elements
      expect(getByTestId('channel-back-button')).toBeTruthy();
      expect(getByTestId('channel-favorite-toggle-btn')).toBeTruthy();

      await waitFor(() => {
        expect(getByText('Último Vídeo Subido')).toBeTruthy();
      });

      // Switch to "Populares" tab
      const popTab = getByTestId('channel-tab-popular');
      await act(async () => {
        fireEvent.press(popTab);
      });

      await waitFor(() => {
        expect(getByText('Vídeo Más Popular')).toBeTruthy();
      });

      // Switch to "Listas" tab
      const playlistsTab = getByTestId('channel-tab-playlists');
      await act(async () => {
        fireEvent.press(playlistsTab);
      });

      await waitFor(() => {
        expect(getByText('Lista de Tutoriales')).toBeTruthy();
      });

      // Switch to "Información" tab
      const aboutTab = getByTestId('channel-tab-about');
      await act(async () => {
        fireEvent.press(aboutTab);
      });

      await waitFor(() => {
        expect(getByText('Descripción')).toBeTruthy();
        expect(getAllByText('Descripción de prueba del canal').length).toBeGreaterThanOrEqual(1);
        expect(getByText('Estadísticas e información')).toBeTruthy();
      });
    });

    it('toggles subscription/favorite state from the channel profile screen', async () => {
      jest.spyOn(youtubeService, 'getChannelDetails').mockResolvedValue(sampleChannel);
      jest.spyOn(youtubeService, 'getChannelVideos').mockResolvedValue(sampleVideos);

      const { getByTestId, getByText } = await render(
        <PlayerProvider>
          <ChannelProfileScreen />
        </PlayerProvider>
      );

      const favBtn = getByTestId('channel-favorite-toggle-btn');
      expect(getByText('Seguir canal')).toBeTruthy();

      await act(async () => {
        fireEvent.press(favBtn);
      });

      await waitFor(() => {
        expect(getByText('Siguiendo')).toBeTruthy();
      });
    });

    it('calls router.back when the back button is pressed', async () => {
      jest.spyOn(youtubeService, 'getChannelDetails').mockResolvedValue(sampleChannel);
      jest.spyOn(youtubeService, 'getChannelVideos').mockResolvedValue(sampleVideos);

      const { getByTestId } = await render(
        <PlayerProvider>
          <ChannelProfileScreen />
        </PlayerProvider>
      );

      const backBtn = getByTestId('channel-back-button');
      await act(async () => {
        fireEvent.press(backBtn);
      });

      expect(mockBack).toHaveBeenCalled();
    });
  });

  describe('ChannelCard & VideoCard navigation triggers', () => {
    it('calls onPress on ChannelCard when the user taps on the channel item', async () => {
      const handlePress = jest.fn();
      const favChannel: FavoriteChannel = {
        id: 'UC_custom',
        name: 'Custom Channel',
        thumbnail: 'https://example.com/custom.jpg',
      };

      const { getByTestId } = await render(
        <ChannelCard
          channel={favChannel}
          isFavorite={false}
          onToggleFavorite={jest.fn()}
          onPress={handlePress}
        />
      );

      const card = getByTestId('channel-card-UC_custom');
      fireEvent.press(card);
      expect(handlePress).toHaveBeenCalledTimes(1);
      expect(handlePress).toHaveBeenCalledWith(favChannel);
    });

    it('calls onPressChannel on VideoCard when the channel title is pressed', async () => {
      const handleVideoPress = jest.fn();
      const handleChannelPress = jest.fn();

      const { getByTestId } = await render(
        <VideoCard
          video={sampleVideos[0]}
          onPress={handleVideoPress}
          onPressChannel={handleChannelPress}
        />
      );

      const channelBtn = getByTestId('video-channel-pressable-video_1');
      fireEvent.press(channelBtn);

      expect(handleChannelPress).toHaveBeenCalledTimes(1);
      expect(handleChannelPress).toHaveBeenCalledWith('UC_test_123', 'Canal de Prueba');
      expect(handleVideoPress).not.toHaveBeenCalled();
    });

    it('renders PlaylistCard and triggers onPress when clicked', async () => {
      const handlePlaylistPress = jest.fn();
      const { getByTestId, getByText } = await render(
        <PlaylistCard
          playlist={samplePlaylists[0]}
          onPress={handlePlaylistPress}
        />
      );

      expect(getByText('Lista de Tutoriales')).toBeTruthy();
      expect(getByText('18 vídeos')).toBeTruthy();

      const card = getByTestId('playlist-card-PL_sample_1');
      fireEvent.press(card);

      expect(handlePlaylistPress).toHaveBeenCalledTimes(1);
      expect(handlePlaylistPress).toHaveBeenCalledWith(samplePlaylists[0]);
    });
  });

  describe('youtubeService channel methods', () => {
    it('fetches and formats channel details from API when key is available', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          items: [
            {
              id: 'UC_api_test',
              snippet: {
                title: 'Canal API Oficial',
                customUrl: '@apioficial',
                description: 'Descripción desde la API',
                publishedAt: '2018-03-01T12:00:00Z',
                country: 'US',
                thumbnails: {
                  high: { url: 'https://example.com/api_thumb.jpg' },
                },
              },
              statistics: {
                subscriberCount: '2500000',
                videoCount: '450',
                viewCount: '50000000',
              },
              brandingSettings: {
                image: {
                  bannerExternalUrl: 'https://example.com/api_banner.jpg',
                },
              },
            },
          ],
        }),
      });
      global.fetch = mockFetch as any;

      const details = await youtubeService.getChannelDetails('UC_api_test', 'TEST_API_KEY');
      expect(details).not.toBeNull();
      expect(details?.name).toBe('Canal API Oficial');
      expect(details?.handle).toBe('@apioficial');
      expect(details?.subscriberCountText).toContain('M suscriptores');
      expect(details?.bannerUrl).toBe('https://example.com/api_banner.jpg');
    });

    it('fetches and formats playlists from API when key is available', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          items: [
            {
              id: 'PL_api_list_1',
              snippet: {
                title: 'Curso Completo de React',
                thumbnails: {
                  high: { url: 'https://example.com/thumb.jpg' },
                },
                publishedAt: '2023-01-01',
              },
              contentDetails: {
                itemCount: 15,
              },
            },
          ],
        }),
      });
      global.fetch = mockFetch as any;

      const playlists = await youtubeService.getChannelPlaylists('UC_api_test', 'TEST_API_KEY');
      expect(playlists).toHaveLength(1);
      expect(playlists[0].id).toBe('PL_api_list_1');
      expect(playlists[0].title).toBe('Curso Completo de React');
      expect(playlists[0].itemCountText).toBe('15 vídeos');
    });
  });

  describe('PersistentPlayerHost channel avatar resolution', () => {
    it('displays channel avatar image when video has channelThumbnail', async () => {
      const videoWithThumb: VideoItem = {
        id: 'vid_avatar_test',
        title: 'Video With Avatar',
        thumbnail: 'https://example.com/thumb.jpg',
        channelId: 'UC_test_123',
        channelTitle: 'Canal de Prueba',
        channelThumbnail: 'https://example.com/avatar.jpg',
        publishedAt: '2026-10-21T00:00:00Z',
      };

      const { getByTestId } = await render(
        <PlayerProvider initialVideo={videoWithThumb}>
          <PersistentPlayerHost />
        </PlayerProvider>
      );

      await waitFor(() => {
        const avatarImg = getByTestId('player-channel-avatar-image');
        expect(avatarImg).toBeTruthy();
        expect(avatarImg.props.source).toEqual({ uri: 'https://example.com/avatar.jpg' });
      });
    });

    it('fetches channel details and displays avatar when channelThumbnail is not directly on video', async () => {
      jest.spyOn(youtubeService, 'getChannelDetails').mockResolvedValue(sampleChannel);

      const videoWithoutThumb: VideoItem = {
        id: 'vid_avatar_fetch',
        title: 'Video Without Direct Avatar',
        thumbnail: 'https://example.com/thumb.jpg',
        channelId: 'UC_test_123',
        channelTitle: 'Canal de Prueba',
        publishedAt: '2026-10-21T00:00:00Z',
      };

      const { getByTestId } = await render(
        <PlayerProvider initialVideo={videoWithoutThumb}>
          <PersistentPlayerHost />
        </PlayerProvider>
      );

      await waitFor(() => {
        const avatarImg = getByTestId('player-channel-avatar-image');
        expect(avatarImg).toBeTruthy();
        expect(avatarImg.props.source).toEqual({ uri: 'https://example.com/avatar.jpg' });
      });
    });
  });
});
