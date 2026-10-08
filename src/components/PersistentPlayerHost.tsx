import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { config } from '../config/config';
import { usePlayer } from '../context/PlayerContext';
import { usePlaybackProgress } from '../hooks/usePlaybackProgress';
import { useThemeColors } from '../hooks/useThemeColors';
import { storage } from '../services/storage';
import { VideoItem } from '../types/youtube';
import {
  formatDuration,
  formatRelativeDate,
  formatViewCount,
} from '../utils/format';
import { VideoPlayer } from './VideoPlayer';

export interface PersistentPlayerHostProps {
  bottomOffset?: number;
}

export function PersistentPlayerHost({
  bottomOffset = config.theme.sizes.tabBarHeight + config.theme.spacing.md,
}: PersistentPlayerHostProps) {
  const { activeVideo, isMinimized, minimizeVideo, expandVideo, closeVideo } =
    usePlayer();
  const { colors } = useThemeColors();

  const videoId = activeVideo?.id ?? '';
  const [cachedDetails, setCachedDetails] = useState<VideoItem | null>(null);

  const {
    loading: progressLoading,
    entry,
    resumePosition,
    isCompleted,
    updatePlaybackState,
    flushProgress,
    restartVideoProgress,
  } = usePlaybackProgress(videoId || undefined);

  useEffect(() => {
    let mounted = true;
    if (videoId) {
      storage.getCachedVideo(videoId).then((cached) => {
        if (mounted) {
          setCachedDetails(cached);
        }
      });
    } else {
      setCachedDetails(null);
    }
    return () => {
      mounted = false;
    };
  }, [videoId]);

  const handleMinimize = useCallback(async () => {
    await flushProgress();
    minimizeVideo();
  }, [flushProgress, minimizeVideo]);

  const handleClose = useCallback(async () => {
    await flushProgress();
    closeVideo();
  }, [closeVideo, flushProgress]);

  const handleRestart = useCallback(async () => {
    if (videoId) {
      await restartVideoProgress(videoId);
    }
  }, [restartVideoProgress, videoId]);

  // Botón físico Atrás en Android: cuando el reproductor está a pantalla completa,
  // lo minimiza a ventana flotante (PiP) para seguir explorando vídeos.
  useEffect(() => {
    if (!activeVideo || isMinimized) {
      return;
    }

    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        handleMinimize();
        return true;
      }
    );

    return () => {
      subscription.remove();
    };
  }, [activeVideo, isMinimized, handleMinimize]);

  if (!activeVideo) {
    return null;
  }

  const title = activeVideo.title || cachedDetails?.title || 'Reproduciendo vídeo';
  const channelTitle =
    activeVideo.channelTitle || cachedDetails?.channelTitle || '';
  const publishedAt =
    activeVideo.publishedAt || cachedDetails?.publishedAt || '';
  const description =
    activeVideo.description || cachedDetails?.description || '';
  const initialDuration =
    activeVideo.durationSeconds ||
    cachedDetails?.durationSeconds ||
    entry?.duration ||
    0;
  const viewCount = activeVideo.viewCount ?? cachedDetails?.viewCount;
  const viewsLabel =
    !activeVideo.isShort && viewCount !== undefined
      ? formatViewCount(viewCount)
      : '';

  return (
    <View
      testID={isMinimized ? 'persistent-mini-player' : 'persistent-full-player'}
      style={[
        isMinimized
          ? [
              styles.floatingMiniCard,
              {
                bottom: bottomOffset,
                backgroundColor: colors.surface,
                borderColor: colors.border,
              },
            ]
          : [
              styles.fullHostContainer,
              {
                backgroundColor: colors.background,
              },
            ],
      ]}
    >
      {/* Cabecera superior (solo en modo pantalla completa) */}
      {!isMinimized && (
        <View
          style={[
            styles.header,
            {
              backgroundColor: colors.surface,
              borderBottomColor: colors.border,
            },
          ]}
        >
          <Pressable
            testID="player-minimize-button"
            accessibilityRole="button"
            accessibilityLabel="Minimizar a ventana flotante y explorar otros vídeos"
            onPress={handleMinimize}
            style={({ pressed }) => [
              styles.headerActionButton,
              { opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Ionicons
              name="chevron-down"
              size={config.theme.sizes.iconMd}
              color={colors.text}
            />
            <Text style={[styles.headerActionText, { color: colors.text }]}>
              Minimizar
            </Text>
          </Pressable>

          <Text
            numberOfLines={1}
            style={[styles.headerChannelTitle, { color: colors.textSecondary }]}
          >
            {channelTitle || config.app.name}
          </Text>

          <Pressable
            testID="player-close-button"
            accessibilityRole="button"
            accessibilityLabel="Cerrar reproductor"
            onPress={handleClose}
            hitSlop={8}
            style={({ pressed }) => [
              styles.closeButton,
              { opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Ionicons
              name="close"
              size={config.theme.sizes.iconMd}
              color={colors.textSecondary}
            />
          </Pressable>
        </View>
      )}

      {/* Instancia persistente del reproductor (mantiene su aspect ratio 16:9 tanto en grande como en ventana flotante) */}
      {progressLoading ? (
        <View style={styles.aspectRatioLoadingBox}>
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      ) : (
        <VideoPlayer
          key={videoId}
          videoId={videoId}
          title={title}
          channelTitle={channelTitle}
          initialPosition={resumePosition}
          initialDuration={initialDuration}
          minimized={isMinimized}
          onExpand={expandVideo}
          onClose={handleClose}
          onProgressUpdate={updatePlaybackState}
          onFlushProgress={(pos, dur) => {
            flushProgress(pos, dur);
          }}
          onRestartProgress={handleRestart}
        />
      )}

      {/* Detalles del vídeo (solo visibles cuando el reproductor está desplegado) */}
      {!isMinimized && (
        <ScrollView
          contentContainerStyle={styles.detailsContent}
          showsVerticalScrollIndicator={false}
        >
          {entry && entry.position > 0 && (
            <View
              testID="saved-progress-banner"
              style={[
                styles.resumeBanner,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                },
              ]}
            >
              <View style={styles.resumeInfo}>
                <Ionicons
                  name={isCompleted ? 'checkmark-circle' : 'time-outline'}
                  size={config.theme.sizes.iconSm + 2}
                  color={isCompleted ? colors.success : colors.primary}
                />
                <Text style={[styles.resumeText, { color: colors.text }]}>
                  {isCompleted
                    ? 'Ya habías completado este vídeo'
                    : `Progreso guardado en ${formatDuration(entry.position)}`}
                </Text>
              </View>
            </View>
          )}

          <Text style={[styles.videoTitle, { color: colors.text }]}>
            {title}
          </Text>

          <View style={styles.metaRow}>
            {channelTitle ? (
              <Text
                style={[styles.channelName, { color: colors.textSecondary }]}
              >
                {channelTitle}
              </Text>
            ) : null}
            {viewsLabel ? (
              <>
                <Text style={[styles.dot, { color: colors.textMuted }]}>•</Text>
                <Text
                  testID="player-view-count"
                  style={[styles.publishedDate, { color: colors.textMuted }]}
                >
                  {viewsLabel}
                </Text>
              </>
            ) : null}
            {publishedAt ? (
              <>
                <Text style={[styles.dot, { color: colors.textMuted }]}>•</Text>
                <Text
                  style={[styles.publishedDate, { color: colors.textMuted }]}
                >
                  {formatRelativeDate(publishedAt)}
                </Text>
              </>
            ) : null}
          </View>

          {description ? (
            <View
              style={[
                styles.descriptionCard,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                },
              ]}
            >
              <Text
                style={[
                  styles.descriptionText,
                  { color: colors.textSecondary },
                ]}
              >
                {description}
              </Text>
            </View>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fullHostContainer: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 9999,
    elevation: 30,
  },
  floatingMiniCard: {
    position: 'absolute',
    right: config.theme.spacing.md,
    width: config.theme.sizes.miniPlayerWidth,
    borderRadius: config.theme.radii.md,
    borderWidth: config.theme.sizes.borderWidth,
    overflow: 'hidden',
    zIndex: 9999,
    elevation: 28,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: config.theme.spacing.md,
    paddingVertical: config.theme.spacing.sm + 2,
    borderBottomWidth: config.theme.sizes.borderWidth,
    gap: config.theme.spacing.sm,
  },
  headerActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: config.theme.spacing.xs,
    paddingVertical: config.theme.spacing.xxs,
  },
  headerActionText: {
    fontSize: config.theme.typography.fontSizes.md,
    fontWeight: config.theme.typography.fontWeights.semibold,
  },
  headerChannelTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: config.theme.typography.fontSizes.sm,
    fontWeight: config.theme.typography.fontWeights.medium,
  },
  closeButton: {
    padding: config.theme.spacing.xxs,
  },
  aspectRatioLoadingBox: {
    width: '100%',
    aspectRatio: config.theme.sizes.thumbnailAspectRatio,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailsContent: {
    padding: config.theme.spacing.lg,
    gap: config.theme.spacing.md,
  },
  resumeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: config.theme.spacing.md,
    paddingVertical: config.theme.spacing.sm,
    borderRadius: config.theme.radii.sm,
    borderWidth: config.theme.sizes.borderWidth,
  },
  resumeInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: config.theme.spacing.xs,
  },
  resumeText: {
    fontSize: config.theme.typography.fontSizes.xs,
    fontWeight: config.theme.typography.fontWeights.medium,
  },
  videoTitle: {
    fontSize: config.theme.typography.fontSizes.lg,
    lineHeight: config.theme.typography.lineHeights.lg,
    fontWeight: config.theme.typography.fontWeights.bold,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  channelName: {
    fontSize: config.theme.typography.fontSizes.sm,
    fontWeight: config.theme.typography.fontWeights.semibold,
  },
  dot: {
    marginHorizontal: config.theme.spacing.xs,
  },
  publishedDate: {
    fontSize: config.theme.typography.fontSizes.sm,
  },
  descriptionCard: {
    padding: config.theme.spacing.md,
    borderRadius: config.theme.radii.sm,
    borderWidth: config.theme.sizes.borderWidth,
    marginTop: config.theme.spacing.xs,
  },
  descriptionText: {
    fontSize: config.theme.typography.fontSizes.sm,
    lineHeight: config.theme.typography.lineHeights.sm,
  },
});
