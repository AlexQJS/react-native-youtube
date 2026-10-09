import React from 'react';
import { Share } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import ConfigScreen from '../app/config';
import { VideoPlayer } from '../components/VideoPlayer';
import { PlayerProvider } from '../context/PlayerContext';
import { storage } from '../services/storage';
import {
  computeWeeklyWatchStats,
  formatBarTimeLabel,
  formatWatchTime,
  toLocalDateKey,
} from '../utils/format';

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
    WebView: ReactLib.forwardRef((props: any, _ref: any) => (
      <View testID="mock-webview" {...props} />
    )),
  };
});

describe('Pestaña Config (Tema Light/Dark y Estadísticas Semanales) y Botón Compartir', () => {
  beforeEach(async () => {
    storage.resetMemoryCache();
    await AsyncStorage.clear();
    jest.restoreAllMocks();
  });

  it('permite alternar entre tema Light y Dark y persiste la preferencia en almacenamiento', async () => {
    const { getByTestId } = render(
      <PlayerProvider>
        <ConfigScreen />
      </PlayerProvider>
    );

    expect(getByTestId('config-theme-section')).toBeTruthy();

    // Pulsar opción Light
    await act(async () => {
      fireEvent.press(getByTestId('theme-option-light'));
    });

    expect(getByTestId('config-current-theme-label').props.children).toBe(
      'Modo claro (Light)'
    );
    expect(await storage.getThemeMode()).toBe('light');

    // Pulsar opción Dark
    await act(async () => {
      fireEvent.press(getByTestId('theme-option-dark'));
    });

    expect(getByTestId('config-current-theme-label').props.children).toBe(
      'Modo oscuro (Dark)'
    );
    expect(await storage.getThemeMode()).toBe('dark');
  });

  it('calcula y muestra con barras el tiempo visto cada día de la semana', async () => {
    const now = new Date();
    const todayKey = toLocalDateKey(now);
    const yesterdayDate = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() - 1,
      12,
      0,
      0
    );
    const yesterdayKey = toLocalDateKey(yesterdayDate);

    await storage.saveWatchHistory([
      {
        video: {
          id: 'vid_today_1',
          title: 'Vídeo Hoy',
          thumbnail: 'https://example.com/1.jpg',
          channelId: 'UC_1',
          channelTitle: 'Canal 1',
          publishedAt: '2026-10-09T10:00:00Z',
        },
        watchedAt: now.getTime(),
        position: 1800, // 30 min
        duration: 3600,
      },
      {
        video: {
          id: 'vid_yesterday_1',
          title: 'Vídeo Ayer',
          thumbnail: 'https://example.com/2.jpg',
          channelId: 'UC_2',
          channelTitle: 'Canal 2',
          publishedAt: '2026-10-08T10:00:00Z',
        },
        watchedAt: yesterdayDate.getTime(),
        position: 900, // 15 min
        duration: 1800,
      },
    ]);

    const stats = computeWeeklyWatchStats(await storage.getWatchHistory(), now);
    expect(stats.days).toHaveLength(7);
    expect(stats.totalSeconds).toBe(2700); // 45 min
    expect(stats.totalVideos).toBe(2);
    expect(formatWatchTime(stats.totalSeconds)).toBe('45 min');
    expect(formatBarTimeLabel(1800)).toBe('30m');

    const { getByTestId } = render(
      <PlayerProvider>
        <ConfigScreen />
      </PlayerProvider>
    );

    await waitFor(() => {
      expect(getByTestId('weekly-total-time').props.children).toBe('45 min');
    });

    expect(getByTestId('weekly-videos-count').props.children).toBe(2);
    expect(getByTestId('weekly-stats-chart')).toBeTruthy();
    expect(getByTestId(`weekly-bar-column-${todayKey}`)).toBeTruthy();
    expect(getByTestId(`weekly-bar-value-${todayKey}`).props.children).toBe(
      '30m'
    );
    expect(getByTestId(`weekly-bar-value-${yesterdayKey}`).props.children).toBe(
      '15m'
    );
  });

  it('comparte el vídeo actual al pulsar el botón Compartir dentro del reproductor', async () => {
    const shareSpy = jest
      .spyOn(Share, 'share')
      .mockResolvedValue({ action: Share.sharedAction });

    const { getByTestId } = render(
      <VideoPlayer
        videoId="dQw4w9WgXcQ"
        title="Tutorial de React Native"
        onProgressUpdate={jest.fn()}
        onFlushProgress={jest.fn()}
        onRestartProgress={jest.fn()}
      />
    );

    const shareButton = getByTestId('player-share-button');
    expect(shareButton).toBeTruthy();

    fireEvent.press(shareButton);

    expect(shareSpy).toHaveBeenCalledTimes(1);
    expect(shareSpy).toHaveBeenCalledWith({
      title: 'Tutorial de React Native',
      message:
        'Tutorial de React Native\nhttps://www.youtube.com/watch?v=dQw4w9WgXcQ',
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    });
  });
});
