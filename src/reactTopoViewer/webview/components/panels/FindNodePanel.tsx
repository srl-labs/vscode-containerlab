/**
 * FindNodePanel - Search/find nodes in the topology
 * Migrated from legacy TopoViewer viewport-drawer-topology-overview.html
 */
import React, { useState, useEffect, useRef, useCallback } from "react";

import { BasePanel } from "../shared/editor/BasePanel";

interface FindNodePanelProps {
  isVisible: boolean;
  onClose: () => void;
  cyCompat: null;
}

/** Creates a wildcard filter regex */
function createWildcardFilter(trimmed: string): (value: string) => boolean {
  const regex = new RegExp(
    "^" +
      trimmed
        .split("*")
        .map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
        .join(".*") +
      "$",
    "i"
  );
  return (value: string) => regex.test(value);
}

/** Creates a prefix filter (starts with +) */
function createPrefixFilter(trimmed: string): (value: string) => boolean {
  const prefix = trimmed.slice(1).toLowerCase();
  return (value: string) => value.toLowerCase().startsWith(prefix);
}

/** Creates a contains filter (default) */
function createContainsFilter(lower: string): (value: string) => boolean {
  return (value: string) => value.toLowerCase().includes(lower);
}

/**
 * Creates a filter function for flexible string matching
 * Supports wildcards (*), prefix matching (+), and case-insensitive search
 */
function createFilter(pattern: string): (value: string) => boolean {
  const trimmed = pattern.trim();
  if (!trimmed) return () => true;
  if (trimmed.includes("*")) return createWildcardFilter(trimmed);
  if (trimmed.startsWith("+")) return createPrefixFilter(trimmed);
  return createContainsFilter(trimmed.toLowerCase());
}

/** Formats the search result message */
function formatResultMessage(count: number): string {
  if (count === 0) return "No nodes found";
  const plural = count === 1 ? "" : "s";
  return `Found ${count} node${plural}`;
}

/** Component to display search result status */
const SearchResultStatus: React.FC<{ count: number }> = ({ count }) => {
  const colorClass = count > 0 ? "text-green-500" : "text-orange-500";
  return (
    <span className={`text-sm ${colorClass}`} data-testid="find-node-result">
      {formatResultMessage(count)}
    </span>
  );
};

/** Search nodes - disabled during ReactFlow migration */
function searchNodes(_cyCompat: null, _searchTerm: string): number {
  // Disabled during ReactFlow migration
  // TODO: Use ReactFlow's getNodes() for searching and fitBounds for centering
  void createFilter;
  return 0;
}

/** Hook for panel focus management */
function usePanelFocus(isVisible: boolean, inputRef: React.RefObject<HTMLInputElement | null>) {
  useEffect(() => {
    if (isVisible && inputRef.current) {
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 50);
    }
  }, [isVisible, inputRef]);
}

/** Hook for search state management */
function useSearchState(cyCompat: null, isVisible: boolean) {
  const [searchTerm, setSearchTerm] = useState("");
  const [matchCount, setMatchCount] = useState<number | null>(null);

  useEffect(() => {
    if (!isVisible) setMatchCount(null);
  }, [isVisible]);

  const handleSearch = useCallback(() => {
    if (!cyCompat || !searchTerm.trim()) {
      setMatchCount(null);
      return;
    }
    setMatchCount(searchNodes(cyCompat, searchTerm));
  }, [cyCompat, searchTerm]);

  const handleClear = useCallback(() => {
    setSearchTerm("");
    setMatchCount(null);
    // Disabled during ReactFlow migration - clear selection handled elsewhere
    void cyCompat;
  }, [cyCompat]);

  return { searchTerm, setSearchTerm, matchCount, handleSearch, handleClear };
}

export const FindNodePanel: React.FC<FindNodePanelProps> = ({ isVisible, onClose, cyCompat }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  usePanelFocus(isVisible, inputRef);
  const { searchTerm, setSearchTerm, matchCount, handleSearch, handleClear } = useSearchState(
    cyCompat,
    isVisible
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleSearch();
      } else if (e.key === "Escape") {
        onClose();
      }
    },
    [handleSearch, onClose]
  );

  const handleClearClick = useCallback(() => {
    handleClear();
    inputRef.current?.focus();
  }, [handleClear]);

  return (
    <BasePanel
      title="Find Node"
      isVisible={isVisible}
      onClose={onClose}
      initialPosition={{ x: window.innerWidth - 340, y: 72 }}
      width={300}
      storageKey="findNode"
      zIndex={90}
      footer={false}
      minWidth={250}
      minHeight={150}
      testId="find-node-panel"
    >
      <div className="space-y-3">
        <div>
          <p className="text-secondary text-sm mb-2">Search for nodes in the topology by name.</p>
        </div>

        <div className="relative">
          <input
            ref={inputRef}
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search for nodes ..."
            className="input-field pl-8 pr-8 text-sm w-full"
            autoFocus
            data-testid="find-node-input"
          />
          <span className="absolute left-2 top-1/2 transform -translate-y-1/2 text-secondary">
            <i className="fas fa-search" aria-hidden="true"></i>
          </span>
          {searchTerm && (
            <button
              type="button"
              onClick={handleClearClick}
              className="absolute right-2 top-1/2 transform -translate-y-1/2 text-secondary hover:text-default"
              title="Clear search"
            >
              <i className="fas fa-times" aria-hidden="true"></i>
            </button>
          )}
        </div>

        <div className="flex items-center justify-between">
          <button
            type="button"
            className="btn btn-primary btn-small"
            onClick={handleSearch}
            data-testid="find-node-search-btn"
          >
            Search
          </button>

          {matchCount !== null && <SearchResultStatus count={matchCount} />}
        </div>

        <div className="text-xs text-secondary mt-2">
          <p className="font-semibold mb-1">Search tips:</p>
          <ul className="list-disc list-inside space-y-0.5">
            <li>
              Use <kbd className="shortcuts-kbd-inline">*</kbd> for wildcard (e.g.,{" "}
              <code>srl*</code>)
            </li>
            <li>
              Use <kbd className="shortcuts-kbd-inline">+</kbd> prefix for starts-with
            </li>
            <li>
              Press <kbd className="shortcuts-kbd-inline">Enter</kbd> to search
            </li>
          </ul>
        </div>
      </div>
    </BasePanel>
  );
};
