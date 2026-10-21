import React, { memo, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { config } from '../config/config';
import { useThemeColors } from '../hooks/useThemeColors';
import { ChannelPlaylist } from '../types/youtube';

export interface PlaylistCardProps {
  playlist: ChannelPlaylist;
  onPress: (playlist: ChannelPlaylist) => void;
}

function PlaylistCardComponent({ playlist, onPress }: PlaylistCardProps) {
  const { colors } = useThemeColors();
  const [imageError, setImageError] = useState(false);

  return (
    <Pressable
      testID={`playlist-card-${playlist.id}`}
      accessibilityRole="button"
      accessibilityLabel={`Abrir lista de reproducción ${playlist.title}`}
      onPress={() => onPress(playlist)}
      style={({ pressed }) => [
        styles.card,
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
          { backgroundColor: colors.surfaceElevated },
        ]}
      >
        {playlist.thumbnail && !imageError ? (
          <Image
            source={{ uri: playlist.thumbnail }}
            style={styles.thumbnail}
            resizeMode="cover"
            onError={() => setImageError(true)}
          />
        ) : (
          <View style={styles.thumbnailFallback}>
            <Ionicons
              name="albums-outline"
              size={config.theme.sizes.iconXl}
              color={colors.primary}
            />
          </View>
        )}

        {/* Playlist count badge overlay */}
        <View
          style={[
            styles.playlistBadge,
            { backgroundColor: colors.badgeBackground },
          ]}
        >
          <Ionicons
            name="list"
            size={config.theme.sizes.iconSm}
            color={colors.badgeText}
          />
          {playlist.itemCountText ? (
            <Text style={[styles.badgeText, { color: colors.badgeText }]}>
              {playlist.itemCountText}
            </Text>
          ) : (
            <Text style={[styles.badgeText, { color: colors.badgeText }]}>
              Lista
            </Text>
          )}
        </View>
      </View>

      <View style={styles.detailsContainer}>
        <Text
          numberOfLines={2}
          style={[styles.title, { color: colors.text }]}
        >
          {playlist.title}
        </Text>

        <View style={styles.metaRow}>
          <Ionicons
            name="play-circle-outline"
            size={config.theme.sizes.iconSm}
            color={colors.primary}
          />
          <Text
            style={[styles.playText, { color: colors.primary }]}
          >
            Ver lista
          </Text>

          {playlist.publishedAt ? (
            <>
              <Text style={[styles.dot, { color: colors.textMuted }]}>•</Text>
              <Text
                numberOfLines={1}
                style={[styles.dateText, { color: colors.textMuted }]}
              >
                {playlist.publishedAt}
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
  thumbnailWrapper: {
    width: '100%',
    aspectRatio: config.theme.sizes.thumbnailAspectRatio,
    position: 'relative',
    overflow: 'hidden',
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  thumbnailFallback: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playlistBadge: {
    position: 'absolute',
    bottom: config.theme.spacing.sm,
    right: config.theme.spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: config.theme.spacing.xs,
    paddingHorizontal: config.theme.spacing.sm,
    paddingVertical: config.theme.spacing.xs,
    borderRadius: config.theme.radii.xs,
  },
  badgeText: {
    fontSize: config.theme.typography.fontSizes.xs,
    fontWeight: config.theme.typography.fontWeights.medium,
  },
  detailsContainer: {
    padding: config.theme.spacing.md,
    gap: config.theme.spacing.xs,
  },
  title: {
    fontSize: config.theme.typography.fontSizes.md,
    fontWeight: config.theme.typography.fontWeights.semibold,
    lineHeight: config.theme.typography.lineHeights.md,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: config.theme.spacing.xs,
    marginTop: config.theme.spacing.xxs,
  },
  playText: {
    fontSize: config.theme.typography.fontSizes.sm,
    fontWeight: config.theme.typography.fontWeights.medium,
  },
  dot: {
    fontSize: config.theme.typography.fontSizes.sm,
  },
  dateText: {
    fontSize: config.theme.typography.fontSizes.sm,
    flexShrink: 1,
  },
});

export const PlaylistCard = memo(PlaylistCardComponent);
