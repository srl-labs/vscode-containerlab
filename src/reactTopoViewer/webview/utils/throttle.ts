/**
 * Performance utilities for throttling and debouncing
 */

/**
 * Creates a throttled function that only invokes the provided function at most once
 * per specified time period. Uses requestAnimationFrame for smooth updates.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function throttle<T extends (...args: any[]) => void>(
  func: T,
  limit: number
): T {
  let inThrottle = false;
  let lastArgs: Parameters<T> | null = null;

  const throttled = (...args: Parameters<T>) => {
    lastArgs = args;
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => {
        inThrottle = false;
        // Call with last args if there were updates during throttle period
        if (lastArgs) {
          func(...lastArgs);
          lastArgs = null;
        }
      }, limit);
    }
  };

  return throttled as T;
}

/**
 * Creates a throttled function using requestAnimationFrame.
 * Ensures updates are synchronized with the browser's render cycle.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function rafThrottle<T extends (...args: any[]) => void>(
  func: T
): T & { cancel: () => void } {
  let rafId: number | null = null;
  let lastArgs: Parameters<T> | null = null;

  const throttled = (...args: Parameters<T>) => {
    lastArgs = args;
    if (rafId === null) {
      rafId = window.requestAnimationFrame(() => {
        if (lastArgs) {
          func(...lastArgs);
          lastArgs = null;
        }
        rafId = null;
      });
    }
  };

  throttled.cancel = () => {
    if (rafId !== null) {
      window.cancelAnimationFrame(rafId);
      rafId = null;
    }
  };

  return throttled as T & { cancel: () => void };
}
