/**
 * Dropdown state management hooks for floating panel dropdowns
 */
import type React from 'react';
import { useState, useRef, useEffect, useCallback } from 'react';

/**
 * Hook for dropdown state management with hover behavior
 * Used by floating panel dropdown menus
 */
export function useDropdownState(disabled: boolean) {
  const [isOpen, setIsOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetState = useCallback(() => {
    setIsOpen(false);
    setFilter('');
    setFocusedIndex(-1);
  }, []);

  const handleMouseEnter = useCallback(() => {
    if (disabled) return;
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    setIsOpen(true);
  }, [disabled]);

  const handleMouseLeave = useCallback(() => {
    closeTimeoutRef.current = setTimeout(resetState, 150);
  }, [resetState]);

  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
    };
  }, []);

  return {
    isOpen, filter, focusedIndex,
    setFilter, setFocusedIndex,
    resetState, handleMouseEnter, handleMouseLeave
  };
}

/**
 * Hook for keyboard navigation in floating panel dropdowns
 * Different from useDropdownKeyboard which is for form field dropdowns
 */
interface FloatingDropdownKeyboardParams {
  isOpen: boolean;
  itemCount: number;
  focusedIndex: number;
  setFocusedIndex: React.Dispatch<React.SetStateAction<number>>;
  onSelectFocused: () => void;
  onEscape: () => void;
}

export function useFloatingDropdownKeyboard(params: FloatingDropdownKeyboardParams) {
  const { isOpen, itemCount, focusedIndex, setFocusedIndex, onSelectFocused, onEscape } = params;

  return useCallback((e: React.KeyboardEvent) => {
    if (!isOpen) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusedIndex(prev => Math.min(prev + 1, itemCount - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusedIndex(prev => Math.max(prev - 1, -1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (focusedIndex >= 0 && focusedIndex < itemCount) onSelectFocused();
    } else if (e.key === 'Escape') {
      onEscape();
    }
  }, [isOpen, itemCount, focusedIndex, setFocusedIndex, onSelectFocused, onEscape]);
}

/**
 * Focus input when dropdown opens
 */
export function useFocusOnOpen(isOpen: boolean, inputRef: React.RefObject<HTMLInputElement | null>) {
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen, inputRef]);
}
