/**
 * Basic Tab for Node Editor
 */
import React from 'react';
import { TabProps } from './types';
import { FormField, InputField, CheckboxField } from '../../shared/form';

const NodeNameField: React.FC<TabProps> = ({ data, onChange }) => (
  <FormField label="Node Name">
    <InputField
      id="node-name"
      value={data.name || ''}
      onChange={(value) => onChange({ name: value })}
    />
  </FormField>
);

const CustomNodeFields: React.FC<TabProps> = ({ data, onChange }) => (
  <>
    <FormField label="Custom Node Name">
      <InputField
        id="node-custom-name"
        value={data.customName || ''}
        onChange={(value) => onChange({ customName: value })}
        placeholder="Template name"
      />
    </FormField>
    <FormField label="Base Name (for canvas)">
      <InputField
        id="node-base-name"
        value={data.baseName || ''}
        onChange={(value) => onChange({ baseName: value })}
        placeholder="e.g., srl (will become srl1, srl2, etc.)"
      />
    </FormField>
    <CheckboxField
      id="node-custom-default"
      label="Set as default"
      checked={data.isDefaultCustomNode || false}
      onChange={(checked) => onChange({ isDefaultCustomNode: checked })}
    />
    <FormField
      label="Interface Pattern"
      tooltip="Use {n} for sequential numbering. Examples: xe-{n}, xe-{n:0} starts at 0."
    >
      <InputField
        id="node-interface-pattern"
        value={data.interfacePattern || ''}
        onChange={(value) => onChange({ interfacePattern: value })}
        placeholder="e.g., e1-{n} or Gi0/0/{n:0}"
      />
    </FormField>
  </>
);

const KindTypeImageFields: React.FC<TabProps> = ({ data, onChange }) => (
  <>
    <FormField label="Kind">
      <InputField
        id="node-kind"
        value={data.kind || ''}
        onChange={(value) => onChange({ kind: value })}
        placeholder="e.g., nokia_srlinux"
      />
    </FormField>
    <FormField label="Type">
      <InputField
        id="node-type"
        value={data.type || ''}
        onChange={(value) => onChange({ type: value })}
        placeholder="e.g., ixr-d2l"
      />
    </FormField>
    <FormField label="Image">
      <InputField
        id="node-image"
        value={data.image || ''}
        onChange={(value) => onChange({ image: value })}
        placeholder="e.g., ghcr.io/nokia/srlinux:latest"
      />
    </FormField>
  </>
);

export const BasicTab: React.FC<TabProps> = ({ data, onChange }) => (
  <div className="space-y-3">
    <NodeNameField data={data} onChange={onChange} />
    <CustomNodeFields data={data} onChange={onChange} />
    <KindTypeImageFields data={data} onChange={onChange} />
  </div>
);
