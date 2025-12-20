/**
 * BasicTab - Basic settings tab for Lab Settings panel
 */
import React from 'react';

import type { PrefixType } from './types';

interface BasicTabProps {
  labName: string;
  prefixType: PrefixType;
  customPrefix: string;
  isViewMode: boolean;
  onLabNameChange: (value: string) => void;
  onPrefixTypeChange: (value: PrefixType) => void;
  onCustomPrefixChange: (value: string) => void;
}

export const BasicTab: React.FC<BasicTabProps> = ({
  labName,
  prefixType,
  customPrefix,
  isViewMode,
  onLabNameChange,
  onPrefixTypeChange,
  onCustomPrefixChange
}) => {
  return (
    <div className="space-y-3">
      {/* Lab Name */}
      <div className="form-group">
        <label className="block vscode-label mb-1">Lab Name</label>
        <input
          type="text"
          className="input-field w-full"
          placeholder="Enter lab name"
          value={labName}
          onChange={(e) => onLabNameChange(e.target.value)}
          disabled={isViewMode}
        />
        <small className="text-secondary text-xs">
          Unique name to identify and distinguish this topology from others
        </small>
      </div>

      {/* Prefix */}
      <div className="form-group">
        <label className="block vscode-label mb-1">Container Name Prefix</label>
        <select
          className="input-field w-full mb-2"
          value={prefixType}
          onChange={(e) => onPrefixTypeChange(e.target.value as PrefixType)}
          disabled={isViewMode}
        >
          <option value="default">Default (clab)</option>
          <option value="custom">Custom</option>
          <option value="no-prefix">No prefix</option>
        </select>
        {prefixType === 'custom' && (
          <input
            type="text"
            className="input-field w-full"
            placeholder="Enter custom prefix"
            value={customPrefix}
            onChange={(e) => onCustomPrefixChange(e.target.value)}
            disabled={isViewMode}
          />
        )}
        <small className="text-secondary text-xs">
          Default: clab-&lt;lab-name&gt;-&lt;node-name&gt; | No prefix: &lt;node-name&gt;
        </small>
      </div>
    </div>
  );
};
