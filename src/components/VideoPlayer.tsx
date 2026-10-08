import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { config } from '../config/config';
import { useThemeColors } from '../hooks/useThemeColors';
import { calculateProgressRatio, formatDuration } from '../utils/format';

export interface VideoPlayerProps {
  videoId: string;
  title?: string;
  channelTitle?: string;
  initialPosition?: number;
  initialDuration?: number;
  minimized?: boolean;
  onExpand?: () => void;
  onClose?: () => void;
  onProgressUpdate: (position: number, duration: number) => void;
  onFlushProgress: (position: number, duration: number) => void;
  onRestartProgress: () => void;
}

interface PlayerBridgeMessage {
  type: 'READY' | 'STATE_CHANGE' | 'PROGRESS' | 'ERROR';
  state?: number;
  position?: number;
  duration?: number;
  errorCode?: number;
}

/**
 * Traduce los códigos de error oficiales de la YouTube IFrame Player API
 * a mensajes claros para el usuario.
 */
function getPlayerErrorMessage(errorCode?: number): string {
  switch (errorCode) {
    case 2:
      return 'El identificador del vídeo no es válido.';
    case 5:
      return 'El reproductor HTML5 encontró un error al cargar el vídeo.';
    case 100:
      return 'Este vídeo no está disponible (fue eliminado o es privado).';
    case 101:
    case 150:
      return 'El propietario del vídeo no permite su reproducción en reproductores embebidos.';
    default:
      return 'No se pudo cargar el reproductor de YouTube. Comprueba tu conexión.';
  }
}

/**
 * Genera el documento HTML mínimo que carga la YouTube IFrame Player API oficial.
 */
