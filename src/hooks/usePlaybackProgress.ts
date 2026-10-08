import { useCallback, useEffect, useRef, useState } from 'react';
import { config } from '../config/config';
import { storage } from '../services/storage';
import { PlaybackProgressEntry, PlaybackProgressMap } from '../types/youtube';
import { calculateProgressRatio, isVideoCompleted } from '../utils/format';

export interface UsePlaybackProgressReturn {
  progressMap: PlaybackProgressMap;
  loading: boolean;
  entry: PlaybackProgressEntry | null;
  resumePosition: number;
  progressRatio: number;
  isCompleted: boolean;
  getProgress: (videoId: string) => PlaybackProgressEntry | null;
  updatePlaybackState: (position: number, duration: number) => void;
  flushProgress: (position?: number, duration?: number) => Promise<PlaybackProgressEntry | null>;
  restartVideoProgress: (targetVideoId?: string) => Promise<void>;
}

/**
 * Hook para gestionar el progreso de reproducción tanto a nivel global (Feed)
 * como para un vídeo específico (Reproductor) con guardado periódico cada N segundos
 * y guardado automático al salir del reproductor.
 */
export function usePlaybackProgress(videoId?: string): UsePlaybackProgressReturn {
  const [progressMap, setProgressMap] = useState<PlaybackProgressMap>({});
  const [loading, setLoading] = useState<boolean>(true);

  const latestPositionRef = useRef<number>(0);
  const latestDurationRef = useRef<number>(0);
  const hasUnsavedChangesRef = useRef<boolean>(false);
  const videoIdRef = useRef<string | undefined>(videoId);
  videoIdRef.current = videoId;

  useEffect(() => {
    let mounted = true;

    storage
      .getPlaybackProgress()
      .then((stored) => {
        if (!mounted) return;
        setProgressMap(stored);
        if (videoId && stored[videoId]) {
          latestPositionRef.current = stored[videoId].position;
          latestDurationRef.current = stored[videoId].duration;
        }
      })
      .finally(() => {
        if (mounted) {
          setLoading(false);
        }
      });

    const unsubscribe = storage.subscribeProgress((updated) => {
      if (mounted) {
        setProgressMap(updated);
      }
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [videoId]);

  const flushProgress = useCallback(
    async (
      explicitPosition?: number,
      explicitDuration?: number
    ): Promise<PlaybackProgressEntry | null> => {
      const activeVideoId = videoIdRef.current;
      if (!activeVideoId) {
        return null;
      }

      const pos = explicitPosition ?? latestPositionRef.current;
      const dur = explicitDuration ?? latestDurationRef.current;

      latestPositionRef.current = pos;
      if (dur > 0) {
        latestDurationRef.current = dur;
      }

      hasUnsavedChangesRef.current = false;
      return await storage.updateVideoProgress(activeVideoId, pos, dur);
    },
    []
  );

  const updatePlaybackState = useCallback((position: number, duration: number) => {
    if (Number.isFinite(position) && position >= 0) {
      latestPositionRef.current = position;
      hasUnsavedChangesRef.current = true;
    }
    if (Number.isFinite(duration) && duration > 0) {
      latestDurationRef.current = duration;
    }
  }, []);

  // Guardado periódico configurable (por defecto cada 10 segundos)
  useEffect(() => {
    if (!videoId) {
      return;
    }

    const intervalMs = config.playback.progressSaveInterval * 1000;
    const intervalId = setInterval(() => {
      if (hasUnsavedChangesRef.current && latestPositionRef.current > 0) {
        flushProgress();
      }
    }, intervalMs);

    return () => {
      clearInterval(intervalId);
      // Guardar también al abandonar el reproductor siempre que sea posible
      if (hasUnsavedChangesRef.current && latestPositionRef.current > 0) {
        storage.updateVideoProgress(
          videoId,
          latestPositionRef.current,
          latestDurationRef.current
        );
      }
    };
  }, [videoId, flushProgress]);

  const restartVideoProgress = useCallback(
    async (targetVideoId?: string) => {
      const idToClear = targetVideoId ?? videoIdRef.current;
      if (!idToClear) {
        return;
      }
      latestPositionRef.current = 0;
      hasUnsavedChangesRef.current = false;
      await storage.clearVideoProgress(idToClear);
    },
    []
  );

  const getProgress = useCallback(
    (targetId: string): PlaybackProgressEntry | null => {
      return progressMap[targetId] ?? null;
    },
    [progressMap]
  );

  const entry = videoId ? progressMap[videoId] ?? null : null;
  const isCompleted = entry
    ? Boolean(entry.completed || isVideoCompleted(entry.position, entry.duration))
    : false;

  // Si el vídeo ya fue terminado previamente, al abrirlo permitimos reanudar desde 0
  // (o el usuario puede reiniciar manualmente en cualquier momento)
  const resumePosition = entry && !isCompleted ? entry.position : 0;
  const progressRatio = entry
    ? calculateProgressRatio(entry.position, entry.duration)
    : 0;

  return {
    progressMap,
    loading,
    entry,
    resumePosition,
    progressRatio,
    isCompleted,
    getProgress,
    updatePlaybackState,
    flushProgress,
    restartVideoProgress,
  };
}
