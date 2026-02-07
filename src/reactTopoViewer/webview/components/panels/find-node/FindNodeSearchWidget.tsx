import React, { useCallback, useEffect, useRef, useState } from "react";
import type { ReactFlowInstance } from "@xyflow/react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import InputAdornment from "@mui/material/InputAdornment";
import IconButton from "@mui/material/IconButton";
import Button from "@mui/material/Button";
import SearchIcon from "@mui/icons-material/Search";
import ClearIcon from "@mui/icons-material/Clear";

import { useGraphState } from "../../../stores/graphStore";
import { getNodesBoundingBox } from "../../../utils/graphQueryUtils";
import type { TopoNode } from "../../../../shared/types/graph";

import { formatMatchCountText, getCombinedMatches } from "./findNodeSearchUtils";

export interface FindNodeSearchWidgetProps {
  rfInstance: ReactFlowInstance | null;
  isActive: boolean;
  titleVariant?: "subtitle2" | "h6";
  description?: React.ReactNode;
  dense?: boolean;
  showTipsHeader?: boolean;
}

export const FindNodeSearchWidget: React.FC<FindNodeSearchWidgetProps> = ({
  rfInstance,
  isActive,
  titleVariant = "subtitle2",
  description,
  dense = false,
  showTipsHeader = false
}) => {
  const { nodes } = useGraphState();
  const inputRef = useRef<HTMLInputElement>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [matchCount, setMatchCount] = useState<number | null>(null);

  useEffect(() => {
    if (isActive) {
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 50);
    }
  }, [isActive]);

  useEffect(() => {
    if (!isActive) setMatchCount(null);
  }, [isActive]);

  const handleSearch = useCallback(() => {
    if (!searchTerm.trim()) {
      setMatchCount(null);
      return;
    }

    const combinedMatches = getCombinedMatches(nodes as TopoNode[], searchTerm);
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

  const mbInput = dense ? 1.5 : 2;
  const mbActions = dense ? 1.5 : 2;

  return (
    <>
      <Typography variant={titleVariant} gutterBottom>
        Find Node
      </Typography>

      {description ? (
        <Typography variant="body2" color="text.secondary" sx={{ mb: mbInput }}>
          {description}
        </Typography>
      ) : null}

      <TextField
        inputRef={inputRef}
        fullWidth
        size="small"
        placeholder="Search for nodes..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        onKeyDown={handleKeyDown}
        slotProps={{
          input: {
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
            endAdornment: searchTerm ? (
              <InputAdornment position="end">
                <IconButton size="small" onClick={handleClear} edge="end">
                  <ClearIcon fontSize="small" />
                </IconButton>
              </InputAdornment>
            ) : undefined
          }
        }}
        sx={{ mb: mbInput }}
      />

      <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: mbActions }}>
        <Button variant="contained" size="small" onClick={handleSearch}>
          Search
        </Button>
        {matchCount !== null && (
          <Typography variant="body2" sx={{ color: matchCount > 0 ? "success.main" : "warning.main" }}>
            {formatMatchCountText(matchCount)}
          </Typography>
        )}
      </Box>

      <Box sx={{ mt: dense ? 0 : 2 }}>
        {showTipsHeader ? (
          <Typography variant="subtitle2" gutterBottom>
            Search tips:
          </Typography>
        ) : null}
        <Typography
          variant="caption"
          color="text.secondary"
          component="ul"
          sx={{ pl: 2, m: 0, "& li": { mb: 0.25 } }}
        >
          <li>
            Use <code>*</code> for wildcard (e.g., <code>srl*</code>)
          </li>
          <li>Use <code>+</code> prefix for starts-with</li>
          <li>Press <code>Enter</code> to search</li>
        </Typography>
      </Box>
    </>
  );
};
