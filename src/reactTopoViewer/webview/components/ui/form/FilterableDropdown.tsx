/**
 * FilterableDropdown - A searchable dropdown component with keyboard navigation
 */
import React from "react";

import type { FilterableDropdownOption as _FilterableDropdownOption } from "../../../hooks/ui/useFilterableDropdown";
import { useFilterableDropdown } from "../../../hooks/ui/useFilterableDropdown";

// Re-export type (import then export pattern for non-index files)
export type FilterableDropdownOption = _FilterableDropdownOption;

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

const DropdownItem: React.FC<{
  option: FilterableDropdownOption;
  isHighlighted: boolean;
  onSelect: () => void;
  onMouseEnter: () => void;
  renderOption?: (o: FilterableDropdownOption) => React.ReactNode;
}> = ({ option, isHighlighted, onSelect, onMouseEnter, renderOption }) => (
  <div
    data-dropdown-item
    className={`block cursor-pointer px-3 py-2 ${isHighlighted ? "bg-[var(--vscode-list-activeSelectionBackground)]" : "hover:bg-[var(--vscode-list-hoverBackground)]"}`}
    style={{ color: "var(--vscode-dropdown-foreground)" }}
    onMouseEnter={onMouseEnter}
    onMouseDown={(e) => {
      e.preventDefault();
      onSelect();
    }}
  >
    {renderOption ? renderOption(option) : option.label}
  </div>
);

const DropdownMenu: React.FC<{
  menuRef: React.RefObject<HTMLDivElement | null>;
  menuClassName: string;
  options: FilterableDropdownOption[];
  highlightedIndex: number;
  onSelect: (option: FilterableDropdownOption) => void;
  onHighlight: (index: number) => void;
  renderOption?: (option: FilterableDropdownOption) => React.ReactNode;
}> = ({
  menuRef,
  menuClassName,
  options,
  highlightedIndex,
  onSelect,
  onHighlight,
  renderOption
}) => (
  <div
    ref={menuRef}
    className={`absolute left-0 top-full z-[60] mt-1 w-full overflow-y-auto rounded-sm border border-[var(--vscode-dropdown-border)] bg-[var(--vscode-dropdown-background)] shadow-lg ${menuClassName}`}
  >
    {options.map((option, index) => (
      <DropdownItem
        key={option.value}
        option={option}
        isHighlighted={index === highlightedIndex}
        onSelect={() => onSelect(option)}
        onMouseEnter={() => onHighlight(index)}
        renderOption={renderOption}
      />
    ))}
  </div>
);

const EmptyState: React.FC<{ filterText: string; allowFreeText: boolean }> = ({
  filterText,
  allowFreeText
}) => (
  <div
    className="absolute left-0 top-full z-[60] mt-1 w-full rounded-sm border border-[var(--vscode-dropdown-border)] bg-[var(--vscode-dropdown-background)] px-3 py-2 shadow-lg"
    style={{ color: "var(--vscode-foreground)", opacity: 0.6 }}
  >
    {allowFreeText ? `Use "${filterText}" as custom value` : "No matches found"}
  </div>
);

export const FilterableDropdown: React.FC<FilterableDropdownProps> = ({
  id,
  options,
  value,
  onChange,
  placeholder = "Type to filter...",
  allowFreeText = false,
  className = "",
  disabled = false,
  renderOption,
  menuClassName = "max-h-48"
}) => {
  const dropdown = useFilterableDropdown({ options, value, onChange, allowFreeText });
  const { containerRef, inputRef, menuRef, isOpen, filterText, highlightedIndex, filteredOptions } =
    dropdown;
  const {
    handleSelect,
    handleKeyDown,
    handleBlur,
    handleInputChange,
    handleToggle,
    handleFocus,
    setHighlightedIndex
  } = dropdown;

  return (
    <div ref={containerRef} className={`relative w-full ${className}`}>
      <div className="relative">
        <input
          ref={inputRef}
          id={id}
          type="text"
          className="input-field w-full pr-8"
          placeholder={placeholder}
          value={filterText}
          onChange={handleInputChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          autoComplete="off"
        />
        <button
          type="button"
          className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--vscode-foreground)] opacity-60 hover:opacity-100"
          onClick={handleToggle}
          tabIndex={-1}
          disabled={disabled}
        >
          <i className={`fas fa-angle-${isOpen ? "up" : "down"}`} />
        </button>
      </div>
      {isOpen && filteredOptions.length > 0 && (
        <DropdownMenu
          menuRef={menuRef}
          menuClassName={menuClassName}
          options={filteredOptions}
          highlightedIndex={highlightedIndex}
          onSelect={handleSelect}
          onHighlight={setHighlightedIndex}
          renderOption={renderOption}
        />
      )}
      {isOpen && filteredOptions.length === 0 && filterText && (
        <EmptyState filterText={filterText} allowFreeText={allowFreeText} />
      )}
    </div>
  );
};
