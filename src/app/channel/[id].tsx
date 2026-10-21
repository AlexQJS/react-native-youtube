import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Image,
  ListRenderItemInfo,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { PlaylistCard } from '../../components/PlaylistCard';
import { VideoCard } from '../../components/VideoCard';
import {
  EmptyState,
  ErrorState,
  VideoFeedSkeleton,
} from '../../components/UIStates';
import { config } from '../../config/config';
import { usePlayer } from '../../context/PlayerContext';
import { useChannelProfile } from '../../hooks/useChannelProfile';
import { useFavorites } from '../../hooks/useFavorites';
import { usePlaybackProgress } from '../../hooks/usePlaybackProgress';
import { useThemeColors } from '../../hooks/useThemeColors';
import {
  ChannelPlaylist,
  ChannelProfileTab,
  FavoriteChannel,
  VideoItem,
} from '../../types/youtube';

export default function ChannelProfileScreen() {
  const router = useRouter();
  const { colors } = useThemeColors();
  const { openVideo } = usePlayer();
  const { isFavorite, toggleFavorite } = useFavorites();
  const { getProgress } = usePlaybackProgress();

  const params = useLocalSearchParams<{
    id?: string;
    name?: string;
    thumbnail?: string;
    description?: string;
  }>();

  const channelId =
    typeof params.id === 'string'
      ? params.id
      : Array.isArray(params.id)
      ? params.id[0]
      : '';
  const paramName =
    typeof params.name === 'string'
      ? params.name
      : Array.isArray(params.name)
      ? params.name[0]
      : undefined;
  const paramThumbnail =
    typeof params.thumbnail === 'string'
      ? params.thumbnail
      : Array.isArray(params.thumbnail)
      ? params.thumbnail[0]
      : undefined;
  const paramDescription =
    typeof params.description === 'string'
      ? params.description
      : Array.isArray(params.description)
      ? params.description[0]
      : undefined;

  const {
    channel,
    loadingChannel,
    videos,
    loadingVideos,
    popularVideos,
    loadingPopular,
    playlists,
    loadingPlaylists,
    refreshing,
    error,
    refresh,
    loadTab,
  } = useChannelProfile(channelId, {
    initialName: paramName,
    initialThumbnail: paramThumbnail,
    initialDescription: paramDescription,
  });

  const [activeTab, setActiveTab] = useState<ChannelProfileTab>('videos');
  const [avatarError, setAvatarError] = useState(false);
  const [bannerError, setBannerError] = useState(false);

  // Reset to first tab and clear image errors whenever channelId changes
  useEffect(() => {
    setActiveTab('videos');
    setAvatarError(false);
    setBannerError(false);
  }, [channelId]);

  const channelTitle = channel?.name || paramName || 'Canal';
  const channelThumbnail = channel?.thumbnail || paramThumbnail || '';
  const initial = channelTitle ? channelTitle.charAt(0).toUpperCase() : '?';
  const isChannelFav = isFavorite(channelId);

  const handleToggleFavorite = useCallback(() => {
    if (!channelId) return;
    const channelToSave: FavoriteChannel = {
      id: channelId,
      name: channelTitle,
      thumbnail: channelThumbnail,
      description: channel?.description || paramDescription,
    };
    toggleFavorite(channelToSave);
  }, [channel?.description, channelId, channelThumbnail, channelTitle, paramDescription, toggleFavorite]);

  const handleShareChannel = useCallback(async () => {
    if (!channelId) return;
    try {
      const channelUrl = `https://www.youtube.com/channel/${channelId}`;
      await Share.share({
        title: channelTitle,
        message: `Echa un vistazo al canal "${channelTitle}" en YouTube: ${channelUrl}`,
        url: channelUrl,
      });
    } catch {
      // Ignorar fallo de compartir
    }
  }, [channelId, channelTitle]);

  const handleTabChange = useCallback(
    (tab: ChannelProfileTab) => {
      setActiveTab(tab);
      void loadTab(tab);
    },
    [loadTab]
  );

  const handleOpenVideo = useCallback(
    (video: VideoItem) => {
      openVideo(video);
    },
    [openVideo]
  );

  const handleOpenPlaylist = useCallback(
    (playlist: ChannelPlaylist) => {
      if (playlist.firstVideoId) {
        openVideo({
          id: playlist.firstVideoId,
          title: playlist.title,
          channelId: channelId,
          channelTitle: channelTitle,
          thumbnail: playlist.thumbnail,
          publishedAt: playlist.publishedAt || '',
        });
      }
    },
    [channelId, channelTitle, openVideo]
  );

  const renderVideoItem = useCallback(
    ({ item }: ListRenderItemInfo<VideoItem>) => (
      <VideoCard
        video={item}
        progress={getProgress(item.id)}
        onPress={handleOpenVideo}
      />
    ),
    [getProgress, handleOpenVideo]
  );

  const renderPlaylistItem = useCallback(
    ({ item }: ListRenderItemInfo<ChannelPlaylist>) => (
      <PlaylistCard playlist={item} onPress={handleOpenPlaylist} />
    ),
    [handleOpenPlaylist]
  );

  const videoKeyExtractor = useCallback((item: VideoItem) => item.id, []);
  const playlistKeyExtractor = useCallback((item: ChannelPlaylist) => item.id, []);

  const headerComponent = useMemo(() => {
    const showBanner = Boolean(channel?.bannerUrl && !bannerError);
    const showAvatar = Boolean(channelThumbnail && !avatarError);

    return (
      <View style={styles.headerContainer}>
        {/* Banner */}
        {showBanner ? (
          <Image
            source={{ uri: channel?.bannerUrl }}
            style={styles.banner}
            resizeMode="cover"
            onError={() => setBannerError(true)}
          />
        ) : (
          <View
            style={[
              styles.bannerFallback,
              { backgroundColor: colors.surfaceElevated },
            ]}
          >
            <Ionicons
              name="image-outline"
              size={config.theme.sizes.iconLg}
              color={colors.textMuted}
            />
          </View>
        )}

        {/* Channel Details Header */}
        <View style={styles.profileInfoSection}>
          <View style={styles.avatarRow}>
            <View
              style={[
                styles.avatarWrapper,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.background,
                },
              ]}
            >
              {showAvatar ? (
                <Image
                  source={{ uri: channelThumbnail }}
                  style={styles.avatar}
                  onError={() => setAvatarError(true)}
                />
              ) : (
                <View
                  style={[
                    styles.avatarFallback,
                    { backgroundColor: colors.surfaceElevated },
                  ]}
                >
                  <Text style={[styles.avatarInitial, { color: colors.text }]}>
                    {initial}
                  </Text>
                </View>
              )}
            </View>

            {/* Subscribe / Favorite Button */}
            <Pressable
              testID="channel-favorite-toggle-btn"
              accessibilityRole="button"
              accessibilityLabel={
                isChannelFav ? 'Siguiendo este canal' : 'Seguir este canal'
              }
              onPress={handleToggleFavorite}
              style={({ pressed }) => [
                styles.favoriteButton,
                {
                  backgroundColor: isChannelFav
                    ? colors.surfaceElevated
                    : colors.primary,
                  borderColor: isChannelFav ? colors.border : colors.primary,
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
            >
              <Ionicons
                name={isChannelFav ? 'checkmark-circle' : 'heart-outline'}
                size={config.theme.sizes.iconSm}
                color={isChannelFav ? colors.primary : colors.badgeText}
              />
              <Text
                style={[
                  styles.favoriteButtonText,
                  { color: isChannelFav ? colors.text : colors.badgeText },
                ]}
              >
                {isChannelFav ? 'Siguiendo' : 'Seguir canal'}
              </Text>
            </Pressable>
          </View>

          {/* Titles & Stats */}
          <Text style={[styles.channelName, { color: colors.text }]}>
            {channelTitle}
          </Text>

          <View style={styles.metaRow}>
            {channel?.handle ? (
              <Text style={[styles.handleText, { color: colors.textSecondary }]}>
                {channel.handle}
              </Text>
            ) : null}

            {channel?.subscriberCountText ? (
              <>
                {channel?.handle ? (
                  <Text style={[styles.dot, { color: colors.textMuted }]}>•</Text>
                ) : null}
                <Text
                  style={[styles.statsText, { color: colors.textSecondary }]}
                >
                  {channel.subscriberCountText}
                </Text>
              </>
            ) : null}

            {channel?.videoCountText ? (
              <>
                <Text style={[styles.dot, { color: colors.textMuted }]}>•</Text>
                <Text
                  style={[styles.statsText, { color: colors.textSecondary }]}
                >
                  {channel.videoCountText}
                </Text>
              </>
            ) : null}
          </View>

          {/* Description snippet */}
          {(channel?.description || params.description) ? (
            <Pressable
              onPress={() => handleTabChange('about')}
              hitSlop={4}
              style={styles.descriptionSnippetPressable}
            >
              <Text
                numberOfLines={2}
                style={[styles.descriptionSnippet, { color: colors.textSecondary }]}
              >
                {channel?.description || params.description}
              </Text>
              <Text
                style={[styles.moreInfoLink, { color: colors.primary }]}
              >
                Más información...
              </Text>
            </Pressable>
          ) : null}
        </View>

        {/* Tab Navigation Segmented Bar */}
        <View
          style={[
            styles.tabBar,
            {
              backgroundColor: colors.surface,
              borderBottomColor: colors.border,
            },
          ]}
        >
          <Pressable
            testID="channel-tab-videos"
            accessibilityRole="tab"
            accessibilityState={{ selected: activeTab === 'videos' }}
            onPress={() => handleTabChange('videos')}
            style={[
              styles.tabButton,
              activeTab === 'videos' && {
                borderBottomColor: colors.primary,
                borderBottomWidth: 2,
              },
            ]}
          >
            <Text
              style={[
                styles.tabButtonText,
                {
                  color:
                    activeTab === 'videos' ? colors.primary : colors.textSecondary,
                  fontWeight:
                    activeTab === 'videos'
                      ? config.theme.typography.fontWeights.bold
                      : config.theme.typography.fontWeights.medium,
                },
              ]}
            >
              Vídeos
            </Text>
          </Pressable>

          <Pressable
            testID="channel-tab-popular"
            accessibilityRole="tab"
            accessibilityState={{ selected: activeTab === 'popular' }}
            onPress={() => handleTabChange('popular')}
            style={[
              styles.tabButton,
              activeTab === 'popular' && {
                borderBottomColor: colors.primary,
                borderBottomWidth: 2,
              },
            ]}
          >
            <Text
              style={[
                styles.tabButtonText,
                {
                  color:
                    activeTab === 'popular' ? colors.primary : colors.textSecondary,
                  fontWeight:
                    activeTab === 'popular'
                      ? config.theme.typography.fontWeights.bold
                      : config.theme.typography.fontWeights.medium,
                },
              ]}
            >
              Populares
            </Text>
          </Pressable>

          <Pressable
            testID="channel-tab-playlists"
            accessibilityRole="tab"
            accessibilityState={{ selected: activeTab === 'playlists' }}
            onPress={() => handleTabChange('playlists')}
            style={[
              styles.tabButton,
              activeTab === 'playlists' && {
                borderBottomColor: colors.primary,
                borderBottomWidth: 2,
              },
            ]}
          >
            <Text
              style={[
                styles.tabButtonText,
                {
                  color:
                    activeTab === 'playlists'
                      ? colors.primary
                      : colors.textSecondary,
                  fontWeight:
                    activeTab === 'playlists'
                      ? config.theme.typography.fontWeights.bold
                      : config.theme.typography.fontWeights.medium,
                },
              ]}
            >
              Listas
            </Text>
          </Pressable>

          <Pressable
            testID="channel-tab-about"
            accessibilityRole="tab"
            accessibilityState={{ selected: activeTab === 'about' }}
            onPress={() => handleTabChange('about')}
            style={[
              styles.tabButton,
              activeTab === 'about' && {
                borderBottomColor: colors.primary,
                borderBottomWidth: 2,
              },
            ]}
          >
            <Text
              style={[
                styles.tabButtonText,
                {
                  color:
                    activeTab === 'about' ? colors.primary : colors.textSecondary,
                  fontWeight:
                    activeTab === 'about'
                      ? config.theme.typography.fontWeights.bold
                      : config.theme.typography.fontWeights.medium,
                },
              ]}
            >
              Información
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }, [
    activeTab,
    avatarError,
    bannerError,
    channel?.bannerUrl,
    channel?.description,
    channel?.handle,
    channel?.subscriberCountText,
    channel?.videoCountText,
    channelThumbnail,
    channelTitle,
    colors,
    handleTabChange,
    handleToggleFavorite,
    initial,
    isChannelFav,
    params.description,
  ]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Top Navigation App Bar */}
      <View
        style={[
          styles.topAppBar,
          {
            backgroundColor: colors.surface,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <Pressable
          testID="channel-back-button"
          accessibilityRole="button"
          accessibilityLabel="Regresar a la pantalla anterior"
          onPress={() => router.back()}
          hitSlop={8}
          style={styles.iconButton}
        >
          <Ionicons
            name="arrow-back"
            size={config.theme.sizes.iconMd}
            color={colors.text}
          />
        </Pressable>

        <Text
          numberOfLines={1}
          style={[styles.topAppBarTitle, { color: colors.text }]}
        >
          {channelTitle}
        </Text>

        <Pressable
          testID="channel-share-button"
          accessibilityRole="button"
          accessibilityLabel="Compartir canal"
          onPress={handleShareChannel}
          hitSlop={8}
          style={styles.iconButton}
        >
          <Ionicons
            name="share-outline"
            size={config.theme.sizes.iconMd}
            color={colors.text}
          />
        </Pressable>
      </View>

      {/* Main Tab Content */}
      {error && !videos.length ? (
        <ScrollView
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={refresh}
              tintColor={colors.primary}
            />
          }
          contentContainerStyle={styles.centeredContainer}
        >
          {headerComponent}
          <ErrorState
            message={error.message}
            onRetry={refresh}
            testID="channel-error-state"
          />
        </ScrollView>
      ) : activeTab === 'videos' ? (
        loadingVideos && !videos.length ? (
          <ScrollView contentContainerStyle={styles.contentPadding}>
            {headerComponent}
            <VideoFeedSkeleton count={3} />
          </ScrollView>
        ) : (
          <FlatList
            data={videos}
            keyExtractor={videoKeyExtractor}
            renderItem={renderVideoItem}
            ListHeaderComponent={headerComponent}
            initialNumToRender={5}
            maxToRenderPerBatch={5}
            windowSize={5}
            updateCellsBatchingPeriod={50}
            removeClippedSubviews={Platform.OS !== 'web'}
            ListEmptyComponent={
              <EmptyState
                icon="videocam-outline"
                title="No hay vídeos disponibles"
                description="Este canal aún no tiene vídeos públicos o subidas recientes."
                testID="channel-empty-videos"
              />
            }
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={refresh}
                tintColor={colors.primary}
              />
            }
            contentContainerStyle={styles.listContent}
          />
        )
      ) : activeTab === 'popular' ? (
        loadingPopular && !popularVideos.length ? (
          <ScrollView contentContainerStyle={styles.contentPadding}>
            {headerComponent}
            <VideoFeedSkeleton count={3} />
          </ScrollView>
        ) : (
          <FlatList
            data={popularVideos}
            keyExtractor={videoKeyExtractor}
            renderItem={renderVideoItem}
            ListHeaderComponent={headerComponent}
            initialNumToRender={5}
            maxToRenderPerBatch={5}
            windowSize={5}
            updateCellsBatchingPeriod={50}
            removeClippedSubviews={Platform.OS !== 'web'}
            ListEmptyComponent={
              <EmptyState
                icon="trending-up-outline"
                title="Sin vídeos populares"
                description="No se pudieron encontrar vídeos destacados para este canal."
                testID="channel-empty-popular"
              />
            }
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={refresh}
                tintColor={colors.primary}
              />
            }
            contentContainerStyle={styles.listContent}
          />
        )
      ) : activeTab === 'playlists' ? (
        loadingPlaylists && !playlists.length ? (
          <ScrollView contentContainerStyle={styles.contentPadding}>
            {headerComponent}
            <VideoFeedSkeleton count={3} />
          </ScrollView>
        ) : (
          <FlatList
            data={playlists}
            keyExtractor={playlistKeyExtractor}
            renderItem={renderPlaylistItem}
            ListHeaderComponent={headerComponent}
            initialNumToRender={5}
            maxToRenderPerBatch={5}
            windowSize={5}
            updateCellsBatchingPeriod={50}
            removeClippedSubviews={Platform.OS !== 'web'}
            ListEmptyComponent={
              <EmptyState
                icon="albums-outline"
                title="Sin listas de reproducción"
                description="Este canal no tiene listas de reproducción públicas disponibles."
                testID="channel-empty-playlists"
              />
            }
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={refresh}
                tintColor={colors.primary}
              />
            }
            contentContainerStyle={styles.listContent}
          />
        )
      ) : (
        /* About Tab */
        <ScrollView
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={refresh}
              tintColor={colors.primary}
            />
          }
          contentContainerStyle={styles.aboutContent}
        >
          {headerComponent}

          <View
            style={[
              styles.aboutCard,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
              },
            ]}
          >
            <Text style={[styles.aboutCardTitle, { color: colors.text }]}>
              Descripción
            </Text>
            <Text
              selectable
              style={[styles.aboutDescriptionText, { color: colors.textSecondary }]}
            >
              {channel?.description ||
                params.description ||
                'Este canal no cuenta con una descripción pública.'}
            </Text>

            <View style={[styles.aboutDivider, { backgroundColor: colors.border }]} />

            <Text style={[styles.aboutCardTitle, { color: colors.text }]}>
              Estadísticas e información
            </Text>

            <View style={styles.statsGrid}>
              {channel?.subscriberCountText ? (
                <View style={styles.statsGridItem}>
                  <Ionicons
                    name="people-outline"
                    size={config.theme.sizes.iconSm + 2}
                    color={colors.primary}
                  />
                  <Text style={[styles.statsGridLabel, { color: colors.textMuted }]}>
                    Suscriptores
                  </Text>
                  <Text style={[styles.statsGridValue, { color: colors.text }]}>
                    {channel.subscriberCountText}
                  </Text>
                </View>
              ) : null}

              {channel?.videoCountText ? (
                <View style={styles.statsGridItem}>
                  <Ionicons
                    name="film-outline"
                    size={config.theme.sizes.iconSm + 2}
                    color={colors.primary}
                  />
                  <Text style={[styles.statsGridLabel, { color: colors.textMuted }]}>
                    Vídeos
                  </Text>
                  <Text style={[styles.statsGridValue, { color: colors.text }]}>
                    {channel.videoCountText}
                  </Text>
                </View>
              ) : null}

              {channel?.viewCountText ? (
                <View style={styles.statsGridItem}>
                  <Ionicons
                    name="eye-outline"
                    size={config.theme.sizes.iconSm + 2}
                    color={colors.primary}
                  />
                  <Text style={[styles.statsGridLabel, { color: colors.textMuted }]}>
                    Visualizaciones
                  </Text>
                  <Text style={[styles.statsGridValue, { color: colors.text }]}>
                    {channel.viewCountText}
                  </Text>
                </View>
              ) : null}

              {channel?.country ? (
                <View style={styles.statsGridItem}>
                  <Ionicons
                    name="globe-outline"
                    size={config.theme.sizes.iconSm + 2}
                    color={colors.primary}
                  />
                  <Text style={[styles.statsGridLabel, { color: colors.textMuted }]}>
                    País
                  </Text>
                  <Text style={[styles.statsGridValue, { color: colors.text }]}>
                    {channel.country}
                  </Text>
                </View>
              ) : null}

              {channel?.publishedAt ? (
                <View style={styles.statsGridItem}>
                  <Ionicons
                    name="calendar-outline"
                    size={config.theme.sizes.iconSm + 2}
                    color={colors.primary}
                  />
                  <Text style={[styles.statsGridLabel, { color: colors.textMuted }]}>
                    Se unió el
                  </Text>
                  <Text style={[styles.statsGridValue, { color: colors.text }]}>
                    {new Date(channel.publishedAt).toLocaleDateString()}
                  </Text>
                </View>
              ) : null}

              <View style={styles.statsGridItem}>
                <Ionicons
                  name="key-outline"
                  size={config.theme.sizes.iconSm + 2}
                  color={colors.primary}
                />
                <Text style={[styles.statsGridLabel, { color: colors.textMuted }]}>
                  Identificador
                </Text>
                <Text
                  numberOfLines={1}
                  selectable
                  style={[styles.statsGridValue, { color: colors.text }]}
                >
                  {channelId}
                </Text>
              </View>
            </View>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topAppBar: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: config.theme.spacing.md,
    borderBottomWidth: config.theme.sizes.borderWidth,
    zIndex: 10,
  },
  topAppBarTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: config.theme.typography.fontSizes.md,
    fontWeight: config.theme.typography.fontWeights.bold,
    marginHorizontal: config.theme.spacing.sm,
  },
  iconButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: config.theme.radii.full,
  },
  headerContainer: {
    marginBottom: config.theme.spacing.sm,
  },
  banner: {
    width: '100%',
    height: 110,
  },
  bannerFallback: {
    width: '100%',
    height: 90,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileInfoSection: {
    paddingHorizontal: config.theme.spacing.lg,
    paddingTop: config.theme.spacing.md,
    paddingBottom: config.theme.spacing.sm,
    gap: config.theme.spacing.xs,
  },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: -config.theme.spacing.xl,
    marginBottom: config.theme.spacing.xs,
  },
  avatarWrapper: {
    width: config.theme.sizes.channelAvatarLg,
    height: config.theme.sizes.channelAvatarLg,
    borderRadius: config.theme.radii.full,
    borderWidth: 3,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: '100%',
    height: '100%',
  },
  avatarFallback: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: config.theme.typography.fontSizes.xxl,
    fontWeight: config.theme.typography.fontWeights.bold,
  },
  favoriteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: config.theme.spacing.xs,
    paddingHorizontal: config.theme.spacing.md,
    height: config.theme.sizes.buttonHeight,
    borderRadius: config.theme.radii.full,
    borderWidth: config.theme.sizes.borderWidth,
  },
  favoriteButtonText: {
    fontSize: config.theme.typography.fontSizes.sm,
    fontWeight: config.theme.typography.fontWeights.semibold,
  },
  channelName: {
    fontSize: config.theme.typography.fontSizes.xl,
    fontWeight: config.theme.typography.fontWeights.bold,
    lineHeight: config.theme.typography.lineHeights.xl,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: config.theme.spacing.xs,
  },
  handleText: {
    fontSize: config.theme.typography.fontSizes.sm,
    fontWeight: config.theme.typography.fontWeights.medium,
  },
  dot: {
    fontSize: config.theme.typography.fontSizes.sm,
  },
  statsText: {
    fontSize: config.theme.typography.fontSizes.sm,
  },
  descriptionSnippetPressable: {
    marginTop: config.theme.spacing.xxs,
  },
  descriptionSnippet: {
    fontSize: config.theme.typography.fontSizes.sm,
    lineHeight: config.theme.typography.lineHeights.sm,
  },
  moreInfoLink: {
    fontSize: config.theme.typography.fontSizes.xs,
    fontWeight: config.theme.typography.fontWeights.semibold,
    marginTop: 2,
  },
  tabBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    borderBottomWidth: config.theme.sizes.borderWidth,
    marginTop: config.theme.spacing.xs,
  },
  tabButton: {
    paddingVertical: config.theme.spacing.md,
    paddingHorizontal: config.theme.spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  tabButtonText: {
    fontSize: config.theme.typography.fontSizes.sm,
  },
  listContent: {
    paddingHorizontal: config.theme.spacing.md,
    paddingBottom: 80,
  },
  contentPadding: {
    paddingHorizontal: config.theme.spacing.md,
    paddingBottom: 80,
  },
  centeredContainer: {
    paddingHorizontal: config.theme.spacing.md,
    paddingBottom: 80,
  },
  aboutContent: {
    paddingHorizontal: config.theme.spacing.md,
    paddingBottom: 80,
  },
  aboutCard: {
    padding: config.theme.spacing.lg,
    borderRadius: config.theme.radii.md,
    borderWidth: config.theme.sizes.borderWidth,
    marginVertical: config.theme.spacing.md,
    gap: config.theme.spacing.md,
  },
  aboutCardTitle: {
    fontSize: config.theme.typography.fontSizes.md,
    fontWeight: config.theme.typography.fontWeights.bold,
  },
  aboutDescriptionText: {
    fontSize: config.theme.typography.fontSizes.sm,
    lineHeight: config.theme.typography.lineHeights.md,
  },
  aboutDivider: {
    height: 1,
    width: '100%',
    marginVertical: config.theme.spacing.xs,
  },
  statsGrid: {
    gap: config.theme.spacing.md,
  },
  statsGridItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: config.theme.spacing.sm,
  },
  statsGridLabel: {
    fontSize: config.theme.typography.fontSizes.sm,
    width: 110,
  },
  statsGridValue: {
    fontSize: config.theme.typography.fontSizes.sm,
    fontWeight: config.theme.typography.fontWeights.medium,
    flex: 1,
  },
});
