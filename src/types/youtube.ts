/**
 * Tipos e interfaces principales del dominio de YouTube y persistencia local.
 */

export interface FavoriteChannel {
  id: string;
  name: string;
  thumbnail: string;
  description?: string;
  /** Cantidad de veces que el usuario ha reproducido un vídeo de este canal */
  watchCount?: number;
  /** Timestamp de la última vez que se reprodujo un vídeo de este canal */
  lastWatchedAt?: number;
}

export interface ChannelDetails {
  id: string;
  name: string;
  handle?: string;
  thumbnail: string;
  bannerUrl?: string;
  description?: string;
  subscriberCountText?: string;
  videoCountText?: string;
  viewCountText?: string;
  publishedAt?: string;
  country?: string;
  uploadsPlaylistId?: string;
}

export interface ChannelPlaylist {
  id: string;
  title: string;
  thumbnail: string;
  itemCountText?: string;
  publishedAt?: string;
  firstVideoId?: string;
}

export type ChannelProfileTab = 'videos' | 'popular' | 'playlists' | 'about';

export interface VideoItem {
  id: string;
  title: string;
  description?: string;
  thumbnail: string;
  channelId: string;
  channelTitle: string;
  /** Miniatura / foto de perfil del canal del vídeo (cuando esté disponible) */
  channelThumbnail?: string;
  publishedAt: string;
  /** Duración en segundos (cuando está disponible) */
  durationSeconds?: number;
  /** Duración formateada p.ej. "14:20" */
  durationFormatted?: string;
  /** Indica si el vídeo es un YouTube Short */
  isShort?: boolean;
  /** Número de visitas / visualizaciones del vídeo */
  viewCount?: number;
  /** Indicates whether the video is unlisted on YouTube */
  isUnlisted?: boolean;
}

export interface PlaybackProgressEntry {
  position: number;
  duration: number;
  updatedAt: number;
  completed?: boolean;
}

export type PlaybackProgressMap = Record<string, PlaybackProgressEntry>;

export interface WatchHistoryItem {
  video: VideoItem;
  watchedAt: number;
  position: number;
  duration: number;
  completed?: boolean;
}

export interface CacheEntry<T> {
  data: T;
  updatedAt: number;
  key?: string;
}

export type YouTubeErrorCode =
  | 'NETWORK_ERROR'
  | 'RATE_LIMIT'
  | 'API_ERROR'
  | 'MISSING_API_KEY'
  | 'VIDEO_UNAVAILABLE'
  | 'PRIVATE_VIDEO'
  | 'CHANNEL_DELETED'
  | 'STORAGE_CORRUPTED'
  | 'UNKNOWN_ERROR';

export class YouTubeAppError extends Error {
  public readonly code: YouTubeErrorCode;
  public readonly retryable: boolean;
  public readonly statusCode?: number;

  constructor(
    message: string,
    code: YouTubeErrorCode = 'UNKNOWN_ERROR',
    retryable = true,
    statusCode?: number
  ) {
    super(message);
    this.name = 'YouTubeAppError';
    this.code = code;
    this.retryable = retryable;
    this.statusCode = statusCode;
    Object.setPrototypeOf(this, YouTubeAppError.prototype);
  }
}

export interface YouTubeSearchResponse {
  items?: Array<{
    id?: {
      kind?: string;
      channelId?: string;
      videoId?: string;
    };
    snippet?: {
      title?: string;
      description?: string;
      channelId?: string;
      channelTitle?: string;
      publishedAt?: string;
      thumbnails?: {
        high?: { url?: string };
        medium?: { url?: string };
        default?: { url?: string };
      };
    };
  }>;
  error?: {
    code?: number;
    message?: string;
    errors?: Array<{
      domain?: string;
      reason?: string;
      message?: string;
    }>;
  };
}

export interface YouTubeChannelItem {
  id?: string;
  snippet?: {
    title?: string;
    description?: string;
    customUrl?: string;
    publishedAt?: string;
    country?: string;
    thumbnails?: {
      maxres?: { url?: string };
      standard?: { url?: string };
      high?: { url?: string };
      medium?: { url?: string };
      default?: { url?: string };
    };
  };
  contentDetails?: {
    relatedPlaylists?: {
      uploads?: string;
    };
  };
  statistics?: {
    viewCount?: string;
    subscriberCount?: string;
    hiddenSubscriberCount?: boolean;
    videoCount?: string;
  };
  brandingSettings?: {
    image?: {
      bannerExternalUrl?: string;
    };
  };
}

