/**
 * BasicTab - Basic link configuration (endpoints)
 */
import React from "react";

import { FormField, ReadOnlyBadge, InputField } from "../../ui/form";
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

  const handleOffsetChange = (value: string) => {
    const parsed = Number.parseFloat(value);
    const nextOffset = Number.isFinite(parsed) ? parsed : 0;
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
    <div className="space-y-3">
      {/* Source Endpoint Section */}
      <div className="border-b pb-3 mb-3" style={{ borderColor: "var(--vscode-panel-border)" }}>
        <div className="section-header">Source Endpoint</div>
        <FormField label="Node">
          <ReadOnlyBadge>{data.source || "Unknown"}</ReadOnlyBadge>
        </FormField>
        {data.sourceIsNetwork ? (
          <FormField label="Interface">
            <ReadOnlyBadge>{data.source || "Unknown"}</ReadOnlyBadge>
          </FormField>
        ) : (
          <FormField label="Interface" required>
            <InputField
              id="link-source-interface"
              value={data.sourceEndpoint || ""}
              onChange={(value: string) => onChange({ sourceEndpoint: value })}
              placeholder="e.g., eth1, e1-1"
            />
          </FormField>
        )}
      </div>

      {/* Target Endpoint Section */}
      <div>
        <div className="section-header">Target Endpoint</div>
        <FormField label="Node">
          <ReadOnlyBadge>{data.target || "Unknown"}</ReadOnlyBadge>
        </FormField>
        {data.targetIsNetwork ? (
          <FormField label="Interface">
            <ReadOnlyBadge>{data.target || "Unknown"}</ReadOnlyBadge>
          </FormField>
        ) : (
          <FormField label="Interface" required>
            <InputField
              id="link-target-interface"
              value={data.targetEndpoint || ""}
              onChange={(value: string) => onChange({ targetEndpoint: value })}
              placeholder="e.g., eth1, e1-1"
            />
          </FormField>
        )}
      </div>

      <div className="border-t pt-3 mt-4" style={{ borderColor: "var(--vscode-panel-border)" }}>
        <div className="section-header">Label Offset</div>
        <div className="form-group">
          <div className="px-2">
            <div className="flex items-center gap-2 mb-2">
              <span className="field-label">Value</span>
              <input
                id="link-endpoint-offset"
                type="range"
                min={ENDPOINT_LABEL_OFFSET_MIN}
                max={ENDPOINT_LABEL_OFFSET_MAX}
                step="1"
                value={endpointOffsetValue}
                onChange={(evt) => handleOffsetChange(evt.target.value)}
                className="grid-line-slider m-0 flex-1 text-[var(--vscode-font-size)]"
              />
              <input
                type="text"
                value={endpointOffsetValue.toFixed(0)}
                readOnly
                aria-label="Offset value"
                className="input-field w-12 text-center text-[var(--vscode-font-size)]"
              />
              <div className="w-20">
                {!isDefaultOffset ? (
                  <button
                    type="button"
                    className="btn btn-small btn-secondary w-full whitespace-nowrap"
                    onClick={handleOffsetReset}
                    title={`Reset to ${DEFAULT_ENDPOINT_LABEL_OFFSET}`}
                  >
                    Reset
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
