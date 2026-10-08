import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { deactivateKeepAwake } from 'expo-keep-awake';
import { config } from '../config/config';
import { deviceLock } from '../services/deviceLock';

export const VIDEO_PLAYER_KEEP_AWAKE_TAG = 'youtube-video-player';

export type SleepTimerOption = (typeof config.playback.sleepTimerOptions)[number];
export type SleepTimerOptionId = SleepTimerOption['id'];

export interface UseSleepTimerParams {
  onExpire: () => void;
  isPlaying?: boolean;
}

export interface UseSleepTimerResult {
  options: readonly SleepTimerOption[];
  activeOptionId: SleepTimerOptionId | null;
  activeOption: SleepTimerOption | null;
  remainingSeconds: number | null;
  isActive: boolean;
  isSleepTriggered: boolean;
  isAdminActive: boolean;
  selectOption: (optionId: SleepTimerOptionId) => void;
  cancelSleepMode: () => void;
  notifyVideoEnded: () => void;
  dismissSleepTriggered: () => void;
  requestLockPermission: () => Promise<boolean>;
}

export function useSleepTimer({
  onExpire,
  isPlaying = true,
}: UseSleepTimerParams): UseSleepTimerResult {
  const options = config.playback.sleepTimerOptions;

  const [activeOptionId, setActiveOptionId] = useState<SleepTimerOptionId | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [isSleepTriggered, setIsSleepTriggered] = useState<boolean>(false);
  const [isAdminActive, setIsAdminActive] = useState<boolean>(false);

  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  const activeOption = useMemo(
    () => options.find((opt) => opt.id === activeOptionId) ?? null,
    [activeOptionId, options]
  );

  const triggerSleep = useCallback(() => {
    // Primero pausamos el reproductor mientras el WebView sigue montado
    onExpireRef.current();
    // Liberamos cualquier keep-awake activo (tanto el tag del reproductor como el tag por defecto de Expo)
    deactivateKeepAwake(VIDEO_PLAYER_KEEP_AWAKE_TAG).catch(() => {});
    deactivateKeepAwake().catch(() => {});
    // Actualizamos estado y bloqueamos la pantalla del dispositivo
    setActiveOptionId(null);
    setRemainingSeconds(null);
    setIsSleepTriggered(true);
    deviceLock.lockDeviceScreen().catch(() => {});
  }, []);

  // Cuenta atrás cada segundo únicamente mientras el vídeo está reproduciéndose (isPlaying === true)
  useEffect(() => {
    if (!activeOptionId || activeOptionId === 'end_of_video' || !isPlaying) {
      return;
    }

    const timer = setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev === null) {
          return null;
        }
        if (prev <= 1) {
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      clearInterval(timer);
    };
  }, [activeOptionId, isPlaying]);

  // Ejecutar la pausa y bloqueo cuando el contador llega exactamente a 0
  useEffect(() => {
    if (
      activeOptionId &&
      activeOptionId !== 'end_of_video' &&
      remainingSeconds !== null &&
      remainingSeconds <= 0
    ) {
      triggerSleep();
    }
  }, [activeOptionId, remainingSeconds, triggerSleep]);

  const selectOption = useCallback(
    (optionId: SleepTimerOptionId) => {
      const selected = options.find((opt) => opt.id === optionId);
      if (!selected) {
        return;
      }

      setIsSleepTriggered(false);
      setActiveOptionId(selected.id);

      if (selected.durationSeconds !== null) {
        setRemainingSeconds(selected.durationSeconds);
      } else {
        setRemainingSeconds(null);
      }

      // Solicitar permiso de administrador de dispositivo en Android si aún no está concedido
      // para que DevicePolicyManager.lockNow() pueda bloquear la pantalla al terminar el tiempo
      deviceLock
        .isDeviceAdminActive()
        .then((granted) => {
          if (!granted) {
            deviceLock.requestDeviceAdmin().catch(() => {});
          }
        })
        .catch(() => {});
    },
    [options]
  );

  const cancelSleepMode = useCallback(() => {
    setActiveOptionId(null);
    setRemainingSeconds(null);
    setIsSleepTriggered(false);
  }, []);

  const notifyVideoEnded = useCallback(() => {
    if (activeOptionId === 'end_of_video') {
      triggerSleep();
    }
  }, [activeOptionId, triggerSleep]);

  const dismissSleepTriggered = useCallback(() => {
    setIsSleepTriggered(false);
    deviceLock.restoreScreenState().catch(() => {});
  }, []);

  const requestLockPermission = useCallback(async () => {
    const requested = await deviceLock.requestDeviceAdmin();
    const granted = await deviceLock.isDeviceAdminActive();
    setIsAdminActive(granted);
    return requested || granted;
  }, []);

  return {
    options,
    activeOptionId,
    activeOption,
    remainingSeconds,
    isActive: activeOptionId !== null,
    isSleepTriggered,
    isAdminActive,
    selectOption,
    cancelSleepMode,
    notifyVideoEnded,
    dismissSleepTriggered,
    requestLockPermission,
  };
}
