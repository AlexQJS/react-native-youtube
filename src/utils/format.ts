import { config } from '../config/config';
import { WatchHistoryItem } from '../types/youtube';

/**
 * Convierte una duración ISO 8601 de YouTube (ej. "PT1H12M30S", "PT5M", "PT42S")
 * a segundos totales.
 */
export function parseIsoDuration(isoDuration?: string): number | undefined {
  if (!isoDuration || typeof isoDuration !== 'string') {
    return undefined;
  }

  const match = isoDuration.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i);
  if (!match) {
    return undefined;
  }

  const hours = parseInt(match[1] ?? '0', 10);
  const minutes = parseInt(match[2] ?? '0', 10);
  const seconds = parseInt(match[3] ?? '0', 10);

  const total = hours * 3600 + minutes * 60 + seconds;
  return total > 0 ? total : undefined;
}

/**
 * Formatea segundos en cadena legible "MM:SS" o "H:MM:SS".
 */
export function formatDuration(totalSeconds?: number): string {
  if (
    totalSeconds === undefined ||
    totalSeconds === null ||
    !Number.isFinite(totalSeconds) ||
    totalSeconds < 0
  ) {
    return '';
  }

  const rounded = Math.floor(totalSeconds);
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const seconds = rounded % 60;

  const paddedSeconds = seconds.toString().padStart(2, '0');

  if (hours > 0) {
    const paddedMinutes = minutes.toString().padStart(2, '0');
    return `${hours}:${paddedMinutes}:${paddedSeconds}`;
  }

  return `${minutes}:${paddedSeconds}`;
}

/**
 * Formatea una fecha ISO 8601 a texto relativo en español o fecha corta.
 */
export function formatRelativeDate(isoDate: string, referenceDate: Date = new Date()): string {
  if (!isoDate) {
    return '';
  }

  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) {
    const trimmed = isoDate.trim();
    if (/^(hace|emitido|transmitido|\d+\s)/i.test(trimmed)) {
      return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
    }
    return '';
  }

  const diffMs = referenceDate.getTime() - parsed.getTime();
  const diffSeconds = Math.max(0, Math.floor(diffMs / 1000));
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMinutes < 1) {
    return 'Hace un momento';
  }
  if (diffMinutes < 60) {
    return diffMinutes === 1 ? 'Hace 1 min' : `Hace ${diffMinutes} min`;
  }
  if (diffHours < 24) {
    return diffHours === 1 ? 'Hace 1 hora' : `Hace ${diffHours} horas`;
  }
  if (diffDays < 7) {
    return diffDays === 1 ? 'Hace 1 día' : `Hace ${diffDays} días`;
  }
  if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    return weeks === 1 ? 'Hace 1 semana' : `Hace ${weeks} semanas`;
  }
  if (diffDays < 365) {
    const months = Math.floor(diffDays / 30);
    return months === 1 ? 'Hace 1 mes' : `Hace ${months} meses`;
  }

  const years = Math.floor(diffDays / 365);
  return years === 1 ? 'Hace 1 año' : `Hace ${years} años`;
}

/**
 * Decodifica entidades HTML básicas que devuelve la API de búsqueda de YouTube.
 */
