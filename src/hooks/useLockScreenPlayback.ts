import { useCallback, useEffect, useState } from 'react';
import { config } from '../config/config';
import { deviceLock } from '../services/deviceLock';
import { storage } from '../services/storage';

export interface UseLockScreenPlaybackReturn {
  isLockScreenPlaybackEnabled: boolean;
  setLockScreenPlayback: (enabled: boolean) => Promise<void>;
  toggleLockScreenPlayback: () => Promise<void>;
}

/**
 * Gestiona de forma reactiva y persistente la preferencia del usuario para seguir
 * reproduciendo el vídeo aun cuando la pantalla del móvil esté bloqueada.
 */
export function useLockScreenPlayback(): UseLockScreenPlaybackReturn {
  const [enabled, setEnabled] = useState<boolean>(
    () =>
      storage.getSyncLockScreenPlayback() ??
      config.playback.defaultLockScreenPlayback
  );

  useEffect(() => {
    let mounted = true;

    const currentSync = storage.getSyncLockScreenPlayback();
    if (currentSync !== null && currentSync !== enabled) {
      setEnabled(currentSync);
    }

    if (!storage.isLockScreenPlaybackLoaded()) {
      storage
        .getLockScreenPlayback()
        .then((loaded) => {
          if (mounted) {
            setEnabled(loaded);
          }
          deviceLock.setLockScreenPlaybackEnabled(loaded).catch(() => {});
        })
        .catch(() => {});
    } else {
      deviceLock.setLockScreenPlaybackEnabled(enabled).catch(() => {});
    }

    const unsubscribe = storage.subscribeLockScreenPlayback((nextEnabled) => {
      if (mounted) {
        setEnabled(nextEnabled);
      }
      deviceLock.setLockScreenPlaybackEnabled(nextEnabled).catch(() => {});
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [enabled]);

  const setLockScreenPlayback = useCallback(async (nextEnabled: boolean) => {
    const normalized = Boolean(nextEnabled);
    setEnabled(normalized);
    deviceLock.setLockScreenPlaybackEnabled(normalized).catch(() => {});
    await storage.saveLockScreenPlayback(normalized);
  }, []);

  const toggleLockScreenPlayback = useCallback(async () => {
    const nextEnabled = !enabled;
    setEnabled(nextEnabled);
    deviceLock.setLockScreenPlaybackEnabled(nextEnabled).catch(() => {});
    await storage.saveLockScreenPlayback(nextEnabled);
  }, [enabled]);

  return {
    isLockScreenPlaybackEnabled: enabled,
    setLockScreenPlayback,
    toggleLockScreenPlayback,
  };
}
