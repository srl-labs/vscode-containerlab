/**
 * useFilterableDropdown - Hook to manage filterable dropdown state and behavior
 */
import type React from "react";
import { useState, useRef, useEffect, useCallback, useMemo } from "react";

import { useClickOutside } from "./useDomInteractions";
import { useDropdownKeyboard } from "./useDropdown";

export interface FilterableDropdownOption {
  value: string;
  label: string;
  icon?: string;
}

interface UseFilterableDropdownProps {
  options: FilterableDropdownOption[];
  value: string;
  onChange: (value: string) => void;
  allowFreeText: boolean;
}

/**
 * Find the best matching option for the given text
 */
function findBestMatch(
  text: string,
  options: FilterableDropdownOption[]
): FilterableDropdownOption | null {
  if (!text.trim()) return null;
  const lower = text.toLowerCase();
  const exactMatch = options.find(
    (o) => o.value.toLowerCase() === lower || o.label.toLowerCase() === lower
  );
  if (exactMatch) return exactMatch;
  const startsWithMatch = options.find(
    (o) => o.value.toLowerCase().startsWith(lower) || o.label.toLowerCase().startsWith(lower)
  );
  if (startsWithMatch) return startsWithMatch;
  return (
    options.find(
      (o) => o.value.toLowerCase().includes(lower) || o.label.toLowerCase().includes(lower)
    ) ?? null
  );
}

/**
 * Filter options based on filter text
 */
function filterOptions(
  options: FilterableDropdownOption[],
  filterText: string
): FilterableDropdownOption[] {
  const lower = filterText.toLowerCase();
  return options.filter(
    (o) => o.label.toLowerCase().includes(lower) || o.value.toLowerCase().includes(lower)
  );
}

/**
 * Resolve the commit value based on current state
 */
function resolveCommitValue(
  filterText: string,
  currentValue: string,
  options: FilterableDropdownOption[],
  allowFreeText: boolean
): { newFilterText: string; newValue: string | null } {
  if (allowFreeText) {
    return { newFilterText: filterText, newValue: filterText !== currentValue ? filterText : null };
  }
  const match = findBestMatch(filterText, options);
  if (match) {
    return {
      newFilterText: match.value,
      newValue: match.value !== currentValue ? match.value : null
    };
  }
  return { newFilterText: currentValue, newValue: null };
}

/**
 * Hook to manage dropdown open/close state
 */
function useDropdownOpenState(value: string) {
  const [isOpen, setIsOpen] = useState(false);
  const [filterText, setFilterText] = useState(value);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [isFiltering, setIsFiltering] = useState(false);

  useEffect(() => {
    setFilterText(value);
    setIsFiltering(false);
  }, [value]);

  useEffect(() => {
    const closeDropdown = () => {
      setIsOpen(false);
      setIsFiltering(false);
    };
    window.addEventListener("blur", closeDropdown);
    document.addEventListener("visibilitychange", closeDropdown);
    return () => {
      window.removeEventListener("blur", closeDropdown);
      document.removeEventListener("visibilitychange", closeDropdown);
    };
  }, []);

  return {
    isOpen,
    setIsOpen,
    filterText,
    setFilterText,
    highlightedIndex,
    setHighlightedIndex,
    isFiltering,
    setIsFiltering
  };
}

/**
 * Hook to manage commit behavior
 */
function useCommitValue(
  filterText: string,
  value: string,
  options: FilterableDropdownOption[],
  allowFreeText: boolean,
  onChange: (value: string) => void,
  setFilterText: (text: string) => void
) {
  return useCallback(() => {
    const result = resolveCommitValue(filterText, value, options, allowFreeText);
    setFilterText(result.newFilterText);
    if (result.newValue !== null) {
      onChange(result.newValue);
    }
  }, [filterText, value, options, allowFreeText, onChange, setFilterText]);
}

/**
 * Hook to manage selection behavior
 */
