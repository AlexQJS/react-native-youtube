import React from 'react';
import { act, render } from '@testing-library/react-native';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import {
  buildYouTubeIframeHtml,
  VIDEO_PLAYER_KEEP_AWAKE_TAG,
  VideoPlayer,
} from '../components/VideoPlayer';

let capturedOnMessage: ((event: { nativeEvent: { data: string } }) => void) | null =
  null;

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}));

jest.mock('react-native-webview', () => {
  const ReactLib = require('react');
  const { View } = require('react-native');
  return {
    WebView: ReactLib.forwardRef((props: any, _ref: any) => {
      capturedOnMessage = props.onMessage;
      return ReactLib.createElement(View, { testID: 'mock-webview' });
    }),
  };
});

describe('VideoPlayer Keep Awake (evitar bloqueo de pantalla)', () => {
  beforeEach(() => {
    capturedOnMessage = null;
    jest.clearAllMocks();
  });

  it('no bloquea el apagado de pantalla mientras el vídeo no está reproduciéndose', () => {
    render(
      <VideoPlayer
        videoId="test_vid_1"
        onProgressUpdate={jest.fn()}
        onFlushProgress={jest.fn()}
        onRestartProgress={jest.fn()}
      />
    );

    expect(activateKeepAwakeAsync).not.toHaveBeenCalled();
    expect(deactivateKeepAwake).not.toHaveBeenCalled();
  });

  it('activa keep-awake al reproducir y lo desactiva al pausar o terminar el vídeo', () => {
    render(
      <VideoPlayer
        videoId="test_vid_2"
        onProgressUpdate={jest.fn()}
        onFlushProgress={jest.fn()}
        onRestartProgress={jest.fn()}
      />
    );

    // Simular inicio de reproducción (YT.PlayerState.PLAYING = 1)
    act(() => {
      capturedOnMessage?.({
        nativeEvent: {
          data: JSON.stringify({
            type: 'STATE_CHANGE',
            state: 1,
            position: 10,
            duration: 120,
          }),
        },
      });
    });

    expect(activateKeepAwakeAsync).toHaveBeenCalledTimes(1);
    expect(activateKeepAwakeAsync).toHaveBeenCalledWith(
      VIDEO_PLAYER_KEEP_AWAKE_TAG
    );
    expect(deactivateKeepAwake).not.toHaveBeenCalled();

    // Simular pausa (YT.PlayerState.PAUSED = 2)
    act(() => {
      capturedOnMessage?.({
        nativeEvent: {
          data: JSON.stringify({
            type: 'STATE_CHANGE',
            state: 2,
            position: 25,
            duration: 120,
          }),
        },
      });
    });

    expect(deactivateKeepAwake).toHaveBeenCalledTimes(1);
    expect(deactivateKeepAwake).toHaveBeenCalledWith(
      VIDEO_PLAYER_KEEP_AWAKE_TAG
    );
  });

  it('desactiva keep-awake al desmontar el reproductor mientras se estaba reproduciendo', () => {
    const { unmount } = render(
      <VideoPlayer
        videoId="test_vid_3"
        onProgressUpdate={jest.fn()}
        onFlushProgress={jest.fn()}
        onRestartProgress={jest.fn()}
      />
    );

    act(() => {
      capturedOnMessage?.({
        nativeEvent: {
          data: JSON.stringify({
            type: 'STATE_CHANGE',
            state: 1,
            position: 5,
            duration: 100,
          }),
        },
      });
    });

    expect(activateKeepAwakeAsync).toHaveBeenCalledWith(
      VIDEO_PLAYER_KEEP_AWAKE_TAG
    );

    unmount();

    expect(deactivateKeepAwake).toHaveBeenCalledWith(
      VIDEO_PLAYER_KEEP_AWAKE_TAG
    );
  });

  it('incluye soporte de WakeLock en el HTML embebido de YouTube', () => {
    const html = buildYouTubeIframeHtml('dQw4w9WgXcQ', 0);
    expect(html).toContain('requestWakeLock()');
    expect(html).toContain('releaseWakeLock()');
  });
});
