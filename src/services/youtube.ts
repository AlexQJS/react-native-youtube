import { config } from '../config/config';
import {
  FavoriteChannel,
  VideoComment,
  VideoItem,
  YouTubeAppError,
  YouTubeCommentsListResponse,
  YouTubeCommentThreadsResponse,
  YouTubePlaylistItemsResponse,
  YouTubeSearchResponse,
  YouTubeVideosResponse,
} from '../types/youtube';
import {
  decodeHtmlEntities,
  detectIsShort,
  formatDuration,
  parseDurationTextToSeconds,
  parseIsoDuration,
  parseViewCountText,
} from '../utils/format';

// Deduplicación de peticiones en vuelo
const inFlightRequests = new Map<string, Promise<any>>();

/**
 * Convierte un ID de canal de YouTube (UC...) al ID de su lista de subidas general (UU...).
 */
export function channelIdToUploadsPlaylistId(channelId: string): string | null {
  const trimmed = channelId.trim();
  if (trimmed.startsWith('UC') && trimmed.length > 2) {
    return `UU${trimmed.slice(2)}`;
  }
  return null;
}

/**
 * Obtiene los IDs de listas oficiales de YouTube para separar vídeos largos (UULF...)
 * y Shorts (UUSH...) cuando el ID del canal es un ID real de YouTube (UC...).
 */
export function getSpecializedPlaylistIds(channelId: string): {
  longFormPlaylistId: string;
  shortsPlaylistId: string;
} | null {
  const trimmed = channelId.trim();
  if (trimmed.startsWith('UC') && trimmed.length >= 16) {
    const suffix = trimmed.slice(2);
    return {
      longFormPlaylistId: `UULF${suffix}`,
      shortsPlaylistId: `UUSH${suffix}`,
    };
  }
  return null;
}

/**
 * Normaliza URLs de miniaturas que puedan empezar por "//"
 */
function normalizeThumbnailUrl(url?: string): string {
  if (!url) return '';
  const trimmed = url.trim();
  if (trimmed.startsWith('//')) {
    return `https:${trimmed}`;
  }
  return trimmed;
}

/**
 * Obtiene la API key activa desde la configuración o variable de entorno.
 */
export function getActiveApiKey(overrideKey?: string): string {
  if (overrideKey !== undefined) {
    const trimmedOverride = overrideKey.trim();
    return trimmedOverride === 'TU_CLAVE_DE_API_AQUI' ? '' : trimmedOverride;
  }
  const envKey = (config.api.apiKey || process.env.EXPO_PUBLIC_YOUTUBE_API_KEY || '').trim();
  if (envKey && envKey !== 'TU_CLAVE_DE_API_AQUI') {
    return envKey;
  }
  return '';
}

/**
 * Clasifica errores HTTP / de la API de YouTube en códigos de error de dominio.
 */
function parseApiError(status: number, body: any): YouTubeAppError {
  const reason = body?.error?.errors?.[0]?.reason ?? '';
  const apiMessage = body?.error?.message ?? '';

  if (
    status === 429 ||
    reason === 'quotaExceeded' ||
    reason === 'dailyLimitExceeded' ||
    reason === 'rateLimitExceeded' ||
    reason === 'userRateLimitExceeded'
  ) {
    return new YouTubeAppError(
      'Se ha superado el límite de peticiones de YouTube. Inténtalo más tarde.',
      'RATE_LIMIT',
      true,
      status
    );
  }

  if (status === 404 || reason === 'playlistNotFound' || reason === 'channelNotFound') {
    return new YouTubeAppError(
      'El canal o recurso solicitado ya no está disponible en YouTube.',
      'CHANNEL_DELETED',
      false,
      status
    );
  }

  if (status === 403) {
    return new YouTubeAppError(
      'Acceso denegado por la API de YouTube. Verifica los permisos o la cuota de tu API key.',
      'API_ERROR',
      true,
      status
    );
  }

  return new YouTubeAppError(
    apiMessage || `Error al comunicarse con YouTube (código ${status}).`,
    'API_ERROR',
    true,
    status
  );
}

/**
 * Ejecuta una petición GET JSON con manejo de errores tipado.
 */
async function fetchYouTubeJson<T>(url: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    });
  } catch {
    throw new YouTubeAppError(
      'No se pudo conectar con YouTube. Comprueba tu conexión a internet.',
      'NETWORK_ERROR',
      true
    );
  }

  let data: any = null;
  try {
    data = await response.json();
  } catch {
    if (!response.ok) {
      throw new YouTubeAppError(
        `Error del servidor de YouTube (${response.status}).`,
        'API_ERROR',
        true,
        response.status
      );
    }
    throw new YouTubeAppError(
      'Respuesta inválida recibida desde YouTube.',
      'API_ERROR',
      true,
      response.status
    );
  }

  if (!response.ok || data?.error) {
    throw parseApiError(response.status, data);
  }

  return data as T;
}

/**
 * Busca canales de YouTube sin necesidad de API Key utilizando el endpoint público
 * de búsqueda web de YouTube (filtrado exclusivamente a canales: params="EgIQAg==").
 */
async function searchChannelsWithoutKey(query: string): Promise<FavoriteChannel[]> {
  let response: Response;
  try {
    response = await fetch('https://www.youtube.com/youtubei/v1/search?prettyPrint=false', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        context: {
          client: {
            clientName: 'WEB',
            clientVersion: '2.20241001.00.00',
            hl: 'es',
          },
        },
        query,
        params: 'EgIQAg==',
      }),
    });
  } catch {
    throw new YouTubeAppError(
      'No se pudo conectar con YouTube. Comprueba tu conexión a internet.',
      'NETWORK_ERROR',
      true
    );
  }

  if (response.status === 429) {
    throw new YouTubeAppError(
      'Demasiadas peticiones seguidas a YouTube. Espera unos segundos e inténtalo de nuevo.',
      'RATE_LIMIT',
      true,
      429
    );
  }

  if (!response.ok) {
    throw new YouTubeAppError(
      `Error al buscar canales en YouTube (${response.status}).`,
      'API_ERROR',
      true,
      response.status
    );
  }

  const data: any = await response.json();
  const sections =
    data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer
      ?.contents ?? [];

  const channels: FavoriteChannel[] = [];
  const seen = new Set<string>();

  for (const section of sections) {
    const items = section?.itemSectionRenderer?.contents ?? [];
    for (const item of items) {
      const renderer = item?.channelRenderer;
      if (!renderer) continue;

      const id: string = renderer.channelId ?? '';
      const rawName: string =
        renderer.title?.simpleText ??
        renderer.title?.runs?.map((r: any) => r.text).join('') ??
        '';
      const name = decodeHtmlEntities(rawName).trim();

      if (!id || !name || seen.has(id)) {
        continue;
      }

      seen.add(id);

      const thumbs: Array<{ url?: string }> = renderer.thumbnail?.thumbnails ?? [];
      const bestThumb = thumbs[thumbs.length - 1]?.url ?? thumbs[0]?.url ?? '';
      const thumbnail = normalizeThumbnailUrl(bestThumb);

      const rawDesc: string =
        renderer.descriptionSnippet?.runs?.map((r: any) => r.text).join('') ?? '';
      const description = decodeHtmlEntities(rawDesc).trim() || undefined;

      channels.push({
        id,
        name,
        thumbnail,
        ...(description ? { description } : {}),
      });

      if (channels.length >= config.search.maxResults) {
        return channels;
      }
    }
  }

  return channels;
}

