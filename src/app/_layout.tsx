import React from 'react';
import {
  Platform,
  Pressable,
  StatusBar as RNStatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Tabs, usePathname, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { PersistentPlayerHost } from '../components/PersistentPlayerHost';
import { config } from '../config/config';
import { PlayerProvider, usePlayer } from '../context/PlayerContext';
import { useThemeColors } from '../hooks/useThemeColors';

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
  const isFeedActive = !isSearchActive && !isHistoryActive;

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
  return (
    <SafeAreaProvider>
      <PlayerProvider>
        <AppShell />
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
