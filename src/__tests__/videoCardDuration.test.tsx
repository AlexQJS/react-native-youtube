import React from 'react';
import { render } from '@testing-library/react-native';
import { VideoCard } from '../components/VideoCard';
import { VideoItem } from '../types/youtube';

describe('VideoCard duration display', () => {
  const baseVideo: VideoItem = {
    id: 'test_vid_1',
    title: 'Test Video Title',
    thumbnail: 'https://example.com/thumb.jpg',
    channelId: 'UC_test',
    channelTitle: 'Test Channel',
    publishedAt: '2026-10-18T10:00:00Z',
  };

  it('muestra la duración en la esquina inferior derecha cuando video.durationFormatted está disponible', () => {
    const videoWithDuration: VideoItem = {
      ...baseVideo,
      durationFormatted: '14:20',
      durationSeconds: 860,
    };

    const { getByTestId, getByText } = render(
      <VideoCard video={videoWithDuration} onPress={jest.fn()} />
    );

    const durationBadge = getByTestId('video-duration-test_vid_1');
    expect(durationBadge).toBeTruthy();
    expect(getByText('14:20')).toBeTruthy();
  });

  it('formatea y muestra la duración si solo durationSeconds está presente', () => {
    const videoWithSecondsOnly: VideoItem = {
      ...baseVideo,
      durationSeconds: 125, // 2:05
    };

    const { getByTestId, getByText } = render(
      <VideoCard video={videoWithSecondsOnly} onPress={jest.fn()} />
    );

    const durationBadge = getByTestId('video-duration-test_vid_1');
    expect(durationBadge).toBeTruthy();
    expect(getByText('2:05')).toBeTruthy();
  });

  it('muestra la duración obtenida del progreso de reproducción si el vídeo no tiene duración previa', () => {
    const { getByTestId, getByText } = render(
      <VideoCard
        video={baseVideo}
        progress={{
          position: 60,
          duration: 300, // 5:00
          updatedAt: Date.now(),
        }}
        onPress={jest.fn()}
      />
    );

    const durationBadge = getByTestId('video-duration-test_vid_1');
    expect(durationBadge).toBeTruthy();
    expect(getByText('5:00')).toBeTruthy();
  });

  it('no muestra la etiqueta de duración si no hay duración ni progreso disponible', () => {
    const { queryByTestId } = render(
      <VideoCard video={baseVideo} onPress={jest.fn()} />
    );

    expect(queryByTestId('video-duration-test_vid_1')).toBeNull();
  });
});