/**
 * Busca vídeos de YouTube sin necesidad de API Key utilizando el endpoint público
 * de búsqueda web de YouTube (filtrado a vídeos: params="EgIQAQ==").
 */
async function searchVideosWithoutKey(query: string): Promise<VideoItem[]> {
  let response: Response;
  try {
    response = await fetch('https://www.youtube.com/youtubei/v1/search?prettyPrint=false', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        context: {
          client: {
            clientName: 'WEB',
            clientVersion: '2.20241001.00.00',
            hl: 'es',
          },
        },
        query,
        params: 'EgIQAQ==',
      }),
    });
  } catch {
    throw new YouTubeAppError(
      'No se pudo conectar con YouTube. Comprueba tu conexión a internet.',
      'NETWORK_ERROR',
      true
    );
  }

  if (response.status === 429) {
    throw new YouTubeAppError(
      'Demasiadas peticiones seguidas a YouTube. Espera unos segundos e inténtalo de nuevo.',
      'RATE_LIMIT',
      true,
      429
    );
  }

  if (!response.ok) {
    throw new YouTubeAppError(
      `Error al buscar vídeos en YouTube (${response.status}).`,
      'API_ERROR',
      true,
      response.status
    );
  }

  const data: any = await response.json();
  const sections =
    data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer
      ?.contents ?? [];

  const videos: VideoItem[] = [];
  const seen = new Set<string>();

  for (const section of sections) {
    const items = section?.itemSectionRenderer?.contents ?? [];
    for (const item of items) {
      const renderer = item?.videoRenderer;
      if (!renderer) continue;

      const id: string = renderer.videoId ?? '';
      const rawTitle: string =
        renderer.title?.runs?.map((r: any) => r.text).join('') ??
        renderer.title?.simpleText ??
        '';
      const title = decodeHtmlEntities(rawTitle).trim();

      if (!id || !title || seen.has(id)) {
        continue;
      }

      seen.add(id);

      const thumbs: Array<{ url?: string }> = renderer.thumbnail?.thumbnails ?? [];
      const bestThumb =
        thumbs[thumbs.length - 1]?.url ??
        thumbs[0]?.url ??
        `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
      const thumbnail = normalizeThumbnailUrl(bestThumb);

      const ownerRuns =
        renderer.ownerText?.runs ??
        renderer.longBylineText?.runs ??
        renderer.shortBylineText?.runs ??
        [];
      const channelTitle = decodeHtmlEntities(ownerRuns[0]?.text ?? '').trim();
      const channelId: string =
        ownerRuns[0]?.navigationEndpoint?.browseEndpoint?.browseId ?? '';

      const publishedAt: string =
        renderer.publishedTimeText?.simpleText ??
        renderer.publishedTimeText?.runs?.map((r: any) => r.text).join('') ??
        '';

      const durationText: string =
        renderer.lengthText?.simpleText ??
        renderer.lengthText?.runs?.map((r: any) => r.text).join('') ??
        '';
      const durationSeconds = parseDurationTextToSeconds(durationText);
      const durationFormatted =
        durationText.trim() ||
        (durationSeconds ? formatDuration(durationSeconds) : undefined);

      const viewText: string =
        renderer.viewCountText?.simpleText ??
        renderer.viewCountText?.runs?.map((r: any) => r.text).join('') ??
        '';
      const viewCount = parseViewCountText(viewText);

      const rawDesc: string =
        renderer.detailedMetadataSnippets?.[0]?.snippetText?.runs
          ?.map((r: any) => r.text)
          .join('') ??
        renderer.descriptionSnippet?.runs?.map((r: any) => r.text).join('') ??
        '';
      const description = decodeHtmlEntities(rawDesc).trim() || undefined;

      const navUrl: string =
        renderer.navigationEndpoint?.commandMetadata?.webCommandMetadata?.url ?? '';
      const isShort = detectIsShort({
        title,
        description,
        durationSeconds,
        linkHref: navUrl,
      });

      videos.push({
        id,
        title,
        thumbnail,
        channelId,
        channelTitle,
        publishedAt,
        ...(description ? { description } : {}),
        ...(durationSeconds !== undefined ? { durationSeconds } : {}),
        ...(durationFormatted ? { durationFormatted } : {}),
        ...(viewCount !== undefined ? { viewCount } : {}),
        ...(isShort ? { isShort: true } : {}),
      });

      if (videos.length >= config.search.maxVideoResults) {
        return videos;
      }
    }
  }

  return videos;
}

/**
 * Extrae el contenido de una etiqueta XML simple.
 */
function extractXmlTag(xmlBlock: string, tagName: string): string {
  const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i');
  const match = xmlBlock.match(regex);
  return match ? decodeHtmlEntities(match[1].trim()) : '';
}

/**
 * Parsea un bloque XML Atom/RSS de YouTube y devuelve la lista de VideoItem.
 */
function parseRssXmlEntries(
  xml: string,
  channel: FavoriteChannel,
  forcedShortState?: boolean
): VideoItem[] {
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/gi;
  const videos: VideoItem[] = [];
  let match: RegExpExecArray | null;

  while ((match = entryRegex.exec(xml)) !== null) {
    const entryXml = match[1];
    const videoId = extractXmlTag(entryXml, 'yt:videoId');
    const title = extractXmlTag(entryXml, 'title');
    const publishedAt = extractXmlTag(entryXml, 'published');
    const authorBlock = extractXmlTag(entryXml, 'author');
    const authorName = extractXmlTag(authorBlock, 'name') || channel.name;
    const description = extractXmlTag(entryXml, 'media:description');

    const linkMatch = entryXml.match(/<link[^>]*href=["']([^"']+)["']/i);
    const linkHref = linkMatch?.[1] ?? (entryXml.includes('/shorts/') ? '/shorts/' : '');

    const thumbMatch = entryXml.match(/<media:thumbnail[^>]*url=["']([^"']+)["']/i);
    const thumbnail =
      thumbMatch?.[1] ?? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

    const viewsMatch = entryXml.match(/<media:statistics[^>]*views=["'](\d+)["']/i);
    const parsedViews = viewsMatch ? Number(viewsMatch[1]) : undefined;
    const viewCount =
      parsedViews !== undefined && Number.isFinite(parsedViews)
        ? parsedViews
        : undefined;

    if (!videoId || !title) {
      continue;
    }

    const isShort =
      forcedShortState !== undefined
        ? forcedShortState
        : detectIsShort({
            title,
            description,
            linkHref,
          });

    videos.push({
      id: videoId,
      title,
      description,
      thumbnail,
      channelId: channel.id,
      channelTitle: authorName,
      publishedAt,
      ...(isShort ? { isShort: true } : {}),
      ...(viewCount !== undefined ? { viewCount } : {}),
    });

    if (videos.length >= config.feed.videosPerChannel) {
      break;
    }
  }

  return videos;
}

/**
 * Descarga un texto RSS desde una URL de YouTube.
 */
async function fetchRssText(url: string): Promise<string> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/atom+xml, application/xml, text/xml, */*',
      },
    });
  } catch {
    throw new YouTubeAppError(
      'No se pudo conectar con YouTube. Comprueba tu conexión a internet.',
      'NETWORK_ERROR',
      true
    );
  }

  if (response.status === 404) {
    throw new YouTubeAppError(
      'El canal ya no existe o no tiene feed público disponible.',
      'CHANNEL_DELETED',
      false,
      404
    );
  }

  if (response.status === 429) {
    throw new YouTubeAppError(
      'Límite de peticiones alcanzado temporalmente. Inténtalo más tarde.',
      'RATE_LIMIT',
      true,
      429
    );
  }

  if (!response.ok) {
    throw new YouTubeAppError(
      `No se pudo obtener el feed del canal (${response.status}).`,
      'API_ERROR',
      true,
      response.status
    );
  }

  return await response.text();
}

/**
 * Obtiene los últimos vídeos de un canal utilizando el Feed Atom/RSS público
 * oficial de YouTube:
 * - Si el canal tiene un ID estándar de YouTube (UC...), consulta en paralelo
 *   la lista de vídeos normales (`UULF...`) y la lista de Shorts (`UUSH...`)
 *   para garantizar que siempre haya tanto vídeos normales como Shorts disponibles.
 * - Si alguna no está disponible o es un ID corto/de prueba, utiliza `channel_id=...`.
 */
export async function fetchChannelVideosFromRss(
  channel: FavoriteChannel
): Promise<VideoItem[]> {
  const specialized = getSpecializedPlaylistIds(channel.id);

  if (specialized && config.feed.enableShortsFilter) {
    const longFormUrl = `${config.api.rssFeedBaseUrl}?playlist_id=${encodeURIComponent(
      specialized.longFormPlaylistId
    )}`;
    const shortsUrl = `${config.api.rssFeedBaseUrl}?playlist_id=${encodeURIComponent(
      specialized.shortsPlaylistId
    )}`;

    const [longRes, shortsRes] = await Promise.allSettled([
      fetchRssText(longFormUrl),
      fetchRssText(shortsUrl),
    ]);

    const combined: VideoItem[] = [];
    if (longRes.status === 'fulfilled' && longRes.value) {
      combined.push(...parseRssXmlEntries(longRes.value, channel, false));
    }
    if (shortsRes.status === 'fulfilled' && shortsRes.value) {
      combined.push(...parseRssXmlEntries(shortsRes.value, channel, true));
    }

    if (combined.length > 0) {
      return combined;
    }
  }

  // Fallback general por channel_id
  const defaultUrl = `${config.api.rssFeedBaseUrl}?channel_id=${encodeURIComponent(
    channel.id
  )}`;
  const xml = await fetchRssText(defaultUrl);
  return parseRssXmlEntries(xml, channel);
}

export const youtubeService = {
  /**
   * Limpia las peticiones en vuelo (útil para tests).
   */
  clearInFlightRequests(): void {
    inFlightRequests.clear();
  },

  /**
   * Busca canales de YouTube por texto.
   */
  async searchChannels(query: string, apiKeyOverride?: string): Promise<FavoriteChannel[]> {
    const trimmed = query.trim();
    if (!trimmed || trimmed.length < config.search.minQueryLength) {
      return [];
    }

    const apiKey = getActiveApiKey(apiKeyOverride);
    const requestKey = `search:${apiKey ? 'api' : 'nokey'}:${trimmed.toLowerCase()}`;
    const existing = inFlightRequests.get(requestKey);
    if (existing) {
      return existing;
    }

    const requestPromise = (async () => {
      try {
        if (!apiKey) {
          return await searchChannelsWithoutKey(trimmed);
        }

        const params = new URLSearchParams({
          part: 'snippet',
          type: 'channel',
          maxResults: String(config.search.maxResults),
          q: trimmed,
          key: apiKey,
        });

        const url = `${config.api.baseUrl}/search?${params.toString()}`;
        const data = await fetchYouTubeJson<YouTubeSearchResponse>(url);
        const items = data.items ?? [];
        const channels: FavoriteChannel[] = [];
        const seen = new Set<string>();

        for (const item of items) {
          const id = item.id?.channelId ?? item.snippet?.channelId ?? '';
          const rawName = item.snippet?.title ?? item.snippet?.channelTitle ?? '';
          const name = decodeHtmlEntities(rawName).trim();

          if (!id || !name || seen.has(id)) {
            continue;
          }

          seen.add(id);
          const thumbnail = normalizeThumbnailUrl(
            item.snippet?.thumbnails?.high?.url ??
              item.snippet?.thumbnails?.medium?.url ??
              item.snippet?.thumbnails?.default?.url ??
              ''
          );

          const rawDesc = item.snippet?.description;
          const description = rawDesc ? decodeHtmlEntities(rawDesc).trim() : undefined;

          channels.push({
            id,
            name,
            thumbnail,
            ...(description ? { description } : {}),
          });
        }

        return channels;
      } finally {
        inFlightRequests.delete(requestKey);
      }
    })();

    inFlightRequests.set(requestKey, requestPromise);
    return requestPromise;
  },

  /**
   * Busca vídeos de YouTube por texto.
   */
  async searchVideos(query: string, apiKeyOverride?: string): Promise<VideoItem[]> {
    const trimmed = query.trim();
    if (!trimmed || trimmed.length < config.search.minQueryLength) {
      return [];
    }

    const apiKey = getActiveApiKey(apiKeyOverride);
    const requestKey = `searchVideos:${apiKey ? 'api' : 'nokey'}:${trimmed.toLowerCase()}`;
    const existing = inFlightRequests.get(requestKey);
    if (existing) {
      return existing;
    }

    const requestPromise = (async () => {
      try {
        if (!apiKey) {
          return await searchVideosWithoutKey(trimmed);
        }

        const params = new URLSearchParams({
          part: 'snippet',
          type: 'video',
          maxResults: String(config.search.maxVideoResults),
          q: trimmed,
          key: apiKey,
        });

        const url = `${config.api.baseUrl}/search?${params.toString()}`;
        const data = await fetchYouTubeJson<YouTubeSearchResponse>(url);
        const items = data.items ?? [];
        const videos: VideoItem[] = [];
        const seen = new Set<string>();

        for (const item of items) {
          const id = item.id?.videoId ?? '';
          const rawTitle = item.snippet?.title ?? '';
          const title = decodeHtmlEntities(rawTitle).trim();

          if (!id || !title || seen.has(id)) {
            continue;
          }

          seen.add(id);
          const thumbnail = normalizeThumbnailUrl(
            item.snippet?.thumbnails?.high?.url ??
              item.snippet?.thumbnails?.medium?.url ??
              item.snippet?.thumbnails?.default?.url ??
              `https://i.ytimg.com/vi/${id}/hqdefault.jpg`
          );

          const channelId = item.snippet?.channelId ?? '';
          const channelTitle = decodeHtmlEntities(item.snippet?.channelTitle ?? '').trim();
          const publishedAt = item.snippet?.publishedAt ?? '';
          const rawDesc = item.snippet?.description;
          const description = rawDesc ? decodeHtmlEntities(rawDesc).trim() : undefined;

          videos.push({
            id,
            title,
            thumbnail,
            channelId,
            channelTitle,
            publishedAt,
            ...(description ? { description } : {}),
          });
        }

        return await this.enrichVideosWithDetails(videos, apiKey);
      } finally {
        inFlightRequests.delete(requestKey);
      }
    })();

    inFlightRequests.set(requestKey, requestPromise);
    return requestPromise;
  },

  /**
   * Busca simultáneamente canales y vídeos para mostrar ambos apartados en la pestaña Buscar.
   */
  async searchAll(
    query: string,
    apiKeyOverride?: string
  ): Promise<{ channels: FavoriteChannel[]; videos: VideoItem[] }> {
    const trimmed = query.trim();
    if (!trimmed || trimmed.length < config.search.minQueryLength) {
      return { channels: [], videos: [] };
    }

    const [channelsResult, videosResult] = await Promise.allSettled([
      this.searchChannels(trimmed, apiKeyOverride),
      this.searchVideos(trimmed, apiKeyOverride),
    ]);

    if (channelsResult.status === 'rejected' && videosResult.status === 'rejected') {
      throw channelsResult.reason;
    }

    return {
      channels: channelsResult.status === 'fulfilled' ? channelsResult.value : [],
      videos: videosResult.status === 'fulfilled' ? videosResult.value : [],
    };
  },

  /**
   * Obtiene los últimos vídeos de un canal individual.
   */
  async getChannelVideos(
    channel: FavoriteChannel,
    apiKeyOverride?: string
  ): Promise<VideoItem[]> {
    const apiKey = getActiveApiKey(apiKeyOverride);

    if (!apiKey) {
      return await fetchChannelVideosFromRss(channel);
    }

    const uploadsPlaylistId = channelIdToUploadsPlaylistId(channel.id);

    if (uploadsPlaylistId) {
      const params = new URLSearchParams({
        part: 'snippet,contentDetails,status',
        playlistId: uploadsPlaylistId,
        maxResults: String(config.feed.videosPerChannel),
        key: apiKey,
      });

      const url = `${config.api.baseUrl}/playlistItems?${params.toString()}`;
      const data = await fetchYouTubeJson<YouTubePlaylistItemsResponse>(url);
      const items = data.items ?? [];
      const videos: VideoItem[] = [];

      for (const item of items) {
        const privacyStatus = item.status?.privacyStatus;
        const title = decodeHtmlEntities(item.snippet?.title ?? '').trim();

        if (
          privacyStatus === 'private' ||
          !title ||
          title === 'Private video' ||
          title === 'Deleted video'
        ) {
          continue;
        }

        const videoId =
          item.contentDetails?.videoId ?? item.snippet?.resourceId?.videoId ?? '';
        if (!videoId) {
          continue;
        }

        const publishedAt =
          item.contentDetails?.videoPublishedAt ?? item.snippet?.publishedAt ?? '';
        const thumbnail =
          item.snippet?.thumbnails?.maxres?.url ??
          item.snippet?.thumbnails?.standard?.url ??
          item.snippet?.thumbnails?.high?.url ??
          item.snippet?.thumbnails?.medium?.url ??
          item.snippet?.thumbnails?.default?.url ??
          '';

        const description = decodeHtmlEntities(item.snippet?.description ?? '');
        const isShort = detectIsShort({ title, description });

        videos.push({
          id: videoId,
          title,
          description,
          thumbnail,
          channelId: channel.id,
          channelTitle: decodeHtmlEntities(item.snippet?.channelTitle || channel.name),
          publishedAt,
          ...(isShort ? { isShort: true } : {}),
        });
      }

      return videos;
    }

    const params = new URLSearchParams({
      part: 'snippet',
      channelId: channel.id,
      order: 'date',
      type: 'video',
      maxResults: String(config.feed.videosPerChannel),
      key: apiKey,
    });

    const url = `${config.api.baseUrl}/search?${params.toString()}`;
    const data = await fetchYouTubeJson<YouTubeSearchResponse>(url);
    const items = data.items ?? [];
    const videos: VideoItem[] = [];

    for (const item of items) {
      const videoId = item.id?.videoId ?? '';
      const title = decodeHtmlEntities(item.snippet?.title ?? '').trim();
      if (!videoId || !title || title === 'Private video' || title === 'Deleted video') {
        continue;
      }

      const thumbnail =
        item.snippet?.thumbnails?.high?.url ??
        item.snippet?.thumbnails?.medium?.url ??
        item.snippet?.thumbnails?.default?.url ??
        '';

      const description = decodeHtmlEntities(item.snippet?.description ?? '');
      const isShort = detectIsShort({ title, description });

      videos.push({
        id: videoId,
        title,
        description,
        thumbnail,
        channelId: channel.id,
        channelTitle: decodeHtmlEntities(item.snippet?.channelTitle || channel.name),
        publishedAt: item.snippet?.publishedAt ?? '',
        ...(isShort ? { isShort: true } : {}),
      });
    }

    return videos;
  },

  /**
   * Obtiene detalles adicionales (como la duración ISO 8601) para un lote de IDs de vídeo
   * cuando se dispone de API Key.
   */
  async enrichVideosWithDetails(
    videos: VideoItem[],
    apiKeyOverride?: string
  ): Promise<VideoItem[]> {
    if (!videos.length) {
      return [];
    }

    const apiKey = getActiveApiKey(apiKeyOverride);
    if (!apiKey) {
      return videos;
    }

    const ids = videos.map((v) => v.id).slice(0, 50);
    const params = new URLSearchParams({
      part: 'contentDetails,status,statistics',
      id: ids.join(','),
      key: apiKey,
    });

    try {
      const url = `${config.api.baseUrl}/videos?${params.toString()}`;
      const data = await fetchYouTubeJson<YouTubeVideosResponse>(url);
      const detailsMap = new Map<
        string,
        {
          durationSeconds?: number;
          durationFormatted?: string;
          viewCount?: number;
          isPrivate?: boolean;
        }
      >();

      for (const item of data.items ?? []) {
        if (!item.id) continue;
        const isPrivate = item.status?.privacyStatus === 'private';
        const durationSeconds = parseIsoDuration(item.contentDetails?.duration);
        const durationFormatted =
          durationSeconds !== undefined ? formatDuration(durationSeconds) : undefined;
        const rawViews = item.statistics?.viewCount
          ? Number(item.statistics.viewCount)
          : undefined;
        const viewCount =
          rawViews !== undefined && Number.isFinite(rawViews) ? rawViews : undefined;
        detailsMap.set(item.id, {
          durationSeconds,
          durationFormatted,
          viewCount,
          isPrivate,
        });
      }

      return videos
        .filter((v) => !detailsMap.get(v.id)?.isPrivate)
        .map((video) => {
          const details = detailsMap.get(video.id);
          if (!details) return video;
          const isShort =
            video.isShort ||
            detectIsShort({
              title: video.title,
              description: video.description,
              durationSeconds: details.durationSeconds,
            });
          return {
            ...video,
            ...(details.durationSeconds !== undefined
              ? { durationSeconds: details.durationSeconds }
              : {}),
            ...(details.durationFormatted !== undefined
              ? { durationFormatted: details.durationFormatted }
              : {}),
            ...(details.viewCount !== undefined
              ? { viewCount: details.viewCount }
              : {}),
            ...(isShort ? { isShort: true } : {}),
          };
        });
    } catch {
      return videos;
    }
  },

  /**
   * Obtiene el Feed agregado para todos los canales favoritos:
   * - Ordena todos los vídeos del más reciente al más antiguo.
   * - Garantiza espacio hasta config.feed.maxVideos tanto para vídeos normales como para Shorts.
   */
  async getFeedForChannels(
    channels: FavoriteChannel[],
    apiKeyOverride?: string
  ): Promise<VideoItem[]> {
    if (!channels.length) {
      return [];
    }

    const signature = channels
      .map((c) => c.id)
      .sort()
      .join(',');
    const requestKey = `feed:${signature}`;
    const existing = inFlightRequests.get(requestKey);
    if (existing) {
      return existing;
    }

    const requestPromise = (async () => {
      try {
        const results = await Promise.allSettled(
          channels.map((channel) => this.getChannelVideos(channel, apiKeyOverride))
        );

        const collected: VideoItem[] = [];
        let firstFatalError: YouTubeAppError | null = null;
        let successCount = 0;

        for (const res of results) {
          if (res.status === 'fulfilled') {
            successCount++;
            collected.push(...res.value);
          } else {
            const err = res.reason;
            if (err instanceof YouTubeAppError) {
              if (err.code !== 'CHANNEL_DELETED' && !firstFatalError) {
                firstFatalError = err;
              } else if (!firstFatalError) {
                firstFatalError = err;
              }
            } else if (!firstFatalError) {
              firstFatalError = new YouTubeAppError(
                'Error al obtener vídeos del canal.',
                'API_ERROR',
                true
              );
            }
          }
        }

        if (successCount === 0 && firstFatalError) {
          throw firstFatalError;
        }

        const uniqueMap = new Map<string, VideoItem>();
        for (const video of collected) {
          if (video.id && !uniqueMap.has(video.id)) {
            uniqueMap.set(video.id, video);
          }
        }

        const sortedAll = Array.from(uniqueMap.values()).sort((a, b) => {
          const timeA = new Date(a.publishedAt).getTime() || 0;
          const timeB = new Date(b.publishedAt).getTime() || 0;
          return timeB - timeA;
        });

        // Conservamos hasta maxVideos vídeos normales y hasta maxVideos Shorts
        // para que ninguna pestaña ("Todos" vs "Shorts") quede vacía
        const normalVideos = sortedAll
          .filter((v) => !v.isShort)
          .slice(0, config.feed.maxVideos);
        const shortVideos = sortedAll
          .filter((v) => Boolean(v.isShort))
          .slice(0, config.feed.maxVideos);

        const merged = [...normalVideos, ...shortVideos].sort((a, b) => {
          const timeA = new Date(a.publishedAt).getTime() || 0;
          const timeB = new Date(b.publishedAt).getTime() || 0;
          return timeB - timeA;
        });

        return await this.enrichVideosWithDetails(merged, apiKeyOverride);
      } finally {
        inFlightRequests.delete(requestKey);
      }
    })();

    inFlightRequests.set(requestKey, requestPromise);
    return requestPromise;
  },

  /**
   * Obtiene los comentarios principales de un vídeo de YouTube, tanto con API Key
   * (YouTube Data API v3 commentThreads) como sin API Key (endpoint público InnerTube /next).
   */
  async getVideoComments(
    videoId: string,
    apiKeyOverride?: string
  ): Promise<VideoComment[]> {
    const trimmed = videoId.trim();
    if (!trimmed) {
      return [];
    }

    const apiKey = getActiveApiKey(apiKeyOverride);
    const requestKey = `comments:${apiKey ? 'api' : 'nokey'}:${trimmed}`;
    const existing = inFlightRequests.get(requestKey);
    if (existing) {
      return existing;
    }

    const requestPromise = (async () => {
      try {
        if (!apiKey) {
          return await fetchVideoCommentsWithoutKey(trimmed);
        }

        const params = new URLSearchParams({
          part: 'snippet,replies',
          videoId: trimmed,
          maxResults: String(config.comments.maxResults),
          order: 'relevance',
          textFormat: 'plainText',
          key: apiKey,
        });

        try {
          const url = `${config.api.baseUrl}/commentThreads?${params.toString()}`;
          const data = await fetchYouTubeJson<YouTubeCommentThreadsResponse>(url);
          const items = data.items ?? [];
          const comments: VideoComment[] = [];
          const seen = new Set<string>();

          for (const item of items) {
            const topComment = item.snippet?.topLevelComment;
            const topSnippet = topComment?.snippet;
            const id = topComment?.id ?? item.id ?? '';
            const rawText = topSnippet?.textOriginal ?? topSnippet?.textDisplay ?? '';
            const text = decodeHtmlEntities(rawText).trim();

            if (!id || !text || seen.has(id)) {
              continue;
            }
            seen.add(id);

            const authorName =
              decodeHtmlEntities(topSnippet?.authorDisplayName ?? '').trim() ||
              'Usuario de YouTube';
            const authorAvatar =
              normalizeThumbnailUrl(topSnippet?.authorProfileImageUrl) || undefined;
            const publishedAt = topSnippet?.publishedAt ?? '';
            const likeCount =
              typeof topSnippet?.likeCount === 'number' && topSnippet.likeCount > 0
                ? topSnippet.likeCount
                : undefined;

            const inlineRepliesRaw = item.replies?.comments ?? [];
            const inlineReplies: VideoComment[] = [];
            for (const rep of inlineRepliesRaw) {
              const repId = rep.id ?? '';
              const repSnippet = rep.snippet;
              const repText = decodeHtmlEntities(
                repSnippet?.textOriginal ?? repSnippet?.textDisplay ?? ''
              ).trim();
              if (!repId || !repText) continue;

              const repAuthor =
                decodeHtmlEntities(repSnippet?.authorDisplayName ?? '').trim() ||
                'Usuario de YouTube';
              const repAvatar =
                normalizeThumbnailUrl(repSnippet?.authorProfileImageUrl) ||
                undefined;
              const repLikes =
                typeof repSnippet?.likeCount === 'number' &&
                repSnippet.likeCount > 0
                  ? repSnippet.likeCount
                  : undefined;

              inlineReplies.push({
                id: repId,
                authorName: repAuthor,
                text: repText,
                publishedAt: repSnippet?.publishedAt ?? '',
                ...(repAvatar ? { authorAvatar: repAvatar } : {}),
                ...(repLikes !== undefined ? { likeCount: repLikes } : {}),
              });
            }

            const totalReplyCount =
              typeof item.snippet?.totalReplyCount === 'number' &&
              item.snippet.totalReplyCount > 0
                ? item.snippet.totalReplyCount
                : inlineReplies.length > 0
                  ? inlineReplies.length
                  : undefined;

            comments.push({
              id,
              authorName,
              text,
              publishedAt,
              ...(authorAvatar ? { authorAvatar } : {}),
              ...(likeCount !== undefined ? { likeCount } : {}),
              ...(totalReplyCount !== undefined ? { replyCount: totalReplyCount } : {}),
              ...(inlineReplies.length > 0 ? { replies: inlineReplies } : {}),
            });
          }

          return comments;
        } catch (err) {
          if (
            err instanceof YouTubeAppError &&
            (err.statusCode === 403 || err.statusCode === 404)
          ) {
            return [];
          }
          throw err;
        }
      } finally {
        inFlightRequests.delete(requestKey);
      }
    })();

    inFlightRequests.set(requestKey, requestPromise);
    return requestPromise;
  },

  /**
   * Obtiene las respuestas de un comentario específico, tanto con API Key
   * (YouTube Data API v3 comments?parentId=...) como sin API Key (token de continuación de InnerTube).
   */
  async getCommentReplies(
    commentOrId: VideoComment | string,
    apiKeyOverride?: string
  ): Promise<VideoComment[]> {
    const commentObj =
      typeof commentOrId === 'object' && commentOrId !== null
        ? commentOrId
        : null;
    const commentId = (
      typeof commentOrId === 'string' ? commentOrId : commentObj?.id ?? ''
    ).trim();

    if (!commentId) {
      return [];
    }

    const apiKey = getActiveApiKey(apiKeyOverride);

    // Si ya están todas las respuestas precargadas y no hay token ni necesidad de pedir más
    if (
      commentObj?.replies &&
      commentObj.replies.length > 0 &&
      (!commentObj.replyCount ||
        commentObj.replies.length >= commentObj.replyCount) &&
      (!commentObj.repliesContinuationToken || Boolean(apiKey))
    ) {
      return commentObj.replies;
    }

    const requestKey = `commentReplies:${apiKey ? 'api' : 'nokey'}:${commentId}`;
    const existing = inFlightRequests.get(requestKey);
    if (existing) {
      return existing;
    }

    const requestPromise = (async () => {
      try {
        if (!apiKey) {
          if (commentObj?.repliesContinuationToken) {
            const fetched = await fetchCommentRepliesWithoutKey(
              commentObj.repliesContinuationToken
            );
            if (fetched.length > 0) {
              return fetched;
            }
          }
          return commentObj?.replies ?? [];
        }

        const params = new URLSearchParams({
          part: 'snippet',
          parentId: commentId,
          maxResults: String(config.comments.maxResults),
          textFormat: 'plainText',
          key: apiKey,
        });

        const url = `${config.api.baseUrl}/comments?${params.toString()}`;
        const data = await fetchYouTubeJson<YouTubeCommentsListResponse>(url);
        const items = data.items ?? [];
        const replies: VideoComment[] = [];
        const seen = new Set<string>();

        for (const item of items) {
          const id = item.id ?? '';
          const snippet = item.snippet;
          const rawText = snippet?.textOriginal ?? snippet?.textDisplay ?? '';
          const text = decodeHtmlEntities(rawText).trim();

          if (!id || !text || seen.has(id)) {
            continue;
          }
          seen.add(id);

          const authorName =
            decodeHtmlEntities(snippet?.authorDisplayName ?? '').trim() ||
            'Usuario de YouTube';
          const authorAvatar =
            normalizeThumbnailUrl(snippet?.authorProfileImageUrl) || undefined;
          const publishedAt = snippet?.publishedAt ?? '';
          const likeCount =
            typeof snippet?.likeCount === 'number' && snippet.likeCount > 0
              ? snippet.likeCount
              : undefined;

          replies.push({
            id,
            authorName,
            text,
            publishedAt,
            ...(authorAvatar ? { authorAvatar } : {}),
            ...(likeCount !== undefined ? { likeCount } : {}),
          });
        }

        if (replies.length === 0 && commentObj?.replies?.length) {
          return commentObj.replies;
        }

        return replies;
      } finally {
        inFlightRequests.delete(requestKey);
      }
    })();

    inFlightRequests.set(requestKey, requestPromise);
    return requestPromise;
  },
};

