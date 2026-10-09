import React, { useEffect } from 'react';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { usePlayer } from '../../context/PlayerContext';

/**
 * Ruta de enlace directo a un vídeo (/player/[id]).
 * Abre el vídeo en el reproductor persistente (con soporte de Mini Reproductor)
 * y mantiene activa la vista principal del Feed debajo.
 */
export default function PlayerRouteScreen() {
  const { openVideo } = usePlayer();
  const params = useLocalSearchParams<{
    id?: string;
    title?: string;
    channelTitle?: string;
    channelId?: string;
    publishedAt?: string;
    durationSeconds?: string;
    isShort?: string;
  }>();

  const videoId = typeof params.id === 'string' ? params.id : '';

  useEffect(() => {
    if (videoId) {
      openVideo({
        id: videoId,
        title: params.title || 'Reproduciendo vídeo',
        channelTitle: params.channelTitle || '',
        channelId: params.channelId || '',
        publishedAt: params.publishedAt || '',
        thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        durationSeconds: params.durationSeconds
          ? Number(params.durationSeconds)
          : undefined,
        isShort:
          params.isShort === 'true' || params.isShort === '1'
            ? true
            : params.isShort === 'false' || params.isShort === '0'
              ? false
              : undefined,
      });
    }
  }, [
    openVideo,
    params.channelId,
    params.channelTitle,
    params.durationSeconds,
    params.isShort,
    params.publishedAt,
    params.title,
    videoId,
  ]);

  return <Redirect href="/feed" />;
}
