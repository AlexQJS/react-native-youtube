import React, { useMemo } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { config } from '../config/config';
import { usePlayer } from '../context/PlayerContext';
import { useThemeColors } from '../hooks/useThemeColors';
import { useWatchHistory } from '../hooks/useWatchHistory';
import {
  computeWeeklyWatchStats,
  formatBarTimeLabel,
  formatWatchTime,
} from '../utils/format';

export default function ConfigScreen() {
  const { colors, isDark, themeMode, setThemeMode } = useThemeColors();
  const { activeVideo, isMinimized } = usePlayer();
  const { history } = useWatchHistory();

  const hasMiniPlayer = Boolean(activeVideo && isMinimized);

  const weeklyStats = useMemo(
    () => computeWeeklyWatchStats(history),
    [history]
  );

  return (
    <ScrollView
      testID="config-screen"
      style={[styles.screen, { backgroundColor: colors.background }]}
      contentContainerStyle={[
        styles.content,
        hasMiniPlayer && styles.contentWithMiniPlayer,
      ]}
      showsVerticalScrollIndicator={false}
    >
      {/* Sección 1: Tema (Light / Dark) */}
      <View testID="config-theme-section" style={styles.section}>
        <View style={styles.sectionHeaderRow}>
          <Ionicons
            name="contrast-outline"
            size={config.theme.sizes.iconSm + 2}
            color={colors.primary}
          />
          <Text style={[styles.sectionHeaderTitle, { color: colors.text }]}>
            Apariencia
          </Text>
        </View>

        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
            },
          ]}
        >
          <View style={styles.themeInfoRow}>
            <View
              style={[
                styles.themeIconBadge,
                { backgroundColor: colors.surfaceElevated },
              ]}
            >
              <Ionicons
                name={isDark ? 'moon' : 'sunny'}
                size={config.theme.sizes.iconMd}
                color={colors.primary}
              />
            </View>
            <View style={styles.themeTextColumn}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>
                Tema de la aplicación
              </Text>
              <Text
                testID="config-current-theme-label"
                style={[styles.cardSubtitle, { color: colors.textSecondary }]}
              >
                {isDark ? 'Modo oscuro (Dark)' : 'Modo claro (Light)'}
              </Text>
            </View>
          </View>

          <View style={styles.themeSelectorRow}>
            <Pressable
              testID="theme-option-light"
              accessibilityRole="button"
              accessibilityState={{ selected: themeMode === 'light' }}
              accessibilityLabel="Activar tema claro"
              onPress={() => setThemeMode('light')}
              style={({ pressed }) => [
                styles.themeOptionButton,
                {
                  backgroundColor:
                    themeMode === 'light'
                      ? colors.primary
                      : colors.surfaceElevated,
                  borderColor:
                    themeMode === 'light' ? colors.primary : colors.border,
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
            >
              <Ionicons
                name="sunny-outline"
                size={config.theme.sizes.iconSm}
                color={themeMode === 'light' ? colors.badgeText : colors.text}
              />
              <Text
                style={[
                  styles.themeOptionText,
                  {
                    color:
                      themeMode === 'light' ? colors.badgeText : colors.text,
                  },
                ]}
              >
                Light
              </Text>
            </Pressable>

            <Pressable
              testID="theme-option-dark"
              accessibilityRole="button"
              accessibilityState={{ selected: themeMode === 'dark' }}
              accessibilityLabel="Activar tema oscuro"
              onPress={() => setThemeMode('dark')}
              style={({ pressed }) => [
                styles.themeOptionButton,
                {
                  backgroundColor:
                    themeMode === 'dark'
                      ? colors.primary
                      : colors.surfaceElevated,
                  borderColor:
                    themeMode === 'dark' ? colors.primary : colors.border,
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
            >
              <Ionicons
                name="moon-outline"
                size={config.theme.sizes.iconSm}
                color={themeMode === 'dark' ? colors.badgeText : colors.text}
              />
              <Text
                style={[
                  styles.themeOptionText,
                  {
                    color:
                      themeMode === 'dark' ? colors.badgeText : colors.text,
                  },
                ]}
              >
                Dark
              </Text>
            </Pressable>
          </View>
        </View>
      </View>

      {/* Sección 2: Estadísticas de tiempo visto esta semana */}
      <View testID="config-weekly-stats-section" style={styles.section}>
        <View style={styles.sectionHeaderRow}>
          <Ionicons
            name="bar-chart-outline"
            size={config.theme.sizes.iconSm + 2}
            color={colors.primary}
          />
          <Text style={[styles.sectionHeaderTitle, { color: colors.text }]}>
            Tiempo visto esta semana
          </Text>
        </View>

        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
            },
          ]}
        >
          {/* Resumen numérico semanal */}
          <View testID="weekly-stats-summary" style={styles.kpiRow}>
            <View
              style={[
                styles.kpiBox,
                { backgroundColor: colors.surfaceElevated },
              ]}
            >
              <Text style={[styles.kpiLabel, { color: colors.textSecondary }]}>
                Total semana
              </Text>
              <Text
                testID="weekly-total-time"
                style={[styles.kpiValue, { color: colors.text }]}
              >
                {formatWatchTime(weeklyStats.totalSeconds)}
              </Text>
            </View>

            <View
              style={[
                styles.kpiBox,
                { backgroundColor: colors.surfaceElevated },
              ]}
            >
              <Text style={[styles.kpiLabel, { color: colors.textSecondary }]}>
                Media diaria
              </Text>
              <Text
                testID="weekly-daily-average"
                style={[styles.kpiValue, { color: colors.text }]}
              >
                {formatWatchTime(weeklyStats.averageSecondsPerDay)}
              </Text>
            </View>

            <View
              style={[
                styles.kpiBox,
                { backgroundColor: colors.surfaceElevated },
              ]}
            >
              <Text style={[styles.kpiLabel, { color: colors.textSecondary }]}>
                Vídeos
              </Text>
              <Text
                testID="weekly-videos-count"
                style={[styles.kpiValue, { color: colors.text }]}
              >
                {weeklyStats.totalVideos}
              </Text>
            </View>
          </View>

          {/* Gráfico de barras por día de la semana */}
          <View testID="weekly-stats-chart" style={styles.chartContainer}>
            {weeklyStats.days.map((day) => {
              const hasActivity = day.seconds > 0;
              return (
                <View
                  key={day.dateKey}
                  testID={`weekly-bar-column-${day.dateKey}`}
                  style={styles.barColumn}
                >
                  <Text
                    testID={`weekly-bar-value-${day.dateKey}`}
                    numberOfLines={1}
                    style={[
                      styles.barValueText,
                      {
                        color: hasActivity ? colors.text : colors.textMuted,
                        fontWeight: day.isToday
                          ? config.theme.typography.fontWeights.bold
                          : config.theme.typography.fontWeights.medium,
                      },
                    ]}
                  >
                    {formatBarTimeLabel(day.seconds)}
                  </Text>

                  <View
                    style={[
                      styles.barTrack,
                      { backgroundColor: colors.surfaceElevated },
                    ]}
                  >
                    <View
                      testID={`weekly-bar-fill-${day.dateKey}`}
                      style={[
                        styles.barFill,
                        {
                          height: `${day.heightPercent}%`,
                          backgroundColor: hasActivity
                            ? colors.primary
                            : 'transparent',
                          opacity: day.isToday ? 1 : 0.78,
                        },
                      ]}
                    />
                  </View>

                  <Text
                    testID={`weekly-bar-label-${day.dateKey}`}
                    style={[
                      styles.barDayLabel,
                      {
                        color: day.isToday
                          ? colors.primary
                          : colors.textSecondary,
                        fontWeight: day.isToday
                          ? config.theme.typography.fontWeights.bold
                          : config.theme.typography.fontWeights.medium,
                      },
                    ]}
                  >
                    {day.dayLabel}
                  </Text>
                </View>
              );
            })}
          </View>

          {weeklyStats.totalSeconds === 0 && (
            <Text
              testID="weekly-stats-empty-hint"
              style={[styles.emptyHintText, { color: colors.textMuted }]}
            >
              Reproduce vídeos para ver aquí tu actividad diaria de la semana.
            </Text>
          )}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    paddingHorizontal: config.theme.spacing.lg,
    paddingTop: config.theme.spacing.md,
    paddingBottom: config.theme.spacing.xxl,
    gap: config.theme.spacing.xl,
  },
  contentWithMiniPlayer: {
    paddingBottom:
      config.theme.spacing.xxl + config.theme.sizes.miniPlayerHeight,
  },
  section: {
    gap: config.theme.spacing.sm,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: config.theme.spacing.xs,
  },
  sectionHeaderTitle: {
    fontSize: config.theme.typography.fontSizes.sm,
    fontWeight: config.theme.typography.fontWeights.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  card: {
    borderRadius: config.theme.radii.md,
    borderWidth: config.theme.sizes.borderWidth,
    padding: config.theme.spacing.lg,
    gap: config.theme.spacing.md,
  },
  themeInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: config.theme.spacing.md,
  },
  themeIconBadge: {
    width: 42,
    height: 42,
    borderRadius: config.theme.radii.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  themeTextColumn: {
    flex: 1,
    gap: 2,
  },
  cardTitle: {
    fontSize: config.theme.typography.fontSizes.md,
    fontWeight: config.theme.typography.fontWeights.semibold,
  },
  cardSubtitle: {
    fontSize: config.theme.typography.fontSizes.xs,
  },
  themeSelectorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: config.theme.spacing.sm,
  },
  themeOptionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: config.theme.spacing.xs,
    height: config.theme.sizes.buttonHeight,
    borderRadius: config.theme.radii.full,
    borderWidth: config.theme.sizes.borderWidth,
  },
  themeOptionText: {
    fontSize: config.theme.typography.fontSizes.sm,
    fontWeight: config.theme.typography.fontWeights.semibold,
  },
  kpiRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: config.theme.spacing.sm,
  },
  kpiBox: {
    flex: 1,
    borderRadius: config.theme.radii.sm,
    paddingVertical: config.theme.spacing.sm + 2,
    paddingHorizontal: config.theme.spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  kpiLabel: {
    fontSize: config.theme.typography.fontSizes.xs,
    fontWeight: config.theme.typography.fontWeights.medium,
  },
  kpiValue: {
    fontSize: config.theme.typography.fontSizes.sm,
    fontWeight: config.theme.typography.fontWeights.bold,
    textAlign: 'center',
  },
  chartContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingTop: config.theme.spacing.sm,
    gap: config.theme.spacing.xs,
  },
  barColumn: {
    flex: 1,
    alignItems: 'center',
    gap: config.theme.spacing.xs,
  },
  barValueText: {
    fontSize: 10,
    textAlign: 'center',
  },
  barTrack: {
    width: '68%',
    maxWidth: 28,
    minWidth: 16,
    height: 116,
    borderRadius: config.theme.radii.sm,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  barFill: {
    width: '100%',
    borderRadius: config.theme.radii.sm,
  },
  barDayLabel: {
    fontSize: config.theme.typography.fontSizes.xs,
    textAlign: 'center',
  },
  emptyHintText: {
    fontSize: config.theme.typography.fontSizes.xs,
    textAlign: 'center',
  },
});
