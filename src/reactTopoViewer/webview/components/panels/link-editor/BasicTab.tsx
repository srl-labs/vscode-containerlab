/**
 * BasicTab - Basic link configuration (endpoints)
 */
import React from 'react';

import { FormField, ReadOnlyBadge, InputField } from '../../shared/form';
import {
  DEFAULT_ENDPOINT_LABEL_OFFSET,
  ENDPOINT_LABEL_OFFSET_MIN,
  ENDPOINT_LABEL_OFFSET_MAX
} from '../../../utils/endpointLabelOffset';

import type { LinkTabProps } from './types';

const SECTION_HEADING_COLOR = 'var(--vscode-foreground)';

export const BasicTab: React.FC<LinkTabProps> = ({ data, onChange }) => {
  const rawEndpointOffset = typeof data.endpointLabelOffset === 'number' ? data.endpointLabelOffset : Number.NaN;
  const endpointOffsetValue = Number.isFinite(rawEndpointOffset)
    ? rawEndpointOffset
    : DEFAULT_ENDPOINT_LABEL_OFFSET;

  const handleOffsetChange = (value: string) => {
    const parsed = Number.parseFloat(value);
    onChange({
      endpointLabelOffset: Number.isFinite(parsed) ? parsed : 0,
      endpointLabelOffsetEnabled: true
    });
  };

  return (
    <div className="space-y-3">
      {/* Source Endpoint Section */}
      <div className="border-b pb-3 mb-3" style={{ borderColor: 'var(--vscode-panel-border)' }}>
        <div className="text-sm font-semibold mb-2" style={{ color: SECTION_HEADING_COLOR }}>
          Source Endpoint
        </div>
        <FormField label="Node">
          <ReadOnlyBadge>{data.source || 'Unknown'}</ReadOnlyBadge>
        </FormField>
        {data.sourceIsNetwork ? (
          <FormField label="Interface">
              <ReadOnlyBadge>{data.source || 'Unknown'}</ReadOnlyBadge>
          </FormField>
        ) : (
          <FormField label="Interface" required>
            <InputField
              id="link-source-interface"
              value={data.sourceEndpoint || ''}
              onChange={(value: string) => onChange({ sourceEndpoint: value })}
              placeholder="e.g., eth1, e1-1"
            />
          </FormField>
        )}
      </div>

      {/* Target Endpoint Section */}
      <div>
        <div className="text-sm font-semibold mb-2" style={{ color: SECTION_HEADING_COLOR }}>
          Target Endpoint
        </div>
        <FormField label="Node">
          <ReadOnlyBadge>{data.target || 'Unknown'}</ReadOnlyBadge>
        </FormField>
        {data.targetIsNetwork ? (
          <FormField label="Interface">
            <ReadOnlyBadge>{data.target || 'Unknown'}</ReadOnlyBadge>
          </FormField>
        ) : (
          <FormField label="Interface" required>
            <InputField
              id="link-target-interface"
              value={data.targetEndpoint || ''}
              onChange={(value: string) => onChange({ targetEndpoint: value })}
              placeholder="e.g., eth1, e1-1"
            />
          </FormField>
        )}
      </div>

      <div className="border-t pt-3 mt-4" style={{ borderColor: 'var(--vscode-panel-border)' }}>
        <div className="text-sm font-semibold mb-2" style={{ color: SECTION_HEADING_COLOR }}>
          Label Offset
        </div>
        <FormField label="Offset" tooltip="Distance from the node; clamped per-link to avoid label crossover.">
          <div className="px-2">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs text-[var(--vscode-descriptionForeground)]">Offset</span>
              <span className="grid-line-display">{endpointOffsetValue.toFixed(0)}</span>
            </div>
            <input
              id="link-endpoint-offset"
              type="range"
              min={ENDPOINT_LABEL_OFFSET_MIN}
              max={ENDPOINT_LABEL_OFFSET_MAX}
              step="1"
              value={endpointOffsetValue}
              onChange={(evt) => handleOffsetChange(evt.target.value)}
              className="grid-line-slider"
            />
          </div>
        </FormField>
      </div>
    </div>
  );
};
