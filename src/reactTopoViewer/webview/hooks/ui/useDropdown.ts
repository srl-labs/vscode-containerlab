/**
 * Dropdown hooks for various dropdown patterns in the UI
 * Consolidates: simple toggle, hover-based with filter, and keyboard navigation
 */
import type React from "react";
import { useState, useRef, useEffect, useCallback } from "react";

// ============================================================================
// Simple Toggle Dropdown (used by Navbar)
// ============================================================================

export interface UseDropdownReturn {
  isOpen: boolean;
  toggle: () => void;
  close: () => void;
  ref: React.RefObject<HTMLDivElement | null>;
}

/**
 * Simple dropdown state hook with click-outside detection
 * Used by navbar dropdowns and similar components
 */
export function useDropdown(): UseDropdownReturn {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && event.target instanceof Node && !ref.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    const handlePaneClick = () => {
      setIsOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("topoviewer:pane-click", handlePaneClick as EventListener);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("topoviewer:pane-click", handlePaneClick as EventListener);
    };
  }, []);

  return {
    isOpen,
    toggle: () => setIsOpen((prev) => !prev),
    close: () => setIsOpen(false),
    ref
  };
}

// ============================================================================
// Hover-based Dropdown with Filter (used by FloatingPanel)
// ============================================================================

/**
 * Hook for dropdown state management with hover behavior
 * Used by toolbar dropdown menus
 */
export function useDropdownState(disabled: boolean) {
  const [isOpen, setIsOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetState = useCallback(() => {
    setIsOpen(false);
    setFilter("");
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
    isOpen,
    filter,
    focusedIndex,
    setFilter,
    setFocusedIndex,
    resetState,
    handleMouseEnter,
    handleMouseLeave
  };
}

/**
 * Hook for keyboard navigation in toolbar dropdowns
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

  return useCallback(
    (e: React.KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setFocusedIndex((prev) => Math.min(prev + 1, itemCount - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocusedIndex((prev) => Math.max(prev - 1, -1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (focusedIndex >= 0 && focusedIndex < itemCount) onSelectFocused();
      } else if (e.key === "Escape") {
        onEscape();
      }
    },
    [isOpen, itemCount, focusedIndex, setFocusedIndex, onSelectFocused, onEscape]
  );
}

/**
 * Focus input when dropdown opens
 */
export function useFocusOnOpen(
  isOpen: boolean,
  inputRef: React.RefObject<HTMLInputElement | null>
) {
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen, inputRef]);
}

// ============================================================================
// Form Field Dropdown Keyboard Navigation
// ============================================================================

export interface DropdownKeyboardActions {
  setIsOpen: (open: boolean) => void;
  setHighlightedIndex: (index: number) => void;
  onSelect: (index: number) => void;
  onCommit: () => void;
}

export interface DropdownKeyboardState {
  highlightedIndex: number;
  optionsLength: number;
  allowFreeText: boolean;
}

/**
 * Hook that provides keyboard event handler for dropdown navigation
 * Used by form field dropdowns (FilterableDropdown, etc.)
 */
export function useDropdownKeyboard(
  state: DropdownKeyboardState,
  actions: DropdownKeyboardActions
): (e: React.KeyboardEvent) => void {
  const { highlightedIndex, optionsLength, allowFreeText } = state;
  const { setIsOpen, setHighlightedIndex, onSelect, onCommit } = actions;

  return useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setIsOpen(true);
          setHighlightedIndex(Math.min(highlightedIndex + 1, optionsLength - 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          setIsOpen(true);
          setHighlightedIndex(Math.max(highlightedIndex - 1, 0));
          break;
        case "Enter":
          e.preventDefault();
          if (highlightedIndex >= 0) {
            onSelect(highlightedIndex);
          } else if (allowFreeText) {
            onCommit();
            setIsOpen(false);
          }
          break;
        case "Escape":
          setIsOpen(false);
          setHighlightedIndex(-1);
          break;
        case "Tab":
          onCommit();
          setIsOpen(false);
          break;
      }
    },
    [
      highlightedIndex,
      optionsLength,
      allowFreeText,
      setIsOpen,
      setHighlightedIndex,
      onSelect,
      onCommit
    ]
  );
}
