/**
 * BasicTab - Basic link configuration (endpoints)
 */
import React from 'react';
import { FormField, InputField } from '../../shared/form';
import { LinkTabProps } from './types';

// CSS variable constants
const CSS_BG_QUOTE = 'var(--vscode-textBlockQuote-background)';
const CSS_BORDER_QUOTE = 'var(--vscode-textBlockQuote-border)';

const readOnlyStyle: React.CSSProperties = {
  backgroundColor: CSS_BG_QUOTE,
  border: `1px solid ${CSS_BORDER_QUOTE}`
};

/**
 * Read-only badge for displaying non-editable values
 */
const ReadOnlyBadge: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="text-base px-2 py-1 inline-block rounded" style={readOnlyStyle}>
    {children}
  </span>
);

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