/**
 * Extrae el token de continuación de las respuestas de un hilo de comentario (commentRepliesRenderer).
 */
function extractReplyContinuationToken(repliesContainer: any): string | undefined {
  const renderer = repliesContainer?.commentRepliesRenderer ?? repliesContainer;
  if (!renderer || typeof renderer !== 'object') {
    return undefined;
  }

  const candidateArrays = [
    renderer.contents,
    renderer.continuationItems,
    renderer.subThreads,
  ];

  for (const arr of candidateArrays) {
    if (!Array.isArray(arr)) continue;
    for (const entry of arr) {
      const token =
        entry?.continuationItemRenderer?.continuationEndpoint
          ?.continuationCommand?.token ??
        entry?.continuationItemRenderer?.button?.buttonRenderer?.command
          ?.continuationCommand?.token ??
        entry?.continuationCommand?.token;
      if (typeof token === 'string' && token.trim()) {
        return token.trim();
      }
    }
  }

  const directToken =
    renderer?.continuationEndpoint?.continuationCommand?.token ??
    renderer?.viewReplies?.buttonRenderer?.command?.continuationCommand?.token;
  if (typeof directToken === 'string' && directToken.trim()) {
    return directToken.trim();
  }

  return undefined;
}

/**
 * Extrae el número de respuestas desde commentRepliesRenderer si no vino en el comentario principal.
 */
