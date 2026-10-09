import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  Image,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { config } from '../config/config';

interface SplashScreenProps {
  /** Callback ejecutado cuando finaliza la animación de salida de la Splash Screen */
  onFinish: () => void;
}

/**
 * Pantalla de carga inicial (Splash Screen) basada en los iconos de la app:
 * fondo turquesa (#39b19bff) e icono blanco de reproducción redondeado,
 * con animación de entrada, pulso suave y transición fluida hacia el Feed.
 */
export function SplashScreen({ onFinish }: SplashScreenProps) {
  const containerOpacity = useRef(new Animated.Value(1)).current;
  const logoScale = useRef(new Animated.Value(0.82)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const ringScale = useRef(new Animated.Value(0.85)).current;
  const ringOpacity = useRef(new Animated.Value(0)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;
  const textTranslateY = useRef(new Animated.Value(12)).current;
  const progressWidth = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const entranceAnimation = Animated.parallel([
      Animated.timing(logoOpacity, {
        toValue: 1,
        duration: 380,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(logoScale, {
        toValue: 1,
        friction: 6,
        tension: 65,
        useNativeDriver: true,
      }),
      Animated.timing(ringOpacity, {
        toValue: 1,
        duration: 500,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(ringScale, {
        toValue: 1.08,
        duration: config.splash.durationMs,
        easing: Easing.out(Easing.sin),
        useNativeDriver: true,
      }),
      Animated.timing(textOpacity, {
        toValue: 1,
        duration: 420,
        delay: 140,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(textTranslateY, {
        toValue: 0,
        duration: 420,
        delay: 140,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(progressWidth, {
        toValue: 1,
        duration: Math.max(400, config.splash.durationMs - 150),
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true,
      }),
    ]);

    entranceAnimation.start();

    let exitAnimation: Animated.CompositeAnimation | null = null;

    const exitTimer = setTimeout(() => {
      exitAnimation = Animated.parallel([
        Animated.timing(containerOpacity, {
          toValue: 0,
          duration: config.splash.fadeOutDurationMs,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(logoScale, {
          toValue: 1.08,
          duration: config.splash.fadeOutDurationMs,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
      ]);
      exitAnimation.start(({ finished }) => {
        if (finished) {
          onFinish();
        }
      });
    }, config.splash.durationMs);

    return () => {
      clearTimeout(exitTimer);
      entranceAnimation.stop();
      exitAnimation?.stop();
    };
  }, [
    containerOpacity,
    logoOpacity,
    logoScale,
    onFinish,
    progressWidth,
    ringOpacity,
    ringScale,
    textOpacity,
    textTranslateY,
  ]);

  return (
    <Animated.View
      testID="app-splash-screen"
      accessibilityLabel={config.splash.brandName}
      style={[
        styles.container,
        {
          backgroundColor: config.splash.backgroundColor,
          opacity: containerOpacity,
        },
      ]}
    >
      <StatusBar style="light" />

      <View style={styles.centerContent}>
        <View style={styles.iconStage}>
          {/* Anillos decorativos inspirados en la estética limpia del icono */}
          <Animated.View
            style={[
              styles.outerHaloRing,
              {
                opacity: ringOpacity,
                transform: [{ scale: ringScale }],
              },
            ]}
          />
          <Animated.View
            style={[
              styles.innerHaloRing,
              {
                opacity: ringOpacity,
                transform: [{ scale: ringScale }],
              },
            ]}
          />

          <Animated.View
            style={[
              styles.logoWrapper,
              {
                opacity: logoOpacity,
                transform: [{ scale: logoScale }],
              },
            ]}
          >
            <Image
              testID="splash-logo-image"
              source={require('../../assets/splash-icon.png')}
              style={styles.logoImage}
              resizeMode="contain"
            />
          </Animated.View>
        </View>

        <Animated.View
          style={[
            styles.textContainer,
            {
              opacity: textOpacity,
              transform: [{ translateY: textTranslateY }],
            },
          ]}
        >
          <Text style={styles.brandTitle}>{config.splash.brandName}</Text>
          <Text style={styles.tagline}>{config.splash.tagline}</Text>
        </Animated.View>
      </View>

      <Animated.View style={[styles.footer, { opacity: textOpacity }]}>
        <View style={styles.progressTrack}>
          <Animated.View
            style={[
              styles.progressFill,
              {
                transform: [
                  {
                    scaleX: progressWidth,
                  },
                ],
              },
            ]}
          />
        </View>
      </Animated.View>
    </Animated.View>
  );
}

const LOGO_SIZE = config.splash.logoSize;

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 9999,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: config.theme.spacing.xxl * 2,
  },
  centerContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconStage: {
    width: LOGO_SIZE * 1.75,
    height: LOGO_SIZE * 1.75,
    alignItems: 'center',
    justifyContent: 'center',
  },
  outerHaloRing: {
    position: 'absolute',
    width: LOGO_SIZE * 1.65,
    height: LOGO_SIZE * 1.65,
    borderRadius: (LOGO_SIZE * 1.65) / 2,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  innerHaloRing: {
    position: 'absolute',
    width: LOGO_SIZE * 1.28,
    height: LOGO_SIZE * 1.28,
    borderRadius: (LOGO_SIZE * 1.28) / 2,
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
  },
  logoWrapper: {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
    borderRadius: LOGO_SIZE * 0.26,
    overflow: 'hidden',
    backgroundColor: config.splash.backgroundColor,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#144d43',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22,
    shadowRadius: 16,
    elevation: 8,
  },
  logoImage: {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
  },
  textContainer: {
    marginTop: config.theme.spacing.lg,
    alignItems: 'center',
  },
  brandTitle: {
    color: config.splash.textColor,
    fontSize: config.theme.typography.fontSizes.xxl + 4,
    fontWeight: config.theme.typography.fontWeights.bold,
    letterSpacing: 0.6,
  },
  tagline: {
    marginTop: config.theme.spacing.xs,
    color: 'rgba(255, 255, 255, 0.88)',
    fontSize: config.theme.typography.fontSizes.sm,
    fontWeight: config.theme.typography.fontWeights.medium,
    letterSpacing: 0.2,
  },
  footer: {
    width: '100%',
    alignItems: 'center',
    paddingHorizontal: config.theme.spacing.xxl * 2,
  },
  progressTrack: {
    width: 120,
    height: 4,
    borderRadius: config.theme.radii.full,
    backgroundColor: 'rgba(255, 255, 255, 0.28)',
    overflow: 'hidden',
  },
  progressFill: {
    width: '100%',
    height: '100%',
    borderRadius: config.theme.radii.full,
    backgroundColor: config.splash.accentColor,
  },
});
