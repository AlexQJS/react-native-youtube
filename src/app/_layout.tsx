import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Platform,
  Pressable,
  StatusBar as RNStatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  SplashScreen,
  Tabs,
  usePathname,
  useRouter,
} from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { PersistentPlayerHost } from '../components/PersistentPlayerHost';
import { SplashScreen as BrandSplashScreen } from '../components/SplashScreen';
import { config } from '../config/config';
import { PlayerProvider, usePlayer } from '../context/PlayerContext';
import { useThemeColors } from '../hooks/useThemeColors';
import { deviceLock } from '../services/deviceLock';
import { storage } from '../services/storage';

// Congelamos la pantalla de inicio nativa para evitar que se oculte automáticamente
// antes de que los datos y la interfaz principal estén listos.
void SplashScreen.preventAutoHideAsync().catch(() => {
  // Ignorar en entornos de test o plataformas sin módulo nativo
});

function BottomNavigationBar() {
  const router = useRouter();
  const pathname = usePathname();
  const { colors } = useThemeColors();
  const { activeVideo, isMinimized } = usePlayer();

  // Si el reproductor está abierto a pantalla completa, ocultamos la barra inferior
  if (activeVideo && !isMinimized) {
    return null;
  }

  const isSearchActive = pathname.startsWith('/search');
  const isHistoryActive = pathname.startsWith('/history');
  const isConfigActive = pathname.startsWith('/config');
  const isFeedActive =
    !isSearchActive && !isHistoryActive && !isConfigActive;

  return (
    <View
      testID="bottom-navigation-bar"
      style={[
        styles.tabBar,
        {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
        },
      ]}
    >
      <Pressable
        testID="nav-tab-feed"
        accessibilityRole="tab"
        accessibilityState={{ selected: isFeedActive }}
        onPress={() => {
          if (!isFeedActive) {
            router.navigate('/feed');
          }
        }}
        style={styles.tabItem}
      >
        <Ionicons
          name={isFeedActive ? 'play-circle' : 'play-circle-outline'}
          size={config.theme.sizes.iconMd}
          color={isFeedActive ? colors.primary : colors.textSecondary}
        />
        <Text
          style={[
            styles.tabLabel,
            { color: isFeedActive ? colors.primary : colors.textSecondary },
          ]}
        >
          Feed
        </Text>
      </Pressable>

      <Pressable
        testID="nav-tab-search"
        accessibilityRole="tab"
        accessibilityState={{ selected: isSearchActive }}
        onPress={() => {
          if (!isSearchActive) {
            router.navigate('/search');
          }
        }}
        style={styles.tabItem}
      >
        <Ionicons
          name={isSearchActive ? 'search' : 'search-outline'}
          size={config.theme.sizes.iconMd}
          color={isSearchActive ? colors.primary : colors.textSecondary}
        />
        <Text
          style={[
            styles.tabLabel,
            { color: isSearchActive ? colors.primary : colors.textSecondary },
          ]}
        >
          Buscar
        </Text>
      </Pressable>

      <Pressable
        testID="nav-tab-history"
        accessibilityRole="tab"
        accessibilityState={{ selected: isHistoryActive }}
        onPress={() => {
          if (!isHistoryActive) {
            router.navigate('/history');
          }
        }}
        style={styles.tabItem}
      >
        <Ionicons
          name={isHistoryActive ? 'time' : 'time-outline'}
          size={config.theme.sizes.iconMd}
          color={isHistoryActive ? colors.primary : colors.textSecondary}
        />
        <Text
          style={[
            styles.tabLabel,
            { color: isHistoryActive ? colors.primary : colors.textSecondary },
          ]}
        >
          Historial
        </Text>
      </Pressable>

      <Pressable
        testID="nav-tab-config"
        accessibilityRole="tab"
        accessibilityState={{ selected: isConfigActive }}
        onPress={() => {
          if (!isConfigActive) {
            router.navigate('/config');
          }
        }}
        style={styles.tabItem}
      >
        <Ionicons
          name={isConfigActive ? 'settings' : 'settings-outline'}
          size={config.theme.sizes.iconMd}
          color={isConfigActive ? colors.primary : colors.textSecondary}
        />
        <Text
          style={[
            styles.tabLabel,
            { color: isConfigActive ? colors.primary : colors.textSecondary },
          ]}
        >
          Config
        </Text>
      </Pressable>
    </View>
  );
}

