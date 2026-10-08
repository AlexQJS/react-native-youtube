import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';
import { storage } from '../services/storage';
import { VideoItem } from '../types/youtube';

export interface PlayerContextValue {
  activeVideo: VideoItem | null;
  isMinimized: boolean;
  openVideo: (video: VideoItem) => void;
  minimizeVideo: () => void;
  expandVideo: () => void;
  closeVideo: () => void;
}

const PlayerContext = createContext<PlayerContextValue | undefined>(undefined);

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const [activeVideo, setActiveVideo] = useState<VideoItem | null>(null);
  const [isMinimized, setIsMinimized] = useState<boolean>(false);

  const openVideo = useCallback((video: VideoItem) => {
    setActiveVideo(video);
    setIsMinimized(false);
    // Registrar automáticamente el vídeo en el Historial al abrirlo
    storage.recordVideoWatch(video).catch(() => {});
  }, []);

  const minimizeVideo = useCallback(() => {
    setIsMinimized(true);
  }, []);

  const expandVideo = useCallback(() => {
    setIsMinimized(false);
  }, []);

  const closeVideo = useCallback(() => {
    setActiveVideo(null);
    setIsMinimized(false);
  }, []);

  const value = useMemo<PlayerContextValue>(
    () => ({
      activeVideo,
      isMinimized,
      openVideo,
      minimizeVideo,
      expandVideo,
      closeVideo,
    }),
    [activeVideo, isMinimized, openVideo, minimizeVideo, expandVideo, closeVideo]
  );

  return (
    <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>
  );
}

export function usePlayer(): PlayerContextValue {
  const ctx = useContext(PlayerContext);
  if (!ctx) {
    throw new Error('usePlayer debe usarse dentro de un PlayerProvider');
  }
  return ctx;
}
