import React from 'react';
import { act, render, renderHook, waitFor } from '@testing-library/react-native';
import { VideoCard } from '../components/VideoCard';
import { config } from '../config/config';
import { useChannelSearch } from '../hooks/useChannelSearch';
import { extractYouTubeVideoId, youtubeService } from '../services/youtube';
import { VideoItem } from '../types/youtube';

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}));

describe('Video ID & Unlisted Video Search', () => {
  beforeEach(() => {
    youtubeService.clearInFlightRequests();
    jest.restoreAllMocks();
  });

  describe('extractYouTubeVideoId', () => {
    it('extracts a raw 11-character YouTube video ID preserving case', () => {
      expect(extractYouTubeVideoId('dQw4w9WgXcQ')).toEqual({
        videoId: 'dQw4w9WgXcQ',
        isExplicitUrl: false,
      });
      expect(extractYouTubeVideoId('  aB3_dE5-gH7  ')).toEqual({
        videoId: 'aB3_dE5-gH7',
        isExplicitUrl: false,
      });
    });

    it('extracts video IDs from explicit prefixes', () => {
      expect(extractYouTubeVideoId('id:dQw4w9WgXcQ')).toEqual({
        videoId: 'dQw4w9WgXcQ',
        isExplicitUrl: true,
      });
      expect(extractYouTubeVideoId('v=aB3_dE5-gH7')).toEqual({
        videoId: 'aB3_dE5-gH7',
        isExplicitUrl: true,
      });
    });

    it('extracts video IDs from standard YouTube URLs', () => {
      const urls = [
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s',
        'https://m.youtube.com/watch?list=PL12345&v=dQw4w9WgXcQ&index=2',
        'https://youtu.be/dQw4w9WgXcQ?si=sharetoken',
        'youtu.be/dQw4w9WgXcQ',
        'https://www.youtube.com/shorts/dQw4w9WgXcQ?feature=share',
        'https://www.youtube.com/live/dQw4w9WgXcQ',
        'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
        'https://studio.youtube.com/video/dQw4w9WgXcQ/edit',
      ];

      for (const url of urls) {
        expect(extractYouTubeVideoId(url)).toEqual({
          videoId: 'dQw4w9WgXcQ',
          isExplicitUrl: true,
        });
      }
    });

    it('returns null for normal search text, channel IDs, or invalid URLs', () => {
      expect(extractYouTubeVideoId('')).toBeNull();
      expect(extractYouTubeVideoId('react native')).toBeNull();
      expect(extractYouTubeVideoId('UC8LeXCWOalN8SxlrPcG-PaQ')).toBeNull();
      expect(
        extractYouTubeVideoId('https://www.youtube.com/channel/UC8LeXCWOalN8SxlrPcG-PaQ')
      ).toBeNull();
      expect(
        extractYouTubeVideoId('https://www.youtube.com/watch?v=tooLongVideoId123')
      ).toBeNull();
      expect(extractYouTubeVideoId('https://example.com/watch?v=dQw4w9WgXcQ')).toBeNull();
    });
  });

  describe('youtubeService.getVideoById', () => {
    it('fetches an unlisted video by ID without an API key via InnerTube /player', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          playabilityStatus: { status: 'OK' },
          videoDetails: {
            videoId: 'uNlIsTeD_01',
            title: 'Unlisted Demo &amp; Walkthrough',
            lengthSeconds: '245',
            channelId: 'UC_demo_channel',
            shortDescription: 'Private link demo video',
            thumbnail: {
              thumbnails: [
                { url: 'https://i.ytimg.com/vi/uNlIsTeD_01/hqdefault.jpg' },
              ],
            },
            viewCount: '42',
            author: 'Demo Creator',
            isPrivate: false,
          },
          microformat: {
            playerMicroformatRenderer: {
              publishDate: '2026-10-12',
              isUnlisted: true,
            },
          },
        }),
      }) as unknown as typeof fetch;

      const video = await youtubeService.getVideoById('uNlIsTeD_01', '');

      expect(video).toEqual({
        id: 'uNlIsTeD_01',
        title: 'Unlisted Demo & Walkthrough',
        thumbnail: 'https://i.ytimg.com/vi/uNlIsTeD_01/hqdefault.jpg',
        channelId: 'UC_demo_channel',
        channelTitle: 'Demo Creator',
        publishedAt: '2026-10-12',
        description: 'Private link demo video',
        durationSeconds: 245,
        durationFormatted: '4:05',
        viewCount: 42,
        isUnlisted: true,
      });
    });

    it('still extracts unlisted video metadata when InnerTube /player returns UNPLAYABLE with videoDetails', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          playabilityStatus: {
            status: 'UNPLAYABLE',
            reason: 'Es necesario volver a cargar la página.',
          },
          videoDetails: {
            videoId: 'uNpLaY_1234',
            title: 'Unlisted Video With Reload Prompt',
            lengthSeconds: '125',
            channelId: 'UC_unlisted_ch',
            shortDescription: 'Unlisted description',
            thumbnail: {
              thumbnails: [
                { url: 'https://i.ytimg.com/vi/uNpLaY_1234/hqdefault.jpg' },
              ],
            },
            viewCount: '7',
            author: 'Hidden Creator',
            isPrivate: false,
            isCrawlable: false,
          },
          microformat: {
            playerMicroformatRenderer: {
              publishDate: '2026-11-10',
              isUnlisted: true,
            },
          },
        }),
      }) as unknown as typeof fetch;

      const video = await youtubeService.getVideoById('uNpLaY_1234', '');

      expect(video).toEqual({
        id: 'uNpLaY_1234',
        title: 'Unlisted Video With Reload Prompt',
        thumbnail: 'https://i.ytimg.com/vi/uNpLaY_1234/hqdefault.jpg',
        channelId: 'UC_unlisted_ch',
        channelTitle: 'Hidden Creator',
        publishedAt: '2026-11-10',
        description: 'Unlisted description',
        durationSeconds: 125,
        durationFormatted: '2:05',
        viewCount: 7,
        isUnlisted: true,
      });
    });

    it('fetches an unlisted video by ID using YouTube Data API v3 when an API key is provided', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          items: [
            {
              id: 'aPiUnLiSt_2',
              snippet: {
                title: 'API Unlisted Video',
                description: 'Shared by link',
                channelId: 'UC_api_ch',
                channelTitle: 'API Channel',
                publishedAt: '2026-09-01T12:00:00Z',
                thumbnails: {
                  high: { url: 'https://i.ytimg.com/vi/aPiUnLiSt_2/hqdefault.jpg' },
                },
              },
              contentDetails: {
                duration: 'PT3M15S',
              },
              statistics: {
                viewCount: '150',
              },
              status: {
                privacyStatus: 'unlisted',
              },
            },
          ],
        }),
      }) as unknown as typeof fetch;

      const video = await youtubeService.getVideoById('aPiUnLiSt_2', 'mock-api-key');

      expect(video).toEqual({
        id: 'aPiUnLiSt_2',
        title: 'API Unlisted Video',
        thumbnail: 'https://i.ytimg.com/vi/aPiUnLiSt_2/hqdefault.jpg',
        channelId: 'UC_api_ch',
        channelTitle: 'API Channel',
        publishedAt: '2026-09-01T12:00:00Z',
        description: 'Shared by link',
        durationSeconds: 195,
        durationFormatted: '3:15',
        viewCount: 150,
        isUnlisted: true,
      });
    });

    it('returns null for private or nonexistent videos without calling oEmbed on ERROR', async () => {
      const fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          playabilityStatus: { status: 'ERROR' },
        }),
      });
      global.fetch = fetchMock as unknown as typeof fetch;

      const video = await youtubeService.getVideoById('programming', '');
      expect(video).toBeNull();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('falls back to oEmbed when InnerTube /player does not return videoDetails', async () => {
      const fetchMock = jest
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            playabilityStatus: { status: 'LOGIN_REQUIRED' },
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            title: 'Fallback Unlisted Title',
            author_name: 'Fallback Author',
            thumbnail_url: 'https://i.ytimg.com/vi/oEmBeD_1234/hqdefault.jpg',
          }),
        });
      global.fetch = fetchMock as unknown as typeof fetch;

      const video = await youtubeService.getVideoById('oEmBeD_1234', '');
      expect(video).toEqual({
        id: 'oEmBeD_1234',
        title: 'Fallback Unlisted Title',
        thumbnail: 'https://i.ytimg.com/vi/oEmBeD_1234/hqdefault.jpg',
        channelId: '',
        channelTitle: 'Fallback Author',
        publishedAt: '',
      });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });

  describe('youtubeService.searchVideos with video IDs and URLs', () => {
    it('returns only the unlisted video when searching by its raw 11-character ID', async () => {
      const unlistedVideo: VideoItem = {
        id: 'hIdDeN_1234',
        title: 'My Unlisted Video',
        thumbnail: 'https://i.ytimg.com/vi/hIdDeN_1234/hqdefault.jpg',
        channelId: 'UC_owner',
        channelTitle: 'Owner Channel',
        publishedAt: '2026-10-01',
        durationSeconds: 180,
        durationFormatted: '3:00',
        isUnlisted: true,
      };

      jest.spyOn(youtubeService, 'getVideoById').mockResolvedValue(unlistedVideo);
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          contents: {
            twoColumnSearchResultsRenderer: {
              primaryContents: { sectionListRenderer: { contents: [] } },
            },
          },
        }),
      }) as unknown as typeof fetch;

      const results = await youtubeService.searchVideos('hIdDeN_1234', '');
      expect(results).toEqual([unlistedVideo]);
    });

    it('fetches directly by ID without text search when given a YouTube URL', async () => {
      const targetVideo: VideoItem = {
        id: 'dQw4w9WgXcQ',
        title: 'Direct URL Video',
        thumbnail: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
        channelId: 'UC_url',
        channelTitle: 'URL Channel',
        publishedAt: '2026-08-15',
        isUnlisted: true,
      };

      const byIdSpy = jest
        .spyOn(youtubeService, 'getVideoById')
        .mockResolvedValue(targetVideo);
      const fetchSpy = jest.fn();
      global.fetch = fetchSpy as unknown as typeof fetch;

      const results = await youtubeService.searchVideos(
        'https://youtu.be/dQw4w9WgXcQ?si=abc',
        ''
      );

      expect(byIdSpy).toHaveBeenCalledWith('dQw4w9WgXcQ', '');
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(results).toEqual([targetVideo]);
    });

    it('prepends the exact video and deduplicates when searching a public video ID', async () => {
      const directVideo: VideoItem = {
        id: 'pUbLiC_1234',
        title: 'Public Video Exact Match',
        thumbnail: 'https://i.ytimg.com/vi/pUbLiC_1234/hqdefault.jpg',
        channelId: 'UC_pub',
        channelTitle: 'Public Creator',
        publishedAt: '2026-07-01',
        durationSeconds: 300,
        durationFormatted: '5:00',
      };

      jest.spyOn(youtubeService, 'getVideoById').mockResolvedValue(directVideo);
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
                              videoId: 'pUbLiC_1234',
                              title: { runs: [{ text: 'Public Video Exact Match' }] },
                              thumbnail: {
                                thumbnails: [
                                  {
                                    url: 'https://i.ytimg.com/vi/pUbLiC_1234/hqdefault.jpg',
                                  },
                                ],
                              },
                              ownerText: { runs: [{ text: 'Public Creator' }] },
                              publishedTimeText: { simpleText: '2 days ago' },
                              lengthText: { simpleText: '5:00' },
                            },
                          },
                          {
                            videoRenderer: {
                              videoId: 'rElAtEd_999',
                              title: { runs: [{ text: 'Related Video' }] },
                              thumbnail: {
                                thumbnails: [
                                  {
                                    url: 'https://i.ytimg.com/vi/rElAtEd_999/hqdefault.jpg',
                                  },
                                ],
                              },
                              ownerText: { runs: [{ text: 'Other Creator' }] },
                              publishedTimeText: { simpleText: '1 day ago' },
                              lengthText: { simpleText: '4:00' },
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

      const results = await youtubeService.searchVideos('pUbLiC_1234', '');
      expect(results).toHaveLength(2);
      expect(results[0].id).toBe('pUbLiC_1234');
      expect(results[1].id).toBe('rElAtEd_999');
    });

    it('falls back seamlessly to normal text search for regular 11-letter words', async () => {
      jest.spyOn(youtubeService, 'getVideoById').mockResolvedValue(null);
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
                              videoId: 'prog_vid_01',
                              title: { runs: [{ text: 'Programming Basics' }] },
                              thumbnail: {
                                thumbnails: [
                                  {
                                    url: 'https://i.ytimg.com/vi/prog_vid_01/hqdefault.jpg',
                                  },
                                ],
                              },
                              ownerText: {
                                runs: [
                                  {
                                    text: 'Code Academy',
                                    navigationEndpoint: {
                                      browseEndpoint: { browseId: 'UC_code' },
                                    },
                                  },
                                ],
                              },
                              publishedTimeText: { simpleText: '1 day ago' },
                              lengthText: { simpleText: '10:00' },
                              viewCountText: { simpleText: '500 views' },
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

      const results = await youtubeService.searchVideos('programming', '');
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('prog_vid_01');
      expect(results[0].title).toBe('Programming Basics');
    });
  });

  describe('useChannelSearch hook with video IDs and URLs', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('skips channel search when searching an explicit YouTube URL', async () => {
      const unlistedVideo: VideoItem = {
        id: 'uRlViDeO_99',
        title: 'Unlisted via URL',
        thumbnail: 'https://i.ytimg.com/vi/uRlViDeO_99/hqdefault.jpg',
        channelId: 'UC_creator',
        channelTitle: 'Creator',
        publishedAt: '2026-10-05',
        isUnlisted: true,
      };

      const channelSpy = jest.spyOn(youtubeService, 'searchChannels');
      const videoSpy = jest
        .spyOn(youtubeService, 'searchVideos')
        .mockResolvedValue([unlistedVideo]);

      const { result, unmount } = await renderHook(() => useChannelSearch());

      await act(async () => {
        result.current.setQuery('https://www.youtube.com/watch?v=uRlViDeO_99');
      });

      await act(async () => {
        jest.advanceTimersByTime(config.search.debounceMs);
        await Promise.resolve();
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(channelSpy).not.toHaveBeenCalled();
      expect(videoSpy).toHaveBeenCalledWith('https://www.youtube.com/watch?v=uRlViDeO_99');
      expect(result.current.results).toEqual([]);
      expect(result.current.videoResults).toEqual([unlistedVideo]);
      await unmount();
    });

    it('clears unrelated channels when a raw 11-char ID matches an unlisted video', async () => {
      const unlistedVideo: VideoItem = {
        id: 'rAwUnLiSt_7',
        title: 'Raw ID Unlisted Video',
        thumbnail: 'https://i.ytimg.com/vi/rAwUnLiSt_7/hqdefault.jpg',
        channelId: 'UC_creator',
        channelTitle: 'Creator',
        publishedAt: '2026-10-05',
        isUnlisted: true,
      };

      jest.spyOn(youtubeService, 'searchChannels').mockResolvedValue([
        {
          id: 'UC_noise',
          name: 'Unrelated Channel',
          thumbnail: 'https://example.com/noise.jpg',
        },
      ]);
      jest.spyOn(youtubeService, 'searchVideos').mockResolvedValue([unlistedVideo]);

      const { result, unmount } = await renderHook(() => useChannelSearch());

      await act(async () => {
        result.current.setQuery('rAwUnLiSt_7');
      });

      await act(async () => {
        jest.advanceTimersByTime(config.search.debounceMs);
        await Promise.resolve();
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.results).toEqual([]);
      expect(result.current.videoResults).toEqual([unlistedVideo]);
      await unmount();
    });
  });

  describe('VideoCard unlisted badge', () => {
    const baseVideo: VideoItem = {
      id: 'uNlIsTeD_99',
      title: 'Secret Demo',
      thumbnail: 'https://i.ytimg.com/vi/uNlIsTeD_99/hqdefault.jpg',
      channelId: 'UC_test',
      channelTitle: 'Test Channel',
      publishedAt: '2026-10-18T10:00:00Z',
    };

    it('renders the Unlisted badge when video.isUnlisted is true', async () => {
      const { getByTestId, getByText } = await render(
        <VideoCard video={{ ...baseVideo, isUnlisted: true }} onPress={jest.fn()} />
      );

      expect(getByTestId('video-unlisted-badge-uNlIsTeD_99')).toBeTruthy();
      expect(getByText('Unlisted')).toBeTruthy();
    });

    it('does not render the Unlisted badge for regular videos', async () => {
      const { queryByTestId } = await render(
        <VideoCard video={baseVideo} onPress={jest.fn()} />
      );

      expect(queryByTestId('video-unlisted-badge-uNlIsTeD_99')).toBeNull();
    });
  });
});
