// Basic link configuration tab.
import React from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Slider from "@mui/material/Slider";
import Button from "@mui/material/Button";

import { ReadOnlyBadge, InputField, PanelSection } from "../../ui/form";
import {
  DEFAULT_ENDPOINT_LABEL_OFFSET,
  ENDPOINT_LABEL_OFFSET_MIN,
  ENDPOINT_LABEL_OFFSET_MAX,
} from "../../../annotations/endpointLabelOffset";

import type { LinkTabProps } from "./types";

interface EndpointInterfaceFieldProps {
  isNetwork: boolean;
  nodeName: string;
  inputId: string;
  endpoint: string | undefined;
  onChange: (value: string) => void;
}

const EndpointInterfaceField: React.FC<EndpointInterfaceFieldProps> = ({
  isNetwork,
  nodeName,
  inputId,
  endpoint,
  onChange,
}) => {
  if (isNetwork) {
    return (
      <Box>
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
          {nodeName} Interface
        </Typography>
        <ReadOnlyBadge>{nodeName || "Unknown"}</ReadOnlyBadge>
      </Box>
    );
  }

  return (
    <InputField
      id={inputId}
      label={`${nodeName} Interface`}
      required
      value={endpoint ?? ""}
      onChange={onChange}
      placeholder="e.g., eth1, e1-1"
    />
  );
};

interface LabelOffsetSectionProps {
  endpointOffsetValue: number;
  onOffsetChange: (_event: Event, value: number | number[]) => void;
  onOffsetReset: () => void;
}

const LabelOffsetSection: React.FC<LabelOffsetSectionProps> = ({
  endpointOffsetValue,
  onOffsetChange,
  onOffsetReset,
}) => {
  return (
    <PanelSection
      title="Label Offset"
      bodySx={{ display: "flex", alignItems: "center", gap: 2, px: 2, py: 1 }}
    >
      <>
        <Typography variant="body2" color="text.secondary">
          {ENDPOINT_LABEL_OFFSET_MIN}
        </Typography>
        <Slider
          id="link-endpoint-offset"
          value={endpointOffsetValue}
          min={ENDPOINT_LABEL_OFFSET_MIN}
          max={ENDPOINT_LABEL_OFFSET_MAX}
          step={1}
          onChange={onOffsetChange}
          valueLabelDisplay="auto"
          sx={{ flex: 1 }}
        />
        <Typography variant="body2" color="text.secondary">
          {ENDPOINT_LABEL_OFFSET_MAX}
        </Typography>
        <Button
          size="small"
          onClick={onOffsetReset}
          title={`Reset to ${DEFAULT_ENDPOINT_LABEL_OFFSET}`}
        >
          Reset
        </Button>
      </>
    </PanelSection>
  );
};

function resolveEndpointOffsetValue(offset: unknown): number {
  if (typeof offset === "number" && Number.isFinite(offset)) {
    return offset;
  }

  return DEFAULT_ENDPOINT_LABEL_OFFSET;
}

export const BasicTab: React.FC<LinkTabProps> = ({ data, onChange, onPreviewOffset }) => {
  const sourceName = data.source.length > 0 ? data.source : "Source";
  const targetName = data.target.length > 0 ? data.target : "Target";
  const endpointOffsetValue = resolveEndpointOffsetValue(data.endpointLabelOffset);

  const handleOffsetChange = (_event: Event, value: number | number[]) => {
    const nextOffset = typeof value === "number" ? value : value[0];
    const nextData = {
      ...data,
      endpointLabelOffset: nextOffset,
      endpointLabelOffsetEnabled: true,
    };
    onChange({
      endpointLabelOffset: nextOffset,
      endpointLabelOffsetEnabled: true,
    });
    onPreviewOffset?.(nextData);
  };

  const handleOffsetReset = () => {
    const nextData = {
      ...data,
      endpointLabelOffset: DEFAULT_ENDPOINT_LABEL_OFFSET,
      endpointLabelOffsetEnabled: true,
    };
    onChange({
      endpointLabelOffset: DEFAULT_ENDPOINT_LABEL_OFFSET,
      endpointLabelOffsetEnabled: true,
    });
    onPreviewOffset?.(nextData);
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column" }}>
      <PanelSection title="Endpoints" withTopDivider={false}>
        <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5 }}>
          <EndpointInterfaceField
            isNetwork={Boolean(data.sourceIsNetwork)}
            nodeName={sourceName}
            inputId="link-source-interface"
            endpoint={data.sourceEndpoint}
            onChange={(value) => onChange({ sourceEndpoint: value })}
          />
          <EndpointInterfaceField
            isNetwork={Boolean(data.targetIsNetwork)}
            nodeName={targetName}
            inputId="link-target-interface"
            endpoint={data.targetEndpoint}
            onChange={(value) => onChange({ targetEndpoint: value })}
          />
        </Box>
      </PanelSection>

      <LabelOffsetSection
        endpointOffsetValue={endpointOffsetValue}
        onOffsetChange={handleOffsetChange}
        onOffsetReset={handleOffsetReset}
      />
    </Box>
  );
};
