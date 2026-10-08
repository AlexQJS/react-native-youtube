import AsyncStorage from '@react-native-async-storage/async-storage';
import { config } from '../config/config';
import { storage } from '../services/storage';
import { FavoriteChannel } from '../types/youtube';

describe('Storage Service', () => {
  beforeEach(async () => {
    storage.resetMemoryCache();
    await AsyncStorage.clear();
    jest.clearAllMocks();
  });

  describe('Favoritos', () => {
    it('guarda y recupera canales favoritos correctamente sin información innecesaria', async () => {
      const rawChannel = {
        id: 'UC_channel_1',
        name: 'Canal de Prueba',
        thumbnail: 'https://example.com/thumb.jpg',
        description: 'Descripción del canal',
        extraFieldNotNeeded: 'debe descartarse',
      } as unknown as FavoriteChannel;

      await storage.saveFavorites([rawChannel]);
      storage.resetMemoryCache();

      const loaded = await storage.getFavorites();
      expect(loaded).toHaveLength(1);
      expect(loaded[0]).toEqual({
        id: 'UC_channel_1',
        name: 'Canal de Prueba',
        thumbnail: 'https://example.com/thumb.jpg',
        description: 'Descripción del canal',
      });
      expect((loaded[0] as any).extraFieldNotNeeded).toBeUndefined();
    });

    it('permite añadir y eliminar canales favoritos evitando duplicados', async () => {
      const ch1: FavoriteChannel = {
        id: 'UC_1',
        name: 'Canal 1',
        thumbnail: 'https://example.com/1.jpg',
      };
      const ch2: FavoriteChannel = {
        id: 'UC_2',
        name: 'Canal 2',
        thumbnail: 'https://example.com/2.jpg',
      };

      await storage.addFavorite(ch1);
      await storage.addFavorite(ch1); // duplicado
      await storage.addFavorite(ch2);

      storage.resetMemoryCache();
      let favorites = await storage.getFavorites();
      expect(favorites).toHaveLength(2);
      expect(favorites.map((c) => c.id)).toEqual(['UC_1', 'UC_2']);

      await storage.removeFavorite('UC_1');
      storage.resetMemoryCache();
      favorites = await storage.getFavorites();
      expect(favorites).toHaveLength(1);
      expect(favorites[0].id).toBe('UC_2');
    });

    it('se recupera de datos corruptos en AsyncStorage sin lanzar excepciones', async () => {
      await AsyncStorage.setItem(
        config.storageKeys.favoriteChannels,
        '{json_corrupto_invalido'
      );
      storage.resetMemoryCache();

      const favorites = await storage.getFavorites();
      expect(favorites).toEqual([]);
    });

    it('reordena automáticamente las suscripciones por arriba según la frecuencia al ver vídeos de cada canal', async () => {
      await storage.addFavorite({
        id: 'UC_A',
        name: 'Canal A',
        thumbnail: 'https://example.com/a.jpg',
      });
      await storage.addFavorite({
        id: 'UC_B',
        name: 'Canal B',
        thumbnail: 'https://example.com/b.jpg',
      });
      await storage.addFavorite({
        id: 'UC_C',
        name: 'Canal C',
        thumbnail: 'https://example.com/c.jpg',
      });

      // Vemos un vídeo del Canal C -> Canal C sube al primer puesto (watchCount: 1)
      await storage.recordVideoWatch(
        {
          id: 'vid_c1',
          title: 'Vídeo C1',
          thumbnail: 'https://example.com/vc1.jpg',
          channelId: 'UC_C',
          channelTitle: 'Canal C',
          publishedAt: '2026-10-08T10:00:00Z',
        },
        0,
        300,
        1000
      );

      let favorites = await storage.getFavorites();
      expect(favorites.map((c) => c.id)).toEqual(['UC_C', 'UC_A', 'UC_B']);
      expect(favorites[0].watchCount).toBe(1);

      // Vemos dos vídeos del Canal B -> Canal B pasa al primer puesto (watchCount: 2)
      await storage.recordVideoWatch(
        {
          id: 'vid_b1',
          title: 'Vídeo B1',
          thumbnail: 'https://example.com/vb1.jpg',
          channelId: 'UC_B',
          channelTitle: 'Canal B',
          publishedAt: '2026-10-08T10:00:00Z',
        },
        0,
        300,
        2000
      );
      await storage.recordVideoWatch(
        {
          id: 'vid_b2',
          title: 'Vídeo B2',
          thumbnail: 'https://example.com/vb2.jpg',
          channelId: 'UC_B',
          channelTitle: 'Canal B',
          publishedAt: '2026-10-08T11:00:00Z',
        },
        0,
        300,
        3000
      );

      storage.resetMemoryCache();
      favorites = await storage.getFavorites();
      expect(favorites.map((c) => c.id)).toEqual(['UC_B', 'UC_C', 'UC_A']);
      expect(favorites[0].watchCount).toBe(2);
      expect(favorites[1].watchCount).toBe(1);
    });
  });

  describe('Progreso de reproducción', () => {
    it('guarda y recupera el mapa de progreso de reproducción', async () => {
      const progressData = {
        video_abc: {
          position: 352,
          duration: 1200,
          updatedAt: 1700000000000,
        },
      };

      await storage.savePlaybackProgress(progressData);
      storage.resetMemoryCache();

      const allProgress = await storage.getPlaybackProgress();
      expect(allProgress.video_abc).toEqual({
        position: 352,
        duration: 1200,
        updatedAt: 1700000000000,
      });

      const single = await storage.getVideoProgress('video_abc');
      expect(single?.position).toBe(352);
      expect(single?.duration).toBe(1200);
    });

    it('no guarda progreso si el vídeo apenas ha comenzado (< minSecondsToSave)', async () => {
      const result = await storage.updateVideoProgress('video_short', 2, 600);
      expect(result).toBeNull();

      const stored = await storage.getVideoProgress('video_short');
      expect(stored).toBeNull();
    });

    it('marca el vídeo como completado cuando el usuario llega aproximadamente al final', async () => {
      const entry = await storage.updateVideoProgress('video_end', 1195, 1200);
      expect(entry).not.toBeNull();
      expect(entry?.completed).toBe(true);
      expect(entry?.position).toBe(1200);
    });
  });

  describe('Historial de reproducción (Watch History)', () => {
    it('registra los vídeos vistos, actualiza su minutaje y los ordena del más reciente al más antiguo', async () => {
      await storage.recordVideoWatch({
        id: 'vid_1',
        title: 'Primer Vídeo Visto',
        thumbnail: 'https://example.com/v1.jpg',
        channelId: 'UC_1',
        channelTitle: 'Canal 1',
        publishedAt: '2026-10-01T10:00:00Z',
        viewCount: 15400,
      });

      await storage.recordVideoWatch({
        id: 'vid_2',
        title: 'Segundo Vídeo Visto',
        thumbnail: 'https://example.com/v2.jpg',
        channelId: 'UC_2',
        channelTitle: 'Canal 2',
        publishedAt: '2026-10-02T10:00:00Z',
        viewCount: 93900,
      });

      // Actualiza el minutaje del primer vídeo y lo sincroniza con el historial
      await storage.updateVideoProgress('vid_1', 125, 600);

      storage.resetMemoryCache();
      const history = await storage.getWatchHistory();
      expect(history).toHaveLength(2);
      // vid_2 se abrió más recientemente
      expect(history[0].video.id).toBe('vid_2');
      expect(history[0].video.viewCount).toBe(93900);
      expect(history[1].video.id).toBe('vid_1');
      expect(history[1].position).toBe(125);
      expect(history[1].duration).toBe(600);
    });

    it('respeta el límite máximo configurable de vídeos en el historial (config.history.maxItems)', async () => {
      const max = config.history.maxItems;
      const items = Array.from({ length: max + 15 }, (_, idx) => ({
        video: {
          id: `hist_vid_${idx}`,
          title: `Vídeo ${idx}`,
          thumbnail: `https://example.com/${idx}.jpg`,
          channelId: 'UC_test',
          channelTitle: 'Canal Test',
          publishedAt: '2026-10-08T10:00:00Z',
        },
        watchedAt: 1700000000000 + idx * 1000,
        position: 30,
        duration: 300,
      }));

      await storage.saveWatchHistory(items);
      storage.resetMemoryCache();

      const saved = await storage.getWatchHistory();
      expect(saved).toHaveLength(max);
      // Debe conservar los más recientes (los de mayor watchedAt)
      expect(saved[0].video.id).toBe(`hist_vid_${max + 14}`);
    });
  });
});

