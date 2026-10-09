import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { config } from '../config/config';
import {
  SleepTimerOptionId,
  useSleepTimer,
  VIDEO_PLAYER_KEEP_AWAKE_TAG,
} from '../hooks/useSleepTimer';
import { useThemeColors } from '../hooks/useThemeColors';
import { calculateProgressRatio, formatDuration } from '../utils/format';

export { VIDEO_PLAYER_KEEP_AWAKE_TAG };

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
    var wakeLockSentinel = null;

    function requestWakeLock() {
      if (navigator && navigator.wakeLock && typeof navigator.wakeLock.request === 'function') {
        navigator.wakeLock.request('screen').then(function(sentinel) {
          wakeLockSentinel = sentinel;
        }).catch(function() {});
      }
    }

    function releaseWakeLock() {
      if (wakeLockSentinel && typeof wakeLockSentinel.release === 'function') {
        wakeLockSentinel.release().catch(function() {});
        wakeLockSentinel = null;
      }
    }

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
          autoplay: 1,
          playsinline: 1,
          controls: 1,
          rel: 0,
          modestbranding: 1,
          start: ${safeStart},
          origin: '${config.api.embedOrigin}'
        },
        events: {
          onReady: function(event) {
            var iframe = event.target && event.target.getIframe ? event.target.getIframe() : null;
            if (iframe && iframe.setAttribute) {
              iframe.setAttribute('allow', 'autoplay; encrypted-media; fullscreen; picture-in-picture');
            }
            var duration = event.target.getDuration ? event.target.getDuration() : 0;
            postToNative({
              type: 'READY',
              position: ${safeStart},
              duration: duration || 0
            });
            if (event.target && typeof event.target.playVideo === 'function') {
              event.target.playVideo();
            }
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
              requestWakeLock();
            } else {
              stopTracking();
              if (state === YT.PlayerState.PAUSED || state === YT.PlayerState.ENDED) {
                releaseWakeLock();
              }
            }
          },
          onError: function(event) {
            stopTracking();
            releaseWakeLock();
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
      releaseWakeLock();
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
  const [isSleepMenuOpen, setIsSleepMenuOpen] = useState<boolean>(false);

  const startSecondsRef = useRef<number>(initialPosition);
  if (reloadKey === 0 && !isReady && initialPosition > 0 && startSecondsRef.current === 0) {
    startSecondsRef.current = initialPosition;
  }

  const handleSleepExpire = useCallback(() => {
    setIsPlaying(false);
    setIsSleepMenuOpen(false);
    startSecondsRef.current = currentPosition;
    deactivateKeepAwake(VIDEO_PLAYER_KEEP_AWAKE_TAG).catch(() => {});
    deactivateKeepAwake().catch(() => {});
    if (webViewRef.current) {
      webViewRef.current.injectJavaScript(
        'if (typeof releaseWakeLock === "function") { releaseWakeLock(); } if (typeof stopTracking === "function") { stopTracking(); } if (player && player.pauseVideo) { player.pauseVideo(); } document.querySelectorAll("video").forEach(function(v){ try { v.pause(); } catch(e){} }); true;'
      );
    }
    onFlushProgress(currentPosition, duration);
  }, [currentPosition, duration, onFlushProgress]);

  const {
    options: sleepOptions,
    activeOptionId: activeSleepOptionId,
    activeOption: activeSleepOption,
    remainingSeconds: sleepRemainingSeconds,
    isActive: isSleepActive,
    isSleepTriggered,
    selectOption: selectSleepOption,
    cancelSleepMode,
    notifyVideoEnded,
    dismissSleepTriggered,
  } = useSleepTimer({
    onExpire: handleSleepExpire,
    isPlaying,
  });

  // Evitar que el móvil se bloquee mientras el vídeo se esté reproduciendo,
  // y liberar el bloqueo inmediatamente cuando se pausa o termina el Sleep Mode
  useEffect(() => {
    if (!isPlaying || isSleepTriggered) {
      return;
    }

    activateKeepAwakeAsync(VIDEO_PLAYER_KEEP_AWAKE_TAG).catch(() => {});

    return () => {
      deactivateKeepAwake(VIDEO_PLAYER_KEEP_AWAKE_TAG).catch(() => {});
    };
  }, [isPlaying, isSleepTriggered]);

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
            const effectivePos = msg.state === 0 && dur > 0 ? dur : pos;
            setCurrentPosition(effectivePos);
            if (dur > 0) {
              setDuration(dur);
            }

            if (msg.state === 1) {
              if (isSleepTriggered) {
                dismissSleepTriggered();
              }
              setIsPlaying(true);
              onProgressUpdate(effectivePos, dur);
            } else if (msg.state === 2) {
              setIsPlaying(false);
              onFlushProgress(effectivePos, dur);
            } else if (msg.state === 0) {
              setIsPlaying(false);
              onFlushProgress(effectivePos, dur);
              notifyVideoEnded();
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
    [
      currentPosition,
      dismissSleepTriggered,
      duration,
      isSleepTriggered,
      notifyVideoEnded,
      onFlushProgress,
      onProgressUpdate,
    ]
  );

  const togglePlayPause = useCallback(() => {
    if (isSleepTriggered) {
      startSecondsRef.current = currentPosition;
      setIsReady(false);
      dismissSleepTriggered();
      return;
    }
    if (!webViewRef.current) return;
    const command = isPlaying
      ? 'if (player && player.pauseVideo) { player.pauseVideo(); } true;'
      : 'if (player && player.playVideo) { player.playVideo(); } true;';
    webViewRef.current.injectJavaScript(command);
  }, [currentPosition, dismissSleepTriggered, isPlaying, isSleepTriggered]);

  const handleResumeAfterSleep = useCallback(() => {
    startSecondsRef.current = currentPosition;
    setIsReady(false);
    dismissSleepTriggered();
  }, [currentPosition, dismissSleepTriggered]);

  const handleSelectSleepOption = useCallback(
    (optionId: SleepTimerOptionId) => {
      selectSleepOption(optionId);
      setIsSleepMenuOpen(false);
      if (!isPlaying && webViewRef.current) {
        webViewRef.current.injectJavaScript(
          'if (player && player.playVideo) { player.playVideo(); } true;'
        );
      }
    },
    [isPlaying, selectSleepOption]
  );

  const handleCancelSleep = useCallback(() => {
    cancelSleepMode();
    setIsSleepMenuOpen(false);
  }, [cancelSleepMode]);

  const handleRestartFromBeginning = useCallback(() => {
    if (isSleepTriggered) {
      dismissSleepTriggered();
    }
    setCurrentPosition(0);
    startSecondsRef.current = 0;
    onRestartProgress();
    if (webViewRef.current) {
      webViewRef.current.injectJavaScript(
        'if (player && player.seekTo) { player.seekTo(0, true); player.playVideo(); } true;'
      );
    }
  }, [dismissSleepTriggered, isSleepTriggered, onRestartProgress]);

  const handleRetry = useCallback(() => {
    setPlayerError(null);
    setIsReady(false);
    setIsPlaying(false);
    startSecondsRef.current = currentPosition;
    setReloadKey((prev) => prev + 1);
  }, [currentPosition]);

  const handleOpenInYouTube = useCallback(() => {
    const url = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
    Linking.openURL(url).catch(() => {});
  }, [videoId]);

  const handleShareVideo = useCallback(() => {
    const url = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
    const message = title ? `${title}\n${url}` : url;
    Share.share({
      title: title || 'Compartir vídeo',
      message,
      url,
    }).catch(() => {});
  }, [title, videoId]);

  const progressRatio = calculateProgressRatio(currentPosition, duration);

  const sleepButtonLabel = useMemo(() => {
    if (!isSleepActive) {
      return 'Sleep Mode';
    }
    if (activeSleepOptionId === 'end_of_video') {
      return 'Fin del vídeo';
    }
    return formatDuration(sleepRemainingSeconds ?? 0) || activeSleepOption?.label || 'Sleep Mode';
  }, [activeSleepOption, activeSleepOptionId, isSleepActive, sleepRemainingSeconds]);

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
        ) : isSleepTriggered ? (
          <View
            testID="sleep-mode-locked-overlay"
            style={[
              styles.sleepLockedOverlay,
              { backgroundColor: '#000000' },
            ]}
          >
            <Ionicons
              name="moon"
              size={config.theme.sizes.iconLg + 4}
              color={colors.primary}
            />
            <Text style={[styles.sleepLockedTitle, { color: colors.badgeText }]}>
              Sleep Mode finalizado
            </Text>
            <Text
              style={[
                styles.sleepLockedSubtitle,
                { color: colors.textSecondary },
              ]}
            >
              El vídeo se ha pausado y la pantalla se ha bloqueado.
            </Text>
            <Pressable
              testID="sleep-mode-resume-button"
              accessibilityRole="button"
              accessibilityLabel="Reanudar reproducción"
              onPress={handleResumeAfterSleep}
              style={({ pressed }) => [
                styles.actionBtn,
                {
                  backgroundColor: colors.primary,
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
            >
              <Ionicons
                name="play"
                size={config.theme.sizes.iconSm}
                color={colors.badgeText}
              />
              <Text style={[styles.actionBtnText, { color: colors.badgeText }]}>
                Continuar viendo
              </Text>
            </Pressable>
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
              onError={() => {
                setIsPlaying(false);
                setPlayerError(
                  'Error de red al cargar el reproductor embebido de YouTube.'
                );
              }}
              onHttpError={() => {
                setIsPlaying(false);
                setPlayerError(
                  'No se pudo cargar el contenido desde el servidor de YouTube.'
                );
              }}
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

            {minimized && (
              <View
                style={styles.miniVideoOverlayButtons}
                pointerEvents="box-none"
              >
                <Pressable
                  testID="mini-player-expand"
                  accessibilityRole="button"
                  accessibilityLabel={`Ampliar ${title}`}
                  onPress={onExpand}
                  hitSlop={10}
                  style={({ pressed }) => [
                    styles.miniRoundButton,
                    {
                      backgroundColor: colors.badgeBackground,
                      opacity: pressed ? 0.75 : 1,
                    },
                  ]}
                >
                  <Ionicons
                    name="expand-outline"
                    size={config.theme.sizes.iconMd - 2}
                    color={colors.badgeText}
                  />
                </Pressable>

                <View
                  style={styles.miniActionButtons}
                  pointerEvents="box-none"
                >
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
                          backgroundColor: colors.badgeBackground,
                          opacity: pressed ? 0.75 : 1,
                        },
                      ]}
                    >
                      <Ionicons
                        name="close"
                        size={config.theme.sizes.iconMd}
                        color={colors.badgeText}
                      />
                    </Pressable>
                  )}
                </View>
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
            <Text
              numberOfLines={1}
              style={[styles.miniTitle, { color: colors.text }]}
            >
              {title}
            </Text>
          </View>

          {isSleepActive && (
            <View
              testID="mini-player-sleep-banner"
              style={[
                styles.miniSleepRow,
                {
                  backgroundColor: colors.surfaceElevated,
                  borderTopColor: colors.border,
                },
              ]}
            >
              <View style={styles.miniSleepInfo}>
                <Ionicons
                  name="moon"
                  size={config.theme.sizes.iconSm - 2}
                  color={colors.primary}
                />
                <Text
                  numberOfLines={1}
                  style={[styles.miniSleepText, { color: colors.text }]}
                >
                  {sleepButtonLabel}
                </Text>
              </View>
              <Pressable
                testID="mini-player-sleep-cancel"
                accessibilityRole="button"
                accessibilityLabel="Cancelar Sleep Mode"
                onPress={handleCancelSleep}
                hitSlop={8}
              >
                <Text style={[styles.miniSleepCancelText, { color: colors.primary }]}>
                  Cancelar
                </Text>
              </Pressable>
            </View>
          )}
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
              testID="player-sleep-mode-button"
              accessibilityRole="button"
              accessibilityLabel={
                isSleepActive
                  ? `Sleep Mode activo: ${sleepButtonLabel}`
                  : 'Configurar Sleep Mode'
              }
              onPress={() => setIsSleepMenuOpen((prev) => !prev)}
              style={({ pressed }) => [
                styles.controlButton,
                {
                  backgroundColor: isSleepActive
                    ? colors.primaryLight
                    : colors.surfaceElevated,
                  borderColor: isSleepActive ? colors.primary : 'transparent',
                  borderWidth: isSleepActive ? config.theme.sizes.borderWidth : 0,
                  opacity: pressed ? 0.8 : 1,
                },
              ]}
            >
              <Ionicons
                name={isSleepActive ? 'moon' : 'moon-outline'}
                size={config.theme.sizes.iconSm}
                color={isSleepActive ? colors.primary : colors.text}
              />
              <Text
                testID="player-sleep-mode-button-text"
                style={[
                  styles.controlButtonText,
                  { color: isSleepActive ? colors.primary : colors.text },
                ]}
              >
                {sleepButtonLabel}
              </Text>
            </Pressable>

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

            <Pressable
              testID="player-share-button"
              accessibilityRole="button"
              accessibilityLabel="Compartir vídeo"
              onPress={handleShareVideo}
              style={({ pressed }) => [
                styles.controlButton,
                {
                  backgroundColor: colors.surfaceElevated,
                  opacity: pressed ? 0.8 : 1,
                },
              ]}
            >
              <Ionicons
                name="share-social-outline"
                size={config.theme.sizes.iconSm}
                color={colors.text}
              />
              <Text style={[styles.controlButtonText, { color: colors.text }]}>
                Compartir
              </Text>
            </Pressable>
          </View>

          {/* Banner de estado activo de Sleep Mode con botón directo de cancelar */}
          {isSleepActive && (
            <View
              testID="sleep-mode-active-banner"
              style={[
                styles.sleepActiveBanner,
                {
                  backgroundColor: colors.surfaceElevated,
                  borderTopColor: colors.border,
                },
              ]}
            >
              <View style={styles.sleepActiveInfo}>
                <Ionicons
                  name="moon"
                  size={config.theme.sizes.iconSm}
                  color={colors.primary}
                />
                <Text
                  testID="sleep-mode-active-text"
                  style={[styles.sleepActiveText, { color: colors.text }]}
                >
                  {activeSleepOptionId === 'end_of_video'
                    ? 'Sleep Mode: Se pausará y bloqueará al terminar el vídeo'
                    : `Sleep Mode: Se pausará y bloqueará en ${formatDuration(sleepRemainingSeconds ?? 0)}`}
                </Text>
              </View>
              <Pressable
                testID="sleep-mode-cancel-banner-button"
                accessibilityRole="button"
                accessibilityLabel="Cancelar Sleep Mode"
                onPress={handleCancelSleep}
                style={({ pressed }) => [
                  styles.sleepCancelPill,
                  {
                    backgroundColor: colors.errorBackground,
                    opacity: pressed ? 0.8 : 1,
                  },
                ]}
              >
                <Ionicons
                  name="close-circle-outline"
                  size={config.theme.sizes.iconSm}
                  color={colors.error}
                />
                <Text style={[styles.sleepCancelPillText, { color: colors.error }]}>
                  Cancelar
                </Text>
              </Pressable>
            </View>
          )}

          {/* Panel desplegable de selección de tiempos de Sleep Mode */}
          {isSleepMenuOpen && (
            <View
              testID="sleep-mode-modal"
              style={[
                styles.sleepMenuContainer,
                {
                  backgroundColor: colors.surfaceElevated,
                  borderTopColor: colors.border,
                },
              ]}
            >
              <View style={styles.sleepMenuHeader}>
                <View style={styles.sleepMenuTitleRow}>
                  <Ionicons
                    name="moon"
                    size={config.theme.sizes.iconSm + 2}
                    color={colors.primary}
                  />
                  <Text style={[styles.sleepMenuTitle, { color: colors.text }]}>
                    Temporizador Sleep Mode
                  </Text>
                </View>
                <Pressable
                  testID="sleep-mode-close-modal"
                  accessibilityRole="button"
                  accessibilityLabel="Cerrar menú Sleep Mode"
                  onPress={() => setIsSleepMenuOpen(false)}
                  hitSlop={8}
                >
                  <Ionicons
                    name="close"
                    size={config.theme.sizes.iconMd}
                    color={colors.textSecondary}
                  />
                </Pressable>
              </View>

              <Text
                style={[styles.sleepMenuSubtitle, { color: colors.textSecondary }]}
              >
                Elige cuándo pausar el vídeo y bloquear el móvil:
              </Text>

              <View style={styles.sleepOptionsGrid}>
                {sleepOptions.map((option) => {
                  const isSelected = activeSleepOptionId === option.id;
                  return (
                    <Pressable
                      key={option.id}
                      testID={`sleep-option-${option.id}`}
                      accessibilityRole="button"
                      accessibilityState={{ selected: isSelected }}
                      accessibilityLabel={`Sleep Mode ${option.label}`}
                      onPress={() => handleSelectSleepOption(option.id)}
                      style={({ pressed }) => [
                        styles.sleepOptionButton,
                        {
                          backgroundColor: isSelected
                            ? colors.primary
                            : colors.surface,
                          borderColor: isSelected ? colors.primary : colors.border,
                          opacity: pressed ? 0.85 : 1,
                        },
                      ]}
                    >
                      <Ionicons
                        name={
                          option.id === 'end_of_video'
                            ? 'flag-outline'
                            : 'time-outline'
                        }
                        size={config.theme.sizes.iconSm}
                        color={isSelected ? colors.badgeText : colors.text}
                      />
                      <Text
                        style={[
                          styles.sleepOptionText,
                          {
                            color: isSelected ? colors.badgeText : colors.text,
                          },
                        ]}
                      >
                        {option.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {isSleepActive && (
                <Pressable
                  testID="sleep-mode-cancel-button"
                  accessibilityRole="button"
                  accessibilityLabel="Cancelar temporizador Sleep Mode"
                  onPress={handleCancelSleep}
                  style={({ pressed }) => [
                    styles.sleepCancelFullButton,
                    {
                      backgroundColor: colors.errorBackground,
                      borderColor: colors.error,
                      opacity: pressed ? 0.85 : 1,
                    },
                  ]}
                >
                  <Ionicons
                    name="close-circle"
                    size={config.theme.sizes.iconSm}
                    color={colors.error}
                  />
                  <Text
                    style={[styles.sleepCancelFullText, { color: colors.error }]}
                  >
                    Cancelar Sleep Mode
                  </Text>
                </Pressable>
              )}
            </View>
          )}
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
  miniVideoOverlayButtons: {
    position: 'absolute',
    top: config.theme.spacing.xs,
    left: config.theme.spacing.xs,
    right: config.theme.spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: config.theme.spacing.xs,
    zIndex: 10,
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
  miniSleepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: config.theme.spacing.sm,
    paddingVertical: config.theme.spacing.xxs + 2,
    borderTopWidth: config.theme.sizes.borderWidth,
  },
  miniSleepInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: config.theme.spacing.xxs + 2,
  },
  miniSleepText: {
    fontSize: config.theme.typography.fontSizes.xs,
    fontWeight: config.theme.typography.fontWeights.medium,
  },
  miniSleepCancelText: {
    fontSize: config.theme.typography.fontSizes.xs,
    fontWeight: config.theme.typography.fontWeights.bold,
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
  sleepLockedOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    padding: config.theme.spacing.lg,
    gap: config.theme.spacing.xs,
  },
  sleepLockedTitle: {
    fontSize: config.theme.typography.fontSizes.md,
    fontWeight: config.theme.typography.fontWeights.bold,
    textAlign: 'center',
  },
  sleepLockedSubtitle: {
    fontSize: config.theme.typography.fontSizes.xs,
    textAlign: 'center',
    marginBottom: config.theme.spacing.xs,
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
    flexWrap: 'wrap',
    paddingHorizontal: config.theme.spacing.md,
    paddingVertical: config.theme.spacing.sm,
    gap: config.theme.spacing.xs,
  },
  controlButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: config.theme.spacing.xs,
    paddingHorizontal: config.theme.spacing.sm + 2,
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
  sleepActiveBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: config.theme.spacing.md,
    paddingVertical: config.theme.spacing.xs + 2,
    borderTopWidth: config.theme.sizes.borderWidth,
    gap: config.theme.spacing.sm,
  },
  sleepActiveInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: config.theme.spacing.xs,
  },
  sleepActiveText: {
    flex: 1,
    fontSize: config.theme.typography.fontSizes.xs,
    fontWeight: config.theme.typography.fontWeights.medium,
  },
  sleepCancelPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: config.theme.spacing.xxs + 2,
    paddingHorizontal: config.theme.spacing.sm,
    paddingVertical: config.theme.spacing.xxs + 2,
    borderRadius: config.theme.radii.full,
  },
  sleepCancelPillText: {
    fontSize: config.theme.typography.fontSizes.xs,
    fontWeight: config.theme.typography.fontWeights.bold,
  },
  sleepMenuContainer: {
    paddingHorizontal: config.theme.spacing.md,
    paddingVertical: config.theme.spacing.md,
    borderTopWidth: config.theme.sizes.borderWidth,
    gap: config.theme.spacing.sm,
  },
  sleepMenuHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sleepMenuTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: config.theme.spacing.xs,
  },
  sleepMenuTitle: {
    fontSize: config.theme.typography.fontSizes.sm,
    fontWeight: config.theme.typography.fontWeights.bold,
  },
  sleepMenuSubtitle: {
    fontSize: config.theme.typography.fontSizes.xs,
  },
  sleepOptionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: config.theme.spacing.xs,
  },
  sleepOptionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: config.theme.spacing.xs,
    paddingHorizontal: config.theme.spacing.md,
    paddingVertical: config.theme.spacing.xs + 3,
    borderRadius: config.theme.radii.full,
    borderWidth: config.theme.sizes.borderWidth,
  },
  sleepOptionText: {
    fontSize: config.theme.typography.fontSizes.xs,
    fontWeight: config.theme.typography.fontWeights.semibold,
  },
  sleepCancelFullButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: config.theme.spacing.xs,
    paddingVertical: config.theme.spacing.sm,
    borderRadius: config.theme.radii.sm,
    borderWidth: config.theme.sizes.borderWidth,
    marginTop: config.theme.spacing.xxs,
  },
  sleepCancelFullText: {
    fontSize: config.theme.typography.fontSizes.xs,
    fontWeight: config.theme.typography.fontWeights.bold,
  },
});