export function decodeHtmlEntities(text?: string): string {
  if (!text) {
    return '';
  }
  return text
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

/**
 * Calcula el porcentaje de reproducción entre 0 y 1.
 */
export function calculateProgressRatio(position: number, duration: number): number {
  if (!Number.isFinite(position) || !Number.isFinite(duration) || duration <= 0 || position <= 0) {
    return 0;
  }
  return Math.min(1, Math.max(0, position / duration));
}

/**
 * Determina si un vídeo se considera prácticamente terminado según la configuración.
 */
export function isVideoCompleted(position: number, duration: number): boolean {
  if (!Number.isFinite(position) || !Number.isFinite(duration) || duration <= 0) {
    return false;
  }
  const ratio = position / duration;
  const remaining = duration - position;
  return (
    ratio >= config.playback.completionRatioThreshold ||
    (duration > config.playback.completionRemainingSeconds * 2 &&
      remaining <= config.playback.completionRemainingSeconds)
  );
}

/**
 * Determina si la posición actual supera el umbral mínimo para guardar progreso.
 */
export function shouldSaveProgress(position: number): boolean {
  return Number.isFinite(position) && position >= config.playback.minSecondsToSave;
}

/**
 * Detecta si un vídeo es un YouTube Short a partir de su URL de enlace (en RSS),
 * hashtags (#shorts / #short) en título o descripción, o su duración en segundos.
 */
export function detectIsShort(params: {
  title?: string;
  description?: string;
  durationSeconds?: number;
  linkHref?: string;
}): boolean {
  const { title = '', description = '', durationSeconds, linkHref = '' } = params;

  if (linkHref.includes('/shorts/')) {
    return true;
  }

  const shortsHashtagRegex = /(?:^|\s)#shorts?\b/i;
  if (shortsHashtagRegex.test(title) || shortsHashtagRegex.test(description)) {
    return true;
  }

  if (
    durationSeconds !== undefined &&
    durationSeconds > 0 &&
    durationSeconds <= config.feed.shortsMaxDurationSeconds
  ) {
    return true;
  }

  return false;
}

/**
 * Formatea el número de visitas de un vídeo en español (p.ej. "1.240 visitas", "93,9 mil visitas", "1,5 M de visitas").
 */
export function formatViewCount(views?: number): string {
  if (views === undefined || views === null || !Number.isFinite(views) || views < 0) {
    return '';
  }

  const rounded = Math.floor(views);
  if (rounded === 1) {
    return '1 visita';
  }

  if (rounded < 1000) {
    return `${rounded} visitas`;
  }

  if (rounded < 1_000_000) {
    const thousands = rounded / 1000;
    const formatted =
      thousands >= 100
        ? Math.round(thousands).toString()
        : thousands.toFixed(1).replace('.0', '').replace('.', ',');
    return `${formatted} mil visitas`;
  }

  const millions = rounded / 1_000_000;
  const formatted = millions.toFixed(1).replace('.0', '').replace('.', ',');
  return `${formatted} M de visitas`;
}

/**
 * Convierte un texto de duración "MM:SS" o "HH:MM:SS" a segundos totales.
 */
export function parseDurationTextToSeconds(text?: string): number | undefined {
  if (!text || typeof text !== 'string') {
    return undefined;
  }

  const parts = text
    .trim()
    .split(':')
    .map((p) => Number(p));
  if (parts.some((n) => !Number.isFinite(n) || n < 0)) {
    return undefined;
  }

  if (parts.length === 2) {
    const total = parts[0] * 60 + parts[1];
    return total > 0 ? total : undefined;
  }

  if (parts.length === 3) {
    const total = parts[0] * 3600 + parts[1] * 60 + parts[2];
    return total > 0 ? total : undefined;
  }

  return undefined;
}

/**
 * Extrae el número aproximado de visitas desde textos de búsqueda de YouTube
 * (p.ej. "125.430 visualizaciones", "93,9 mil visualizaciones", "1,5 M de visualizaciones").
 */
export function parseViewCountText(text?: string): number | undefined {
  if (!text || typeof text !== 'string') {
    return undefined;
  }

  const normalized = text.toLowerCase().trim();
  if (normalized.includes('sin visualizaciones') || normalized.includes('no views')) {
    return 0;
  }

  // Millones: "1,5 m" o "1.5m"
  const millionsMatch = normalized.match(/(\d+(?:[.,]\d+)?)\s*m\b/i);
  if (millionsMatch) {
    const val = parseFloat(millionsMatch[1].replace(',', '.'));
    if (Number.isFinite(val)) {
      return Math.round(val * 1_000_000);
    }
  }

  // Miles abreviados: "93,9 mil" o "93.9k"
  const thousandsMatch = normalized.match(/(\d+(?:[.,]\d+)?)\s*(?:mil|k)\b/i);
  if (thousandsMatch) {
    const val = parseFloat(thousandsMatch[1].replace(',', '.'));
    if (Number.isFinite(val)) {
      return Math.round(val * 1_000);
    }
  }

  // Número entero con separadores de miles ("125.430 visualizaciones" o "125,430 views")
  const digitsOnly = normalized.replace(/[^\d]/g, '');
  if (digitsOnly.length > 0) {
    const val = parseInt(digitsOnly, 10);
    if (Number.isFinite(val)) {
      return val;
    }
  }

  return undefined;
}

/**
 * Formatea una cifra de forma compacta en español (p.ej. 42 -> "42", 1400 -> "1,4 mil", 2100000 -> "2,1 M").
 */
export function formatCompactCount(count?: number): string {
  if (count === undefined || count === null || !Number.isFinite(count) || count <= 0) {
    return '';
  }

  const rounded = Math.floor(count);
  if (rounded < 1000) {
    return `${rounded}`;
  }

  if (rounded < 1_000_000) {
    const thousands = rounded / 1000;
    const formatted =
      thousands >= 100
        ? Math.round(thousands).toString()
        : thousands.toFixed(1).replace('.0', '').replace('.', ',');
    return `${formatted} mil`;
  }

  const millions = rounded / 1_000_000;
  const formatted = millions.toFixed(1).replace('.0', '').replace('.', ',');
  return `${formatted} M`;
}

export interface DailyWatchStat {
  /** Clave de fecha local en formato YYYY-MM-DD */
  dateKey: string;
  /** Etiqueta abreviada del día en español (Lun, Mar, Mié, Jue, Vie, Sáb, Dom) */
  dayLabel: string;
  /** Segundos totales reproducidos en ese día */
  seconds: number;
  /** Cantidad de vídeos vistos en ese día */
  videoCount: number;
  /** Porcentaje de altura de la barra respecto al día de mayor consumo (0 a 100) */
  heightPercent: number;
  /** Indica si este día corresponde al día actual */
  isToday: boolean;
}

export interface WeeklyWatchStats {
  days: DailyWatchStat[];
  totalSeconds: number;
  totalVideos: number;
  averageSecondsPerDay: number;
  maxDaySeconds: number;
}

const SPANISH_SHORT_DAYS = [
  'Dom',
  'Lun',
  'Mar',
  'Mié',
  'Jue',
  'Vie',
  'Sáb',
] as const;

export function toLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Formatea segundos totales de visualización en texto legible (ej. "0 min", "45 s", "25 min", "1 h 15 min").
 */
export function formatWatchTime(totalSeconds?: number): string {
  if (
    totalSeconds === undefined ||
    totalSeconds === null ||
    !Number.isFinite(totalSeconds) ||
    totalSeconds <= 0
  ) {
    return '0 min';
  }

  const rounded = Math.floor(totalSeconds);
  if (rounded < 60) {
    return `${rounded} s`;
  }

  const hours = Math.floor(rounded / 3600);
  const minutes = Math.round((rounded % 3600) / 60);

  if (hours > 0) {
    if (minutes === 60) {
      return `${hours + 1} h`;
    }
    return minutes > 0 ? `${hours} h ${minutes} min` : `${hours} h`;
  }

  return `${Math.max(1, Math.round(rounded / 60))} min`;
}

/**
 * Formatea segundos totales de visualización en etiqueta compacta para barras (ej. "0m", "45s", "15m", "1h 20m").
 */
export function formatBarTimeLabel(totalSeconds?: number): string {
  if (
    totalSeconds === undefined ||
    totalSeconds === null ||
    !Number.isFinite(totalSeconds) ||
    totalSeconds <= 0
  ) {
    return '0m';
  }

  const rounded = Math.floor(totalSeconds);
  if (rounded < 60) {
    return `${rounded}s`;
  }

  const hours = Math.floor(rounded / 3600);
  const minutes = Math.round((rounded % 3600) / 60);

  if (hours > 0) {
    if (minutes === 60) {
      return `${hours + 1}h`;
    }
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }

  return `${Math.max(1, Math.round(rounded / 60))}m`;
}

/**
 * Calcula las estadísticas de tiempo visto durante los últimos 7 días (esta semana)
 * desglosadas día por día para representarlas en un gráfico de barras.
 */
export function computeWeeklyWatchStats(
  history: WatchHistoryItem[],
  referenceDate: Date = new Date()
): WeeklyWatchStats {
  const dayBuckets: Array<{
    dateKey: string;
    dayLabel: string;
    seconds: number;
    videoCount: number;
    isToday: boolean;
  }> = [];

  const bucketByDateKey = new Map<
    string,
    {
      dateKey: string;
      dayLabel: string;
      seconds: number;
      videoCount: number;
      isToday: boolean;
    }
  >();

  for (let offset = 6; offset >= 0; offset -= 1) {
    const d = new Date(
      referenceDate.getFullYear(),
      referenceDate.getMonth(),
      referenceDate.getDate() - offset
    );
    const dateKey = toLocalDateKey(d);
    const dayLabel = SPANISH_SHORT_DAYS[d.getDay()] ?? 'Día';
    const bucket = {
      dateKey,
      dayLabel,
      seconds: 0,
      videoCount: 0,
      isToday: offset === 0,
    };
    dayBuckets.push(bucket);
    bucketByDateKey.set(dateKey, bucket);
  }

  if (Array.isArray(history)) {
    for (const item of history) {
      if (!item || typeof item.watchedAt !== 'number') {
        continue;
      }
      const watchedDate = new Date(item.watchedAt);
      if (Number.isNaN(watchedDate.getTime())) {
        continue;
      }

      const key = toLocalDateKey(watchedDate);
      const targetBucket = bucketByDateKey.get(key);
      if (!targetBucket) {
        continue;
      }

      const effectiveDuration =
        item.duration || item.video?.durationSeconds || 0;
      const watchedSeconds =
        item.position > 0
          ? Math.floor(item.position)
          : item.completed && effectiveDuration > 0
            ? Math.floor(effectiveDuration)
            : 0;

      targetBucket.seconds += Math.max(0, watchedSeconds);
      targetBucket.videoCount += 1;
    }
  }

  const maxDaySeconds = dayBuckets.reduce(
    (max, day) => Math.max(max, day.seconds),
    0
  );
  const totalSeconds = dayBuckets.reduce((sum, day) => sum + day.seconds, 0);
  const totalVideos = dayBuckets.reduce((sum, day) => sum + day.videoCount, 0);
  const averageSecondsPerDay = Math.round(totalSeconds / 7);

  const days: DailyWatchStat[] = dayBuckets.map((day) => ({
    ...day,
    heightPercent:
      maxDaySeconds > 0 && day.seconds > 0
        ? Math.max(10, Math.round((day.seconds / maxDaySeconds) * 100))
        : 0,
  }));

  return {
    days,
    totalSeconds,
    totalVideos,
    averageSecondsPerDay,
    maxDaySeconds,
  };
}