function extractReplyCountFromRenderer(repliesContainer: any): number | undefined {
  const renderer = repliesContainer?.commentRepliesRenderer ?? repliesContainer;
  if (!renderer || typeof renderer !== 'object') {
    return undefined;
  }

  const textCandidates = [
    renderer.viewReplies?.buttonRenderer?.text?.simpleText,
    renderer.viewReplies?.buttonRenderer?.text?.runs
      ?.map((r: any) => r.text)
      .join(''),
    renderer.moreText?.simpleText,
    renderer.moreText?.runs?.map((r: any) => r.text).join(''),
  ];

  for (const candidate of textCandidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      const parsed = parseViewCountText(candidate);
      if (parsed !== undefined && parsed > 0) {
        return parsed;
      }
    }
  }

  return undefined;
}

/**
 * Extrae el token de continuación de la sección de comentarios en la respuesta inicial de /youtubei/v1/next.
 */
function extractCommentsContinuationToken(data: any): string | null {
  const panels = data?.engagementPanels;
  if (Array.isArray(panels)) {
    for (const panel of panels) {
      const renderer = panel?.engagementPanelSectionListRenderer;
      const panelId = renderer?.panelIdentifier ?? renderer?.targetId ?? '';
      if (panelId === 'engagement-panel-comments-section') {
        const sortToken =
          renderer?.header?.engagementPanelTitleHeaderRenderer?.menu
            ?.sortFilterSubMenuRenderer?.subMenuItems?.[0]?.serviceEndpoint
            ?.continuationCommand?.token;
        if (typeof sortToken === 'string' && sortToken.trim()) {
          return sortToken.trim();
        }

        const sectionContents = renderer?.content?.sectionListRenderer?.contents ?? [];
        for (const section of sectionContents) {
          const items = section?.itemSectionRenderer?.contents ?? [];
          for (const item of items) {
            const token =
              item?.continuationItemRenderer?.continuationEndpoint
                ?.continuationCommand?.token ??
              item?.continuationItemRenderer?.button?.buttonRenderer?.command
                ?.continuationCommand?.token;
            if (typeof token === 'string' && token.trim()) {
              return token.trim();
            }
          }
        }
      }
    }
  }

  const watchContents =
    data?.contents?.twoColumnWatchNextResults?.results?.results?.contents ?? [];
  for (const entry of watchContents) {
    const section = entry?.itemSectionRenderer;
    if (!section) continue;
    const items = section.contents ?? [];
    for (const item of items) {
      const token =
        item?.continuationItemRenderer?.continuationEndpoint?.continuationCommand
          ?.token ??
        item?.continuationItemRenderer?.button?.buttonRenderer?.command
          ?.continuationCommand?.token;
      if (typeof token === 'string' && token.trim()) {
        return token.trim();
      }
    }
  }

  return null;
}

