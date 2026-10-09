import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { config } from '../config/config';
import { usePlayer } from '../context/PlayerContext';
import { usePlaybackProgress } from '../hooks/usePlaybackProgress';
import { useThemeColors } from '../hooks/useThemeColors';
import { useVideoComments } from '../hooks/useVideoComments';
import { storage } from '../services/storage';
import { VideoItem } from '../types/youtube';
import {
  detectIsShort,
  formatCompactCount,
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
  const { height: windowHeight } = useWindowDimensions();

  const videoId = activeVideo?.id ?? '';
  const [cachedDetails, setCachedDetails] = useState<VideoItem | null>(null);
  const [isDescriptionExpanded, setIsDescriptionExpanded] =
    useState<boolean>(false);

  const {
    loading: progressLoading,
    entry,
    resumePosition,
    isCompleted,
    updatePlaybackState,
    flushProgress,
    restartVideoProgress,
  } = usePlaybackProgress(videoId || undefined);

  const {
    comments,
    loading: commentsLoading,
    error: commentsError,
    refresh: refreshComments,
    expandedReplies,
    repliesByCommentId,
    loadingReplies,
    errorReplies,
    toggleReplies,
    retryReplies,
  } = useVideoComments(videoId || undefined);

  useEffect(() => {
    let mounted = true;
    setIsDescriptionExpanded(false);
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
  const isShort = Boolean(
    activeVideo.isShort ??
      cachedDetails?.isShort ??
      detectIsShort({
        title,
        description,
        durationSeconds: initialDuration || undefined,
      })
  );
  const shortMaxHeight =
    windowHeight && windowHeight > 0
      ? Math.max(
          280,
          Math.min(
            Math.round(
              windowHeight * config.theme.sizes.shortsPlayerMaxHeightRatio
            ),
            windowHeight - config.theme.sizes.shortsPlayerReservedSpace
          )
        )
      : 460;
  const viewCount = activeVideo.viewCount ?? cachedDetails?.viewCount;
  const viewsLabel =
    !isShort && viewCount !== undefined
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

      {/* Instancia persistente del reproductor (16:9 estándar o 9:16 vertical adaptado para Shorts) */}
      {progressLoading ? (
        <View
          style={[
            styles.aspectRatioLoadingBox,
            isShort &&
              !isMinimized && [
                styles.aspectRatioLoadingBoxShort,
                { maxHeight: shortMaxHeight },
              ],
          ]}
        >
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
          isShort={isShort}
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
              testID="video-description-card"
              style={[
                styles.descriptionCard,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                },
              ]}
            >
              <Text
                testID="video-description-text"
                numberOfLines={
                  isDescriptionExpanded
                    ? undefined
                    : config.comments.descriptionCollapsedLines
                }
                style={[
                  styles.descriptionText,
                  { color: colors.textSecondary },
                ]}
              >
                {description}
              </Text>

              <Pressable
                testID="description-toggle-button"
                accessibilityRole="button"
                accessibilityLabel={
                  isDescriptionExpanded ? 'Ver menos' : 'Ver más'
                }
                onPress={() => setIsDescriptionExpanded((prev) => !prev)}
                hitSlop={8}
                style={({ pressed }) => [
                  styles.descriptionToggleButton,
                  { opacity: pressed ? 0.7 : 1 },
                ]}
              >
                <Text
                  testID="description-toggle-text"
                  style={[
                    styles.descriptionToggleText,
                    { color: colors.primary },
                  ]}
                >
                  {isDescriptionExpanded ? 'Ver menos' : 'Ver más'}
                </Text>
                <Ionicons
                  name={isDescriptionExpanded ? 'chevron-up' : 'chevron-down'}
                  size={config.theme.sizes.iconSm}
                  color={colors.primary}
                />
              </Pressable>
            </View>
          ) : null}

          {/* Sección de comentarios del vídeo (debajo de la descripción) */}
          <View
            testID="video-comments-section"
            style={[
              styles.commentsSection,
              {
                borderTopColor: colors.border,
              },
            ]}
          >
            <View style={styles.commentsHeader}>
              <View style={styles.commentsHeaderTitleRow}>
                <Ionicons
                  name="chatbubble-ellipses-outline"
                  size={config.theme.sizes.iconSm + 2}
                  color={colors.text}
                />
                <Text
                  style={[styles.commentsHeaderTitle, { color: colors.text }]}
                >
                  Comentarios
                </Text>
                {!commentsLoading && comments.length > 0 ? (
                  <Text
                    testID="video-comments-count"
                    style={[
                      styles.commentsCountBadge,
                      { color: colors.textSecondary },
                    ]}
                  >
                    ({comments.length})
                  </Text>
                ) : null}
              </View>
            </View>

            {commentsLoading && comments.length === 0 ? (
              <View
                testID="video-comments-loading"
                style={[
                  styles.commentsStateCard,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                  },
                ]}
              >
                <ActivityIndicator size="small" color={colors.primary} />
                <Text
                  style={[
                    styles.commentsStateText,
                    { color: colors.textSecondary },
                  ]}
                >
                  Cargando comentarios...
                </Text>
              </View>
            ) : commentsError && comments.length === 0 ? (
              <View
                testID="video-comments-error"
                style={[
                  styles.commentsStateCard,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.commentsStateText,
                    { color: colors.textSecondary },
                  ]}
                >
                  {commentsError.message}
                </Text>
                <Pressable
                  testID="video-comments-retry"
                  accessibilityRole="button"
                  accessibilityLabel="Reintentar carga de comentarios"
                  onPress={refreshComments}
                  style={({ pressed }) => [
                    styles.commentsRetryButton,
                    {
                      backgroundColor: colors.surfaceElevated,
                      borderColor: colors.border,
                      opacity: pressed ? 0.75 : 1,
                    },
                  ]}
                >
                  <Ionicons
                    name="refresh"
                    size={config.theme.sizes.iconSm - 2}
                    color={colors.text}
                  />
                  <Text
                    style={[styles.commentsRetryText, { color: colors.text }]}
                  >
                    Reintentar
                  </Text>
                </Pressable>
              </View>
            ) : comments.length === 0 ? (
              <View
                testID="video-comments-empty"
                style={[
                  styles.commentsStateCard,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.commentsStateText,
                    { color: colors.textSecondary },
                  ]}
                >
                  No hay comentarios disponibles para este vídeo.
                </Text>
              </View>
            ) : (
              <View testID="video-comments-list" style={styles.commentsList}>
                {comments.map((comment) => {
                  const dateLabel =
                    formatRelativeDate(comment.publishedAt) ||
                    comment.publishedAt;
                  const authorInitial =
                    comment.authorName.replace(/^@/, '').trim().charAt(0).toUpperCase() ||
                    'U';
                  const likesLabel = formatCompactCount(comment.likeCount);
                  const repliesLabel = formatCompactCount(comment.replyCount);
                  const hasReplies = Boolean(
                    (comment.replyCount && comment.replyCount > 0) ||
                      (comment.replies && comment.replies.length > 0) ||
                      comment.repliesContinuationToken
                  );
                  const isRepliesExpanded = Boolean(expandedReplies[comment.id]);
                  const loadedReplies =
                    repliesByCommentId[comment.id] ?? comment.replies ?? [];
                  const isLoadingReplies = Boolean(loadingReplies[comment.id]);
                  const replyError = errorReplies[comment.id] ?? null;

                  const replyButtonLabel = isRepliesExpanded
                    ? 'Ocultar respuestas'
                    : comment.replyCount === 1
                      ? '1 respuesta'
                      : repliesLabel
                        ? `${repliesLabel} respuestas`
                        : 'Ver respuestas';

                  return (
                    <View
                      key={comment.id}
                      testID={`video-comment-item-${comment.id}`}
                      style={[
                        styles.commentCard,
                        {
                          backgroundColor: colors.surface,
                          borderColor: colors.border,
                        },
                      ]}
                    >
                      {comment.authorAvatar ? (
                        <Image
                          source={{ uri: comment.authorAvatar }}
                          style={[
                            styles.commentAvatar,
                            { backgroundColor: colors.surfaceElevated },
                          ]}
                        />
                      ) : (
                        <View
                          style={[
                            styles.commentAvatarFallback,
                            { backgroundColor: colors.surfaceElevated },
                          ]}
                        >
                          <Text
                            style={[
                              styles.commentAvatarInitial,
                              { color: colors.text },
                            ]}
                          >
                            {authorInitial}
                          </Text>
                        </View>
                      )}

                      <View style={styles.commentBody}>
                        <View style={styles.commentHeaderRow}>
                          <Text
                            numberOfLines={1}
                            style={[
                              styles.commentAuthor,
                              { color: colors.text },
                            ]}
                          >
                            {comment.authorName}
                          </Text>
                          {dateLabel ? (
                            <Text
                              style={[
                                styles.commentDate,
                                { color: colors.textMuted },
                              ]}
                            >
                              {dateLabel}
                            </Text>
                          ) : null}
                        </View>

                        <Text
                          style={[
                            styles.commentText,
                            { color: colors.textSecondary },
                          ]}
                        >
                          {comment.text}
                        </Text>

                        {(likesLabel || hasReplies) ? (
                          <View style={styles.commentFooterRow}>
                            {likesLabel ? (
                              <View style={styles.commentMetaBadge}>
                                <Ionicons
                                  name="thumbs-up-outline"
                                  size={config.theme.sizes.iconSm - 3}
                                  color={colors.textMuted}
                                />
                                <Text
                                  style={[
                                    styles.commentMetaText,
                                    { color: colors.textMuted },
                                  ]}
                                >
                                  {likesLabel}
                                </Text>
                              </View>
                            ) : null}

                            {hasReplies ? (
                              <Pressable
                                testID={`comment-replies-toggle-${comment.id}`}
                                accessibilityRole="button"
                                accessibilityLabel={replyButtonLabel}
                                onPress={() => toggleReplies(comment)}
                                hitSlop={8}
                                style={({ pressed }) => [
                                  styles.commentRepliesButton,
                                  { opacity: pressed ? 0.7 : 1 },
                                ]}
                              >
                                <Ionicons
                                  name="chatbubble-outline"
                                  size={config.theme.sizes.iconSm - 3}
                                  color={colors.primary}
                                />
                                <Text
                                  testID={`comment-replies-toggle-text-${comment.id}`}
                                  style={[
                                    styles.commentMetaText,
                                    { color: colors.primary },
                                  ]}
                                >
                                  {replyButtonLabel}
                                </Text>
                                <Ionicons
                                  name={
                                    isRepliesExpanded
                                      ? 'chevron-up'
                                      : 'chevron-down'
                                  }
                                  size={config.theme.sizes.iconSm - 2}
                                  color={colors.primary}
                                />
                              </Pressable>
                            ) : null}
                          </View>
                        ) : null}

                        {isRepliesExpanded ? (
                          <View
                            testID={`comment-replies-container-${comment.id}`}
                            style={[
                              styles.repliesContainer,
                              { borderLeftColor: colors.border },
                            ]}
                          >
                            {isLoadingReplies && loadedReplies.length === 0 ? (
                              <View
                                testID={`comment-replies-loading-${comment.id}`}
                                style={styles.repliesLoadingRow}
                              >
                                <ActivityIndicator
                                  size="small"
                                  color={colors.primary}
                                />
                                <Text
                                  style={[
                                    styles.repliesStateText,
                                    { color: colors.textSecondary },
                                  ]}
                                >
                                  Cargando respuestas...
                                </Text>
                              </View>
                            ) : replyError && loadedReplies.length === 0 ? (
                              <View
                                testID={`comment-replies-error-${comment.id}`}
                                style={styles.repliesErrorRow}
                              >
                                <Text
                                  style={[
                                    styles.repliesStateText,
                                    { color: colors.textSecondary },
                                  ]}
                                >
                                  {replyError}
                                </Text>
                                <Pressable
                                  testID={`comment-replies-retry-${comment.id}`}
                                  accessibilityRole="button"
                                  onPress={() => retryReplies(comment)}
                                  style={({ pressed }) => [
                                    styles.commentsRetryButton,
                                    {
                                      backgroundColor: colors.surfaceElevated,
                                      borderColor: colors.border,
                                      opacity: pressed ? 0.75 : 1,
                                    },
                                  ]}
                                >
                                  <Ionicons
                                    name="refresh"
                                    size={config.theme.sizes.iconSm - 3}
                                    color={colors.text}
                                  />
                                  <Text
                                    style={[
                                      styles.commentsRetryText,
                                      { color: colors.text },
                                    ]}
                                  >
                                    Reintentar
                                  </Text>
                                </Pressable>
                              </View>
                            ) : loadedReplies.length === 0 ? (
                              <Text
                                style={[
                                  styles.repliesStateText,
                                  { color: colors.textMuted },
                                ]}
                              >
                                No hay respuestas disponibles.
                              </Text>
                            ) : (
                              loadedReplies.map((reply) => {
                                const replyDateLabel =
                                  formatRelativeDate(reply.publishedAt) ||
                                  reply.publishedAt;
                                const replyInitial =
                                  reply.authorName
                                    .replace(/^@/, '')
                                    .trim()
                                    .charAt(0)
                                    .toUpperCase() || 'U';
                                const replyLikesLabel = formatCompactCount(
                                  reply.likeCount
                                );

                                return (
                                  <View
                                    key={reply.id}
                                    testID={`comment-reply-item-${reply.id}`}
                                    style={styles.replyItemRow}
                                  >
                                    {reply.authorAvatar ? (
                                      <Image
                                        source={{ uri: reply.authorAvatar }}
                                        style={[
                                          styles.replyAvatar,
                                          {
                                            backgroundColor:
                                              colors.surfaceElevated,
                                          },
                                        ]}
                                      />
                                    ) : (
                                      <View
                                        style={[
                                          styles.replyAvatarFallback,
                                          {
                                            backgroundColor:
                                              colors.surfaceElevated,
                                          },
                                        ]}
                                      >
                                        <Text
                                          style={[
                                            styles.replyAvatarInitial,
                                            { color: colors.text },
                                          ]}
                                        >
                                          {replyInitial}
                                        </Text>
                                      </View>
                                    )}

                                    <View style={styles.replyBody}>
                                      <View style={styles.commentHeaderRow}>
                                        <Text
                                          numberOfLines={1}
                                          style={[
                                            styles.commentAuthor,
                                            { color: colors.text },
                                          ]}
                                        >
                                          {reply.authorName}
                                        </Text>
                                        {replyDateLabel ? (
                                          <Text
                                            style={[
                                              styles.commentDate,
                                              { color: colors.textMuted },
                                            ]}
                                          >
                                            {replyDateLabel}
                                          </Text>
                                        ) : null}
                                      </View>

                                      <Text
                                        style={[
                                          styles.replyText,
                                          { color: colors.textSecondary },
                                        ]}
                                      >
                                        {reply.text}
                                      </Text>

                                      {replyLikesLabel ? (
                                        <View style={styles.commentMetaBadge}>
                                          <Ionicons
                                            name="thumbs-up-outline"
                                            size={config.theme.sizes.iconSm - 4}
                                            color={colors.textMuted}
                                          />
                                          <Text
                                            style={[
                                              styles.commentMetaText,
                                              { color: colors.textMuted },
                                            ]}
                                          >
                                            {replyLikesLabel}
                                          </Text>
                                        </View>
                                      ) : null}
                                    </View>
                                  </View>
                                );
                              })
                            )}
                          </View>
                        ) : null}
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
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
  aspectRatioLoadingBoxShort: {
    aspectRatio: config.theme.sizes.shortsAspectRatio,
    alignSelf: 'center',
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
    gap: config.theme.spacing.xs,
  },
  descriptionText: {
    fontSize: config.theme.typography.fontSizes.sm,
    lineHeight: config.theme.typography.lineHeights.sm,
  },
  descriptionToggleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: config.theme.spacing.xxs,
    paddingTop: config.theme.spacing.xxs,
  },
  descriptionToggleText: {
    fontSize: config.theme.typography.fontSizes.sm,
    fontWeight: config.theme.typography.fontWeights.semibold,
  },
  commentsSection: {
    marginTop: config.theme.spacing.xs,
    paddingTop: config.theme.spacing.md,
    borderTopWidth: config.theme.sizes.borderWidth,
    gap: config.theme.spacing.sm,
  },
  commentsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  commentsHeaderTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: config.theme.spacing.xs,
  },
  commentsHeaderTitle: {
    fontSize: config.theme.typography.fontSizes.md,
    fontWeight: config.theme.typography.fontWeights.bold,
  },
  commentsCountBadge: {
    fontSize: config.theme.typography.fontSizes.sm,
    fontWeight: config.theme.typography.fontWeights.medium,
  },
  commentsStateCard: {
    padding: config.theme.spacing.md,
    borderRadius: config.theme.radii.sm,
    borderWidth: config.theme.sizes.borderWidth,
    alignItems: 'center',
    justifyContent: 'center',
    gap: config.theme.spacing.sm,
  },
  commentsStateText: {
    fontSize: config.theme.typography.fontSizes.sm,
    textAlign: 'center',
  },
  commentsRetryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: config.theme.spacing.xs,
    paddingHorizontal: config.theme.spacing.md,
    paddingVertical: config.theme.spacing.xs,
    borderRadius: config.theme.radii.full,
    borderWidth: config.theme.sizes.borderWidth,
  },
  commentsRetryText: {
    fontSize: config.theme.typography.fontSizes.xs,
    fontWeight: config.theme.typography.fontWeights.semibold,
  },
  commentsList: {
    gap: config.theme.spacing.sm,
  },
  commentCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: config.theme.spacing.md,
    borderRadius: config.theme.radii.sm,
    borderWidth: config.theme.sizes.borderWidth,
    gap: config.theme.spacing.sm,
  },
  commentAvatar: {
    width: config.theme.sizes.channelAvatarSm,
    height: config.theme.sizes.channelAvatarSm,
    borderRadius: config.theme.radii.full,
  },
  commentAvatarFallback: {
    width: config.theme.sizes.channelAvatarSm,
    height: config.theme.sizes.channelAvatarSm,
    borderRadius: config.theme.radii.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  commentAvatarInitial: {
    fontSize: config.theme.typography.fontSizes.sm,
    fontWeight: config.theme.typography.fontWeights.bold,
  },
  commentBody: {
    flex: 1,
    gap: config.theme.spacing.xxs,
  },
  commentHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: config.theme.spacing.xs,
  },
  commentAuthor: {
    flexShrink: 1,
    fontSize: config.theme.typography.fontSizes.xs,
    fontWeight: config.theme.typography.fontWeights.semibold,
  },
  commentDate: {
    fontSize: config.theme.typography.fontSizes.xs,
  },
  commentText: {
    fontSize: config.theme.typography.fontSizes.sm,
    lineHeight: config.theme.typography.lineHeights.sm,
  },
  commentFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: config.theme.spacing.md,
    marginTop: config.theme.spacing.xxs,
  },
  commentMetaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  commentRepliesButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 2,
  },
  commentMetaText: {
    fontSize: config.theme.typography.fontSizes.xs,
    fontWeight: config.theme.typography.fontWeights.medium,
  },
  repliesContainer: {
    marginTop: config.theme.spacing.sm,
    paddingLeft: config.theme.spacing.md,
    borderLeftWidth: 2,
    gap: config.theme.spacing.sm,
  },
  repliesLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: config.theme.spacing.xs,
    paddingVertical: config.theme.spacing.xxs,
  },
  repliesErrorRow: {
    alignItems: 'flex-start',
    gap: config.theme.spacing.xs,
    paddingVertical: config.theme.spacing.xxs,
  },
  repliesStateText: {
    fontSize: config.theme.typography.fontSizes.xs,
  },
  replyItemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: config.theme.spacing.xs,
  },
  replyAvatar: {
    width: 24,
    height: 24,
    borderRadius: config.theme.radii.full,
  },
  replyAvatarFallback: {
    width: 24,
    height: 24,
    borderRadius: config.theme.radii.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  replyAvatarInitial: {
    fontSize: config.theme.typography.fontSizes.xs,
    fontWeight: config.theme.typography.fontWeights.bold,
  },
  replyBody: {
    flex: 1,
    gap: 2,
  },
  replyText: {
    fontSize: config.theme.typography.fontSizes.xs + 1,
    lineHeight: config.theme.typography.lineHeights.xs + 2,
  },
});


