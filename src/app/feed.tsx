import React, { useCallback, useMemo, useState } from 'react';
import {
  FlatList,
  ListRenderItemInfo,
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
import { useThemeColors } from '../hooks/useThemeColors';
import { FavoriteChannel, VideoItem } from '../types/youtube';

export default function FeedScreen() {
  const router = useRouter();
  const { colors } = useThemeColors();
  const { openVideo, activeVideo, isMinimized } = usePlayer();
  const { favorites, loading: favoritesLoading } = useFavorites();
  const {
    videos,
    loading: feedLoading,
    refreshing,
    error,
    isOfflineData,
    lastUpdatedAt,
    refresh,
  } = useFeed(favorites, favoritesLoading);
  const { getProgress } = usePlaybackProgress();

  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const [feedMode, setFeedMode] = useState<'videos' | 'shorts'>('videos');

  const shortsFilterEnabled = config.feed.enableShortsFilter;
  const showShortsOnly = shortsFilterEnabled && feedMode === 'shorts';

  const filteredVideos = useMemo(() => {
    return videos.filter((video) => {
      if (selectedChannelId && video.channelId !== selectedChannelId) {
        return false;
      }

      if (shortsFilterEnabled) {
        if (feedMode === 'shorts') {
          return Boolean(video.isShort);
        }
        // En la pestaña principal ("Todos") solo se muestran vídeos normales (no Shorts)
        return !video.isShort;
      }

      return true;
    });
  }, [videos, selectedChannelId, shortsFilterEnabled, feedMode]);

  const handleOpenVideo = useCallback(
    (video: VideoItem) => {
      openVideo(video);
    },
    [openVideo]
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
        compact={showShortsOnly}
      />
    ),
    [getProgress, handleOpenVideo, showShortsOnly]
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
                  {/* Pestaña/Filtro "Todos" -> Muestra solo vídeos normales */}
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

                  {/* Pestaña/Filtro "Shorts" -> Muestra solo Shorts (configurable desde config.feed.enableShortsFilter) */}
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
                        color={isShortsSelected ? colors.badgeText : colors.primary}
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

  if (feedLoading && videos.length === 0) {
    return (
      <View
        style={[styles.screen, { backgroundColor: colors.background }]}
      >
        <View style={styles.contentPadding}>
          <VideoFeedSkeleton count={3} />
        </View>
      </View>
    );
  }

  if (favorites.length === 0) {
    return (
      <View
        style={[styles.screen, { backgroundColor: colors.background }]}
      >
        <EmptyState
          testID="feed-empty-favorites"
          icon="tv-outline"
          title="Todavía no tienes canales favoritos."
          description="Busca tus canales preferidos de YouTube y añádelos a favoritos para descubrir aquí sus vídeos más recientes."
          actionLabel="Buscar canales"
          onAction={handleGoToSearch}
        />
      </View>
    );
  }

  if (error && videos.length === 0) {
    return (
      <View
        style={[styles.screen, { backgroundColor: colors.background }]}
      >
        <ErrorState
          testID="feed-error-state"
          message={error.message}
          onRetry={refresh}
        />
      </View>
    );
  }

  const hasMiniPlayer = Boolean(activeVideo && isMinimized);

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
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
        initialNumToRender={6}
        maxToRenderPerBatch={8}
        windowSize={7}
        removeClippedSubviews
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
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
