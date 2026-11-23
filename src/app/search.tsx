import React, { useCallback, useState } from 'react';
import {
  FlatList,
  ListRenderItemInfo,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ChannelCard } from '../components/ChannelCard';
import { VideoCard } from '../components/VideoCard';
import {
  ChannelSearchSkeleton,
  EmptyState,
  ErrorState,
} from '../components/UIStates';
import { config } from '../config/config';
import { usePlayer } from '../context/PlayerContext';
import { useChannelSearch } from '../hooks/useChannelSearch';
import { useFavorites } from '../hooks/useFavorites';
import { usePlaybackProgress } from '../hooks/usePlaybackProgress';
import { useThemeColors } from '../hooks/useThemeColors';
import { extractYouTubeVideoId } from '../services/youtube';
import { FavoriteChannel, VideoItem } from '../types/youtube';

type SearchTabFilter = 'all' | 'videos' | 'channels';

export default function SearchScreen() {
  const router = useRouter();
  const { colors } = useThemeColors();
  const { openVideo, activeVideo, isMinimized } = usePlayer();
  const { favorites, isFavorite, toggleFavorite } = useFavorites();
  const { getProgress } = usePlaybackProgress();
  const {
    query,
    results,
    videoResults,
    loading,
    error,
    hasSearched,
    setQuery,
    retry,
    clearSearch,
  } = useChannelSearch();

  const [activeFilter, setActiveFilter] = useState<SearchTabFilter>('all');

  const handleChangeQuery = useCallback(
    (text: string) => {
      if (activeFilter === 'channels' && extractYouTubeVideoId(text)) {
        setActiveFilter('all');
      }
      setQuery(text);
    },
    [activeFilter, setQuery]
  );

  const handleClearSearch = useCallback(() => {
    setActiveFilter('all');
    clearSearch();
  }, [clearSearch]);

  const handleSubmitSearch = useCallback(() => {
    retry();
  }, [retry]);

  const isShowingFavorites = query.trim().length < config.search.minQueryLength;
  const hasMiniPlayer = Boolean(activeVideo && isMinimized);
  const hasAnyResults = results.length > 0 || videoResults.length > 0;

  const handleToggleFavorite = useCallback(
    (channel: FavoriteChannel) => {
      toggleFavorite(channel);
    },
    [toggleFavorite]
  );

  const handleOpenChannel = useCallback(
    (channel: FavoriteChannel) => {
      router.push({
        pathname: '/channel/[id]',
        params: {
          id: channel.id,
          name: channel.name,
          thumbnail: channel.thumbnail,
          description: channel.description || '',
        },
      });
    },
    [router]
  );

  const handleOpenChannelFromVideo = useCallback(
    (channelId: string, channelTitle?: string) => {
      router.push({
        pathname: '/channel/[id]',
        params: {
          id: channelId,
          name: channelTitle || '',
        },
      });
    },
    [router]
  );

  const handleOpenVideo = useCallback(
    (video: VideoItem) => {
      openVideo(video);
    },
    [openVideo]
  );

  const renderChannelItem = useCallback(
    ({ item }: ListRenderItemInfo<FavoriteChannel>) => (
      <ChannelCard
        channel={item}
        isFavorite={isFavorite(item.id)}
        onToggleFavorite={handleToggleFavorite}
        onPress={handleOpenChannel}
      />
    ),
    [handleOpenChannel, handleToggleFavorite, isFavorite]
  );

  const keyExtractor = useCallback((item: FavoriteChannel) => item.id, []);

  const showChannelsSection =
    (activeFilter === 'all' || activeFilter === 'channels') &&
    results.length > 0;
  const showVideosSection =
    (activeFilter === 'all' || activeFilter === 'videos') &&
    videoResults.length > 0;

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      {/* Barra de búsqueda */}
      <View
        style={[
          styles.searchBarWrapper,
          {
            backgroundColor: colors.surface,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <View
          style={[
            styles.inputContainer,
            {
              backgroundColor: colors.surfaceElevated,
              borderColor: colors.border,
            },
          ]}
        >
          <Ionicons
            name="search"
            size={config.theme.sizes.iconSm}
            color={colors.textSecondary}
          />
          <TextInput
            testID="channel-search-input"
            value={query}
            onChangeText={handleChangeQuery}
            onSubmitEditing={handleSubmitSearch}
            placeholder="Search videos, channels, or video ID..."
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            style={[styles.input, { color: colors.text }]}
          />
          {query.length > 0 && (
            <Pressable
              testID="clear-search-button"
              accessibilityRole="button"
              accessibilityLabel="Limpiar búsqueda"
              onPress={handleClearSearch}
              hitSlop={8}
            >
              <Ionicons
                name="close-circle"
                size={config.theme.sizes.iconSm + 2}
                color={colors.textSecondary}
              />
            </Pressable>
          )}
        </View>
      </View>

      {/* Contenido según el estado */}
      {loading ? (
        <View style={styles.contentPadding}>
          <ChannelSearchSkeleton count={5} />
        </View>
      ) : error ? (
        <ErrorState
          testID="search-error-state"
          message={error.message}
          onRetry={retry}
        />
      ) : isShowingFavorites ? (
        <FlatList
          testID="favorites-management-list"
          data={favorites}
          keyExtractor={keyExtractor}
          renderItem={renderChannelItem}
          ListHeaderComponent={
            favorites.length > 0 ? (
              <Text style={[styles.sectionHeader, { color: colors.textSecondary, marginTop: 8, marginBottom: 16 }]}>
                Tus canales favoritos ({favorites.length})
              </Text>
            ) : undefined
          }
          ListEmptyComponent={
            <EmptyState
              testID="search-idle-empty"
              icon="search-outline"
              title="Descubre vídeos y canales de YouTube"
              description="Escribe en el buscador superior para encontrar vídeos y canales, reproducirlos al instante o suscribirte a tus favoritos."
            />
          }
          contentContainerStyle={[
            styles.listContent,
            hasMiniPlayer && styles.listContentWithMiniPlayer,
            favorites.length === 0 && styles.listContentEmpty,
          ]}
          keyboardShouldPersistTaps="handled"
          initialNumToRender={6}
          maxToRenderPerBatch={6}
          windowSize={5}
          updateCellsBatchingPeriod={50}
          removeClippedSubviews={Platform.OS !== 'web'}
        />
      ) : !hasAnyResults && hasSearched ? (
        <EmptyState
          testID="search-no-results"
          icon="compass-outline"
          title="No se encontraron resultados"
          description={`No hemos encontrado vídeos ni canales para "${query.trim()}". Prueba con otros términos.`}
        />
      ) : (
        <ScrollView
          testID="search-results-list"
          contentContainerStyle={[
            styles.listContent,
            hasMiniPlayer && styles.listContentWithMiniPlayer,
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Filtros rápidos: Todo | Canales | Videos */}
          <View style={styles.filterPillsRow}>
            <Pressable
              testID="search-filter-all"
              onPress={() => setActiveFilter('all')}
              style={[
                styles.filterPill,
                {
                  backgroundColor:
                    activeFilter === 'all'
                      ? colors.primary
                      : colors.surfaceElevated,
                  borderColor:
                    activeFilter === 'all' ? colors.primary : colors.border,
                },
              ]}
            >
              <Text
                style={[
                  styles.filterPillText,
                  {
                    color:
                      activeFilter === 'all' ? colors.badgeText : colors.text,
                  },
                ]}
              >
                Todo
              </Text>
            </Pressable>

            <Pressable
              testID="search-filter-channels"
              onPress={() => setActiveFilter('channels')}
              style={[
                styles.filterPill,
                {
                  backgroundColor:
                    activeFilter === 'channels'
                      ? colors.primary
                      : colors.surfaceElevated,
                  borderColor:
                    activeFilter === 'channels' ? colors.primary : colors.border,
                },
              ]}
            >
              <Ionicons
                name="people-outline"
                size={config.theme.sizes.iconSm - 2}
                color={
                  activeFilter === 'channels'
                    ? colors.badgeText
                    : colors.textSecondary
                }
              />
              <Text
                style={[
                  styles.filterPillText,
                  {
                    color:
                      activeFilter === 'channels'
                        ? colors.badgeText
                        : colors.text,
                  },
                ]}
              >
                Canales ({results.length})
              </Text>
            </Pressable>

            <Pressable
              testID="search-filter-videos"
              onPress={() => setActiveFilter('videos')}
              style={[
                styles.filterPill,
                {
                  backgroundColor:
                    activeFilter === 'videos'
                      ? colors.primary
                      : colors.surfaceElevated,
                  borderColor:
                    activeFilter === 'videos' ? colors.primary : colors.border,
                },
              ]}
            >
              <Ionicons
                name="play-circle-outline"
                size={config.theme.sizes.iconSm - 2}
                color={
                  activeFilter === 'videos' ? colors.badgeText : colors.textSecondary
                }
              />
              <Text
                style={[
                  styles.filterPillText,
                  {
                    color:
                      activeFilter === 'videos' ? colors.badgeText : colors.text,
                  },
                ]}
              >
                Vídeos ({videoResults.length})
              </Text>
            </Pressable>

          </View>

          {/* Apartado 1: Vídeos */}
          {showVideosSection && (
            <View
              testID="search-videos-section"
              style={styles.sectionBlock}
            >
              <View style={styles.sectionHeaderRow}>
                <Ionicons
                  name="videocam"
                  size={config.theme.sizes.iconSm}
                  color={colors.primary}
                />
                <Text style={[styles.sectionHeader, { color: colors.text }]}>
                  Vídeos ({videoResults.length})
                </Text>
              </View>

              {videoResults.map((video) => (
                <VideoCard
                  key={video.id}
                  video={video}
                  progress={getProgress(video.id)}
                  onPress={handleOpenVideo}
                  onPressChannel={handleOpenChannelFromVideo}
                />
              ))}
            </View>
          )}

          {/* Apartado 2: Canales */}
          {showChannelsSection && (
            <View
              testID="search-channels-section"
              style={styles.sectionBlock}
            >
              <View style={styles.sectionHeaderRow}>
                <Ionicons
                  name="people"
                  size={config.theme.sizes.iconSm}
                  color={colors.primary}
                />
                <Text style={[styles.sectionHeader, { color: colors.text }]}>
                  Canales ({results.length})
                </Text>
              </View>

              {results.map((channel) => (
                <ChannelCard
                  key={channel.id}
                  channel={channel}
                  isFavorite={isFavorite(channel.id)}
                  onToggleFavorite={handleToggleFavorite}
                  onPress={handleOpenChannel}
                />
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  searchBarWrapper: {
    paddingHorizontal: config.theme.spacing.lg,
    paddingVertical: config.theme.spacing.md,
    borderBottomWidth: config.theme.sizes.borderWidth,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    height: config.theme.sizes.inputHeight,
    borderRadius: config.theme.radii.full,
    borderWidth: config.theme.sizes.borderWidth,
    paddingHorizontal: config.theme.spacing.md,
    gap: config.theme.spacing.sm,
  },
  input: {
    flex: 1,
    fontSize: config.theme.typography.fontSizes.md,
    paddingVertical: 0,
  },
  contentPadding: {
    paddingHorizontal: config.theme.spacing.lg,
    paddingTop: config.theme.spacing.md,
  },
  listContent: {
    paddingHorizontal: config.theme.spacing.lg,
    paddingTop: config.theme.spacing.md,
    paddingBottom: config.theme.spacing.xxl,
  },
  listContentWithMiniPlayer: {
    paddingBottom:
      config.theme.spacing.xxl + config.theme.sizes.miniPlayerHeight,
  },
  listContentEmpty: {
    flexGrow: 1,
  },
  filterPillsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: config.theme.spacing.xs,
    marginBottom: config.theme.spacing.lg,
  },
  filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: config.theme.spacing.md,
    paddingVertical: config.theme.spacing.xs + 2,
    borderRadius: config.theme.radii.full,
    borderWidth: config.theme.sizes.borderWidth,
  },
  filterPillText: {
    fontSize: config.theme.typography.fontSizes.xs,
    fontWeight: config.theme.typography.fontWeights.semibold,
  },
  sectionBlock: {
    marginBottom: config.theme.spacing.lg,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: config.theme.spacing.xs,
    marginBottom: config.theme.spacing.sm,
  },
  sectionHeader: {
    fontSize: config.theme.typography.fontSizes.sm,
    fontWeight: config.theme.typography.fontWeights.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
});
