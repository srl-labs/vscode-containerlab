/**
 * FilterableDropdown - A searchable dropdown component with keyboard navigation
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';

export interface FilterableDropdownOption {
  value: string;
  label: string;
  icon?: string;
}

interface FilterableDropdownProps {
  id: string;
  options: FilterableDropdownOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  allowFreeText?: boolean;
  className?: string;
  disabled?: boolean;
  renderOption?: (option: FilterableDropdownOption) => React.ReactNode;
  menuClassName?: string;
}

function findBestMatch(text: string, options: FilterableDropdownOption[]): FilterableDropdownOption | null {
  if (!text.trim()) return null;
  const lower = text.toLowerCase();
  return options.find(o => o.value.toLowerCase() === lower || o.label.toLowerCase() === lower)
    || options.find(o => o.value.toLowerCase().startsWith(lower) || o.label.toLowerCase().startsWith(lower))
    || options.find(o => o.value.toLowerCase().includes(lower) || o.label.toLowerCase().includes(lower))
    || null;
}

function filterOptions(options: FilterableDropdownOption[], filterText: string): FilterableDropdownOption[] {
  const lower = filterText.toLowerCase();
  return options.filter(o => o.label.toLowerCase().includes(lower) || o.value.toLowerCase().includes(lower));
}

const DropdownItem: React.FC<{
  option: FilterableDropdownOption; isHighlighted: boolean; onSelect: () => void;
  onMouseEnter: () => void; renderOption?: (o: FilterableDropdownOption) => React.ReactNode;
}> = ({ option, isHighlighted, onSelect, onMouseEnter, renderOption }) => (
  <div
    data-dropdown-item
    className={`block cursor-pointer px-3 py-2 ${isHighlighted ? 'bg-[var(--vscode-list-activeSelectionBackground)]' : 'hover:bg-[var(--vscode-list-hoverBackground)]'}`}
    style={{ color: 'var(--vscode-dropdown-foreground)' }}
    onMouseEnter={onMouseEnter}
    onMouseDown={(e) => { e.preventDefault(); onSelect(); }}
  >
    {renderOption ? renderOption(option) : option.label}
  </div>
);

function useDropdownState(value: string) {
  const [isOpen, setIsOpen] = useState(false);
  const [filterText, setFilterText] = useState(value);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [isFiltering, setIsFiltering] = useState(false); // Track if user is actively filtering

  useEffect(() => { setFilterText(value); setIsFiltering(false); }, [value]);
  // Close dropdown when window loses focus or visibility changes
  useEffect(() => {
    const closeDropdown = () => { setIsOpen(false); setIsFiltering(false); };
    window.addEventListener('blur', closeDropdown);
    document.addEventListener('visibilitychange', closeDropdown);
    return () => {
      window.removeEventListener('blur', closeDropdown);
      document.removeEventListener('visibilitychange', closeDropdown);
    };
  }, []);
  return { isOpen, setIsOpen, filterText, setFilterText, highlightedIndex, setHighlightedIndex, isFiltering, setIsFiltering };
}

// eslint-disable-next-line aggregate-complexity/aggregate-complexity
export const FilterableDropdown: React.FC<FilterableDropdownProps> = ({
  id, options, value, onChange, placeholder = 'Type to filter...', allowFreeText = false,
  className = '', disabled = false, renderOption, menuClassName = 'max-h-48'
}) => {
  const { isOpen, setIsOpen, filterText, setFilterText, highlightedIndex, setHighlightedIndex, isFiltering, setIsFiltering } = useDropdownState(value);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Only filter when user is actively typing, otherwise show all options
  const filteredOptions = isFiltering ? filterOptions(options, filterText) : options;

  const commitValue = useCallback(() => {
    if (allowFreeText) {
      if (filterText !== value) { onChange(filterText); }
      return;
    }
    const match = findBestMatch(filterText, options);
    if (match) {
      setFilterText(match.value);
      if (match.value !== value) { onChange(match.value); }
    } else {
      setFilterText(value);
    }
  }, [filterText, value, allowFreeText, options, onChange]);

  const handleSelect = useCallback((option: FilterableDropdownOption) => {
    setFilterText(option.value); onChange(option.value); setIsOpen(false); setHighlightedIndex(-1); setIsFiltering(false);
  }, [onChange, setFilterText, setIsOpen, setHighlightedIndex, setIsFiltering]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setIsOpen(true); setHighlightedIndex(Math.min(highlightedIndex + 1, filteredOptions.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setIsOpen(true); setHighlightedIndex(Math.max(highlightedIndex - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (highlightedIndex >= 0 && filteredOptions[highlightedIndex]) handleSelect(filteredOptions[highlightedIndex]); else if (allowFreeText) { commitValue(); setIsOpen(false); } }
    else if (e.key === 'Escape') { setIsOpen(false); setHighlightedIndex(-1); }
    else if (e.key === 'Tab') { commitValue(); setIsOpen(false); }
  }, [filteredOptions, highlightedIndex, setIsOpen, setHighlightedIndex, handleSelect, commitValue, allowFreeText]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => { if (containerRef.current && !containerRef.current.contains(e.target as Node)) { commitValue(); setIsOpen(false); setIsFiltering(false); } };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [commitValue, setIsOpen, setIsFiltering]);

  useEffect(() => { if (highlightedIndex >= 0 && menuRef.current) (menuRef.current.querySelectorAll('[data-dropdown-item]')[highlightedIndex] as HTMLElement)?.scrollIntoView({ block: 'nearest' }); }, [highlightedIndex]);

  const handleBlur = useCallback(() => { setTimeout(() => { if (!containerRef.current?.contains(document.activeElement)) { commitValue(); setIsOpen(false); setIsFiltering(false); } }, 150); }, [commitValue, setIsOpen, setIsFiltering]);

  return (
    <div ref={containerRef} className={`relative w-full ${className}`}>
      <div className="relative">
        <input ref={inputRef} id={id} type="text" className="input-field w-full pr-8" placeholder={placeholder} value={filterText}
          onChange={(e) => { setFilterText(e.target.value); setIsOpen(true); setHighlightedIndex(-1); setIsFiltering(true); }}
          onFocus={() => setIsOpen(true)} onBlur={handleBlur} onKeyDown={handleKeyDown} disabled={disabled} autoComplete="off" />
        <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--vscode-foreground)] opacity-60 hover:opacity-100"
          onClick={() => { setIsOpen(!isOpen); inputRef.current?.focus(); }} tabIndex={-1} disabled={disabled}>
          <i className={`fas fa-angle-${isOpen ? 'up' : 'down'}`} />
        </button>
      </div>
      {isOpen && filteredOptions.length > 0 && (
        <div ref={menuRef} className={`absolute left-0 top-full z-[60] mt-1 w-full overflow-y-auto rounded border border-[var(--vscode-dropdown-border)] bg-[var(--vscode-dropdown-background)] shadow-lg ${menuClassName}`}>
          {filteredOptions.map((option, index) => (
            <DropdownItem key={option.value} option={option} isHighlighted={index === highlightedIndex}
              onSelect={() => handleSelect(option)} onMouseEnter={() => setHighlightedIndex(index)} renderOption={renderOption} />
          ))}
        </div>
      )}
      {isOpen && filteredOptions.length === 0 && filterText && (
        <div className="absolute left-0 top-full z-[60] mt-1 w-full rounded border border-[var(--vscode-dropdown-border)] bg-[var(--vscode-dropdown-background)] px-3 py-2 shadow-lg" style={{ color: 'var(--vscode-foreground)', opacity: 0.6 }}>
          {allowFreeText ? `Use "${filterText}" as custom value` : 'No matches found'}
        </div>
      )}
    </div>
  );
};
