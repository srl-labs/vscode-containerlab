/**
 * FindNodePanel - Search/find nodes in the topology
 * Uses graph store state for node data and viewport operations.
 */
import React, { useState, useEffect, useRef, useCallback } from "react";
import type { ReactFlowInstance } from "@xyflow/react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import InputAdornment from "@mui/material/InputAdornment";
import IconButton from "@mui/material/IconButton";
import SearchIcon from "@mui/icons-material/Search";
import ClearIcon from "@mui/icons-material/Clear";

import { BasePanel } from "../ui/editor/BasePanel";
import { useGraphState } from "../../stores/graphStore";
import { searchNodes as searchNodesUtil, getNodesBoundingBox } from "../../utils/graphQueryUtils";
import type { TopoNode } from "../../../shared/types/graph";

interface FindNodePanelProps {
  isVisible: boolean;
  onClose: () => void;
  rfInstance: ReactFlowInstance | null;
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
 */
function createFilter(pattern: string): (value: string) => boolean {
  const trimmed = pattern.trim();
  if (!trimmed) return () => true;
  if (trimmed.includes("*")) return createWildcardFilter(trimmed);
  if (trimmed.startsWith("+")) return createPrefixFilter(trimmed);
  return createContainsFilter(trimmed.toLowerCase());
}

/**
 * Filter nodes using a custom filter function
 */
function filterNodes(nodes: TopoNode[], searchTerm: string): TopoNode[] {
  const filter = createFilter(searchTerm);
  return nodes.filter((node) => {
    if (filter(node.id)) return true;
    const data = node.data as Record<string, unknown>;
    const label = data.label;
    if (typeof label === "string" && filter(label)) return true;
    return false;
  });
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
function useSearchState(
  nodes: TopoNode[],
  rfInstance: ReactFlowInstance | null,
  isVisible: boolean
) {
  const [searchTerm, setSearchTerm] = useState("");
  const [matchCount, setMatchCount] = useState<number | null>(null);

  useEffect(() => {
    if (!isVisible) setMatchCount(null);
  }, [isVisible]);

  const handleSearch = useCallback(() => {
    if (!searchTerm.trim()) {
      setMatchCount(null);
      return;
    }

    const basicMatches = searchNodesUtil(nodes, searchTerm);
    const filterMatches = filterNodes(nodes, searchTerm);

    const matchedIds = new Set<string>();
    const combinedMatches: TopoNode[] = [];
    for (const node of [...basicMatches, ...filterMatches]) {
      if (!matchedIds.has(node.id)) {
        matchedIds.add(node.id);
        combinedMatches.push(node);
      }
    }

    setMatchCount(combinedMatches.length);

    if (combinedMatches.length > 0 && rfInstance) {
      const bounds = getNodesBoundingBox(combinedMatches);
      if (bounds) {
        rfInstance
          .fitBounds(
            { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height },
            { padding: 0.2, duration: 300 }
          )
          .catch(() => {
            /* ignore */
          });
      }
    }
  }, [nodes, searchTerm, rfInstance]);

  const handleClear = useCallback(() => {
    setSearchTerm("");
    setMatchCount(null);
  }, []);

  return { searchTerm, setSearchTerm, matchCount, handleSearch, handleClear };
}

export const FindNodePanel: React.FC<FindNodePanelProps> = ({ isVisible, onClose, rfInstance }) => {
  const { nodes } = useGraphState();
  const inputRef = useRef<HTMLInputElement>(null);
  usePanelFocus(isVisible, inputRef);
  const { searchTerm, setSearchTerm, matchCount, handleSearch, handleClear } = useSearchState(
    nodes as TopoNode[],
    rfInstance,
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
      <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5, p: 1 }}>
        <Typography variant="body2" color="text.secondary">
          Search for nodes in the topology by name.
        </Typography>

        <TextField
          inputRef={inputRef}
          fullWidth
          size="small"
          placeholder="Search for nodes..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          onKeyDown={handleKeyDown}
          autoFocus
          data-testid="find-node-input"
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
            endAdornment: searchTerm && (
              <InputAdornment position="end">
                <IconButton size="small" onClick={handleClearClick} edge="end" title="Clear search">
                  <ClearIcon fontSize="small" />
                </IconButton>
              </InputAdornment>
            )
          }}
        />

        <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
          <Button
            variant="contained"
            size="small"
            onClick={handleSearch}
            data-testid="find-node-search-btn"
          >
            Search
          </Button>
          {matchCount !== null && (
            <Typography
              variant="body2"
              data-testid="find-node-result"
              sx={{ color: matchCount > 0 ? "success.main" : "warning.main" }}
            >
              {matchCount === 0
                ? "No nodes found"
                : `Found ${matchCount} node${matchCount === 1 ? "" : "s"}`}
            </Typography>
          )}
        </Box>

        <Box sx={{ mt: 1 }}>
          <Typography variant="subtitle2" gutterBottom>
            Search tips:
          </Typography>
          <Typography variant="caption" component="ul" sx={{ pl: 2, m: 0 }}>
            <li>
              Use <code>*</code> for wildcard (e.g., <code>srl*</code>)
            </li>
            <li>
              Use <code>+</code> prefix for starts-with
            </li>
            <li>
              Press <code>Enter</code> to search
            </li>
          </Typography>
        </Box>
      </Box>
    </BasePanel>
  );
};
