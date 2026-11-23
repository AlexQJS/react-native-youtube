import React, { memo, useCallback, useRef, useState } from 'react';
import {
  FlatList,
  Image,
  ListRenderItemInfo,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { EmptyState, VideoFeedSkeleton } from '../components/UIStates';
import { config } from '../config/config';
import { usePlayer } from '../context/PlayerContext';
import { useThemeColors } from '../hooks/useThemeColors';
import { useWatchHistory } from '../hooks/useWatchHistory';
import { WatchHistoryItem } from '../types/youtube';
import {
  calculateProgressRatio,
  formatDuration,
  formatRelativeDate,
  formatViewCount,
  isVideoCompleted,
} from '../utils/format';

interface HistoryCardProps {
  item: WatchHistoryItem;
  onPress: (item: WatchHistoryItem) => void;
  onRemove: (videoId: string) => void;
  onPressChannel?: (channelId: string, channelTitle?: string) => void;
}

const HistoryCard = memo(function HistoryCardComponent({
  item,
  onPress,
  onRemove,
  onPressChannel,
}: HistoryCardProps) {
  const { colors } = useThemeColors();
  const [imageError, setImageError] = useState(false);
  const { video, position, duration, completed, watchedAt } = item;
  const isChannelPressedRef = useRef(false);

  const handleCardPress = useCallback(() => {
    if (isChannelPressedRef.current) {
      isChannelPressedRef.current = false;
      return;
    }
    onPress(item);
  }, [item, onPress]);

  const handleChannelPress = useCallback(() => {
    isChannelPressedRef.current = true;
    if (video.channelId && onPressChannel) {
      onPressChannel(video.channelId, video.channelTitle);
    }
  }, [onPressChannel, video.channelId, video.channelTitle]);

  const effectiveDuration = duration || video.durationSeconds || 0;
  const isDone = Boolean(
    completed ||
      (effectiveDuration > 0 && isVideoCompleted(position, effectiveDuration))
  );

  const progressRatio = isDone
    ? 1
    : effectiveDuration > 0
      ? calculateProgressRatio(position, effectiveDuration)
      : position > 0
        ? 0.2
        : 0;

  const formattedPos = formatDuration(position) || '0:00';
  const formattedDur =
    video.durationFormatted ||
    (effectiveDuration > 0 ? formatDuration(effectiveDuration) : '');

  const minutajeLabel = isDone
    ? `Completado${formattedDur ? ` (${formattedDur})` : ''}`
    : formattedDur
      ? `Minuto ${formattedPos} / ${formattedDur}`
      : `Minuto ${formattedPos}`;

  const watchedRelative = formatRelativeDate(new Date(watchedAt).toISOString());
  const viewsText =
    !video.isShort && video.viewCount !== undefined
      ? formatViewCount(video.viewCount)
      : '';

  return (
    <Pressable
      testID={`history-card-${video.id}`}
      accessibilityRole="button"
      accessibilityLabel={`Reanudar ${video.title} de ${video.channelTitle}`}
      onPress={handleCardPress}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          opacity: pressed ? 0.9 : 1,
        },
      ]}
    >
      {/* Miniatura 16:9 a la izquierda con barra de progreso */}
      <View
        style={[
          styles.thumbnailContainer,
          { backgroundColor: colors.surfaceElevated },
        ]}
      >
        {video.thumbnail && !imageError ? (
          <Image
            source={{ uri: video.thumbnail }}
            style={styles.thumbnail}
            resizeMode="cover"
            onError={() => setImageError(true)}
          />
        ) : (
          <View style={styles.thumbnailFallback}>
            <Ionicons
              name="logo-youtube"
              size={config.theme.sizes.iconLg}
              color={colors.primary}
            />
          </View>
        )}

        {formattedDur ? (
          <View
            style={[
              styles.durationBadge,
              { backgroundColor: colors.badgeBackground },
            ]}
          >
            <Text style={[styles.durationText, { color: colors.badgeText }]}>
              {formattedDur}
            </Text>
          </View>
        ) : null}

        {progressRatio > 0 && (
          <View
            style={[
              styles.progressTrack,
              { backgroundColor: colors.progressTrack },
            ]}
          >
            <View
              style={[
                styles.progressFill,
                {
                  backgroundColor: colors.progressFill,
                  width: `${Math.round(progressRatio * 100)}%`,
                },
              ]}
            />
          </View>
        )}
      </View>

      {/* Información del vídeo: título, canal, visitas y minutaje */}
      <View style={styles.infoColumn}>
        <Text
          numberOfLines={2}
          style={[styles.videoTitle, { color: colors.text }]}
        >
          {video.title}
        </Text>

        {onPressChannel && video.channelId ? (
          <Pressable
            testID={`history-channel-${video.id}`}
            accessibilityRole="button"
            accessibilityLabel={`Ver canal ${video.channelTitle}`}
            onPress={handleChannelPress}
            hitSlop={6}
          >
            <Text
              numberOfLines={1}
              style={[styles.channelText, { color: colors.textSecondary }]}
            >
              {video.channelTitle || 'Canal de YouTube'}
            </Text>
          </Pressable>
        ) : (
          <Text
            numberOfLines={1}
            style={[styles.channelText, { color: colors.textSecondary }]}
          >
            {video.channelTitle || 'Canal de YouTube'}
          </Text>
        )}

        {viewsText ? (
          <Text
            numberOfLines={1}
            style={[styles.metaSmall, { color: colors.textMuted }]}
          >
            {viewsText}
          </Text>
        ) : null}

        <View style={styles.badgesRow}>
          <View
            testID={`history-timestamp-${video.id}`}
            style={[
              styles.minutajeChip,
              { backgroundColor: colors.surfaceElevated },
            ]}
          >
            <Ionicons
              name={isDone ? 'checkmark-circle' : 'time-outline'}
              size={13}
              color={isDone ? colors.success : colors.primary}
            />
            <Text
              numberOfLines={1}
              style={[styles.minutajeText, { color: colors.text }]}
            >
              {minutajeLabel}
            </Text>
          </View>

          {watchedRelative ? (
            <Text
              numberOfLines={1}
              style={[styles.watchedAgoText, { color: colors.textMuted }]}
            >
              {watchedRelative}
            </Text>
          ) : null}
        </View>
      </View>

      {/* Botón para quitar del historial */}
      <Pressable
        testID={`history-remove-${video.id}`}
        accessibilityRole="button"
        accessibilityLabel="Quitar del historial"
        onPress={() => onRemove(video.id)}
        hitSlop={10}
        style={styles.removeBtn}
      >
        <Ionicons
          name="trash-outline"
          size={config.theme.sizes.iconSm + 2}
          color={colors.textMuted}
        />
      </Pressable>
    </Pressable>
  );
});

