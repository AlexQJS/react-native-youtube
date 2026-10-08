import { config } from '../config/config';
import {
  FavoriteChannel,
  VideoItem,
  YouTubeAppError,
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
};
