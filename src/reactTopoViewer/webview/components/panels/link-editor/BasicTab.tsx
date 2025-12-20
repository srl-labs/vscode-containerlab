/**
 * BasicTab - Basic link configuration (endpoints)
 */
import React from 'react';

import { FormField, InputField, ReadOnlyBadge } from '../../shared/form';

import { LinkTabProps } from './types';

export const BasicTab: React.FC<LinkTabProps> = ({ data, onChange }) => {
  return (
    <div className="space-y-3">
      {/* Source Endpoint Section */}
      <div className="border-b pb-3 mb-3" style={{ borderColor: 'var(--vscode-panel-border)' }}>
        <div className="text-sm font-semibold mb-2" style={{ color: 'var(--vscode-foreground)' }}>
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
              onChange={(value) => onChange({ sourceEndpoint: value })}
              placeholder="e.g., eth1, e1-1"
            />
          </FormField>
        )}
      </div>

      {/* Target Endpoint Section */}
      <div>
        <div className="text-sm font-semibold mb-2" style={{ color: 'var(--vscode-foreground)' }}>
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
              onChange={(value) => onChange({ targetEndpoint: value })}
              placeholder="e.g., eth1, e1-1"
            />
          </FormField>
        )}
      </div>
    </div>
  );
};
