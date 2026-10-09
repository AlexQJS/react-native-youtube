import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { deactivateKeepAwake } from 'expo-keep-awake';
import {
  buildYouTubeIframeHtml,
  VIDEO_PLAYER_KEEP_AWAKE_TAG,
  VideoPlayer,
} from '../components/VideoPlayer';
import { config } from '../config/config';
import { deviceLock } from '../services/deviceLock';

const mockInjectJavaScript = jest.fn();

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
        injectJavaScript: mockInjectJavaScript,
      }));
      return <View testID="mock-webview" {...props} />;
    }),
  };
});

describe('Sleep Mode en VideoPlayer', () => {
  const mockOnProgressUpdate = jest.fn();
  const mockOnFlushProgress = jest.fn();
  const mockOnRestartProgress = jest.fn();

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    jest.spyOn(deviceLock, 'lockDeviceScreen').mockResolvedValue('LOCKED_ADMIN');
    jest.spyOn(deviceLock, 'isDeviceAdminActive').mockResolvedValue(true);
    jest.spyOn(deviceLock, 'restoreScreenState').mockResolvedValue(true);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('muestra la lista completa de tiempos (5 min, 15 min, 30 min, 1 h, 2 h, Hasta que termine el vídeo)', () => {
    const { getByTestId, getByText } = render(
      <VideoPlayer
        videoId="test_vid_1"
        title="Vídeo de prueba"
        onProgressUpdate={mockOnProgressUpdate}
        onFlushProgress={mockOnFlushProgress}
        onRestartProgress={mockOnRestartProgress}
      />
    );

    const sleepButton = getByTestId('player-sleep-mode-button');
    fireEvent.press(sleepButton);

    expect(getByTestId('sleep-mode-modal')).toBeTruthy();
    expect(getByTestId('sleep-option-5m')).toBeTruthy();
    expect(getByTestId('sleep-option-15m')).toBeTruthy();
    expect(getByTestId('sleep-option-30m')).toBeTruthy();
    expect(getByTestId('sleep-option-1h')).toBeTruthy();
    expect(getByTestId('sleep-option-2h')).toBeTruthy();
    expect(getByTestId('sleep-option-end_of_video')).toBeTruthy();

    expect(getByText('5 min')).toBeTruthy();
    expect(getByText('15 min')).toBeTruthy();
    expect(getByText('30 min')).toBeTruthy();
    expect(getByText('1 h')).toBeTruthy();
    expect(getByText('2 h')).toBeTruthy();
    expect(getByText('Hasta que termine el vídeo')).toBeTruthy();
  });

  it('pausa el vídeo y bloquea el móvil cuando termina el tiempo seleccionado (ej. 5 min)', () => {
    const { getByTestId, queryByTestId } = render(
      <VideoPlayer
        videoId="test_vid_2"
        title="Vídeo con temporizador"
        initialPosition={40}
        initialDuration={600}
        onProgressUpdate={mockOnProgressUpdate}
        onFlushProgress={mockOnFlushProgress}
        onRestartProgress={mockOnRestartProgress}
      />
    );

    // Simular que el vídeo está reproduciéndose
    const webview = getByTestId('mock-webview');
    act(() => {
      webview.props.onMessage({
        nativeEvent: {
          data: JSON.stringify({
            type: 'STATE_CHANGE',
            state: 1,
            position: 45,
            duration: 600,
          }),
        },
      });
    });

    // Abrir selector de Sleep Mode y elegir 5 min (300 segundos)
    fireEvent.press(getByTestId('player-sleep-mode-button'));
    fireEvent.press(getByTestId('sleep-option-5m'));

    expect(getByTestId('sleep-mode-active-banner')).toBeTruthy();
    expect(getByTestId('player-sleep-mode-button-text').props.children).toBe('5:00');
    expect(queryByTestId('sleep-mode-locked-overlay')).toBeNull();

    // Avanzar 299 segundos: aún no debe haberse pausado ni bloqueado
    act(() => {
      jest.advanceTimersByTime(299 * 1000);
    });
    expect(getByTestId('player-sleep-mode-button-text').props.children).toBe('0:01');
    expect(deviceLock.lockDeviceScreen).not.toHaveBeenCalled();

    // Avanzar el último segundo (total 5 min = 300s)
    act(() => {
      jest.advanceTimersByTime(1000);
    });

    // Verifica que el vídeo se pausa, se guarda progreso y el móvil se bloquea
    expect(mockInjectJavaScript).toHaveBeenCalledWith(
      expect.stringContaining('player.pauseVideo()')
    );
    expect(mockOnFlushProgress).toHaveBeenCalledWith(45, 600);
    expect(deactivateKeepAwake).toHaveBeenCalledWith(VIDEO_PLAYER_KEEP_AWAKE_TAG);
    expect(deviceLock.lockDeviceScreen).toHaveBeenCalledTimes(1);
    expect(getByTestId('sleep-mode-locked-overlay')).toBeTruthy();
    expect(queryByTestId('sleep-mode-active-banner')).toBeNull();
  });

  it('permite cancelar el Sleep Mode mientras está activo desde el banner o desde el modal', () => {
    const { getByTestId, queryByTestId } = render(
      <VideoPlayer
        videoId="test_vid_3"
        title="Vídeo cancelable"
        onProgressUpdate={mockOnProgressUpdate}
        onFlushProgress={mockOnFlushProgress}
        onRestartProgress={mockOnRestartProgress}
      />
    );

    // Activar 15 min
    fireEvent.press(getByTestId('player-sleep-mode-button'));
    fireEvent.press(getByTestId('sleep-option-15m'));
    expect(getByTestId('sleep-mode-active-banner')).toBeTruthy();

    // Avanzar 2 minutos
    act(() => {
      jest.advanceTimersByTime(120 * 1000);
    });

    // Cancelar desde el botón de cancelar en el banner activo
    fireEvent.press(getByTestId('sleep-mode-cancel-banner-button'));
    expect(queryByTestId('sleep-mode-active-banner')).toBeNull();
    expect(getByTestId('player-sleep-mode-button-text').props.children).toBe('Sleep Mode');

    // Avanzar otros 20 minutos: no debe pausar ni bloquear porque fue cancelado
    act(() => {
      jest.advanceTimersByTime(20 * 60 * 1000);
    });
    expect(deviceLock.lockDeviceScreen).not.toHaveBeenCalled();
    expect(queryByTestId('sleep-mode-locked-overlay')).toBeNull();

    // Activar 30 min y cancelar desde dentro del modal
    fireEvent.press(getByTestId('player-sleep-mode-button'));
    fireEvent.press(getByTestId('sleep-option-30m'));
    expect(getByTestId('sleep-mode-active-banner')).toBeTruthy();

    fireEvent.press(getByTestId('player-sleep-mode-button'));
    fireEvent.press(getByTestId('sleep-mode-cancel-button'));
    expect(queryByTestId('sleep-mode-active-banner')).toBeNull();
  });

  it('soporta la opción "Hasta que termine el vídeo" y bloquea el móvil al finalizar el vídeo', () => {
    const { getByTestId } = render(
      <VideoPlayer
        videoId="test_vid_4"
        title="Vídeo hasta el final"
        initialDuration={500}
        onProgressUpdate={mockOnProgressUpdate}
        onFlushProgress={mockOnFlushProgress}
        onRestartProgress={mockOnRestartProgress}
      />
    );

    fireEvent.press(getByTestId('player-sleep-mode-button'));
    fireEvent.press(getByTestId('sleep-option-end_of_video'));

    expect(getByTestId('player-sleep-mode-button-text').props.children).toBe('Fin del vídeo');
    expect(getByTestId('sleep-mode-active-banner')).toBeTruthy();

    // Simular evento de fin del vídeo (YT.PlayerState.ENDED === 0)
    const webview = getByTestId('mock-webview');
    act(() => {
      webview.props.onMessage({
        nativeEvent: {
          data: JSON.stringify({
            type: 'STATE_CHANGE',
            state: 0,
            position: 500,
            duration: 500,
          }),
        },
      });
    });

    expect(mockInjectJavaScript).toHaveBeenCalledWith(
      expect.stringContaining('player.pauseVideo()')
    );
    expect(deactivateKeepAwake).toHaveBeenCalledWith(VIDEO_PLAYER_KEEP_AWAKE_TAG);
    expect(deviceLock.lockDeviceScreen).toHaveBeenCalledTimes(1);
    expect(getByTestId('sleep-mode-locked-overlay')).toBeTruthy();
  });

  it('no descuenta segundos mientras el vídeo está en pausa o cargando y solicita permiso de bloqueo si no está activo', async () => {
    jest.spyOn(deviceLock, 'isDeviceAdminActive').mockResolvedValue(false);
    const requestAdminSpy = jest
      .spyOn(deviceLock, 'requestDeviceAdmin')
      .mockResolvedValue(true);

    const { getByTestId } = render(
      <VideoPlayer
        videoId="test_vid_sync"
        title="Vídeo sincronizado"
        onProgressUpdate={mockOnProgressUpdate}
        onFlushProgress={mockOnFlushProgress}
        onRestartProgress={mockOnRestartProgress}
      />
    );

    fireEvent.press(getByTestId('player-sleep-mode-button'));
    fireEvent.press(getByTestId('sleep-option-5m'));

    // Mientras el vídeo aún no ha empezado a reproducirse (5 segundos de carga), el contador sigue en 5:00
    act(() => {
      jest.advanceTimersByTime(5000);
    });
    expect(getByTestId('player-sleep-mode-button-text').props.children).toBe('5:00');

    // Al empezar la reproducción (state = 1), empieza a descontar exactamente desde 5:00
    const webview = getByTestId('mock-webview');
    act(() => {
      webview.props.onMessage({
        nativeEvent: {
          data: JSON.stringify({
            type: 'STATE_CHANGE',
            state: 1,
            position: 0,
            duration: 600,
          }),
        },
      });
    });

    act(() => {
      jest.advanceTimersByTime(5000);
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(getByTestId('player-sleep-mode-button-text').props.children).toBe('4:55');
    expect(requestAdminSpy).toHaveBeenCalled();
  });

  it('configura correctamente todas las duraciones en config.playback.sleepTimerOptions', () => {
    expect(config.playback.sleepTimerOptions).toEqual([
      { id: '5m', label: '5 min', durationSeconds: 300 },
      { id: '15m', label: '15 min', durationSeconds: 900 },
      { id: '30m', label: '30 min', durationSeconds: 1800 },
      { id: '1h', label: '1 h', durationSeconds: 3600 },
      { id: '2h', label: '2 h', durationSeconds: 7200 },
      { id: 'end_of_video', label: 'Hasta que termine el vídeo', durationSeconds: null },
    ]);
  });

  it('configura el iframe de YouTube y el WebView para reproducirse automáticamente al abrir el vídeo', () => {
    const html = buildYouTubeIframeHtml('abc123XYZ', 30);
    expect(html).toContain('autoplay: 1');
    expect(html).toContain('start: 30');
    expect(html).toContain("iframe.setAttribute('allow', 'autoplay; encrypted-media; fullscreen; picture-in-picture')");
    expect(html).toContain('event.target.playVideo()');

    const { getByTestId } = render(
      <VideoPlayer
        videoId="abc123XYZ"
        title="Vídeo autoplay"
        onProgressUpdate={mockOnProgressUpdate}
        onFlushProgress={mockOnFlushProgress}
        onRestartProgress={mockOnRestartProgress}
      />
    );

    const webview = getByTestId('mock-webview');
    expect(webview.props.mediaPlaybackRequiresUserAction).toBe(false);
    expect(webview.props.allowsInlineMediaPlayback).toBe(true);
  });
});
