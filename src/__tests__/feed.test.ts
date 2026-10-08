import AsyncStorage from '@react-native-async-storage/async-storage';
import { renderHook, waitFor } from '@testing-library/react-native';
import { useFeed } from '../hooks/useFeed';
import { storage } from '../services/storage';
import { youtubeService } from '../services/youtube';
import { FavoriteChannel, YouTubeAppError } from '../types/youtube';

describe('Feed Service & Hook', () => {
  const sampleChannels: FavoriteChannel[] = [
    { id: 'UC_channel_A', name: 'Canal A', thumbnail: 'https://example.com/a.jpg' },
    { id: 'UC_channel_B', name: 'Canal B', thumbnail: 'https://example.com/b.jpg' },
  ];

  beforeEach(async () => {
    storage.resetMemoryCache();
    youtubeService.clearInFlightRequests();
    await AsyncStorage.clear();
    jest.restoreAllMocks();
  });

  it('devuelve un feed vacío sin llamar a la API cuando no hay canales favoritos', async () => {
    const spy = jest.spyOn(youtubeService, 'getFeedForChannels');
    const { result } = renderHook(() => useFeed([], false));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.videos).toEqual([]);
    expect(result.current.error).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it('combina vídeos de múltiples canales y los ordena del más reciente al más antiguo', async () => {
    jest.spyOn(youtubeService, 'getChannelVideos').mockImplementation(async (channel) => {
      if (channel.id === 'UC_channel_A') {
        return [
          {
            id: 'vid_older',
            title: 'Vídeo Antiguo Canal A',
            thumbnail: 'https://example.com/v1.jpg',
            channelId: 'UC_channel_A',
            channelTitle: 'Canal A',
            publishedAt: '2026-10-01T10:00:00Z',
          },
          {
            id: 'vid_newest',
            title: 'Vídeo Más Reciente Canal A',
            thumbnail: 'https://example.com/v2.jpg',
            channelId: 'UC_channel_A',
            channelTitle: 'Canal A',
            publishedAt: '2026-10-08T12:00:00Z',
          },
        ];
      }
      return [
        {
          id: 'vid_middle',
          title: 'Vídeo Intermedio Canal B',
          thumbnail: 'https://example.com/v3.jpg',
          channelId: 'UC_channel_B',
          channelTitle: 'Canal B',
          publishedAt: '2026-10-05T15:30:00Z',
        },
      ];
    });

    jest
      .spyOn(youtubeService, 'enrichVideosWithDetails')
      .mockImplementation(async (videos) => videos);

    const { result } = renderHook(() => useFeed(sampleChannels, false));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBeNull();
    expect(result.current.videos.map((v) => v.id)).toEqual([
      'vid_newest',
      'vid_middle',
      'vid_older',
    ]);
  });

  it('reutiliza la caché local vigente sin lanzar peticiones adicionales al cambiar de pestaña', async () => {
    const signature = sampleChannels
      .map((c) => c.id)
      .sort()
      .join(',');

    await storage.saveFeedCache(
      [
        {
          id: 'cached_vid_1',
          title: 'Vídeo en Caché',
          thumbnail: 'https://example.com/c1.jpg',
          channelId: 'UC_channel_A',
          channelTitle: 'Canal A',
          publishedAt: '2026-10-08T09:00:00Z',
          durationSeconds: 300,
          durationFormatted: '5:00',
        },
      ],
      signature
    );

    const spy = jest.spyOn(youtubeService, 'getFeedForChannels');
    const { result } = renderHook(() => useFeed(sampleChannels, false));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(spy).not.toHaveBeenCalled();
    expect(result.current.videos).toHaveLength(1);
    expect(result.current.videos[0].id).toBe('cached_vid_1');
  });

  it('gestiona errores de API correctamente cuando no hay datos en caché', async () => {
    jest
      .spyOn(youtubeService, 'getFeedForChannels')
      .mockRejectedValue(
        new YouTubeAppError('Cuota de API excedida', 'RATE_LIMIT', true, 429)
      );

    const { result } = renderHook(() => useFeed(sampleChannels, false));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.videos).toEqual([]);
    expect(result.current.error).not.toBeNull();
    expect(result.current.error?.code).toBe('RATE_LIMIT');
  });

  it('obtiene vídeos desde el Feed RSS público de YouTube sin necesidad de API key y distingue Shorts', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => `<?xml version="1.0" encoding="UTF-8"?>
        <feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns:media="http://search.yahoo.com/mrss/">
          <entry>
            <yt:videoId>rss_vid_1</yt:videoId>
            <title>Vídeo Normal desde RSS &amp; Sin API Key</title>
            <link rel="alternate" href="https://www.youtube.com/watch?v=rss_vid_1"/>
            <published>2026-10-08T10:00:00+00:00</published>
            <author><name>Canal A</name></author>
            <media:group>
              <media:thumbnail url="https://i1.ytimg.com/vi/rss_vid_1/hqdefault.jpg" />
              <media:description>Descripción RSS</media:description>
              <media:community>
                <media:statistics views="93966"/>
              </media:community>
            </media:group>
          </entry>
          <entry>
            <yt:videoId>rss_short_1</yt:videoId>
            <title>Mi Short vertical</title>
            <link rel="alternate" href="https://www.youtube.com/shorts/rss_short_1"/>
            <published>2026-10-08T11:00:00+00:00</published>
            <author><name>Canal A</name></author>
            <media:group>
              <media:thumbnail url="https://i1.ytimg.com/vi/rss_short_1/hqdefault.jpg" />
              <media:description>Un vídeo corto #shorts</media:description>
            </media:group>
          </entry>
        </feed>`,
    }) as unknown as typeof fetch;

    const videos = await youtubeService.getChannelVideos(sampleChannels[0], '');
    expect(videos).toHaveLength(2);
    expect(videos[0]).toEqual({
      id: 'rss_vid_1',
      title: 'Vídeo Normal desde RSS & Sin API Key',
      description: 'Descripción RSS',
      thumbnail: 'https://i1.ytimg.com/vi/rss_vid_1/hqdefault.jpg',
      channelId: 'UC_channel_A',
      channelTitle: 'Canal A',
      publishedAt: '2026-10-08T10:00:00+00:00',
      viewCount: 93966,
    });
    expect(videos[0].isShort).toBeUndefined();
    expect(videos[1].id).toBe('rss_short_1');
    expect(videos[1].isShort).toBe(true);
  });

  it('consulta en paralelo las listas UULF (vídeos normales) y UUSH (Shorts) para canales de YouTube reales', async () => {
    const realChannel: FavoriteChannel = {
      id: 'UC8LeXCWOalN8SxlrPcG-PaQ',
      name: 'midudev',
      thumbnail: 'https://example.com/midu.jpg',
    };

    global.fetch = jest.fn().mockImplementation(async (url: string) => {
      if (url.includes('playlist_id=UULF')) {
        return {
          ok: true,
          status: 200,
          text: async () => `<feed><entry><yt:videoId>normal_1</yt:videoId><title>Vídeo largo</title><published>2026-10-08T10:00:00Z</published></entry></feed>`,
        };
      }
      if (url.includes('playlist_id=UUSH')) {
        return {
          ok: true,
          status: 200,
          text: async () => `<feed><entry><yt:videoId>short_1</yt:videoId><title>Short vertical</title><published>2026-10-08T11:00:00Z</published></entry></feed>`,
        };
      }
      throw new Error('Unexpected URL');
    }) as unknown as typeof fetch;

    const videos = await youtubeService.getChannelVideos(realChannel, '');
    expect(videos).toHaveLength(2);
    const normal = videos.find((v) => v.id === 'normal_1');
    const short = videos.find((v) => v.id === 'short_1');
    expect(normal?.isShort).toBeFalsy();
    expect(short?.isShort).toBe(true);
  });
});