function useSelectionHandlers(
  filteredOptions: FilterableDropdownOption[],
  onChange: (value: string) => void,
  setFilterText: (text: string) => void,
  setIsOpen: (open: boolean) => void,
  setHighlightedIndex: (index: number) => void,
  setIsFiltering: (filtering: boolean) => void
) {
  const handleSelect = useCallback(
    (option: FilterableDropdownOption) => {
      setFilterText(option.value);
      onChange(option.value);
      setIsOpen(false);
      setHighlightedIndex(-1);
      setIsFiltering(false);
    },
    [onChange, setFilterText, setIsOpen, setHighlightedIndex, setIsFiltering]
  );

  const handleSelectByIndex = useCallback(
    (index: number) => {
      if (index < 0 || index >= filteredOptions.length) return;
      handleSelect(filteredOptions[index]);
    },
    [filteredOptions, handleSelect]
  );

  return { handleSelect, handleSelectByIndex };
}

export interface UseFilterableDropdownReturn {
  containerRef: React.RefObject<HTMLDivElement | null>;
  inputRef: React.RefObject<HTMLInputElement | null>;
  menuRef: React.RefObject<HTMLDivElement | null>;
  isOpen: boolean;
  filterText: string;
  highlightedIndex: number;
  filteredOptions: FilterableDropdownOption[];
  handleSelect: (option: FilterableDropdownOption) => void;
  handleKeyDown: (e: React.KeyboardEvent) => void;
  handleBlur: () => void;
  handleInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleToggle: () => void;
  handleFocus: () => void;
  setHighlightedIndex: (index: number) => void;
}

/**
 * Main hook for filterable dropdown behavior
 */
export function useFilterableDropdown({
  options,
  value,
  onChange,
  allowFreeText
}: UseFilterableDropdownProps): UseFilterableDropdownReturn {
  const state = useDropdownOpenState(value);
  const {
    isOpen,
    setIsOpen,
    filterText,
    setFilterText,
    highlightedIndex,
    setHighlightedIndex,
    isFiltering,
    setIsFiltering
  } = state;

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const filteredOptions = useMemo(
    () => (isFiltering ? filterOptions(options, filterText) : options),
    [isFiltering, options, filterText]
  );

  const commitValue = useCommitValue(
    filterText,
    value,
    options,
    allowFreeText,
    onChange,
    setFilterText
  );
  const { handleSelect, handleSelectByIndex } = useSelectionHandlers(
    filteredOptions,
    onChange,
    setFilterText,
    setIsOpen,
    setHighlightedIndex,
    setIsFiltering
  );

  const handleKeyDown = useDropdownKeyboard(
    { highlightedIndex, optionsLength: filteredOptions.length, allowFreeText },
    { setIsOpen, setHighlightedIndex, onSelect: handleSelectByIndex, onCommit: commitValue }
  );

  const handleClickOutside = useCallback(() => {
    commitValue();
    setIsOpen(false);
    setIsFiltering(false);
  }, [commitValue, setIsOpen, setIsFiltering]);

  useClickOutside(containerRef, handleClickOutside, true);

  useEffect(() => {
    if (highlightedIndex >= 0 && menuRef.current) {
      const item = menuRef.current
        .querySelectorAll<HTMLElement>("[data-dropdown-item]")
        .item(highlightedIndex);
      item.scrollIntoView({ block: "nearest" });
    }
  }, [highlightedIndex]);

  const handleBlur = useCallback(() => {
    setTimeout(() => {
      const container = containerRef.current;
      if (container === null || !container.contains(document.activeElement)) {
        commitValue();
        setIsOpen(false);
        setIsFiltering(false);
      }
    }, 150);
  }, [commitValue, setIsOpen, setIsFiltering]);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setFilterText(e.target.value);
      setIsOpen(true);
      setHighlightedIndex(-1);
      setIsFiltering(true);
    },
    [setFilterText, setIsOpen, setHighlightedIndex, setIsFiltering]
  );

  const handleToggle = useCallback(() => {
    setIsOpen(!isOpen);
    inputRef.current?.focus();
  }, [isOpen, setIsOpen]);

  const handleFocus = useCallback(() => setIsOpen(true), [setIsOpen]);

  return {
    containerRef,
    inputRef,
    menuRef,
    isOpen,
    filterText,
    highlightedIndex,
    filteredOptions,
    handleSelect,
    handleKeyDown,
    handleBlur,
    handleInputChange,
    handleToggle,
    handleFocus,
    setHighlightedIndex
  };
}
