/**
 * Crea una versión con debounce de una función para evitar llamadas excesivas.
 */
export function createDebounce<T extends (...args: any[]) => void>(
  fn: T,
  delayMs: number
): {
  call: (...args: Parameters<T>) => void;
  cancel: () => void;
} {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const cancel = () => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };

  const call = (...args: Parameters<T>) => {
    cancel();
    timeoutId = setTimeout(() => {
      timeoutId = null;
      fn(...args);
    }, delayMs);
  };

  return { call, cancel };
}
