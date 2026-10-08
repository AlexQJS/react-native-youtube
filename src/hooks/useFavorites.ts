import { useCallback, useEffect, useMemo, useState } from 'react';
import { storage } from '../services/storage';
import { FavoriteChannel } from '../types/youtube';

export interface UseFavoritesReturn {
  favorites: FavoriteChannel[];
  loading: boolean;
  error: string | null;
  isFavorite: (channelId: string) => boolean;
  addFavorite: (channel: FavoriteChannel) => Promise<void>;
  removeFavorite: (channelId: string) => Promise<void>;
  toggleFavorite: (channel: FavoriteChannel) => Promise<boolean>;
  refreshFavorites: () => Promise<void>;
}

export function useFavorites(): UseFavoritesReturn {
  const [favorites, setFavorites] = useState<FavoriteChannel[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadFavorites = useCallback(async () => {
    try {
      setError(null);
      const stored = await storage.getFavorites();
      setFavorites(stored);
    } catch {
      setError('No se pudieron cargar los canales favoritos.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    loadFavorites();

    const unsubscribe = storage.subscribeFavorites((updated) => {
      if (mounted) {
        setFavorites(updated);
      }
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [loadFavorites]);

  const favoriteIds = useMemo(
    () => new Set(favorites.map((channel) => channel.id)),
    [favorites]
  );

  const isFavorite = useCallback(
    (channelId: string) => favoriteIds.has(channelId),
    [favoriteIds]
  );

  const addFavorite = useCallback(async (channel: FavoriteChannel) => {
    try {
      setError(null);
      const updated = await storage.addFavorite(channel);
      setFavorites(updated);
    } catch {
      setError('Error al guardar el canal en favoritos.');
    }
  }, []);

  const removeFavorite = useCallback(async (channelId: string) => {
    try {
      setError(null);
      const updated = await storage.removeFavorite(channelId);
      setFavorites(updated);
    } catch {
      setError('Error al eliminar el canal de favoritos.');
    }
  }, []);

  const toggleFavorite = useCallback(
    async (channel: FavoriteChannel): Promise<boolean> => {
      if (favoriteIds.has(channel.id)) {
        await removeFavorite(channel.id);
        return false;
      } else {
        await addFavorite(channel);
        return true;
      }
    },
    [favoriteIds, addFavorite, removeFavorite]
  );

  return {
    favorites,
    loading,
    error,
    isFavorite,
    addFavorite,
    removeFavorite,
    toggleFavorite,
    refreshFavorites: loadFavorites,
  };
}