export interface YouTubeChannelsResponse {
  items?: YouTubeChannelItem[];
  error?: {
    code?: number;
    message?: string;
    errors?: Array<{
      domain?: string;
      reason?: string;
      message?: string;
    }>;
  };
}

export interface YouTubePlaylistsResponse {
  items?: Array<{
    id?: string;
    snippet?: {
      title?: string;
      description?: string;
      publishedAt?: string;
      thumbnails?: {
        maxres?: { url?: string };
        standard?: { url?: string };
        high?: { url?: string };
        medium?: { url?: string };
        default?: { url?: string };
      };
    };
    contentDetails?: {
      itemCount?: number;
    };
  }>;
  error?: {
    code?: number;
    message?: string;
    errors?: Array<{
      reason?: string;
      message?: string;
    }>;
  };
}

export interface YouTubePlaylistItemsResponse {
  items?: Array<{
    snippet?: {
      title?: string;
      description?: string;
      channelId?: string;
      channelTitle?: string;
      publishedAt?: string;
      resourceId?: {
        videoId?: string;
      };
      thumbnails?: {
        maxres?: { url?: string };
        standard?: { url?: string };
        high?: { url?: string };
        medium?: { url?: string };
        default?: { url?: string };
      };
    };
    contentDetails?: {
      videoId?: string;
      videoPublishedAt?: string;
    };
    status?: {
      privacyStatus?: string;
    };
  }>;
  error?: {
    code?: number;
    message?: string;
    errors?: Array<{
      reason?: string;
      message?: string;
    }>;
  };
}

export interface YouTubeVideosResponse {
  items?: Array<{
    id?: string;
    snippet?: {
      title?: string;
      description?: string;
      channelId?: string;
      channelTitle?: string;
      publishedAt?: string;
      thumbnails?: {
        maxres?: { url?: string };
        standard?: { url?: string };
        high?: { url?: string };
        medium?: { url?: string };
        default?: { url?: string };
      };
    };
    contentDetails?: {
      duration?: string;
    };
    statistics?: {
      viewCount?: string;
    };
    status?: {
      uploadStatus?: string;
      privacyStatus?: string;
      embeddable?: boolean;
    };
  }>;
  error?: {
    code?: number;
    message?: string;
    errors?: Array<{
      reason?: string;
      message?: string;
    }>;
  };
}

export interface VideoComment {
  id: string;
  authorName: string;
  authorAvatar?: string;
  text: string;
  publishedAt: string;
  likeCount?: number;
  replyCount?: number;
  /** Respuestas precargadas o cargadas bajo demanda para este comentario */
  replies?: VideoComment[];
  /** Token de continuación de InnerTube para desplegar respuestas sin API key */
  repliesContinuationToken?: string;
}

export interface YouTubeCommentThreadsResponse {
  items?: Array<{
    id?: string;
    snippet?: {
      videoId?: string;
      totalReplyCount?: number;
      topLevelComment?: {
        id?: string;
        snippet?: {
          authorDisplayName?: string;
          authorProfileImageUrl?: string;
          textDisplay?: string;
          textOriginal?: string;
          likeCount?: number;
          publishedAt?: string;
        };
      };
    };
    replies?: {
      comments?: Array<{
        id?: string;
        snippet?: {
          parentId?: string;
          authorDisplayName?: string;
          authorProfileImageUrl?: string;
          textDisplay?: string;
          textOriginal?: string;
          likeCount?: number;
          publishedAt?: string;
        };
      }>;
    };
  }>;
  error?: {
    code?: number;
    message?: string;
    errors?: Array<{
      reason?: string;
      message?: string;
    }>;
  };
}

export interface YouTubeCommentsListResponse {
  items?: Array<{
    id?: string;
    snippet?: {
      parentId?: string;
      authorDisplayName?: string;
      authorProfileImageUrl?: string;
      textDisplay?: string;
      textOriginal?: string;
      likeCount?: number;
      publishedAt?: string;
    };
  }>;
  error?: {
    code?: number;
    message?: string;
    errors?: Array<{
      reason?: string;
      message?: string;
    }>;
  };
}