/**
 * Si la primera continuación devuelve una cabecera con submenú o segundo token antes del listado,
 * extrae ese segundo token de continuación.
 */
function extractSecondaryCommentsContinuationToken(data: any): string | null {
  const endpoints = Array.isArray(data?.onResponseReceivedEndpoints)
    ? data.onResponseReceivedEndpoints
    : [];

  for (const ep of endpoints) {
    const items =
      ep?.reloadContinuationItemsCommand?.continuationItems ??
      ep?.appendContinuationItemsAction?.continuationItems ??
      [];
    for (const item of items) {
      const headerSortToken =
        item?.commentsHeaderRenderer?.sortMenu?.sortFilterSubMenuRenderer
          ?.subMenuItems?.[0]?.serviceEndpoint?.continuationCommand?.token;
      if (typeof headerSortToken === 'string' && headerSortToken.trim()) {
        return headerSortToken.trim();
      }

      const contToken =
        item?.continuationItemRenderer?.continuationEndpoint
          ?.continuationCommand?.token ??
        item?.continuationItemRenderer?.button?.buttonRenderer?.command
          ?.continuationCommand?.token;
      if (typeof contToken === 'string' && contToken.trim()) {
        return contToken.trim();
      }
    }
  }

  return null;
}

/**
 * Convierte un commentEntityPayload moderno de InnerTube (frameworkUpdates) en VideoComment.
 */
