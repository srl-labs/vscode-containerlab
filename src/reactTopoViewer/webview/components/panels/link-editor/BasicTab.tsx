/**
 * BasicTab - Basic link configuration (endpoints)
 */
import React from "react";
import Box from "@mui/material/Box";
import Divider from "@mui/material/Divider";
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

const EndpointSection: React.FC<{
  title: string;
  withDivider?: boolean;
  nodeValue: string | undefined;
  isNetwork: boolean | undefined;
  interfaceBadgeValue: string | undefined;
  interfaceInputId: string;
  interfaceInputValue: string | undefined;
  onInterfaceChange: (value: string) => void;
}> = ({
  title,
  withDivider,
  nodeValue,
  isNetwork,
  interfaceBadgeValue,
  interfaceInputId,
  interfaceInputValue,
  onInterfaceChange
}) => (
  <>
    <Box>
      <Typography
        variant="caption"
        sx={{ fontWeight: 500, textTransform: "uppercase", letterSpacing: 0.5, mb: 1, display: "block" }}
      >
        {title}
      </Typography>
      <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
        <Box>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
            Node
          </Typography>
          <ReadOnlyBadge>{nodeValue || "Unknown"}</ReadOnlyBadge>
        </Box>
        {isNetwork ? (
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
              Interface
            </Typography>
            <ReadOnlyBadge>{interfaceBadgeValue || "Unknown"}</ReadOnlyBadge>
          </Box>
        ) : (
          <InputField
            id={interfaceInputId}
            label="Interface"
            required
            value={interfaceInputValue || ""}
            onChange={onInterfaceChange}
            placeholder="e.g., eth1, e1-1"
          />
        )}
      </Box>
    </Box>
    {withDivider && <Divider />}
  </>
);

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
      <EndpointSection
        title="Source Endpoint"
        withDivider
        nodeValue={data.source}
        isNetwork={data.sourceIsNetwork}
        interfaceBadgeValue={data.source}
        interfaceInputId="link-source-interface"
        interfaceInputValue={data.sourceEndpoint}
        onInterfaceChange={(value) => onChange({ sourceEndpoint: value })}
      />

      <EndpointSection
        title="Target Endpoint"
        nodeValue={data.target}
        isNetwork={data.targetIsNetwork}
        interfaceBadgeValue={data.target}
        interfaceInputId="link-target-interface"
        interfaceInputValue={data.targetEndpoint}
        onInterfaceChange={(value) => onChange({ targetEndpoint: value })}
      />

      <Divider />
      <Box sx={{ pt: 1.5 }}>
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