export function buildYouTubeIframeHtml(videoId: string, startSeconds: number): string {
  const safeVideoId = videoId.replace(/[^a-zA-Z0-9_-]/g, '');
  const safeStart = Math.max(0, Math.floor(startSeconds || 0));

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <meta name="referrer" content="strict-origin-when-cross-origin" />
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { width: 100%; height: 100%; background-color: #000000; overflow: hidden; }
    #player { width: 100%; height: 100%; border: 0; display: block; }
  </style>
</head>
<body>
  <div id="player"></div>
  <script>
    var player = null;
    var progressTimer = null;

    function postToNative(payload) {
      if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
        window.ReactNativeWebView.postMessage(JSON.stringify(payload));
      }
    }

    function sendCurrentProgress() {
      if (!player || typeof player.getCurrentTime !== 'function') return;
      var position = player.getCurrentTime() || 0;
      var duration = (typeof player.getDuration === 'function' ? player.getDuration() : 0) || 0;
      postToNative({
        type: 'PROGRESS',
        position: position,
        duration: duration
      });
    }

    function startTracking() {
      stopTracking();
      progressTimer = setInterval(sendCurrentProgress, 1000);
    }

    function stopTracking() {
      if (progressTimer) {
        clearInterval(progressTimer);
        progressTimer = null;
      }
    }

    var tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    tag.onerror = function() {
      postToNative({ type: 'ERROR', errorCode: -1 });
    };
    var firstScriptTag = document.getElementsByTagName('script')[0];
    firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

    function onYouTubeIframeAPIReady() {
      player = new YT.Player('player', {
        width: '100%',
        height: '100%',
        host: '${config.api.embedHost}',
        videoId: '${safeVideoId}',
        playerVars: {
          playsinline: 1,
          controls: 1,
          rel: 0,
          modestbranding: 1,
          start: ${safeStart},
          origin: '${config.api.embedOrigin}'
        },
        events: {
          onReady: function(event) {
            var duration = event.target.getDuration ? event.target.getDuration() : 0;
            postToNative({
              type: 'READY',
              position: ${safeStart},
              duration: duration || 0
            });
          },
          onStateChange: function(event) {
            var state = event.data;
            var position = event.target.getCurrentTime ? event.target.getCurrentTime() : 0;
            var duration = event.target.getDuration ? event.target.getDuration() : 0;
            postToNative({
              type: 'STATE_CHANGE',
              state: state,
              position: position || 0,
              duration: duration || 0
            });
            if (state === YT.PlayerState.PLAYING) {
              startTracking();
            } else {
              stopTracking();
            }
          },
          onError: function(event) {
            stopTracking();
            postToNative({
              type: 'ERROR',
              errorCode: event.data
            });
          }
        }
      });
    }

    window.addEventListener('beforeunload', function() {
      stopTracking();
    });
  </script>
</body>
</html>`;
}

export function VideoPlayer({
  videoId,
  title = 'Reproduciendo vídeo',
  initialPosition = 0,
  initialDuration = 0,
  minimized = false,
  onExpand,
  onClose,
  onProgressUpdate,
  onFlushProgress,
  onRestartProgress,
}: VideoPlayerProps) {
  const { colors } = useThemeColors();
  const webViewRef = useRef<WebView | null>(null);

  const [isReady, setIsReady] = useState<boolean>(false);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentPosition, setCurrentPosition] = useState<number>(initialPosition);
  const [duration, setDuration] = useState<number>(initialDuration);
  const [playerError, setPlayerError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState<number>(0);

  const startSecondsRef = useRef<number>(initialPosition);
  if (reloadKey === 0 && !isReady && initialPosition > 0 && startSecondsRef.current === 0) {
    startSecondsRef.current = initialPosition;
  }

  const htmlSource = useMemo(
    () => buildYouTubeIframeHtml(videoId, startSecondsRef.current),
    [videoId, reloadKey]
  );

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        const msg = JSON.parse(event.nativeEvent.data) as PlayerBridgeMessage;

        switch (msg.type) {
          case 'READY': {
            setIsReady(true);
            setPlayerError(null);
            if (msg.duration && msg.duration > 0) {
              setDuration(msg.duration);
            }
            break;
          }
          case 'PROGRESS': {
            const pos = msg.position ?? 0;
            const dur = msg.duration && msg.duration > 0 ? msg.duration : duration;
            setCurrentPosition(pos);
            if (dur > 0) {
              setDuration(dur);
            }
            onProgressUpdate(pos, dur);
            break;
          }
          case 'STATE_CHANGE': {
            const pos = msg.position ?? currentPosition;
            const dur = msg.duration && msg.duration > 0 ? msg.duration : duration;
            setCurrentPosition(pos);
            if (dur > 0) {
              setDuration(dur);
            }

            if (msg.state === 1) {
              setIsPlaying(true);
              onProgressUpdate(pos, dur);
            } else if (msg.state === 2) {
              setIsPlaying(false);
              onFlushProgress(pos, dur);
            } else if (msg.state === 0) {
              setIsPlaying(false);
              onFlushProgress(dur > 0 ? dur : pos, dur);
            }
            break;
          }
          case 'ERROR': {
            setIsPlaying(false);
            setPlayerError(getPlayerErrorMessage(msg.errorCode));
            break;
          }
        }
      } catch {
        // Ignorar mensajes no pertenecientes al puente JSON
      }
    },
    [currentPosition, duration, onFlushProgress, onProgressUpdate]
  );

  const togglePlayPause = useCallback(() => {
    if (!webViewRef.current) return;
    const command = isPlaying
      ? 'if (player && player.pauseVideo) { player.pauseVideo(); } true;'
      : 'if (player && player.playVideo) { player.playVideo(); } true;';
    webViewRef.current.injectJavaScript(command);
  }, [isPlaying]);

  const handleRestartFromBeginning = useCallback(() => {
    setCurrentPosition(0);
    startSecondsRef.current = 0;
    onRestartProgress();
    if (webViewRef.current) {
      webViewRef.current.injectJavaScript(
        'if (player && player.seekTo) { player.seekTo(0, true); player.playVideo(); } true;'
      );
    }
  }, [onRestartProgress]);

  const handleRetry = useCallback(() => {
    setPlayerError(null);
    setIsReady(false);
    startSecondsRef.current = currentPosition;
    setReloadKey((prev) => prev + 1);
  }, [currentPosition]);

  const handleOpenInYouTube = useCallback(() => {
    const url = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
    Linking.openURL(url).catch(() => {});
  }, [videoId]);

  const progressRatio = calculateProgressRatio(currentPosition, duration);

  return (
    <View
      testID={minimized ? 'mini-player-container' : 'video-player-container'}
      style={styles.wrapper}
    >
      {/* Contenedor 16:9 del vídeo: mantiene SIEMPRE el aspect ratio 16:9 tanto en grande como en flotante */}
      <View style={styles.aspectRatioFrame}>
        {playerError && !minimized ? (
          <View
            testID="player-error-view"
            style={[styles.errorOverlay, { backgroundColor: colors.surface }]}
          >
            <Ionicons
              name="warning-outline"
              size={config.theme.sizes.iconLg}
              color={colors.error}
            />
            <Text style={[styles.errorText, { color: colors.text }]}>
              {playerError}
            </Text>
            <View style={styles.errorActions}>
              <Pressable
                testID="player-retry-btn"
                onPress={handleRetry}
                style={[styles.actionBtn, { backgroundColor: colors.primary }]}
              >
                <Ionicons
                  name="refresh"
                  size={config.theme.sizes.iconSm}
                  color={colors.badgeText}
                />
                <Text style={[styles.actionBtnText, { color: colors.badgeText }]}>
                  Reintentar
                </Text>
              </Pressable>

              <Pressable
                testID="player-open-external-btn"
                onPress={handleOpenInYouTube}
                style={[
                  styles.actionBtn,
                  {
                    backgroundColor: colors.surfaceElevated,
                    borderColor: colors.border,
                    borderWidth: config.theme.sizes.borderWidth,
                  },
                ]}
              >
                <Ionicons
                  name="open-outline"
                  size={config.theme.sizes.iconSm}
                  color={colors.text}
                />
                <Text style={[styles.actionBtnText, { color: colors.text }]}>
                  Abrir en YouTube
                </Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <>
            <WebView
              key={`yt-webview-${videoId}-${reloadKey}`}
              ref={webViewRef}
              originWhitelist={['*']}
              source={{
                html: htmlSource,
                baseUrl: config.api.embedOrigin,
              }}
              style={styles.webView}
              javaScriptEnabled
              domStorageEnabled
              allowsFullscreenVideo
              allowsInlineMediaPlayback
              mediaPlaybackRequiresUserAction={false}
              onMessage={handleMessage}
              onError={() =>
                setPlayerError(
                  'Error de red al cargar el reproductor embebido de YouTube.'
                )
              }
              onHttpError={() =>
                setPlayerError(
                  'No se pudo cargar el contenido desde el servidor de YouTube.'
                )
              }
            />

            {!isReady && (
              <View
                style={[
                  styles.loadingOverlay,
                  { backgroundColor: colors.overlay },
                ]}
                pointerEvents="none"
              >
                <ActivityIndicator
                  size={minimized ? 'small' : 'large'}
                  color={colors.primary}
                />
              </View>
            )}
          </>
        )}
      </View>

      {/* Barra compacta inferior cuando está en modo Mini Reproductor Flotante */}
      {minimized ? (
        <View
          style={[
            styles.miniFooter,
            {
              backgroundColor: colors.surface,
              borderTopColor: colors.border,
            },
          ]}
        >
          <View
            style={[
              styles.miniProgressTrack,
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

          <View style={styles.miniControlsRow}>
            <Pressable
              testID="mini-player-expand"
              accessibilityRole="button"
              accessibilityLabel={`Ampliar ${title}`}
              onPress={onExpand}
              hitSlop={8}
              style={({ pressed }) => [
                styles.miniExpandButton,
                { opacity: pressed ? 0.75 : 1 },
              ]}
            >
              <View
                style={[
                  styles.miniRoundButton,
                  { backgroundColor: colors.surfaceElevated },
                ]}
              >
                <Ionicons
                  name="expand-outline"
                  size={config.theme.sizes.iconMd - 2}
                  color={colors.text}
                />
              </View>
              <Text
                numberOfLines={1}
                style={[styles.miniTitle, { color: colors.text }]}
              >
                {title}
              </Text>
            </Pressable>

            <View style={styles.miniActionButtons}>
              <Pressable
                testID="mini-player-toggle-play"
                accessibilityRole="button"
                accessibilityLabel={isPlaying ? 'Pausar' : 'Reproducir'}
                onPress={togglePlayPause}
                hitSlop={10}
                style={({ pressed }) => [
                  styles.miniPlayPauseButton,
                  {
                    backgroundColor: colors.primary,
                    opacity: pressed ? 0.85 : 1,
                  },
                ]}
              >
                <Ionicons
                  name={isPlaying ? 'pause' : 'play'}
                  size={config.theme.sizes.iconMd + 2}
                  color={colors.badgeText}
                />
              </Pressable>

              {onClose && (
                <Pressable
                  testID="mini-player-close"
                  accessibilityRole="button"
                  accessibilityLabel="Cerrar reproductor"
                  onPress={onClose}
                  hitSlop={10}
                  style={({ pressed }) => [
                    styles.miniRoundButton,
                    {
                      backgroundColor: colors.surfaceElevated,
                      opacity: pressed ? 0.75 : 1,
                    },
                  ]}
                >
                  <Ionicons
                    name="close"
                    size={config.theme.sizes.iconMd}
                    color={colors.text}
                  />
                </Pressable>
              )}
            </View>
          </View>
        </View>
      ) : (
        /* Barra de controles completa cuando NO está minimizado */
        <View
          style={[
            styles.controlsBar,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
            },
          ]}
        >
          <View
            style={[
              styles.progressTrack,
              { backgroundColor: colors.progressTrack },
            ]}
          >
            <View
              testID="player-progress-fill"
              style={[
                styles.progressFill,
                {
                  backgroundColor: colors.progressFill,
                  width: `${Math.round(progressRatio * 100)}%`,
                },
              ]}
            />
          </View>

          <View style={styles.controlsRow}>
            <Pressable
              testID="player-toggle-play"
              accessibilityRole="button"
              accessibilityLabel={isPlaying ? 'Pausar' : 'Reproducir'}
              onPress={togglePlayPause}
              style={({ pressed }) => [
                styles.controlButton,
                {
                  backgroundColor: colors.surfaceElevated,
                  opacity: pressed ? 0.8 : 1,
                },
              ]}
            >
              <Ionicons
                name={isPlaying ? 'pause' : 'play'}
                size={config.theme.sizes.iconSm}
                color={colors.text}
              />
              <Text style={[styles.controlButtonText, { color: colors.text }]}>
                {isPlaying ? 'Pausar' : 'Reproducir'}
              </Text>
            </Pressable>

            <Text
              testID="player-time-display"
              style={[styles.timeText, { color: colors.textSecondary }]}
            >
              {formatDuration(currentPosition) || '0:00'}
              {duration > 0 ? ` / ${formatDuration(duration)}` : ''}
            </Text>

            <Pressable
              testID="player-restart-button"
              accessibilityRole="button"
              accessibilityLabel="Empezar de nuevo"
              onPress={handleRestartFromBeginning}
              style={({ pressed }) => [
                styles.controlButton,
                {
                  backgroundColor: colors.surfaceElevated,
                  opacity: pressed ? 0.8 : 1,
                },
              ]}
            >
              <Ionicons
                name="refresh-outline"
                size={config.theme.sizes.iconSm}
                color={colors.text}
              />
              <Text style={[styles.controlButtonText, { color: colors.text }]}>
                Desde el inicio
              </Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
  },
  aspectRatioFrame: {
    width: '100%',
    aspectRatio: config.theme.sizes.thumbnailAspectRatio,
    backgroundColor: '#000000',
    position: 'relative',
    overflow: 'hidden',
  },
  webView: {
    flex: 1,
    backgroundColor: '#000000',
  },
  miniFooter: {
    width: '100%',
    borderTopWidth: config.theme.sizes.borderWidth,
  },
  miniProgressTrack: {
    width: '100%',
    height: 4,
  },
  miniControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: config.theme.spacing.sm,
    paddingVertical: config.theme.spacing.xs + 2,
    gap: config.theme.spacing.xs,
  },
  miniExpandButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: config.theme.spacing.xs,
  },
  miniTitle: {
    flex: 1,
    fontSize: config.theme.typography.fontSizes.xs,
    fontWeight: config.theme.typography.fontWeights.semibold,
  },
  miniActionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: config.theme.spacing.xs,
  },
  miniPlayPauseButton: {
    width: config.theme.sizes.miniPlayerButtonSize,
    height: config.theme.sizes.miniPlayerButtonSize,
    borderRadius: config.theme.radii.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniRoundButton: {
    width: config.theme.sizes.miniPlayerButtonSize - 4,
    height: config.theme.sizes.miniPlayerButtonSize - 4,
    borderRadius: config.theme.radii.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    padding: config.theme.spacing.lg,
    gap: config.theme.spacing.sm,
  },
  errorText: {
    fontSize: config.theme.typography.fontSizes.sm,
    lineHeight: config.theme.typography.lineHeights.sm,
    textAlign: 'center',
  },
  errorActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: config.theme.spacing.sm,
    marginTop: config.theme.spacing.xs,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: config.theme.spacing.xs,
    paddingHorizontal: config.theme.spacing.md,
    height: config.theme.sizes.buttonHeight - 4,
    borderRadius: config.theme.radii.full,
  },
  actionBtnText: {
    fontSize: config.theme.typography.fontSizes.sm,
    fontWeight: config.theme.typography.fontWeights.semibold,
  },
  controlsBar: {
    borderBottomWidth: config.theme.sizes.borderWidth,
  },
  progressTrack: {
    width: '100%',
    height: config.theme.sizes.playerProgressBarHeight,
  },
  progressFill: {
    height: '100%',
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: config.theme.spacing.md,
    paddingVertical: config.theme.spacing.sm,
    gap: config.theme.spacing.sm,
  },
  controlButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: config.theme.spacing.xs,
    paddingHorizontal: config.theme.spacing.md,
    paddingVertical: config.theme.spacing.xs + 2,
    borderRadius: config.theme.radii.full,
  },
  controlButtonText: {
    fontSize: config.theme.typography.fontSizes.xs,
    fontWeight: config.theme.typography.fontWeights.semibold,
  },
  timeText: {
    fontSize: config.theme.typography.fontSizes.xs,
    fontWeight: config.theme.typography.fontWeights.medium,
  },
});
