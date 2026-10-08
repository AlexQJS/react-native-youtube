import { NativeModules, Platform } from 'react-native';

export type LockResult = 'LOCKED_ADMIN' | 'LOCKED_FALLBACK' | 'LOCKED_SIMULATED';

interface NativeDeviceLockModule {
  isDeviceAdminActive?: () => Promise<boolean>;
  requestDeviceAdmin?: () => Promise<boolean>;
  lockDevice?: () => Promise<'LOCKED_ADMIN' | 'LOCKED_FALLBACK'>;
  restoreScreenState?: () => Promise<boolean>;
}

function getNativeModule(): NativeDeviceLockModule | undefined {
  return NativeModules?.DeviceLockModule as NativeDeviceLockModule | undefined;
}

export const deviceLock = {
  /**
   * Comprueba si el permiso de Administrador del dispositivo está activo en Android
   * para poder bloquear la pantalla directamente con DevicePolicyManager.lockNow().
   */
  async isDeviceAdminActive(): Promise<boolean> {
    if (Platform.OS !== 'android') {
      return false;
    }
    const nativeMod = getNativeModule();
    if (!nativeMod?.isDeviceAdminActive) {
      return false;
    }
    try {
      return Boolean(await nativeMod.isDeviceAdminActive());
    } catch {
      return false;
    }
  },

  /**
   * Solicita al usuario activar el permiso de Administrador del dispositivo
   * para bloquear el móvil automáticamente al finalizar el Sleep Mode.
   */
  async requestDeviceAdmin(): Promise<boolean> {
    if (Platform.OS !== 'android') {
      return false;
    }
    const nativeMod = getNativeModule();
    if (!nativeMod?.requestDeviceAdmin) {
      return false;
    }
    try {
      return Boolean(await nativeMod.requestDeviceAdmin());
    } catch {
      return false;
    }
  },

  /**
   * Bloquea la pantalla del dispositivo móvil cuando finaliza el Sleep Mode.
   * Si el permiso de administrador está activo en Android, bloquea el teléfono de inmediato;
   * en caso contrario, libera el bloqueo de pantalla activa, atenúa el brillo y envía la app a segundo plano.
   */
  async lockDeviceScreen(): Promise<LockResult> {
    const nativeMod = getNativeModule();
    if (Platform.OS === 'android' && nativeMod?.lockDevice) {
      try {
        return await nativeMod.lockDevice();
      } catch {
        return 'LOCKED_FALLBACK';
      }
    }
    return 'LOCKED_SIMULATED';
  },

  /**
   * Restaura el estado y brillo normal de la pantalla al reanudar la visualización.
   */
  async restoreScreenState(): Promise<boolean> {
    const nativeMod = getNativeModule();
    if (Platform.OS === 'android' && nativeMod?.restoreScreenState) {
      try {
        return Boolean(await nativeMod.restoreScreenState());
      } catch {
        return false;
      }
    }
    return true;
  },
};
