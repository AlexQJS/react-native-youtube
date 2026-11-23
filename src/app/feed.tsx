import React, { useCallback, useMemo, useState } from 'react';
import {
  FlatList,
  ListRenderItemInfo,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { VideoCard } from '../components/VideoCard';
import {
  EmptyState,
  ErrorState,
  OfflineBanner,
  VideoFeedSkeleton,
} from '../components/UIStates';
import { config } from '../config/config';
import { usePlayer } from '../context/PlayerContext';
import { useFavorites } from '../hooks/useFavorites';
import { useFeed } from '../hooks/useFeed';
import { usePlaybackProgress } from '../hooks/usePlaybackProgress';
import { useRecommendedFeed } from '../hooks/useRecommendedFeed';
import { useThemeColors } from '../hooks/useThemeColors';
import { useWatchHistory } from '../hooks/useWatchHistory';
import { FavoriteChannel, VideoItem } from '../types/youtube';

export default function FeedScreen() {
  const router = useRouter();
  const { colors } = useThemeColors();
  const { openVideo, activeVideo, isMinimized } = usePlayer();
  const { favorites, loading: favoritesLoading } = useFavorites();
  const { history } = useWatchHistory();
  const { getProgress } = usePlaybackProgress();

  // Top Tabs: "Following" (active by default) and "Feed" (recommended videos)
  const [mainTab, setMainTab] = useState<'following' | 'feed'>('following');

  // Following feed hook
  const {
    videos,
    loading: feedLoading,
    refreshing,
    error,
    isOfflineData,
    lastUpdatedAt,
    refresh,
  } = useFeed(favorites, favoritesLoading);

  // Recommended feed hook
  const {
    videos: recommendedVideos,
    loading: recommendedLoading,
    refreshing: recommendedRefreshing,
    error: recommendedError,
    isOfflineData: recommendedIsOffline,
    lastUpdatedAt: recommendedLastUpdatedAt,
    refresh: refreshRecommended,
  } = useRecommendedFeed(favorites, history);

  // Filters for Following tab
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const [feedMode, setFeedMode] = useState<'videos' | 'shorts'>('videos');

  // Filters for Recommended Feed tab
  const [recommendedFeedMode, setRecommendedFeedMode] = useState<'videos' | 'shorts'>('videos');

  const shortsFilterEnabled = config.feed.enableShortsFilter;
  const showShortsOnly = shortsFilterEnabled && feedMode === 'shorts';
  const showRecommendedShortsOnly =
    shortsFilterEnabled && recommendedFeedMode === 'shorts';

  const filteredVideos = useMemo(() => {
    return videos.filter((video) => {
      if (selectedChannelId && video.channelId !== selectedChannelId) {
        return false;
      }

      if (shortsFilterEnabled) {
        if (feedMode === 'shorts') {
          return Boolean(video.isShort);
        }
        return !video.isShort;
      }

      return true;
    });
  }, [videos, selectedChannelId, shortsFilterEnabled, feedMode]);

  const filteredRecommendedVideos = useMemo(() => {
    if (!shortsFilterEnabled) {
      return recommendedVideos;
    }
    if (recommendedFeedMode === 'shorts') {
      return recommendedVideos.filter((video) => Boolean(video.isShort));
    }
    return recommendedVideos.filter((video) => !video.isShort);
  }, [recommendedVideos, shortsFilterEnabled, recommendedFeedMode]);

  const handleOpenVideo = useCallback(
    (video: VideoItem) => {
      openVideo(video);
    },
    [openVideo]
  );

  const handleOpenChannel = useCallback(
    (channelId: string, channelTitle?: string) => {
      const trimmedId = channelId?.trim();
      if (!trimmedId) return;
      router.navigate({
        pathname: '/channel/[id]',
        params: {
          id: trimmedId,
          name: channelTitle || '',
        },
      });
    },
    [router]
  );

  const handleGoToSearch = useCallback(() => {
    router.push('/search');
  }, [router]);

  const renderVideoItem = useCallback(
    ({ item }: ListRenderItemInfo<VideoItem>) => (
      <VideoCard
        video={item}
        progress={getProgress(item.id)}
        onPress={handleOpenVideo}
        onPressChannel={handleOpenChannel}
        compact={showShortsOnly}
      />
    ),
    [getProgress, handleOpenChannel, handleOpenVideo, showShortsOnly]
  );

  const renderRecommendedVideoItem = useCallback(
    ({ item }: ListRenderItemInfo<VideoItem>) => (
      <VideoCard
        video={item}
        progress={getProgress(item.id)}
        onPress={handleOpenVideo}
        onPressChannel={handleOpenChannel}
        compact={showRecommendedShortsOnly}
      />
    ),
    [getProgress, handleOpenChannel, handleOpenVideo, showRecommendedShortsOnly]
  );

  const keyExtractor = useCallback((item: VideoItem) => item.id, []);

  const renderChannelChip = useCallback(
    ({ item }: ListRenderItemInfo<FavoriteChannel>) => {
      const isSelected = selectedChannelId === item.id;
      return (
        <Pressable
          testID={`feed-channel-chip-${item.id}`}
          onPress={() =>
            setSelectedChannelId((prev) => (prev === item.id ? null : item.id))
          }
          style={[
            styles.channelChip,
            {
              backgroundColor: isSelected ? colors.primary : colors.surfaceElevated,
              borderColor: isSelected ? colors.primary : colors.border,
            },
          ]}
        >
          <Text
            numberOfLines={1}
            style={[
              styles.channelChipText,
              { color: isSelected ? colors.badgeText : colors.text },
            ]}
          >
            {item.name}
          </Text>
        </Pressable>
      );
    },
    [colors, selectedChannelId]
  );

  const isTodosSelected = feedMode === 'videos' && selectedChannelId === null;
  const isShortsSelected = feedMode === 'shorts';

  const renderListHeader = useCallback(() => {
    return (
      <View>
        {favorites.length > 0 && (
          <View style={styles.channelsBar}>
            <FlatList
              horizontal
              showsHorizontalScrollIndicator={false}
              data={favorites}
              keyExtractor={(item) => item.id}
              renderItem={renderChannelChip}
              ListHeaderComponent={
                <View style={styles.leadingChipsRow}>
                  {/* Pestaña/Filtro "Todos" */}
                  <Pressable
                    testID="feed-channel-chip-all"
                    onPress={() => {
                      setFeedMode('videos');
                      setSelectedChannelId(null);
                    }}
                    style={[
                      styles.channelChip,
                      {
                        backgroundColor: isTodosSelected
                          ? colors.primary
                          : colors.surfaceElevated,
                        borderColor: isTodosSelected
                          ? colors.primary
                          : colors.border,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.channelChipText,
                        {
                          color: isTodosSelected
                            ? colors.badgeText
                            : colors.text,
                        },
                      ]}
                    >
                      Todos
                    </Text>
                  </Pressable>

                  {/* Pestaña/Filtro "Shorts" */}
                  {shortsFilterEnabled && (
                    <Pressable
                      testID="feed-channel-chip-shorts"
                      onPress={() => {
                        setFeedMode((prev) =>
                          prev === 'shorts' ? 'videos' : 'shorts'
                        );
                      }}
                      style={[
                        styles.channelChip,
                        styles.shortsChip,
                        {
                          backgroundColor: isShortsSelected
                            ? colors.primary
                            : colors.surfaceElevated,
                          borderColor: isShortsSelected
                            ? colors.primary
                            : colors.border,
                        },
                      ]}
                    >
                      <Ionicons
                        name="flash"
                        size={config.theme.sizes.iconSm - 3}
                        color={
                          isShortsSelected ? colors.badgeText : colors.primary
                        }
                      />
                      <Text
                        style={[
                          styles.channelChipText,
                          {
                            color: isShortsSelected
                              ? colors.badgeText
                              : colors.text,
                          },
                        ]}
                      >
                        Shorts
                      </Text>
                    </Pressable>
                  )}
                </View>
              }
              contentContainerStyle={styles.channelsBarContent}
            />
          </View>
        )}

        {isOfflineData && (
          <OfflineBanner lastUpdatedAt={lastUpdatedAt} onRetry={refresh} />
        )}
      </View>
    );
  }, [
    colors,
    favorites,
    isOfflineData,
    isShortsSelected,
    isTodosSelected,
    lastUpdatedAt,
    refresh,
    renderChannelChip,
    shortsFilterEnabled,
  ]);

  const isRecommendedTodosSelected = recommendedFeedMode === 'videos';
  const isRecommendedShortsSelected = recommendedFeedMode === 'shorts';

  const renderRecommendedHeader = useCallback(() => {
    return (
      <View>
        {shortsFilterEnabled && (
          <View style={styles.channelsBar}>
            <View style={styles.leadingChipsRow}>
              <Pressable
                testID="recommended-chip-all"
                onPress={() => setRecommendedFeedMode('videos')}
                style={[
                  styles.channelChip,
                  {
                    backgroundColor: isRecommendedTodosSelected
                      ? colors.primary
                      : colors.surfaceElevated,
                    borderColor: isRecommendedTodosSelected
                      ? colors.primary
                      : colors.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.channelChipText,
                    {
                      color: isRecommendedTodosSelected
                        ? colors.badgeText
                        : colors.text,
                    },
                  ]}
                >
                  Todos
                </Text>
              </Pressable>

              <Pressable
                testID="recommended-chip-shorts"
                onPress={() => {
                  setRecommendedFeedMode((prev) =>
                    prev === 'shorts' ? 'videos' : 'shorts'
                  );
                }}
                style={[
                  styles.channelChip,
                  styles.shortsChip,
                  {
                    backgroundColor: isRecommendedShortsSelected
                      ? colors.primary
                      : colors.surfaceElevated,
                    borderColor: isRecommendedShortsSelected
                      ? colors.primary
                      : colors.border,
                  },
                ]}
              >
                <Ionicons
                  name="flash"
                  size={config.theme.sizes.iconSm - 3}
                  color={
                    isRecommendedShortsSelected
                      ? colors.badgeText
                      : colors.primary
                  }
                />
                <Text
                  style={[
                    styles.channelChipText,
                    {
                      color: isRecommendedShortsSelected
                        ? colors.badgeText
                        : colors.text,
                    },
                  ]}
                >
                  Shorts
                </Text>
              </Pressable>
            </View>
          </View>
        )}

        {recommendedIsOffline && (
          <OfflineBanner
            lastUpdatedAt={recommendedLastUpdatedAt}
            onRetry={refreshRecommended}
          />
        )}
      </View>
    );
  }, [
    colors,
    isRecommendedShortsSelected,
    isRecommendedTodosSelected,
    recommendedIsOffline,
    recommendedLastUpdatedAt,
    refreshRecommended,
    shortsFilterEnabled,
  ]);

  const hasMiniPlayer = Boolean(activeVideo && isMinimized);

  const renderFollowingContent = () => {
    if (feedLoading && videos.length === 0) {
      return (
        <View style={styles.contentPadding}>
          <VideoFeedSkeleton count={3} />
        </View>
      );
    }

    if (favorites.length === 0) {
      return (
        <EmptyState
          testID="feed-empty-favorites"
          icon="tv-outline"
          title="Todavía no tienes canales favoritos."
          description="Busca tus canales preferidos de YouTube y añádelos a favoritos para descubrir aquí sus vídeos más recientes."
          actionLabel="Buscar canales"
          onAction={handleGoToSearch}
        />
      );
    }

    if (error && videos.length === 0) {
      return (
        <ErrorState
          testID="feed-error-state"
          message={error.message}
          onRetry={refresh}
        />
      );
    }

    return (
      <FlatList
        key={showShortsOnly ? 'feed-shorts-2col' : 'feed-videos-1col'}
        testID="feed-video-list"
        data={filteredVideos}
        numColumns={showShortsOnly ? config.feed.shortsColumns : 1}
        columnWrapperStyle={
          showShortsOnly ? styles.shortsColumnWrapper : undefined
        }
        keyExtractor={keyExtractor}
        renderItem={renderVideoItem}
        ListHeaderComponent={renderListHeader}
        ListEmptyComponent={
          <EmptyState
            testID="feed-no-videos"
            icon={showShortsOnly ? 'flash-outline' : 'videocam-off-outline'}
            title={
              showShortsOnly
                ? 'No hay Shorts disponibles'
                : 'No hay vídeos recientes'
            }
            description={
              showShortsOnly
                ? 'Desliza hacia abajo o pulsa actualizar para cargar los últimos Shorts de tus canales favoritos.'
                : 'No se encontraron vídeos normales recientes para los canales seleccionados.'
            }
            actionLabel="Actualizar"
            onAction={refresh}
          />
        }
        contentContainerStyle={[
          styles.listContent,
          hasMiniPlayer && styles.listContentWithMiniPlayer,
          filteredVideos.length === 0 && styles.listContentEmpty,
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
        initialNumToRender={5}
        maxToRenderPerBatch={5}
        windowSize={5}
        updateCellsBatchingPeriod={50}
        removeClippedSubviews={Platform.OS !== 'web'}
      />
    );
  };

  const renderRecommendedContent = () => {
    if (recommendedLoading && recommendedVideos.length === 0) {
      return (
        <View style={styles.contentPadding}>
          <VideoFeedSkeleton count={3} />
        </View>
      );
    }

    if (recommendedError && recommendedVideos.length === 0) {
      return (
        <ErrorState
          testID="recommended-error-state"
          message={recommendedError.message}
          onRetry={refreshRecommended}
        />
      );
    }

    return (
      <FlatList
        key={
          showRecommendedShortsOnly
            ? 'recommended-shorts-2col'
            : 'recommended-videos-1col'
        }
        testID="recommended-video-list"
        data={filteredRecommendedVideos}
        numColumns={
          showRecommendedShortsOnly ? config.feed.shortsColumns : 1
        }
        columnWrapperStyle={
          showRecommendedShortsOnly ? styles.shortsColumnWrapper : undefined
        }
        keyExtractor={keyExtractor}
        renderItem={renderRecommendedVideoItem}
        ListHeaderComponent={renderRecommendedHeader}
        ListEmptyComponent={
          <EmptyState
            testID="recommended-no-videos"
            icon={
              showRecommendedShortsOnly
                ? 'flash-outline'
                : 'sparkles-outline'
            }
            title={
              showRecommendedShortsOnly
                ? 'No hay Shorts recomendados'
                : 'No hay vídeos recomendados'
            }
            description="Desliza hacia abajo o pulsa actualizar para descubrir nuevos contenidos recomendados para ti."
            actionLabel="Actualizar"
            onAction={refreshRecommended}
          />
        }
        contentContainerStyle={[
          styles.listContent,
          hasMiniPlayer && styles.listContentWithMiniPlayer,
          filteredRecommendedVideos.length === 0 && styles.listContentEmpty,
        ]}
        refreshControl={
          <RefreshControl
            refreshing={recommendedRefreshing}
            onRefresh={refreshRecommended}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
        initialNumToRender={5}
        maxToRenderPerBatch={5}
        windowSize={5}
        updateCellsBatchingPeriod={50}
        removeClippedSubviews={Platform.OS !== 'web'}
      />
    );
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      {/* Top Tabs: "Following" and "Feed" */}
      <View
        style={[
          styles.topTabsBar,
          {
            backgroundColor: colors.surface,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <Pressable
          testID="feed-tab-following"
          accessibilityRole="tab"
          accessibilityState={{ selected: mainTab === 'following' }}
          onPress={() => setMainTab('following')}
          style={[
            styles.topTabButton,
            mainTab === 'following' && styles.topTabButtonActive,
          ]}
        >
          <Text
            style={[
              styles.topTabTitle,
              {
                color:
                  mainTab === 'following'
                    ? colors.primary
                    : colors.textSecondary,
                fontWeight:
                  mainTab === 'following'
                    ? config.theme.typography.fontWeights.bold
                    : config.theme.typography.fontWeights.medium,
              },
            ]}
          >
            Following
          </Text>
          {mainTab === 'following' && (
            <View
              testID="feed-tab-indicator-following"
              style={[
                styles.topTabIndicator,
                { backgroundColor: colors.primary },
              ]}
            />
          )}
        </Pressable>

        <Pressable
          testID="feed-tab-feed"
          accessibilityRole="tab"
          accessibilityState={{ selected: mainTab === 'feed' }}
          onPress={() => setMainTab('feed')}
          style={[
            styles.topTabButton,
            mainTab === 'feed' && styles.topTabButtonActive,
          ]}
        >
          <Text
            style={[
              styles.topTabTitle,
              {
                color:
                  mainTab === 'feed' ? colors.primary : colors.textSecondary,
                fontWeight:
                  mainTab === 'feed'
                    ? config.theme.typography.fontWeights.bold
                    : config.theme.typography.fontWeights.medium,
              },
            ]}
          >
            Feed
          </Text>
          {mainTab === 'feed' && (
            <View
              testID="feed-tab-indicator-feed"
              style={[
                styles.topTabIndicator,
                { backgroundColor: colors.primary },
              ]}
            />
          )}
        </Pressable>
      </View>

      <View style={styles.tabContentContainer}>
        {mainTab === 'following'
          ? renderFollowingContent()
          : renderRecommendedContent()}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  topTabsBar: {
    flexDirection: 'row',
    borderBottomWidth: config.theme.sizes.borderWidth,
    paddingHorizontal: config.theme.spacing.lg,
    zIndex: 10,
  },
  topTabButton: {
    paddingVertical: config.theme.spacing.md - 2,
    paddingHorizontal: config.theme.spacing.md,
    marginRight: config.theme.spacing.sm,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topTabButtonActive: {},
  topTabTitle: {
    fontSize: config.theme.typography.fontSizes.md,
  },
  topTabIndicator: {
    position: 'absolute',
    bottom: -config.theme.sizes.borderWidth,
    left: config.theme.spacing.sm,
    right: config.theme.spacing.sm,
    height: 3,
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
  },
  tabContentContainer: {
    flex: 1,
  },
  contentPadding: {
    paddingHorizontal: config.theme.spacing.lg,
    paddingTop: config.theme.spacing.md,
  },
  listContent: {
    paddingHorizontal: config.theme.spacing.lg,
    paddingTop: config.theme.spacing.sm,
    paddingBottom: config.theme.spacing.xxl,
  },
  shortsColumnWrapper: {
    justifyContent: 'space-between',
    gap: config.theme.spacing.sm,
  },
  listContentWithMiniPlayer: {
    paddingBottom:
      config.theme.spacing.xxl + config.theme.sizes.miniPlayerHeight,
  },
  listContentEmpty: {
    flexGrow: 1,
  },
  channelsBar: {
    marginBottom: config.theme.spacing.md,
  },
  channelsBarContent: {
    gap: config.theme.spacing.xs,
    paddingVertical: config.theme.spacing.xxs,
  },
  leadingChipsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: config.theme.spacing.xs,
  },
  channelChip: {
    paddingHorizontal: config.theme.spacing.md,
    paddingVertical: config.theme.spacing.xs + 2,
    borderRadius: config.theme.radii.full,
    borderWidth: config.theme.sizes.borderWidth,
    maxWidth: 180,
  },
  shortsChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  channelChipText: {
    fontSize: config.theme.typography.fontSizes.xs,
    fontWeight: config.theme.typography.fontWeights.semibold,
  },
});
