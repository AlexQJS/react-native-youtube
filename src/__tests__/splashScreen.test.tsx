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

  it('mantiene congelada la pantalla de inicio mientras isReady es false y la oculta al pasar a true', () => {
    const onFinish = jest.fn();
    const { rerender, unmount } = render(
      <SplashScreen isReady={false} onFinish={onFinish} />
    );

    act(() => {
      jest.advanceTimersByTime(
        config.splash.durationMs + config.splash.fadeOutDurationMs + 500
      );
    });

    // No debe ocultarse hasta que isReady sea true
    expect(onFinish).not.toHaveBeenCalled();

    rerender(<SplashScreen isReady={true} onFinish={onFinish} />);

    act(() => {
      jest.advanceTimersByTime(config.splash.fadeOutDurationMs + 100);
    });

    expect(onFinish).toHaveBeenCalledTimes(1);
    unmount();
  });
});
