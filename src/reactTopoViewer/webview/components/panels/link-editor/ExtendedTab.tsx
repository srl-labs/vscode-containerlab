/**
 * ExtendedTab - Extended link configuration (MAC, MTU, vars, labels)
 */
import React from 'react';
import { FormField, InputField, KeyValueList } from '../../shared/form';
import { LinkTabProps, LinkEditorData } from './types';

// CSS variable constants
const CSS_BG_QUOTE = 'var(--vscode-textBlockQuote-background)';
const CSS_BORDER_QUOTE = 'var(--vscode-textBlockQuote-border)';

// Style objects
const quoteBlockStyle: React.CSSProperties = {
  backgroundColor: CSS_BG_QUOTE,
  border: `1px solid ${CSS_BORDER_QUOTE}`
};

/**
 * Read-only display badge
 */
const ReadOnlyBadge: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="text-base px-2 py-1 inline-block rounded" style={quoteBlockStyle}>
    {children}
  </span>
);

/**
 * Header section with link name and type
 */
const HeaderSection: React.FC<{ linkId: string; linkType?: string }> = ({ linkId, linkType }) => (
  <div className="border-b pb-3 mb-3" style={{ borderColor: 'var(--vscode-panel-border)' }}>
    <FormField label="Link Name">
      <ReadOnlyBadge>{linkId || 'New Link'}</ReadOnlyBadge>
    </FormField>
    <FormField label="Type">
      <ReadOnlyBadge>{linkType || 'veth'}</ReadOnlyBadge>
      <span className="text-xs text-[var(--vscode-descriptionForeground)] ml-2">
        (auto-detected)
      </span>
    </FormField>
  </div>
);

/**
 * Veth link properties (MAC, MTU, vars, labels)
 */
const VethLinkFields: React.FC<LinkTabProps> = ({ data, onChange }) => (
  <>
    <FormField label="Source MAC" tooltip="MAC address for source endpoint">
      <InputField
        id="link-source-mac"
        value={data.sourceMac || ''}
        onChange={(value) => onChange({ sourceMac: value })}
        placeholder="e.g., 02:42:ac:11:00:01"
      />
    </FormField>

    <FormField label="Target MAC" tooltip="MAC address for target endpoint">
      <InputField
        id="link-target-mac"
        value={data.targetMac || ''}
        onChange={(value) => onChange({ targetMac: value })}
        placeholder="e.g., 02:42:ac:11:00:02"
      />
    </FormField>

    <FormField label="MTU" tooltip="Maximum Transmission Unit">
      <InputField
        id="link-mtu"
        value={data.mtu?.toString() || ''}
        onChange={(value) => onChange({ mtu: value ? parseInt(value, 10) : undefined })}
        placeholder="e.g., 1500"
        type="number"
      />
    </FormField>

    <FormField label="Variables" tooltip="Link variables (key-value pairs)">
      <KeyValueList
        items={data.vars || {}}
        onChange={(vars) => onChange({ vars })}
        keyPlaceholder="Variable name"
        valuePlaceholder="Value"
        addLabel="Add Variable"
      />
    </FormField>

    <FormField label="Labels" tooltip="Link labels (key-value pairs)">
      <KeyValueList
        items={data.labels || {}}
        onChange={(labels) => onChange({ labels })}
        keyPlaceholder="Label key"
        valuePlaceholder="Label value"
        addLabel="Add Label"
      />
    </FormField>
  </>
);

/**
 * Info message for non-veth links
 */
const NonVethInfo: React.FC = () => (
  <div className="my-1">
    <div className="p-2 rounded" style={quoteBlockStyle}>
      <div className="text-sm">
        <span className="font-semibold">Note:</span>{' '}
        This link connects to a network node. Configure extended properties on the network
        node itself.
      </div>
    </div>
  </div>
);

export const ExtendedTab: React.FC<LinkTabProps> = ({ data, onChange }) => {
  const isVethLink = !data.type || data.type === 'veth';

  return (
    <div className="space-y-3">
      <HeaderSection linkId={data.id} linkType={data.type} />
      {isVethLink ? (
        <VethLinkFields data={data} onChange={onChange} />
      ) : (
        <NonVethInfo />
      )}
    </div>
  );
};

/**
 * Validation function for link editor data
 */
export function validateLinkEditorData(data: LinkEditorData): string[] {
  const errors: string[] = [];

  if (!data.source) {
    errors.push('Source node is required');
  }
  if (!data.target) {
    errors.push('Target node is required');
  }
  if (!data.sourceEndpoint) {
    errors.push('Source interface is required');
  }
  if (!data.targetEndpoint) {
    errors.push('Target interface is required');
  }
  if (data.source && data.target && data.source === data.target) {
    errors.push('Source and target nodes must be different');
  }

  return errors;
}
