import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { config } from '../config/config';
import { useThemeColors } from '../hooks/useThemeColors';
import { formatRelativeDate } from '../utils/format';

export interface EmptyStateProps {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  testID?: string;
}

export function EmptyState({
  icon = 'videocam-outline',
  title,
  description,
  actionLabel,
  onAction,
  testID = 'empty-state',
}: EmptyStateProps) {
  const { colors } = useThemeColors();

  return (
    <View testID={testID} style={styles.centerContainer}>
      <View
        style={[
          styles.iconCircle,
          { backgroundColor: colors.surfaceElevated },
        ]}
      >
        <Ionicons
          name={icon}
          size={config.theme.sizes.iconXl}
          color={colors.textSecondary}
        />
      </View>
      <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
      {description ? (
        <Text style={[styles.description, { color: colors.textSecondary }]}>
          {description}
        </Text>
      ) : null}

      {actionLabel && onAction ? (
        <Pressable
          testID={`${testID}-action`}
          accessibilityRole="button"
          onPress={onAction}
          style={({ pressed }) => [
            styles.primaryButton,
            {
              backgroundColor: colors.primary,
              opacity: pressed ? 0.85 : 1,
            },
          ]}
        >
          <Text style={[styles.primaryButtonText, { color: colors.badgeText }]}>
            {actionLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
  testID?: string;
}

export function ErrorState({
  message,
  onRetry,
  testID = 'error-state',
}: ErrorStateProps) {
  const { colors } = useThemeColors();

  return (
    <View testID={testID} style={styles.centerContainer}>
      <View
        style={[
          styles.iconCircle,
          { backgroundColor: colors.errorBackground },
        ]}
      >
        <Ionicons
          name="alert-circle-outline"
          size={config.theme.sizes.iconXl}
          color={colors.error}
        />
      </View>
      <Text style={[styles.title, { color: colors.text }]}>
        Ha ocurrido un problema
      </Text>
      <Text style={[styles.description, { color: colors.textSecondary }]}>
        {message}
      </Text>
      {onRetry ? (
        <Pressable
          testID="retry-button"
          accessibilityRole="button"
          onPress={onRetry}
          style={({ pressed }) => [
            styles.primaryButton,
            {
              backgroundColor: colors.primary,
              opacity: pressed ? 0.85 : 1,
            },
          ]}
        >
          <Ionicons
            name="refresh"
            size={config.theme.sizes.iconSm}
            color={colors.badgeText}
          />
          <Text style={[styles.primaryButtonText, { color: colors.badgeText }]}>
            Reintentar
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export interface OfflineBannerProps {
  lastUpdatedAt?: number | null;
  onRetry?: () => void;
}

export function OfflineBanner({ lastUpdatedAt, onRetry }: OfflineBannerProps) {
  const { colors } = useThemeColors();
  const timeLabel = lastUpdatedAt
    ? formatRelativeDate(new Date(lastUpdatedAt).toISOString())
    : '';

  return (
    <View
      testID="offline-banner"
      style={[
        styles.offlineBanner,
        {
          backgroundColor: colors.warningBackground,
          borderColor: colors.warning,
        },
      ]}
    >
      <Ionicons
        name="cloud-offline-outline"
        size={config.theme.sizes.iconMd}
        color={colors.warning}
      />
      <View style={styles.offlineTextWrapper}>
        <Text style={[styles.offlineTitle, { color: colors.text }]}>
          Modo sin conexión o datos en caché
        </Text>
        <Text style={[styles.offlineSubtext, { color: colors.textSecondary }]}>
          Los vídeos mostrados pueden no estar actualizados
          {timeLabel ? ` (${timeLabel})` : ''}.
        </Text>
      </View>
      {onRetry ? (
        <Pressable
          onPress={onRetry}
          style={({ pressed }) => [
            styles.offlineRetryButton,
            {
              borderColor: colors.warning,
              opacity: pressed ? 0.75 : 1,
            },
          ]}
        >
          <Text style={[styles.offlineRetryText, { color: colors.warning }]}>
            Actualizar
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function VideoFeedSkeleton({ count = 3 }: { count?: number }) {
  const { colors } = useThemeColors();

  return (
    <View testID="feed-skeleton" style={styles.skeletonList}>
      {Array.from({ length: count }).map((_, index) => (
        <View
          key={index}
          style={[
            styles.skeletonCard,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
            },
          ]}
        >
          <View
            style={[
              styles.skeletonThumbnail,
              { backgroundColor: colors.skeleton },
            ]}
          />
          <View style={styles.skeletonMeta}>
            <View
              style={[
                styles.skeletonLineWide,
                { backgroundColor: colors.skeleton },
              ]}
            />
            <View
              style={[
                styles.skeletonLineShort,
                { backgroundColor: colors.skeleton },
              ]}
            />
          </View>
        </View>
      ))}
    </View>
  );
}

export function ChannelSearchSkeleton({ count = 4 }: { count?: number }) {
  const { colors } = useThemeColors();

  return (
    <View testID="search-skeleton" style={styles.skeletonList}>
      {Array.from({ length: count }).map((_, index) => (
        <View
          key={index}
          style={[
            styles.skeletonChannelRow,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
            },
          ]}
        >
          <View
            style={[
              styles.skeletonAvatar,
              { backgroundColor: colors.skeleton },
            ]}
          />
          <View style={styles.skeletonChannelInfo}>
            <View
              style={[
                styles.skeletonLineWide,
                { backgroundColor: colors.skeleton },
              ]}
            />
            <View
              style={[
                styles.skeletonLineShort,
                { backgroundColor: colors.skeleton },
              ]}
            />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: config.theme.spacing.xl,
    paddingVertical: config.theme.spacing.xxl,
  },
  iconCircle: {
    width: config.theme.sizes.channelAvatarLg + 12,
    height: config.theme.sizes.channelAvatarLg + 12,
    borderRadius: config.theme.radii.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: config.theme.spacing.lg,
  },
  title: {
    fontSize: config.theme.typography.fontSizes.lg,
    lineHeight: config.theme.typography.lineHeights.lg,
    fontWeight: config.theme.typography.fontWeights.bold,
    textAlign: 'center',
    marginBottom: config.theme.spacing.xs,
  },
  description: {
    fontSize: config.theme.typography.fontSizes.md,
    lineHeight: config.theme.typography.lineHeights.md,
    textAlign: 'center',
    marginBottom: config.theme.spacing.lg,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: config.theme.spacing.xs,
    paddingHorizontal: config.theme.spacing.lg,
    height: config.theme.sizes.buttonHeight,
    borderRadius: config.theme.radii.full,
  },
  primaryButtonText: {
    fontSize: config.theme.typography.fontSizes.md,
    fontWeight: config.theme.typography.fontWeights.semibold,
  },
  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: config.theme.spacing.md,
    borderRadius: config.theme.radii.sm,
    borderWidth: config.theme.sizes.borderWidth,
    marginBottom: config.theme.spacing.md,
    gap: config.theme.spacing.sm,
  },
  offlineTextWrapper: {
    flex: 1,
  },
  offlineTitle: {
    fontSize: config.theme.typography.fontSizes.sm,
    fontWeight: config.theme.typography.fontWeights.semibold,
  },
  offlineSubtext: {
    fontSize: config.theme.typography.fontSizes.xs,
    lineHeight: config.theme.typography.lineHeights.xs,
  },
  offlineRetryButton: {
    paddingHorizontal: config.theme.spacing.sm,
    paddingVertical: config.theme.spacing.xs,
    borderRadius: config.theme.radii.xs,
    borderWidth: config.theme.sizes.borderWidth,
  },
  offlineRetryText: {
    fontSize: config.theme.typography.fontSizes.xs,
    fontWeight: config.theme.typography.fontWeights.semibold,
  },
  skeletonList: {
    paddingVertical: config.theme.spacing.sm,
  },
  skeletonCard: {
    borderRadius: config.theme.radii.md,
    borderWidth: config.theme.sizes.borderWidth,
    overflow: 'hidden',
    marginBottom: config.theme.spacing.lg,
  },
  skeletonThumbnail: {
    width: '100%',
    aspectRatio: config.theme.sizes.thumbnailAspectRatio,
  },
  skeletonMeta: {
    padding: config.theme.spacing.md,
    gap: config.theme.spacing.sm,
  },
  skeletonLineWide: {
    width: '80%',
    height: 16,
    borderRadius: config.theme.radii.xs,
  },
  skeletonLineShort: {
    width: '45%',
    height: 13,
    borderRadius: config.theme.radii.xs,
  },
  skeletonChannelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: config.theme.spacing.md,
    borderRadius: config.theme.radii.md,
    borderWidth: config.theme.sizes.borderWidth,
    marginBottom: config.theme.spacing.sm,
    gap: config.theme.spacing.md,
  },
  skeletonAvatar: {
    width: config.theme.sizes.channelAvatarMd,
    height: config.theme.sizes.channelAvatarMd,
    borderRadius: config.theme.radii.full,
  },
  skeletonChannelInfo: {
    flex: 1,
    gap: config.theme.spacing.xs,
  },
});