function parseCommentEntityPayload(
  payload: any,
  fallbackId?: string,
  repliesContinuationToken?: string,
  fallbackReplyCount?: number
): VideoComment | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const id: string =
    payload.properties?.commentId ?? payload.key ?? fallbackId ?? '';
  const rawText: string = payload.properties?.content?.content ?? '';
  const text = decodeHtmlEntities(rawText).trim();

  if (!id || !text) {
    return null;
  }

  const rawAuthor: string = payload.author?.displayName ?? '';
  const authorName =
    decodeHtmlEntities(rawAuthor).trim() || 'Usuario de YouTube';
  const authorAvatar =
    normalizeThumbnailUrl(payload.author?.avatarThumbnailUrl) || undefined;
  const publishedAt = decodeHtmlEntities(
    payload.properties?.publishedTime ?? ''
  ).trim();

  const likeText: string =
    payload.toolbar?.likeCountNotliked ??
    payload.toolbar?.likeCountLiked ??
    '';
  const likeCount = parseViewCountText(likeText);

  const replyText: string = payload.toolbar?.replyCount ?? '';
  const parsedReplyCount = parseViewCountText(replyText);
  const replyCount =
    parsedReplyCount !== undefined && parsedReplyCount > 0
      ? parsedReplyCount
      : fallbackReplyCount !== undefined && fallbackReplyCount > 0
        ? fallbackReplyCount
        : repliesContinuationToken
          ? 1
          : undefined;

  return {
    id,
    authorName,
    text,
    publishedAt,
    ...(authorAvatar ? { authorAvatar } : {}),
    ...(likeCount !== undefined && likeCount > 0 ? { likeCount } : {}),
    ...(replyCount !== undefined && replyCount > 0 ? { replyCount } : {}),
    ...(repliesContinuationToken ? { repliesContinuationToken } : {}),
  };
}

