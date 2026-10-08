import React from 'react';
import { act, render } from '@testing-library/react-native';
import { SplashScreen } from '../components/SplashScreen';
import { config } from '../config/config';

describe('SplashScreen Component', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('renderiza el icono, nombre de marca y subtítulo basados en la identidad de la app', () => {
    const onFinish = jest.fn();
    const { getByTestId, getByText, unmount } = render(
      <SplashScreen onFinish={onFinish} />
    );

    expect(getByTestId('app-splash-screen')).toBeTruthy();
    expect(getByTestId('splash-logo-image')).toBeTruthy();
    expect(getByText(config.splash.brandName)).toBeTruthy();
    expect(getByText(config.splash.tagline)).toBeTruthy();
    expect(onFinish).not.toHaveBeenCalled();

    unmount();
  });

  it('ejecuta onFinish tras completar el tiempo de visualización y la animación de salida', () => {
    const onFinish = jest.fn();
    const { unmount } = render(<SplashScreen onFinish={onFinish} />);

    act(() => {
      jest.advanceTimersByTime(
        config.splash.durationMs + config.splash.fadeOutDurationMs + 100
      );
    });

    expect(onFinish).toHaveBeenCalledTimes(1);
    unmount();
  });
});
