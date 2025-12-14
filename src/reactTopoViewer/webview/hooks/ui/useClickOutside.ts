/**
 * useClickOutside - Hook to detect clicks outside an element
 */
import { useEffect, RefObject } from 'react';

/**
 * Hook that calls a callback when clicking outside the referenced element
 */
export function useClickOutside(
  ref: RefObject<HTMLElement>,
  callback: () => void,
  enabled: boolean = true
): void {
  useEffect(() => {
    if (!enabled) return;

    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        callback();
      }
    };

    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [ref, callback, enabled]);
}
