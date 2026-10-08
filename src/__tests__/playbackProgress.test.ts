import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { config } from '../config/config';
import { usePlaybackProgress } from '../hooks/usePlaybackProgress';
import { storage } from '../services/storage';

describe('usePlaybackProgress Hook', () => {
  beforeEach(async () => {
    jest.useFakeTimers();
    storage.resetMemoryCache();
    await AsyncStorage.clear();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('devuelve estado sin progreso para un vídeo nuevo', async () => {
    const { result } = renderHook(() => usePlaybackProgress('vid_new'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.entry).toBeNull();
    expect(result.current.resumePosition).toBe(0);
    expect(result.current.progressRatio).toBe(0);
    expect(result.current.isCompleted).toBe(false);
  });

  it('recupera automáticamente el progreso almacenado al abrir un vídeo', async () => {
    await storage.savePlaybackProgress({
      vid_resume: {
        position: 352,
        duration: 1200,
        updatedAt: 1700000000000,
      },
    });
    storage.resetMemoryCache();

    const { result } = renderHook(() => usePlaybackProgress('vid_resume'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.entry?.position).toBe(352);
    expect(result.current.resumePosition).toBe(352);
    expect(result.current.isCompleted).toBe(false);
    expect(result.current.progressRatio).toBeCloseTo(352 / 1200, 3);
  });

  it('guarda periódicamente el progreso según el intervalo configurado', async () => {
    const { result } = renderHook(() => usePlaybackProgress('vid_periodic'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    act(() => {
      result.current.updatePlaybackState(145, 600);
    });

    // Avanzar el temporizador exactamente el intervalo configurado (10 segundos por defecto)
    await act(async () => {
      jest.advanceTimersByTime(config.playback.progressSaveInterval * 1000);
    });

    await waitFor(async () => {
      const saved = await storage.getVideoProgress('vid_periodic');
      expect(saved).not.toBeNull();
      expect(saved?.position).toBe(145);
      expect(saved?.duration).toBe(600);
    });
  });

  it('considera un vídeo terminado al llegar al final y permite empezar de nuevo', async () => {
    const { result } = renderHook(() => usePlaybackProgress('vid_complete'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.flushProgress(996, 1000);
    });

    expect(result.current.isCompleted).toBe(true);
    // Si el vídeo está terminado, al abrirlo la posición de reanudación vuelve a 0
    expect(result.current.resumePosition).toBe(0);

    // Permitir reiniciar manualmente el progreso de un vídeo
    await act(async () => {
      await result.current.restartVideoProgress();
    });

    expect(result.current.entry).toBeNull();
    const afterClear = await storage.getVideoProgress('vid_complete');
    expect(afterClear).toBeNull();
  });
});