function AppShell() {
  const { colors, isDark } = useThemeColors();
  const insets = useSafeAreaInsets();

  // Garantizar márgenes seguros reales tanto arriba (status bar / notch) como abajo (botones de Android)
  const topInset = Math.max(
    insets.top,
    Platform.OS === 'android' ? RNStatusBar.currentHeight ?? 28 : 0
  );
  const bottomInset = Math.max(
    insets.bottom,
    Platform.OS === 'android' ? 20 : 0
  );

  return (
    <View
      style={[
        styles.outerRoot,
        {
          backgroundColor: colors.surface,
          paddingTop: topInset,
          paddingBottom: bottomInset,
          paddingLeft: insets.left,
          paddingRight: insets.right,
        },
      ]}
    >
      <StatusBar style={isDark ? 'light' : 'dark'} />

      <View
        style={[
          styles.safeContentBox,
          { backgroundColor: colors.background },
        ]}
      >
        <View style={styles.mainStage}>
          <Tabs
            initialRouteName="feed"
            backBehavior="history"
            tabBar={() => null}
            screenOptions={{
              headerStatusBarHeight: 0,
              headerStyle: {
                backgroundColor: colors.surface,
              },
              headerTintColor: colors.text,
              headerTitleStyle: {
                fontWeight: config.theme.typography.fontWeights.bold,
                fontSize: config.theme.typography.fontSizes.lg,
              },
              headerShadowVisible: false,
              sceneStyle: {
                backgroundColor: colors.background,
              },
            }}
          >
            <Tabs.Screen
              name="index"
              options={{
                href: null,
              }}
            />
            <Tabs.Screen
              name="feed"
              options={{
                title: 'Feed',
                headerTitle: config.app.name,
              }}
            />
            <Tabs.Screen
              name="search"
              options={{
                title: 'Buscar',
                headerTitle: 'Buscar canales',
              }}
            />
            <Tabs.Screen
              name="history"
              options={{
                title: 'Historial',
                headerTitle: 'Historial de reproducción',
              }}
            />
            <Tabs.Screen
              name="config"
              options={{
                title: 'Config',
                headerTitle: 'Configuración',
              }}
            />
            <Tabs.Screen
              name="player/[id]"
              options={{
                href: null,
                headerShown: false,
              }}
            />
          </Tabs>
        </View>

        <BottomNavigationBar />

        {/* Posicionado justo encima de la barra inferior (Feed / Buscar / Historial) */}
        <PersistentPlayerHost
          bottomOffset={
            config.theme.sizes.tabBarHeight + config.theme.spacing.sm + 4
          }
        />
      </View>
    </View>
  );
}

export default function RootLayout() {
  const [isAppReady, setIsAppReady] = useState(false);
  const [isSplashVisible, setIsSplashVisible] = useState(true);
  const hasHiddenNativeSplashRef = useRef(false);

  const hideNativeSplash = useCallback(() => {
    if (hasHiddenNativeSplashRef.current) {
      return;
    }
    hasHiddenNativeSplashRef.current = true;
    void SplashScreen.hideAsync().catch(() => {
      // Ignorar errores en entornos sin módulo nativo
    });
  }, []);

  useEffect(() => {
    let mounted = true;
    let unsubscribeFeedReady: (() => void) | null = null;
    let fallbackTimer: ReturnType<typeof setTimeout> | null = null;

    const markReady = () => {
      if (!mounted) {
        return;
      }
      if (fallbackTimer) {
        clearTimeout(fallbackTimer);
        fallbackTimer = null;
      }
      if (unsubscribeFeedReady) {
        unsubscribeFeedReady();
        unsubscribeFeedReady = null;
      }
      setIsAppReady(true);
    };

    async function prepareInitialScreen() {
      try {
        const [, favorites, , lockScreenPlayback] = await Promise.all([
          storage.getThemeMode(),
          storage.getFavorites(),
          storage.getPlaybackProgress(),
          storage.getLockScreenPlayback(),
        ]);

        deviceLock.setLockScreenPlaybackEnabled(lockScreenPlayback).catch(() => {});

        if (favorites.length > 0) {
          const signature = favorites
            .map((c) => c.id)
            .sort()
            .join(',');
          const cached = await storage.getFeedCache(signature);
          if (cached && cached.videos.length > 0) {
            storage.markInitialFeedReady();
          }
        } else {
          storage.markInitialFeedReady();
        }
      } catch {
        storage.markInitialFeedReady();
      }

      if (!mounted) {
        return;
      }

      if (storage.isInitialFeedReady()) {
        markReady();
      } else {
        unsubscribeFeedReady = storage.subscribeInitialFeedReady(() => {
          markReady();
        });
        fallbackTimer = setTimeout(() => {
          markReady();
        }, 3000);
      }
    }

    void prepareInitialScreen();

    return () => {
      mounted = false;
      if (fallbackTimer) {
        clearTimeout(fallbackTimer);
      }
      if (unsubscribeFeedReady) {
        unsubscribeFeedReady();
      }
    };
  }, []);

  useEffect(() => {
    if (isAppReady) {
      hideNativeSplash();
    }
  }, [isAppReady, hideNativeSplash]);

  const handleRootLayout = useCallback(() => {
    if (isAppReady) {
      hideNativeSplash();
    }
  }, [isAppReady, hideNativeSplash]);

  return (
    <SafeAreaProvider>
      <PlayerProvider>
        <View style={styles.outerRoot} onLayout={handleRootLayout}>
          <AppShell />
          {isSplashVisible && (
            <BrandSplashScreen
              isReady={isAppReady}
              onFinish={() => setIsSplashVisible(false)}
            />
          )}
        </View>
      </PlayerProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  outerRoot: {
    flex: 1,
  },
  safeContentBox: {
    flex: 1,
    flexDirection: 'column',
    position: 'relative',
  },
  mainStage: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
  },
  tabBar: {
    flexDirection: 'row',
    height: config.theme.sizes.tabBarHeight,
    borderTopWidth: config.theme.sizes.borderWidth,
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  tabItem: {
    flex: 1,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  tabLabel: {
    fontSize: config.theme.typography.fontSizes.xs,
    fontWeight: config.theme.typography.fontWeights.semibold,
  },
});
