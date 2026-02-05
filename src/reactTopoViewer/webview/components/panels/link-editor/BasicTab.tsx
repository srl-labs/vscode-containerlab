/**
 * BasicTab - Basic link configuration (endpoints)
 */
import React from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Slider from "@mui/material/Slider";
import Button from "@mui/material/Button";

import { ReadOnlyBadge, InputField } from "../../ui/form";
import {
  DEFAULT_ENDPOINT_LABEL_OFFSET,
  ENDPOINT_LABEL_OFFSET_MIN,
  ENDPOINT_LABEL_OFFSET_MAX
} from "../../../annotations/endpointLabelOffset";

import type { LinkTabProps } from "./types";

export const BasicTab: React.FC<LinkTabProps> = ({ data, onChange, onAutoApplyOffset }) => {
  const rawEndpointOffset =
    typeof data.endpointLabelOffset === "number" ? data.endpointLabelOffset : Number.NaN;
  const endpointOffsetValue = Number.isFinite(rawEndpointOffset)
    ? rawEndpointOffset
    : DEFAULT_ENDPOINT_LABEL_OFFSET;
  const isDefaultOffset = endpointOffsetValue === DEFAULT_ENDPOINT_LABEL_OFFSET;

  const handleOffsetChange = (_event: Event, value: number | number[]) => {
    const nextOffset = typeof value === "number" ? value : value[0];
    const nextData = {
      ...data,
      endpointLabelOffset: nextOffset,
      endpointLabelOffsetEnabled: true
    };
    onChange({
      endpointLabelOffset: nextOffset,
      endpointLabelOffsetEnabled: true
    });
    onAutoApplyOffset?.(nextData);
  };

  const handleOffsetReset = () => {
    const nextData = {
      ...data,
      endpointLabelOffset: DEFAULT_ENDPOINT_LABEL_OFFSET,
      endpointLabelOffsetEnabled: true
    };
    onChange({
      endpointLabelOffset: DEFAULT_ENDPOINT_LABEL_OFFSET,
      endpointLabelOffsetEnabled: true
    });
    onAutoApplyOffset?.(nextData);
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {/* Source Endpoint Section */}
      <Box sx={{ borderBottom: 1, borderColor: "divider", pb: 1.5 }}>
        <Typography
          variant="caption"
          sx={{ fontWeight: 500, textTransform: "uppercase", letterSpacing: 0.5, mb: 1, display: "block" }}
        >
          Source Endpoint
        </Typography>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
              Node
            </Typography>
            <ReadOnlyBadge>{data.source || "Unknown"}</ReadOnlyBadge>
          </Box>
          {data.sourceIsNetwork ? (
            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
                Interface
              </Typography>
              <ReadOnlyBadge>{data.source || "Unknown"}</ReadOnlyBadge>
            </Box>
          ) : (
            <InputField
              id="link-source-interface"
              label="Interface"
              required
              value={data.sourceEndpoint || ""}
              onChange={(value: string) => onChange({ sourceEndpoint: value })}
              placeholder="e.g., eth1, e1-1"
            />
          )}
        </Box>
      </Box>

      {/* Target Endpoint Section */}
      <Box>
        <Typography
          variant="caption"
          sx={{ fontWeight: 500, textTransform: "uppercase", letterSpacing: 0.5, mb: 1, display: "block" }}
        >
          Target Endpoint
        </Typography>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
              Node
            </Typography>
            <ReadOnlyBadge>{data.target || "Unknown"}</ReadOnlyBadge>
          </Box>
          {data.targetIsNetwork ? (
            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
                Interface
              </Typography>
              <ReadOnlyBadge>{data.target || "Unknown"}</ReadOnlyBadge>
            </Box>
          ) : (
            <InputField
              id="link-target-interface"
              label="Interface"
              required
              value={data.targetEndpoint || ""}
              onChange={(value: string) => onChange({ targetEndpoint: value })}
              placeholder="e.g., eth1, e1-1"
            />
          )}
        </Box>
      </Box>

      <Box sx={{ borderTop: 1, borderColor: "divider", pt: 1.5 }}>
        <Typography
          variant="caption"
          sx={{ fontWeight: 500, textTransform: "uppercase", letterSpacing: 0.5, mb: 1, display: "block" }}
        >
          Label Offset
        </Typography>
        <Box sx={{ display: "flex", alignItems: "center", gap: 2, px: 1 }}>
          <Typography variant="caption" color="text.secondary">
            Value
          </Typography>
          <Slider
            id="link-endpoint-offset"
            value={endpointOffsetValue}
            min={ENDPOINT_LABEL_OFFSET_MIN}
            max={ENDPOINT_LABEL_OFFSET_MAX}
            step={1}
            onChange={handleOffsetChange}
            size="small"
            sx={{ flex: 1 }}
          />
          <Typography variant="body2" sx={{ width: 40, textAlign: "center" }}>
            {endpointOffsetValue.toFixed(0)}
          </Typography>
          <Box sx={{ width: 70 }}>
            {!isDefaultOffset && (
              <Button
                size="small"
                variant="outlined"
                onClick={handleOffsetReset}
                title={`Reset to ${DEFAULT_ENDPOINT_LABEL_OFFSET}`}
              >
                Reset
              </Button>
            )}
          </Box>
        </Box>
      </Box>
    </Box>
  );
};
