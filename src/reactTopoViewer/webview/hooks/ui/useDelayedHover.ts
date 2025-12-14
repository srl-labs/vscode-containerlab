/**
 * Hook for delayed hover state with timeout
 */
import { useState, useRef, useCallback } from 'react';

export interface UseDelayedHoverReturn {
  isHovered: boolean;
  onEnter: () => void;
  onLeave: () => void;
}

/**
 * Hook that manages hover state with a delay before unhover
 * Useful for showing/hiding UI elements that shouldn't disappear immediately
 */
export function useDelayedHover(delay: number = 150): UseDelayedHoverReturn {
  const [isHovered, setIsHovered] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onEnter = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setIsHovered(true);
  }, []);

  const onLeave = useCallback(() => {
    timeoutRef.current = setTimeout(() => setIsHovered(false), delay);
  }, [delay]);

  return { isHovered, onEnter, onLeave };
}
