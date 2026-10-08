const mockStorageStore = new Map<string, string>();

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (key: string) => {
      return mockStorageStore.has(key) ? mockStorageStore.get(key)! : null;
    }),
    setItem: jest.fn(async (key: string, value: string) => {
      mockStorageStore.set(key, value);
    }),
    removeItem: jest.fn(async (key: string) => {
      mockStorageStore.delete(key);
    }),
    clear: jest.fn(async () => {
      mockStorageStore.clear();
    }),
  },
}));

jest.mock('expo-keep-awake', () => ({
  activateKeepAwakeAsync: jest.fn(async () => {}),
  deactivateKeepAwake: jest.fn(async () => {}),
  useKeepAwake: jest.fn(),
}));

