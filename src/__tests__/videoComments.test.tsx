import React, { useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { PersistentPlayerHost } from '../components/PersistentPlayerHost';
import { config } from '../config/config';
import { PlayerProvider, usePlayer } from '../context/PlayerContext';
import { clearCommentsMemoryCache } from '../hooks/useVideoComments';
import { storage } from '../services/storage';
import { youtubeService } from '../services/youtube';
import { VideoItem } from '../types/youtube';

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
    WebView: ReactLib.forwardRef((props: any, ref: any) => {
      ReactLib.useImperativeHandle(ref, () => ({
        injectJavaScript: jest.fn(),
      }));
      return <View testID="mock-webview" {...props} />;
    }),
  };
});

function TestPlayerLauncher({ video }: { video: VideoItem }) {
  const { openVideo } = usePlayer();
  useEffect(() => {
    openVideo(video);
  }, [openVideo, video]);
  return <PersistentPlayerHost />;
}

describe('Comentarios, Respuestas y Descripción Reducida ("Ver más" / "Ver menos") en el Vídeo', () => {
  beforeEach(async () => {
    storage.resetMemoryCache();
    clearCommentsMemoryCache();
    youtubeService.clearInFlightRequests();
    await AsyncStorage.clear();
    jest.restoreAllMocks();
  });

  it('obtiene comentarios usando YouTube Data API v3 cuando hay API key', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        items: [
          {
            id: 'thread_1',
            snippet: {
              totalReplyCount: 4,
              topLevelComment: {
                id: 'comment_1',
                snippet: {
                  authorDisplayName: '@carlos_dev',
                  authorProfileImageUrl: 'https://example.com/avatar1.jpg',
                  textOriginal: '¡Gran explicación de React Native &amp; Expo!',
                  likeCount: 120,
                  publishedAt: '2026-10-08T10:00:00Z',
                },
              },
            },
          },
        ],
      }),
    }) as unknown as typeof fetch;

    const comments = await youtubeService.getVideoComments('vid_api_1', 'mock-api-key');
    expect(comments).toHaveLength(1);
    expect(comments[0]).toEqual({
      id: 'comment_1',
      authorName: '@carlos_dev',
      authorAvatar: 'https://example.com/avatar1.jpg',
      text: '¡Gran explicación de React Native & Expo!',
      publishedAt: '2026-10-08T10:00:00Z',
      likeCount: 120,
      replyCount: 4,
    });
  });

  it('obtiene comentarios y el token de sus respuestas sin API key mediante InnerTube (/youtubei/v1/next)', async () => {
    global.fetch = jest
      .fn()
      // 1ª petición: metadatos del vídeo + token de continuación de comentarios
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          contents: {
            twoColumnWatchNextResults: {
              results: {
                results: {
                  contents: [
                    {
                      itemSectionRenderer: {
                        sectionIdentifier: 'comment-item-section',
                        contents: [
                          {
                            continuationItemRenderer: {
                              continuationEndpoint: {
                                continuationCommand: {
                                  token: 'mock_comments_continuation_token',
                                },
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
      })
      // 2ª petición: listado de comentarios con formato moderno (commentEntityPayload) y token de respuestas
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          onResponseReceivedEndpoints: [
            {
              appendContinuationItemsAction: {
                continuationItems: [
                  {
                    commentThreadRenderer: {
                      commentViewModel: {
                        commentViewModel: {
                          commentId: 'c_innertube_1',
                        },
                      },
                      replies: {
                        commentRepliesRenderer: {
                          contents: [
                            {
                              continuationItemRenderer: {
                                continuationEndpoint: {
                                  continuationCommand: {
                                    token: 'mock_reply_token_1',
                                  },
                                },
                              },
                            },
                          ],
                        },
                      },
                    },
                  },
                ],
              },
            },
          ],
          frameworkUpdates: {
            entityBatchUpdate: {
              mutations: [
                {
                  entityKey: 'key_1',
                  payload: {
                    commentEntityPayload: {
                      properties: {
                        commentId: 'c_innertube_1',
                        content: {
                          content: 'Excelente vídeo, me ayudó muchísimo.',
                        },
                        publishedTime: 'hace 3 horas',
                        replyLevel: 0,
                      },
                      author: {
                        displayName: '@laura_code',
                        avatarThumbnailUrl: '//yt3.ggpht.com/laura.jpg',
                      },
                      toolbar: {
                        likeCountNotliked: '45',
                        replyCount: '2',
                      },
                    },
                  },
                },
              ],
            },
          },
        }),
      })
      // 3ª petición: respuestas del comentario usando el token de continuación de respuestas
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          onResponseReceivedEndpoints: [
            {
              appendContinuationItemsAction: {
                continuationItems: [
                  {
                    commentViewModel: {
                      commentViewModel: {
                        commentId: 'reply_innertube_1',
                      },
                    },
                  },
                ],
              },
            },
          ],
          frameworkUpdates: {
            entityBatchUpdate: {
              mutations: [
                {
                  entityKey: 'key_reply_1',
                  payload: {
                    commentEntityPayload: {
                      properties: {
                        commentId: 'reply_innertube_1',
                        content: {
                          content: 'Totalmente de acuerdo contigo, Laura.',
                        },
                        publishedTime: 'hace 1 hora',
                        replyLevel: 1,
                      },
                      author: {
                        displayName: '@pedro_js',
                      },
                      toolbar: {
                        likeCountNotliked: '7',
                      },
                    },
                  },
                },
              ],
            },
          },
        }),
      }) as unknown as typeof fetch;

    const comments = await youtubeService.getVideoComments('vid_nokey_1', '');
    expect(comments).toHaveLength(1);
    expect(comments[0]).toEqual({
      id: 'c_innertube_1',
      authorName: '@laura_code',
      authorAvatar: 'https://yt3.ggpht.com/laura.jpg',
      text: 'Excelente vídeo, me ayudó muchísimo.',
      publishedAt: 'hace 3 horas',
      likeCount: 45,
      replyCount: 2,
      repliesContinuationToken: 'mock_reply_token_1',
    });

    const replies = await youtubeService.getCommentReplies(comments[0], '');
    expect(replies).toHaveLength(1);
    expect(replies[0]).toEqual({
      id: 'reply_innertube_1',
      authorName: '@pedro_js',
      text: 'Totalmente de acuerdo contigo, Laura.',
      publishedAt: 'hace 1 hora',
      likeCount: 7,
    });
  });

  it('muestra la descripción reducida ("Ver más" / "Ver menos"), los comentarios debajo y permite desplegar/ocultar las respuestas de cada comentario', async () => {
    jest.spyOn(youtubeService, 'getVideoComments').mockResolvedValue([
      {
        id: 'comm_ui_1',
        authorName: '@dev_fan',
        text: 'Primer comentario debajo de la descripción',
        publishedAt: 'hace 1 día',
        likeCount: 18,
        replyCount: 2,
        repliesContinuationToken: 'token_replies_comm_1',
      },
      {
        id: 'comm_ui_2',
        authorName: '@ana_ux',
        text: 'Me encanta el nuevo diseño compacto',
        publishedAt: 'hace 5 horas',
      },
    ]);

    const getRepliesSpy = jest
      .spyOn(youtubeService, 'getCommentReplies')
      .mockResolvedValue([
        {
          id: 'rep_ui_1',
          authorName: '@creador_canal',
          text: '¡Muchas gracias por ver el vídeo!',
          publishedAt: 'hace 12 horas',
          likeCount: 5,
        },
        {
          id: 'rep_ui_2',
          authorName: '@otro_usuario',
          text: 'A mí también me funcionó a la primera.',
          publishedAt: 'hace 3 horas',
        },
      ]);

    const sampleVideo: VideoItem = {
      id: 'vid_player_ui',
      title: 'Aprende TypeScript Avanzado',
      channelId: 'UC_ts',
      channelTitle: 'Canal TS',
      publishedAt: '2026-10-07T12:00:00Z',
      thumbnail: 'https://i.ytimg.com/vi/vid_player_ui/hqdefault.jpg',
      description:
        'Línea 1 de la descripción.\nLínea 2 de la descripción.\nLínea 3 de la descripción.\nLínea 4 adicional muy larga.\nLínea 5 final.',
      viewCount: 15400,
    };

    const { getByTestId, getByText, queryByTestId } = render(
      <PlayerProvider>
        <TestPlayerLauncher video={sampleVideo} />
      </PlayerProvider>
    );

    await waitFor(() => {
      expect(getByTestId('video-description-card')).toBeTruthy();
    });

    const descText = getByTestId('video-description-text');
    const toggleBtn = getByTestId('description-toggle-button');
    const toggleText = getByTestId('description-toggle-text');

    // Por defecto la descripción aparece reducida a config.comments.descriptionCollapsedLines (3 líneas) y muestra "Ver más"
    expect(descText.props.numberOfLines).toBe(
      config.comments.descriptionCollapsedLines
    );
    expect(toggleText.props.children).toBe('Ver más');

    // Al pulsar "Ver más", se expande completa (numberOfLines = undefined) y el botón cambia a "Ver menos"
    fireEvent.press(toggleBtn);
    expect(getByTestId('video-description-text').props.numberOfLines).toBeUndefined();
    expect(getByTestId('description-toggle-text').props.children).toBe('Ver menos');

    // Al pulsar "Ver menos", vuelve a contraerse
    fireEvent.press(toggleBtn);
    expect(getByTestId('video-description-text').props.numberOfLines).toBe(
      config.comments.descriptionCollapsedLines
    );
    expect(getByTestId('description-toggle-text').props.children).toBe('Ver más');

    // Debajo de la descripción aparecen los comentarios cargados
    await waitFor(() => {
      expect(getByTestId('video-comments-section')).toBeTruthy();
      expect(getByTestId('video-comments-list')).toBeTruthy();
    });

    expect(getByTestId('video-comment-item-comm_ui_1')).toBeTruthy();
    expect(getByTestId('video-comment-item-comm_ui_2')).toBeTruthy();
    expect(getByText('@dev_fan')).toBeTruthy();
    expect(getByText('Primer comentario debajo de la descripción')).toBeTruthy();

    // El primer comentario tiene 2 respuestas (inicialmente contraídas) y el segundo no tiene botón de respuestas
    const repliesToggleBtn = getByTestId('comment-replies-toggle-comm_ui_1');
    expect(getByTestId('comment-replies-toggle-text-comm_ui_1').props.children).toBe(
      '2 respuestas'
    );
    expect(queryByTestId('comment-replies-toggle-comm_ui_2')).toBeNull();
    expect(queryByTestId('comment-replies-container-comm_ui_1')).toBeNull();

    // Al pulsar en "2 respuestas", se despliegan las respuestas del comentario
    fireEvent.press(repliesToggleBtn);

    await waitFor(() => {
      expect(getByTestId('comment-replies-container-comm_ui_1')).toBeTruthy();
      expect(getByTestId('comment-reply-item-rep_ui_1')).toBeTruthy();
      expect(getByTestId('comment-reply-item-rep_ui_2')).toBeTruthy();
    });

    expect(getRepliesSpy).toHaveBeenCalledTimes(1);
    expect(getByText('@creador_canal')).toBeTruthy();
    expect(getByText('¡Muchas gracias por ver el vídeo!')).toBeTruthy();
    expect(getByText('@otro_usuario')).toBeTruthy();
    expect(getByText('A mí también me funcionó a la primera.')).toBeTruthy();
    expect(getByTestId('comment-replies-toggle-text-comm_ui_1').props.children).toBe(
      'Ocultar respuestas'
    );

    // Al pulsar en "Ocultar respuestas", se pliegan las respuestas
    fireEvent.press(repliesToggleBtn);
    expect(queryByTestId('comment-replies-container-comm_ui_1')).toBeNull();
    expect(getByTestId('comment-replies-toggle-text-comm_ui_1').props.children).toBe(
      '2 respuestas'
    );
  });
});
