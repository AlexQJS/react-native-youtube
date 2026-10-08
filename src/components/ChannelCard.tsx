import React, { memo, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { config } from '../config/config';
import { useThemeColors } from '../hooks/useThemeColors';
import { FavoriteChannel } from '../types/youtube';
import { FavoriteButton } from './FavoriteButton';

export interface ChannelCardProps {
  channel: FavoriteChannel;
  isFavorite: boolean;
  onToggleFavorite: (channel: FavoriteChannel) => void;
}

function ChannelCardComponent({
  channel,
  isFavorite,
  onToggleFavorite,
}: ChannelCardProps) {
  const { colors } = useThemeColors();
  const [imageError, setImageError] = useState(false);

  const initial = channel.name ? channel.name.charAt(0).toUpperCase() : '?';
  const showImage = Boolean(channel.thumbnail && !imageError);

  return (
    <View
      testID={`channel-card-${channel.id}`}
      style={[
        styles.container,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
        },
      ]}
    >
      <View
        style={[
          styles.avatarContainer,
          { backgroundColor: colors.surfaceElevated },
        ]}
      >
        {showImage ? (
          <Image
            source={{ uri: channel.thumbnail }}
            style={styles.avatar}
            onError={() => setImageError(true)}
          />
        ) : (
          <Text style={[styles.avatarInitial, { color: colors.text }]}>
            {initial}
          </Text>
        )}
      </View>

      <View style={styles.infoContainer}>
        <View style={styles.titleRow}>
          <Text
            numberOfLines={1}
            style={[styles.name, { color: colors.text }]}
          >
            {channel.name}
          </Text>
          {typeof channel.watchCount === 'number' && channel.watchCount > 0 && (
            <View
              testID={`channel-watch-count-${channel.id}`}
              style={[
                styles.frequencyBadge,
                {
                  backgroundColor: colors.surfaceElevated,
                  borderColor: colors.border,
                },
              ]}
            >
              <Text
                style={[
                  styles.frequencyBadgeText,
                  { color: colors.primary },
                ]}
              >
                {channel.watchCount === 1
                  ? '1 vídeo visto'
                  : `${channel.watchCount} vídeos vistos`}
              </Text>
            </View>
          )}
        </View>
        {channel.description ? (
          <Text
            numberOfLines={2}
            style={[styles.description, { color: colors.textSecondary }]}
          >
            {channel.description}
          </Text>
        ) : (
          <Text
            numberOfLines={1}
            style={[styles.description, { color: colors.textMuted }]}
          >
            Canal de YouTube
          </Text>
        )}
      </View>

      <FavoriteButton
        testID={`fav-btn-${channel.id}`}
        isFavorite={isFavorite}
        onPress={() => onToggleFavorite(channel)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: config.theme.spacing.md,
    borderRadius: config.theme.radii.md,
    borderWidth: config.theme.sizes.borderWidth,
    marginBottom: config.theme.spacing.sm,
    gap: config.theme.spacing.md,
  },
  avatarContainer: {
    width: config.theme.sizes.channelAvatarMd,
    height: config.theme.sizes.channelAvatarMd,
    borderRadius: config.theme.radii.full,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: '100%',
    height: '100%',
  },
  avatarInitial: {
    fontSize: config.theme.typography.fontSizes.xl,
    fontWeight: config.theme.typography.fontWeights.bold,
  },
  infoContainer: {
    flex: 1,
    justifyContent: 'center',
    gap: config.theme.spacing.xxs,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: config.theme.spacing.xs,
  },
  name: {
    fontSize: config.theme.typography.fontSizes.md,
    lineHeight: config.theme.typography.lineHeights.md,
    fontWeight: config.theme.typography.fontWeights.semibold,
    flexShrink: 1,
  },
  frequencyBadge: {
    paddingHorizontal: config.theme.spacing.sm,
    paddingVertical: 2,
    borderRadius: config.theme.radii.full,
  },
  frequencyBadgeText: {
    fontSize: config.theme.typography.fontSizes.xs,
    fontWeight: config.theme.typography.fontWeights.bold,
  },
  description: {
    fontSize: config.theme.typography.fontSizes.sm,
    lineHeight: config.theme.typography.lineHeights.sm,
  },
});

export const ChannelCard = memo(ChannelCardComponent);
