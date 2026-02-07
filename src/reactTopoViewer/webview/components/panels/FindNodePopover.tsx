/**
 * FindNodePopover - MUI Popover for find/search functionality
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import type { ReactFlowInstance } from "@xyflow/react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import InputAdornment from "@mui/material/InputAdornment";
import IconButton from "@mui/material/IconButton";
import Button from "@mui/material/Button";
import Popover from "@mui/material/Popover";
import SearchIcon from "@mui/icons-material/Search";
import ClearIcon from "@mui/icons-material/Clear";

import { useGraphState } from "../../stores/graphStore";
import { searchNodes as searchNodesUtil, getNodesBoundingBox } from "../../utils/graphQueryUtils";
import type { TopoNode } from "../../../shared/types/graph";

function createWildcardFilter(pattern: string): (value: string) => boolean {
  const regex = new RegExp("^" + pattern.replace(/\*/g, ".*").replace(/\?/g, ".") + "$", "i");
  return (value: string) => regex.test(value);
}

function createPrefixFilter(pattern: string): (value: string) => boolean {
  const prefix = pattern.slice(1).toLowerCase();
  return (value: string) => value.toLowerCase().startsWith(prefix);
}

function createContainsFilter(lower: string): (value: string) => boolean {
  return (value: string) => value.toLowerCase().includes(lower);
}

function createFilter(pattern: string): (value: string) => boolean {
  const trimmed = pattern.trim();
  if (!trimmed) return () => true;
  if (trimmed.includes("*")) return createWildcardFilter(trimmed);
  if (trimmed.startsWith("+")) return createPrefixFilter(trimmed);
  return createContainsFilter(trimmed.toLowerCase());
}

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

interface FindNodePopoverProps {
  anchorEl: HTMLElement | null;
  onClose: () => void;
  rfInstance: ReactFlowInstance | null;
}

export const FindNodePopover: React.FC<FindNodePopoverProps> = ({
  anchorEl,
  onClose,
  rfInstance
}) => {
  const open = Boolean(anchorEl);
  const { nodes } = useGraphState();
  const inputRef = useRef<HTMLInputElement>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [matchCount, setMatchCount] = useState<number | null>(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 50);
    }
  }, [open]);

  useEffect(() => {
    if (!open) setMatchCount(null);
  }, [open]);

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
        rfInstance.fitBounds({ x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height }, { padding: 0.2, duration: 300 }).catch(() => {});
      }
    }
  }, [nodes, searchTerm, rfInstance]);

  const handleClear = useCallback(() => {
    setSearchTerm("");
    setMatchCount(null);
    inputRef.current?.focus();
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSearch();
    }
  }, [handleSearch]);

  return (
    <Popover
      open={open}
      anchorEl={anchorEl}
      onClose={onClose}
      anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      transformOrigin={{ vertical: "top", horizontal: "center" }}
    >
      <Box sx={{ p: 2, width: 320 }}>
        <Typography variant="subtitle2" gutterBottom>Find Node</Typography>

        <TextField
          inputRef={inputRef}
          fullWidth
          size="small"
          placeholder="Search for nodes..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          onKeyDown={handleKeyDown}
          InputProps={{
            startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>,
            endAdornment: searchTerm ? (
              <InputAdornment position="end">
                <IconButton size="small" onClick={handleClear} edge="end"><ClearIcon fontSize="small" /></IconButton>
              </InputAdornment>
            ) : undefined
          }}
          sx={{ mb: 1.5 }}
        />

        <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 1.5 }}>
          <Button variant="contained" size="small" onClick={handleSearch}>Search</Button>
          {matchCount !== null && (
            <Typography variant="body2" sx={{ color: matchCount > 0 ? "success.main" : "warning.main" }}>
              {matchCount === 0 ? "No nodes found" : `Found ${matchCount} node${matchCount === 1 ? "" : "s"}`}
            </Typography>
          )}
        </Box>

        <Typography variant="caption" color="text.secondary" component="ul" sx={{ pl: 2, m: 0, "& li": { mb: 0.25 } }}>
          <li>Use <code>*</code> for wildcard (e.g., <code>srl*</code>)</li>
          <li>Use <code>+</code> prefix for starts-with</li>
          <li>Press <code>Enter</code> to search</li>
        </Typography>
      </Box>
    </Popover>
  );
};