/**
 * Parsea la respuesta de continuación de InnerTube soportando tanto commentRenderer clásico
 * como commentEntityPayload moderno (frameworkUpdates.entityBatchUpdate.mutations).
 */
function parseInnerTubeComments(
  data: any,
  options?: { includeReplies?: boolean }
): VideoComment[] {
  const includeReplies = Boolean(options?.includeReplies);
  const comments: VideoComment[] = [];
  const seen = new Set<string>();

  const endpoints = Array.isArray(data?.onResponseReceivedEndpoints)
    ? data.onResponseReceivedEndpoints
    : [];

  const continuationItems: any[] = [];
  for (const ep of endpoints) {
    const reloadItems = ep?.reloadContinuationItemsCommand?.continuationItems;
    if (Array.isArray(reloadItems)) {
      continuationItems.push(...reloadItems);
    }
    const appendItems = ep?.appendContinuationItemsAction?.continuationItems;
    if (Array.isArray(appendItems)) {
      continuationItems.push(...appendItems);
    }
  }

  const entityPayloadsById = new Map<string, any>();
  const orderedEntityPayloads: any[] = [];
  const mutations = data?.frameworkUpdates?.entityBatchUpdate?.mutations;
  if (Array.isArray(mutations)) {
    for (const mutation of mutations) {
      const payload = mutation?.payload?.commentEntityPayload;
      if (payload) {
        const cid = payload?.properties?.commentId ?? mutation?.entityKey ?? '';
        if (cid) {
          entityPayloadsById.set(cid, payload);
        }
        orderedEntityPayloads.push(payload);
      }
    }
  }

  for (const item of continuationItems) {
    const thread = item?.commentThreadRenderer;
    const repliesContinuationToken = extractReplyContinuationToken(thread?.replies);
    const fallbackReplyCount = extractReplyCountFromRenderer(thread?.replies);

    const classicRenderer =
      thread?.comment?.commentRenderer ?? item?.commentRenderer;

    if (classicRenderer) {
      const id: string = classicRenderer.commentId ?? '';
      const rawAuthor: string =
        classicRenderer.authorText?.simpleText ??
        classicRenderer.authorText?.runs?.map((r: any) => r.text).join('') ??
        '';
      const authorName =
        decodeHtmlEntities(rawAuthor).trim() || 'Usuario de YouTube';
      const rawText: string =
        classicRenderer.contentText?.runs?.map((r: any) => r.text).join('') ??
        classicRenderer.contentText?.simpleText ??
        '';
      const text = decodeHtmlEntities(rawText).trim();

      if (!id || !text || seen.has(id)) {
        continue;
      }
      seen.add(id);

      const thumbs: Array<{ url?: string }> =
        classicRenderer.authorThumbnail?.thumbnails ?? [];
      const bestThumb =
        thumbs[thumbs.length - 1]?.url ?? thumbs[0]?.url ?? '';
      const authorAvatar = normalizeThumbnailUrl(bestThumb) || undefined;

      const rawPublished: string =
        classicRenderer.publishedTimeText?.runs
          ?.map((r: any) => r.text)
          .join('') ??
        classicRenderer.publishedTimeText?.simpleText ??
        '';
      const publishedAt = decodeHtmlEntities(rawPublished).trim();

      const voteText: string =
        classicRenderer.voteCount?.simpleText ??
        classicRenderer.voteCount?.runs?.map((r: any) => r.text).join('') ??
        '';
      const likeCount = parseViewCountText(voteText);

      const rawReplyCount =
        typeof classicRenderer.replyCount === 'number' &&
        classicRenderer.replyCount > 0
          ? classicRenderer.replyCount
          : fallbackReplyCount !== undefined && fallbackReplyCount > 0
            ? fallbackReplyCount
            : repliesContinuationToken
              ? 1
              : undefined;

      comments.push({
        id,
        authorName,
        text,
        publishedAt,
        ...(authorAvatar ? { authorAvatar } : {}),
        ...(likeCount !== undefined && likeCount > 0 ? { likeCount } : {}),
        ...(rawReplyCount !== undefined && rawReplyCount > 0
          ? { replyCount: rawReplyCount }
          : {}),
        ...(repliesContinuationToken ? { repliesContinuationToken } : {}),
      });

      if (comments.length >= config.comments.maxResults) {
        return comments;
      }
      continue;
    }

    const viewModelCommentId: string =
      thread?.commentViewModel?.commentViewModel?.commentId ??
      item?.commentViewModel?.commentViewModel?.commentId ??
      '';
    if (viewModelCommentId && entityPayloadsById.has(viewModelCommentId)) {
      const payload = entityPayloadsById.get(viewModelCommentId);
      const parsed = parseCommentEntityPayload(
        payload,
        viewModelCommentId,
        repliesContinuationToken,
        fallbackReplyCount
      );
      if (parsed && !seen.has(parsed.id)) {
        seen.add(parsed.id);
        comments.push(parsed);
        if (comments.length >= config.comments.maxResults) {
          return comments;
        }
      }
    }
  }

  for (const payload of orderedEntityPayloads) {
    const replyLevel = Number(payload?.properties?.replyLevel ?? 0);
    if (!includeReplies && replyLevel > 0) {
      continue;
    }
    const parsed = parseCommentEntityPayload(payload);
    if (parsed && !seen.has(parsed.id)) {
      seen.add(parsed.id);
      comments.push(parsed);
      if (comments.length >= config.comments.maxResults) {
        return comments;
      }
    }
  }

  return comments;
}

