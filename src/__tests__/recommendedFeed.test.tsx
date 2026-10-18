import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, renderHook, waitFor } from '@testing-library/react-native';
import FeedScreen from '../app/feed';
import { PlayerProvider } from '../context/PlayerContext';
import { useRecommendedFeed } from '../hooks/useRecommendedFeed';
import { storage } from '../services/storage';
import { youtubeService } from '../services/youtube';
import { FavoriteChannel, VideoItem, WatchHistoryItem, YouTubeAppError } from '../types/youtube';

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}));

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, navigate: jest.fn() }),
  usePathname: () => '/feed',
}));

describe('Recommended Feed & Feed Top Tabs ("Following" / "Feed")', () => {
  const sampleFavorites: FavoriteChannel[] = [
    { id: 'UC_fav_1', name: 'Tech Channel', thumbnail: 'https://example.com/tech.jpg' },
  ];

  const sampleHistory: WatchHistoryItem[] = [
    {
      video: {
        id: 'hist_vid_1',
        title: 'React Native Tutorial 2026',
        thumbnail: 'https://example.com/rn.jpg',
        channelId: 'UC_dev',
        channelTitle: 'Coding World',
        publishedAt: '2026-10-10T12:00:00Z',
      },
      watchedAt: 1700000000000,
      position: 120,
      duration: 600,
      completed: false,
    },
  ];

  beforeEach(async () => {
    storage.resetMemoryCache();
    youtubeService.clearInFlightRequests();
    await AsyncStorage.clear();
    jest.clearAllMocks();
  });

  describe('youtubeService.getRecommendedVideos', () => {
    it('genera recomendaciones personalizadas utilizando el historial y los canales favoritos', async () => {
      const searchSpy = jest
        .spyOn(youtubeService, 'searchVideos')
        .mockImplementation(async (query: string) => {
          return [
            {
              id: `rec_${query.replace(/\s+/g, '_')}`,
              title: `Video sobre ${query}`,
              thumbnail: 'https://example.com/v.jpg',
              channelId: 'UC_rec',
              channelTitle: 'Recommended Channel',
              publishedAt: '2026-10-15T10:00:00Z',
            },
          ];
        });

      const videos = await youtubeService.getRecommendedVideos({
        favorites: sampleFavorites,
        history: sampleHistory,
      });

      expect(videos.length).toBeGreaterThan(0);
      expect(searchSpy).toHaveBeenCalled();
      // Verificamos que se hayan usado términos del canal en historial o favoritos
      const calls = searchSpy.mock.calls.map((c) => c[0]);
      expect(
        calls.some(
          (q) =>
            q.includes('Coding World') ||
            q.includes('Tech Channel') ||
            q.includes('React Native')
        )
      ).toBe(true);
    });

    it('utiliza consultas de respaldo cuando no hay historial ni favoritos', async () => {
      const searchSpy = jest
        .spyOn(youtubeService, 'searchVideos')
        .mockResolvedValue([
          {
            id: 'general_rec_1',
            title: 'Tendencias de Hoy',
            thumbnail: 'https://example.com/gen.jpg',
            channelId: 'UC_general',
            channelTitle: 'Trending',
            publishedAt: '2026-10-16T10:00:00Z',
          },
        ]);

      const videos = await youtubeService.getRecommendedVideos({
        favorites: [],
        history: [],
      });

      expect(videos).toHaveLength(1);
      expect(videos[0].id).toBe('general_rec_1');
      expect(searchSpy).toHaveBeenCalled();
    });

    it('garantiza diversidad entre canales limitando el número máximo de vídeos por creador', async () => {
      // Simulamos que una de las búsquedas devuelve 10 vídeos del mismo canal
      jest.spyOn(youtubeService, 'searchVideos').mockImplementation(async (query: string) => {
        if (query.includes('Tech')) {
          return Array.from({ length: 8 }, (_, i) => ({
            id: `tech_vid_${i}`,
            title: `Tech Video ${i}`,
            thumbnail: 'https://example.com/t.jpg',
            channelId: 'UC_only_one_channel',
            channelTitle: 'Canal Monopolio',
            publishedAt: '2026-10-18T10:00:00Z',
          }));
        }
        return [
          {
            id: `other_vid_${query}`,
            title: `Other Video ${query}`,
            thumbnail: 'https://example.com/o.jpg',
            channelId: `UC_creator_${query}`,
            channelTitle: `Creador ${query}`,
            publishedAt: '2026-10-18T11:00:00Z',
          },
        ];
      });

      const videos = await youtubeService.getRecommendedVideos({
        favorites: [{ id: 'UC_1', name: 'Tech', thumbnail: '' }],
        history: [],
      });

      // El canal "Canal Monopolio" no debe superar 2 vídeos
      const monopolyVideos = videos.filter(
        (v) => v.channelTitle === 'Canal Monopolio'
      );
      expect(monopolyVideos.length).toBeLessThanOrEqual(2);

      // Debe haber vídeos de otros creadores
      const otherChannels = videos.filter(
        (v) => v.channelTitle !== 'Canal Monopolio'
      );
      expect(otherChannels.length).toBeGreaterThan(0);
    });
  });

  describe('useRecommendedFeed Hook', () => {
    it('recupera recomendaciones desde la caché si existe y no ha expirado', async () => {
      const cachedVideo: VideoItem = {
        id: 'cached_rec_1',
        title: 'Video en Caché Recomendado',
        thumbnail: 'https://example.com/cached.jpg',
        channelId: 'UC_c',
        channelTitle: 'Channel',
        publishedAt: '2026-10-17T10:00:00Z',
      };

      const signature = 'UC_fav_1|hist_vid_1';
      await storage.saveRecommendedFeedCache([cachedVideo], signature);

      const serviceSpy = jest.spyOn(youtubeService, 'getRecommendedVideos');

      const { result } = renderHook(() =>
        useRecommendedFeed(sampleFavorites, sampleHistory)
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.videos).toHaveLength(1);
      expect(result.current.videos[0].id).toBe('cached_rec_1');
      expect(serviceSpy).not.toHaveBeenCalled();
    });

    it('gestiona errores de red manteniendo datos de caché con isOfflineData = true', async () => {
      const cachedVideo: VideoItem = {
        id: 'offline_cached_1',
        title: 'Video Offline',
        thumbnail: 'https://example.com/off.jpg',
        channelId: 'UC_c',
        channelTitle: 'Channel',
        publishedAt: '2026-10-17T10:00:00Z',
      };
      const signature = 'UC_fav_1|hist_vid_1';
      await storage.saveRecommendedFeedCache([cachedVideo], signature);

      jest
        .spyOn(youtubeService, 'getRecommendedVideos')
        .mockRejectedValue(
          new YouTubeAppError('Error de red', 'NETWORK_ERROR', true)
        );

      const { result } = renderHook(() =>
        useRecommendedFeed(sampleFavorites, sampleHistory)
      );

      await act(async () => {
        await result.current.refresh();
      });

      expect(result.current.videos).toHaveLength(1);
      expect(result.current.isOfflineData).toBe(true);
    });
  });

  describe('FeedScreen UI Tabs ("Following" / "Feed")', () => {
    beforeEach(() => {
      jest.spyOn(youtubeService, 'getFeedForChannels').mockResolvedValue([
        {
          id: 'following_vid_1',
          title: 'Following Video 1',
          thumbnail: 'https://example.com/f1.jpg',
          channelId: 'UC_fav_1',
          channelTitle: 'Tech Channel',
          publishedAt: '2026-10-18T10:00:00Z',
        },
      ]);

      jest.spyOn(youtubeService, 'getRecommendedVideos').mockResolvedValue([
        {
          id: 'recommended_vid_1',
          title: 'Recommended Video 1',
          thumbnail: 'https://example.com/r1.jpg',
          channelId: 'UC_rec_1',
          channelTitle: 'Discover Channel',
          publishedAt: '2026-10-18T11:00:00Z',
        },
      ]);
    });

    it('muestra ambas pestañas ("Following" y "Feed") en la parte superior con "Following" activa por defecto', async () => {
      await storage.saveFavorites(sampleFavorites);

      const { getByTestId, queryByTestId } = render(
        <PlayerProvider>
          <FeedScreen />
        </PlayerProvider>
      );

      // Pestañas visibles en la parte superior
      const followingTab = getByTestId('feed-tab-following');
      const feedTab = getByTestId('feed-tab-feed');

      expect(followingTab).toBeTruthy();
      expect(feedTab).toBeTruthy();
      expect(getByTestId('feed-tab-indicator-following')).toBeTruthy();
      expect(queryByTestId('feed-tab-indicator-feed')).toBeNull();

      // En la pestaña Following se muestra el contenido seguido
      await waitFor(() => {
        expect(getByTestId('feed-video-list')).toBeTruthy();
      });
      expect(getByTestId('video-card-following_vid_1')).toBeTruthy();
    });

    it('permite cambiar a la pestaña "Feed" y muestra los vídeos recomendados', async () => {
      await storage.saveFavorites(sampleFavorites);

      const { getByTestId, queryByTestId } = render(
        <PlayerProvider>
          <FeedScreen />
        </PlayerProvider>
      );

      await waitFor(() => {
        expect(getByTestId('video-card-following_vid_1')).toBeTruthy();
      });

      // Cambiar a la pestaña "Feed"
      await act(async () => {
        fireEvent.press(getByTestId('feed-tab-feed'));
      });

      // Ahora la pestaña Feed está activa con su indicador
      expect(getByTestId('feed-tab-indicator-feed')).toBeTruthy();
      expect(queryByTestId('feed-tab-indicator-following')).toBeNull();

      // Debe mostrarse la lista de recomendados
      await waitFor(() => {
        expect(getByTestId('recommended-video-list')).toBeTruthy();
      });
      expect(getByTestId('video-card-recommended_vid_1')).toBeTruthy();

      // Cambiar de nuevo a "Following"
      await act(async () => {
        fireEvent.press(getByTestId('feed-tab-following'));
      });

      expect(getByTestId('feed-tab-indicator-following')).toBeTruthy();
      expect(getByTestId('feed-video-list')).toBeTruthy();
    });

    it('permite al usuario ver recomendaciones en "Feed" aunque todavía no tenga canales favoritos', async () => {
      // 0 favoritos
      await storage.saveFavorites([]);

      const { getByTestId, queryByTestId } = render(
        <PlayerProvider>
          <FeedScreen />
        </PlayerProvider>
      );

      // Pestañas superiores siguen visibles
      expect(getByTestId('feed-tab-following')).toBeTruthy();
      expect(getByTestId('feed-tab-feed')).toBeTruthy();

      // En "Following" se muestra el EmptyState de favoritos
      expect(getByTestId('feed-empty-favorites')).toBeTruthy();

      // Pulsamos en "Feed" (recomendados)
      await act(async () => {
        fireEvent.press(getByTestId('feed-tab-feed'));
      });

      // Ahora se cargan las recomendaciones aunque no haya suscripciones
      await waitFor(() => {
        expect(getByTestId('recommended-video-list')).toBeTruthy();
      });
      expect(getByTestId('video-card-recommended_vid_1')).toBeTruthy();
    });
  });
});