export default function HistoryScreen() {
  const router = useRouter();
  const { colors } = useThemeColors();
  const { openVideo, activeVideo, isMinimized } = usePlayer();
  const { history, loading, removeItem, clearHistory } = useWatchHistory();

  const hasMiniPlayer = Boolean(activeVideo && isMinimized);

  const handleOpenHistoryItem = useCallback(
    (item: WatchHistoryItem) => {
      openVideo(item.video);
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

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<WatchHistoryItem>) => (
      <HistoryCard
        item={item}
        onPress={handleOpenHistoryItem}
        onRemove={removeItem}
        onPressChannel={handleOpenChannel}
      />
    ),
    [handleOpenChannel, handleOpenHistoryItem, removeItem]
  );

  const keyExtractor = useCallback(
    (item: WatchHistoryItem) => item.video.id,
    []
  );

  if (loading && history.length === 0) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        <View style={styles.contentPadding}>
          <VideoFeedSkeleton count={3} />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      {history.length > 0 && (
        <View
          style={[
            styles.topSummaryBar,
            {
              backgroundColor: colors.surface,
              borderBottomColor: colors.border,
            },
          ]}
        >
          <Text
            style={[styles.summaryText, { color: colors.textSecondary }]}
          >
            Últimos vistos ({history.length} / {config.history.maxItems})
          </Text>

          <Pressable
            testID="clear-history-button"
            accessibilityRole="button"
            onPress={clearHistory}
            style={({ pressed }) => [
              styles.clearButton,
              {
                backgroundColor: colors.surfaceElevated,
                opacity: pressed ? 0.75 : 1,
              },
            ]}
          >
            <Ionicons
              name="trash-outline"
              size={config.theme.sizes.iconSm - 2}
              color={colors.error}
            />
            <Text style={[styles.clearButtonText, { color: colors.error }]}>
              Borrar historial
            </Text>
          </Pressable>
        </View>
      )}

      <FlatList
        testID="history-video-list"
        data={history}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        ListEmptyComponent={
          <EmptyState
            testID="history-empty-state"
            icon="time-outline"
            title="Tu historial está vacío"
            description={`Aquí aparecerán los últimos ${config.history.maxItems} vídeos que hayas reproducido junto con su minutaje y canal.`}
            actionLabel="Ir al Feed"
            onAction={() => router.navigate('/feed')}
          />
        }
        contentContainerStyle={[
          styles.listContent,
          hasMiniPlayer && styles.listContentWithMiniPlayer,
          history.length === 0 && styles.listContentEmpty,
        ]}
        initialNumToRender={5}
        maxToRenderPerBatch={5}
        windowSize={5}
        updateCellsBatchingPeriod={50}
        removeClippedSubviews={Platform.OS !== 'web'}
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
  topSummaryBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: config.theme.spacing.lg,
    paddingVertical: config.theme.spacing.sm + 2,
    borderBottomWidth: config.theme.sizes.borderWidth,
  },
  summaryText: {
    fontSize: config.theme.typography.fontSizes.xs,
    fontWeight: config.theme.typography.fontWeights.semibold,
  },
  clearButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: config.theme.spacing.sm + 2,
    paddingVertical: config.theme.spacing.xs,
    borderRadius: config.theme.radii.full,
  },
  clearButtonText: {
    fontSize: config.theme.typography.fontSizes.xs,
    fontWeight: config.theme.typography.fontWeights.semibold,
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
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: config.theme.spacing.sm + 2,
    borderRadius: config.theme.radii.md,
    borderWidth: config.theme.sizes.borderWidth,
    marginBottom: config.theme.spacing.sm + 2,
    gap: config.theme.spacing.md,
  },
  thumbnailContainer: {
    width: 136,
    aspectRatio: config.theme.sizes.thumbnailAspectRatio,
    borderRadius: config.theme.radii.sm,
    overflow: 'hidden',
    position: 'relative',
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  thumbnailFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  durationBadge: {
    position: 'absolute',
    right: 4,
    bottom: 6,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: config.theme.radii.xs,
  },
  durationText: {
    fontSize: 10,
    fontWeight: config.theme.typography.fontWeights.semibold,
  },
  progressTrack: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 3,
  },
  progressFill: {
    height: '100%',
  },
  infoColumn: {
    flex: 1,
    justifyContent: 'center',
    gap: 3,
  },
  videoTitle: {
    fontSize: config.theme.typography.fontSizes.sm,
    lineHeight: config.theme.typography.lineHeights.sm,
    fontWeight: config.theme.typography.fontWeights.semibold,
  },
  channelText: {
    fontSize: config.theme.typography.fontSizes.xs,
    fontWeight: config.theme.typography.fontWeights.medium,
  },
  metaSmall: {
    fontSize: config.theme.typography.fontSizes.xs,
  },
  badgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 2,
  },
  minutajeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: config.theme.radii.xs,
  },
  minutajeText: {
    fontSize: config.theme.typography.fontSizes.xs,
    fontWeight: config.theme.typography.fontWeights.semibold,
  },
  watchedAgoText: {
    fontSize: 10,
  },
  removeBtn: {
    padding: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
