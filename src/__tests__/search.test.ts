import { act, renderHook, waitFor } from '@testing-library/react-native';
import { config } from '../config/config';
import { useChannelSearch } from '../hooks/useChannelSearch';
import { youtubeService } from '../services/youtube';
import { YouTubeAppError } from '../types/youtube';

describe('Search Service & useChannelSearch Hook', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    youtubeService.clearInFlightRequests();
    jest.restoreAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('no realiza llamadas a la API cuando la búsqueda está vacía o es demasiado corta', async () => {
    const spy = jest.spyOn(youtubeService, 'searchChannels');
    const { result } = renderHook(() => useChannelSearch());

    act(() => {
      result.current.setQuery('   ');
    });

    act(() => {
      jest.advanceTimersByTime(config.search.debounceMs + 100);
    });

    expect(spy).not.toHaveBeenCalled();
    expect(result.current.results).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it('aplica debounce para evitar peticiones innecesarias mientras el usuario escribe', async () => {
    const spy = jest.spyOn(youtubeService, 'searchChannels').mockResolvedValue([
      {
        id: 'UC_react',
        name: 'React Native Channel',
        thumbnail: 'https://example.com/rn.jpg',
        description: 'Canal oficial',
      },
    ]);

    const { result } = renderHook(() => useChannelSearch());

    act(() => {
      result.current.setQuery('re');
    });
    act(() => {
      jest.advanceTimersByTime(100);
      result.current.setQuery('rea');
    });
    act(() => {
      jest.advanceTimersByTime(100);
      result.current.setQuery('react');
    });

    // Todavía no ha transcurrido el tiempo de debounce completo desde la última pulsación
    expect(spy).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(config.search.debounceMs);
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith('react');
    expect(result.current.results).toHaveLength(1);
    expect(result.current.results[0].name).toBe('React Native Channel');
  });

  it('parsea correctamente los resultados de búsqueda desde YouTube Data API v3', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        items: [
          {
            id: { channelId: 'UC_expo_dev' },
            snippet: {
              title: 'Expo &amp; React Native',
              description: 'Canal de desarrollo móvil',
              thumbnails: {
                high: { url: 'https://example.com/expo.jpg' },
              },
            },
          },
        ],
      }),
    }) as unknown as typeof fetch;

    const channels = await youtubeService.searchChannels('expo', 'mock-api-key');
    expect(channels).toHaveLength(1);
    expect(channels[0]).toEqual({
      id: 'UC_expo_dev',
      name: 'Expo & React Native',
      thumbnail: 'https://example.com/expo.jpg',
      description: 'Canal de desarrollo móvil',
    });
  });

  it('gestiona errores de red o rate limits durante la búsqueda', async () => {
    jest
      .spyOn(youtubeService, 'searchChannels')
      .mockRejectedValue(
        new YouTubeAppError(
          'No se pudo conectar con YouTube.',
          'NETWORK_ERROR',
          true
        )
      );

    const { result } = renderHook(() => useChannelSearch());

    act(() => {
      result.current.setQuery('expo');
    });

    await act(async () => {
      jest.advanceTimersByTime(config.search.debounceMs);
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.results).toEqual([]);
    expect(result.current.error).not.toBeNull();
    expect(result.current.error?.code).toBe('NETWORK_ERROR');
  });

  it('busca canales sin necesidad de API key mediante el modo público sin clave', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        contents: {
          twoColumnSearchResultsRenderer: {
            primaryContents: {
              sectionListRenderer: {
                contents: [
                  {
                    itemSectionRenderer: {
                      contents: [
                        {
                          channelRenderer: {
                            channelId: 'UC8LeXCWOalN8SxlrPcG-PaQ',
                            title: { simpleText: 'midudev' },
                            thumbnail: {
                              thumbnails: [{ url: '//yt3.ggpht.com/avatar.jpg' }],
                            },
                            descriptionSnippet: {
                              runs: [{ text: 'Desarrollo web y programación' }],
                            },
                          },
                        },
                      ],
                    },
                  },
                ],
              },
            },
          },
        },
      }),
    }) as unknown as typeof fetch;

    const channels = await youtubeService.searchChannels('midudev', '');
    expect(channels).toHaveLength(1);
    expect(channels[0]).toEqual({
      id: 'UC8LeXCWOalN8SxlrPcG-PaQ',
      name: 'midudev',
      thumbnail: 'https://yt3.ggpht.com/avatar.jpg',
      description: 'Desarrollo web y programación',
    });
  });

  it('busca vídeos sin necesidad de API key extrayendo duración, canal y visitas', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        contents: {
          twoColumnSearchResultsRenderer: {
            primaryContents: {
              sectionListRenderer: {
                contents: [
                  {
                    itemSectionRenderer: {
                      contents: [
                        {
                          videoRenderer: {
                            videoId: 'vid_search_1',
                            title: { runs: [{ text: 'Curso de React Native desde cero' }] },
                            thumbnail: {
                              thumbnails: [{ url: 'https://i.ytimg.com/vi/vid_search_1/hqdefault.jpg' }],
                            },
                            ownerText: {
                              runs: [
                                {
                                  text: 'midudev',
                                  navigationEndpoint: {
                                    browseEndpoint: {
                                      browseId: 'UC8LeXCWOalN8SxlrPcG-PaQ',
                                    },
                                  },
                                },
                              ],
                            },
                            publishedTimeText: { simpleText: 'hace 2 semanas' },
                            lengthText: { simpleText: '15:30' },
                            viewCountText: { simpleText: '125.400 visualizaciones' },
                          },
                        },
                      ],
                    },
                  },
                ],
              },
            },
          },
        },
      }),
    }) as unknown as typeof fetch;

    const videos = await youtubeService.searchVideos('react native', '');
    expect(videos).toHaveLength(1);
    expect(videos[0]).toEqual({
      id: 'vid_search_1',
      title: 'Curso de React Native desde cero',
      thumbnail: 'https://i.ytimg.com/vi/vid_search_1/hqdefault.jpg',
      channelId: 'UC8LeXCWOalN8SxlrPcG-PaQ',
      channelTitle: 'midudev',
      publishedAt: 'hace 2 semanas',
      durationSeconds: 930,
      durationFormatted: '15:30',
      viewCount: 125400,
    });
  });
});