/**
 * Obtiene las respuestas de un comentario sin API Key utilizando el token de continuación
 * de InnerTube (/youtubei/v1/next).
 */
async function fetchCommentRepliesWithoutKey(
  continuationToken: string
): Promise<VideoComment[]> {
  const trimmedToken = continuationToken.trim();
  if (!trimmedToken) {
    return [];
  }

  let response: Response;
  try {
    response = await fetch(
      'https://www.youtube.com/youtubei/v1/next?prettyPrint=false',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          context: {
            client: {
              clientName: 'WEB',
              clientVersion: '2.20241001.00.00',
              hl: 'es',
            },
          },
          continuation: trimmedToken,
        }),
      }
    );
  } catch {
    throw new YouTubeAppError(
      'No se pudo conectar con YouTube para cargar las respuestas.',
      'NETWORK_ERROR',
      true
    );
  }

  if (!response.ok) {
    throw new YouTubeAppError(
      `No se pudieron cargar las respuestas del comentario (${response.status}).`,
      'API_ERROR',
      true,
      response.status
    );
  }

  const data: any = await response.json();
  return parseInnerTubeComments(data, { includeReplies: true });
}

/**
 * Obtiene los comentarios de un vídeo sin necesidad de API Key utilizando
 * el endpoint público de YouTube (/youtubei/v1/next).
 */
async function fetchVideoCommentsWithoutKey(
  videoId: string
): Promise<VideoComment[]> {
  const clientContext = {
    client: {
      clientName: 'WEB',
      clientVersion: '2.20241001.00.00',
      hl: 'es',
    },
  };

  let initialResponse: Response;
  try {
    initialResponse = await fetch(
      'https://www.youtube.com/youtubei/v1/next?prettyPrint=false',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          context: clientContext,
          videoId,
        }),
      }
    );
  } catch {
    throw new YouTubeAppError(
      'No se pudo conectar con YouTube para cargar los comentarios.',
      'NETWORK_ERROR',
      true
    );
  }

  if (initialResponse.status === 429) {
    throw new YouTubeAppError(
      'Demasiadas peticiones seguidas a YouTube. Inténtalo de nuevo más tarde.',
      'RATE_LIMIT',
      true,
      429
    );
  }

  if (!initialResponse.ok) {
    throw new YouTubeAppError(
      `No se pudieron obtener los comentarios del vídeo (${initialResponse.status}).`,
      'API_ERROR',
      true,
      initialResponse.status
    );
  }

  const initialData: any = await initialResponse.json();
  const directComments = parseInnerTubeComments(initialData);
  if (directComments.length > 0) {
    return directComments;
  }

  const continuationToken = extractCommentsContinuationToken(initialData);
  if (!continuationToken) {
    return [];
  }

  let contResponse: Response;
  try {
    contResponse = await fetch(
      'https://www.youtube.com/youtubei/v1/next?prettyPrint=false',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          context: clientContext,
          continuation: continuationToken,
        }),
      }
    );
  } catch {
    throw new YouTubeAppError(
      'No se pudo conectar con YouTube para cargar los comentarios.',
      'NETWORK_ERROR',
      true
    );
  }

  if (!contResponse.ok) {
    return [];
  }

  const contData: any = await contResponse.json();
  const parsed = parseInnerTubeComments(contData);
  if (parsed.length > 0) {
    return parsed;
  }

  const secondaryToken = extractSecondaryCommentsContinuationToken(contData);
  if (secondaryToken && secondaryToken !== continuationToken) {
    try {
      const secondResponse = await fetch(
        'https://www.youtube.com/youtubei/v1/next?prettyPrint=false',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            context: clientContext,
            continuation: secondaryToken,
          }),
        }
      );
      if (secondResponse.ok) {
        const secondData: any = await secondResponse.json();
        return parseInnerTubeComments(secondData);
      }
    } catch {
      // Ignorar fallo en continuación secundaria
    }
  }

  return [];
}


