import React, { memo, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { config } from '../config/config';
import { useThemeColors } from '../hooks/useThemeColors';
import { PlaybackProgressEntry, VideoItem } from '../types/youtube';
import {
  calculateProgressRatio,
  formatDuration,
  formatRelativeDate,
  formatViewCount,
  isVideoCompleted,
} from '../utils/format';

export interface VideoCardProps {
  video: VideoItem;
  progress?: PlaybackProgressEntry | null;
  onPress: (video: VideoItem) => void;
  /** Modo compacto en cuadrícula de 2 columnas (usado en la pestaña Shorts) */
  compact?: boolean;
}

function VideoCardComponent({
  video,
  progress,
  onPress,
  compact = false,
}: VideoCardProps) {
  const { colors } = useThemeColors();
  const [imageError, setImageError] = useState(false);

  const hasProgress = Boolean(progress && progress.position > 0);
  const completed = progress
    ? Boolean(progress.completed || isVideoCompleted(progress.position, progress.duration))
    : false;

  const effectiveDuration =
    (progress?.duration && progress.duration > 0 ? progress.duration : undefined) ??
    video.durationSeconds ??
    0;

  const progressRatio =
    hasProgress && progress
      ? completed
        ? 1
        : effectiveDuration > 0
          ? calculateProgressRatio(progress.position, effectiveDuration)
          : 0.15
      : 0;

  const durationText =
    video.durationFormatted ||
    (effectiveDuration > 0 ? formatDuration(effectiveDuration) : '');

  const relativeDate = formatRelativeDate(video.publishedAt);
  // Mostrar cantidad de visitas en los vídeos normales (no Shorts)
  const viewsText =
    !video.isShort && video.viewCount !== undefined
      ? formatViewCount(video.viewCount)
      : '';

  return (
    <Pressable
      testID={`video-card-${video.id}`}
      accessibilityRole="button"
      accessibilityLabel={`Reproducir ${video.title} de ${video.channelTitle}`}
      onPress={() => onPress(video)}
      style={({ pressed }) => [
        styles.card,
        compact && styles.cardCompact,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          opacity: pressed ? 0.92 : 1,
        },
      ]}
    >
      <View
        style={[
          styles.thumbnailWrapper,
          compact && styles.thumbnailWrapperCompact,
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
              size={config.theme.sizes.iconXl}
              color={colors.primary}
            />
          </View>
        )}

        {/* Etiqueta de progreso cuando el usuario ya comenzó el vídeo */}
        {hasProgress && progress && (
          <View
            testID={`video-progress-badge-${video.id}`}
            style={[
              styles.progressStatusBadge,
              { backgroundColor: colors.badgeBackground },
            ]}
          >
            <Ionicons
              name={completed ? 'checkmark-circle' : 'play-circle'}
              size={config.theme.sizes.iconSm - 2}
              color={completed ? colors.success : colors.primary}
            />
            <Text style={[styles.badgeText, { color: colors.badgeText }]}>
              {completed ? 'Visto' : `Continúa en ${formatDuration(progress.position)}`}
            </Text>
          </View>
        )}

        {/* Etiqueta de duración en la esquina inferior derecha */}
        {durationText ? (
          <View
            style={[
              styles.durationBadge,
              { backgroundColor: colors.badgeBackground },
            ]}
          >
            <Text style={[styles.badgeText, { color: colors.badgeText }]}>
              {durationText}
            </Text>
          </View>
        ) : null}

        {/* Barra visual de progreso sobre el borde inferior del thumbnail */}
        {hasProgress && (
          <View
            testID={`video-progress-bar-${video.id}`}
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

      <View
        style={[
          styles.detailsContainer,
          compact && styles.detailsContainerCompact,
        ]}
      >
        <Text
          numberOfLines={2}
          style={[
            styles.title,
            compact && styles.titleCompact,
            { color: colors.text },
          ]}
        >
          {video.title}
        </Text>

        <View style={styles.metaRow}>
          <Text
            numberOfLines={1}
            style={[styles.channelName, { color: colors.textSecondary }]}
          >
            {video.channelTitle}
          </Text>

          {viewsText ? (
            <>
              <Text style={[styles.dotSeparator, { color: colors.textMuted }]}>
                •
              </Text>
              <Text
                testID={`video-views-${video.id}`}
                style={[styles.metaText, { color: colors.textMuted }]}
              >
                {viewsText}
              </Text>
            </>
          ) : null}

          {relativeDate ? (
            <>
              <Text style={[styles.dotSeparator, { color: colors.textMuted }]}>
                •
              </Text>
              <Text style={[styles.metaText, { color: colors.textMuted }]}>
                {relativeDate}
              </Text>
            </>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: config.theme.radii.md,
    borderWidth: config.theme.sizes.borderWidth,
    overflow: 'hidden',
    marginBottom: config.theme.spacing.lg,
  },
  cardCompact: {
    flex: 1,
    maxWidth: '48.5%',
    marginBottom: config.theme.spacing.md,
  },
  thumbnailWrapper: {
    width: '100%',
    aspectRatio: config.theme.sizes.thumbnailAspectRatio,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  thumbnailWrapperCompact: {
    aspectRatio: config.theme.sizes.shortsAspectRatio,
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  thumbnailFallback: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressStatusBadge: {
    position: 'absolute',
    top: config.theme.spacing.sm,
    left: config.theme.spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: config.theme.spacing.xs,
    paddingHorizontal: config.theme.spacing.sm,
    paddingVertical: config.theme.spacing.xs,
    borderRadius: config.theme.radii.xs,
  },
  durationBadge: {
    position: 'absolute',
    bottom: config.theme.spacing.sm + config.theme.sizes.progressBarHeight,
    right: config.theme.spacing.sm,
    paddingHorizontal: config.theme.spacing.xs + 2,
    paddingVertical: config.theme.spacing.xxs,
    borderRadius: config.theme.radii.xs,
  },
  badgeText: {
    fontSize: config.theme.typography.fontSizes.xs,
    fontWeight: config.theme.typography.fontWeights.semibold,
  },
  progressTrack: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: config.theme.sizes.progressBarHeight,
  },
  progressFill: {
    height: '100%',
  },
  detailsContainer: {
    padding: config.theme.spacing.md,
    gap: config.theme.spacing.xs,
  },
  detailsContainerCompact: {
    padding: config.theme.spacing.sm,
    gap: config.theme.spacing.xxs,
  },
  title: {
    fontSize: config.theme.typography.fontSizes.md,
    lineHeight: config.theme.typography.lineHeights.md,
    fontWeight: config.theme.typography.fontWeights.semibold,
  },
  titleCompact: {
    fontSize: config.theme.typography.fontSizes.sm,
    lineHeight: config.theme.typography.lineHeights.sm,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  channelName: {
    fontSize: config.theme.typography.fontSizes.sm,
    fontWeight: config.theme.typography.fontWeights.medium,
    flexShrink: 1,
  },
  dotSeparator: {
    marginHorizontal: config.theme.spacing.xs,
    fontSize: config.theme.typography.fontSizes.sm,
  },
  metaText: {
    fontSize: config.theme.typography.fontSizes.sm,
  },
});

export const VideoCard = memo(VideoCardComponent);
