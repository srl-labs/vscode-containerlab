/**
 * useDropdownKeyboard - Hook to handle keyboard navigation in dropdowns
 */
import React, { useCallback } from 'react';

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
 */
export function useDropdownKeyboard(
  state: DropdownKeyboardState,
  actions: DropdownKeyboardActions
): (e: React.KeyboardEvent) => void {
  const { highlightedIndex, optionsLength, allowFreeText } = state;
  const { setIsOpen, setHighlightedIndex, onSelect, onCommit } = actions;

  return useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setIsOpen(true);
        setHighlightedIndex(Math.min(highlightedIndex + 1, optionsLength - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setIsOpen(true);
        setHighlightedIndex(Math.max(highlightedIndex - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightedIndex >= 0) {
          onSelect(highlightedIndex);
        } else if (allowFreeText) {
          onCommit();
          setIsOpen(false);
        }
        break;
      case 'Escape':
        setIsOpen(false);
        setHighlightedIndex(-1);
        break;
      case 'Tab':
        onCommit();
        setIsOpen(false);
        break;
    }
  }, [highlightedIndex, optionsLength, allowFreeText, setIsOpen, setHighlightedIndex, onSelect, onCommit]);
}
