/**
 * DOM Interaction Hooks - Consolidated hooks for common DOM interactions
 * Includes: useEscapeKey, useClickOutside, useDelayedHover
 */
import type { RefObject } from "react";
import { useEffect, useState, useRef, useCallback } from "react";

// ============================================================================
// useEscapeKey - Hook for handling ESC key to close modals/panels
// ============================================================================

/**
 * Hook that calls onClose when ESC key is pressed while isOpen is true
 */
export function useEscapeKey(isOpen: boolean, onClose: () => void): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);
}

// ============================================================================
// useClickOutside - Hook to detect clicks outside an element
// ============================================================================

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

    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [ref, callback, enabled]);
}

// ============================================================================
// useDelayedHover - Hook for delayed hover state with timeout
// ============================================================================

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
