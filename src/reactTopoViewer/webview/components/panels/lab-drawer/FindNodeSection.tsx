/**
 * FindNodeSection - Search/find nodes in the topology
 * Migrated from FindNodePanel for use in the Settings Drawer
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

import { useGraphState } from "../../../stores/graphStore";
import { searchNodes as searchNodesUtil, getNodesBoundingBox } from "../../../utils/graphQueryUtils";
import type { TopoNode } from "../../../../shared/types/graph";

interface FindNodeSectionProps {
  rfInstance: ReactFlowInstance | null;
  isVisible: boolean;
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

export const FindNodeSection: React.FC<FindNodeSectionProps> = ({ rfInstance, isVisible }) => {
  const { nodes } = useGraphState();
  const inputRef = useRef<HTMLInputElement>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [matchCount, setMatchCount] = useState<number | null>(null);

  // Focus input when section becomes visible
  useEffect(() => {
    if (isVisible && inputRef.current) {
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 50);
    }
  }, [isVisible]);

  // Reset match count when section is hidden
  useEffect(() => {
    if (!isVisible) setMatchCount(null);
  }, [isVisible]);

  const handleSearch = useCallback(() => {
    if (!searchTerm.trim()) {
      setMatchCount(null);
      return;
    }

    const basicMatches = searchNodesUtil(nodes as TopoNode[], searchTerm);
    const filterMatches = filterNodes(nodes as TopoNode[], searchTerm);

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
    inputRef.current?.focus();
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleSearch();
      }
    },
    [handleSearch]
  );

  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="h6" gutterBottom>
        Find Node
      </Typography>

      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
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
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon fontSize="small" />
            </InputAdornment>
          ),
          endAdornment: searchTerm && (
            <InputAdornment position="end">
              <IconButton size="small" onClick={handleClear} edge="end">
                <ClearIcon fontSize="small" />
              </IconButton>
            </InputAdornment>
          )
        }}
        sx={{ mb: 2 }}
      />

      <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 2 }}>
        <Button variant="contained" size="small" onClick={handleSearch}>
          Search
        </Button>
        {matchCount !== null && (
          <Typography
            variant="body2"
            sx={{ color: matchCount > 0 ? "success.main" : "warning.main" }}
          >
            {matchCount === 0
              ? "No nodes found"
              : `Found ${matchCount} node${matchCount === 1 ? "" : "s"}`}
          </Typography>
        )}
      </Box>

      <Box sx={{ mt: 2 }}>
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
  );
};
