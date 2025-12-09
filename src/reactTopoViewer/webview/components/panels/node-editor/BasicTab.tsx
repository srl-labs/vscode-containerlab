/**
 * Basic Tab for Node Editor
 *
 * Shows different fields depending on whether we're editing:
 * - A regular node: Node Name + Kind/Type/Image/Version/Icon fields
 * - A custom node template: Custom Node Name, Base Name, Interface Pattern, Set as default + Kind/Type/Image/Version/Icon fields
 */
import React from 'react';
import { TabProps } from './types';
import { FormField, InputField, CheckboxField, Section } from '../../shared/form';

/**
 * Node Name field - shown only for regular nodes
 */
const NodeNameField: React.FC<TabProps> = ({ data, onChange }) => (
  <FormField label="Node Name">
    <InputField
      id="node-name"
      value={data.name || ''}
      onChange={(value) => onChange({ name: value })}
    />
  </FormField>
);

/**
 * Custom Node Template fields - shown only when editing custom node templates
 */
const CustomNodeTemplateFields: React.FC<TabProps> = ({ data, onChange }) => (
  <Section title="Custom Node Template">
    <div className="space-y-3">
      <FormField label="Template Name">
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
        tooltip="Use {n} for sequential numbering. Examples: xe-{n}, xe-{n:0} starts at 0, xe-{n:1-4} limits range."
      >
        <InputField
          id="node-interface-pattern"
          value={data.interfacePattern || ''}
          onChange={(value) => onChange({ interfacePattern: value })}
          placeholder="e.g., e1-{n} or Gi0/0/{n:0}"
        />
      </FormField>
    </div>
  </Section>
);

/**
 * Kind field with placeholder
 */
const KindField: React.FC<TabProps> = ({ data, onChange }) => (
  <FormField label="Kind">
    <InputField
      id="node-kind"
      value={data.kind || ''}
      onChange={(value) => onChange({ kind: value })}
      placeholder="e.g., nokia_srlinux"
    />
  </FormField>
);

/**
 * Type field with placeholder
 */
const TypeField: React.FC<TabProps> = ({ data, onChange }) => (
  <FormField label="Type">
    <InputField
      id="node-type"
      value={data.type || ''}
      onChange={(value) => onChange({ type: value })}
      placeholder="e.g., ixr-d2l"
    />
  </FormField>
);

/**
 * Image and Version fields in a 2-column grid (matching legacy layout)
 */
const ImageVersionFields: React.FC<TabProps> = ({ data, onChange }) => (
  <div className="grid grid-cols-2 gap-2">
    <FormField label="Image">
      <InputField
        id="node-image"
        value={data.image || ''}
        onChange={(value) => onChange({ image: value })}
        placeholder="e.g., ghcr.io/nokia/srlinux"
      />
    </FormField>
    <FormField label="Version">
      <InputField
        id="node-version"
        value={data.version || ''}
        onChange={(value) => onChange({ version: value })}
        placeholder="e.g., latest"
      />
    </FormField>
  </div>
);

/**
 * Icon field with edit/add buttons (placeholder for now)
 */
const IconField: React.FC<TabProps> = ({ data, onChange }) => (
  <FormField label="Icon">
    <div className="flex gap-2 items-start">
      <div className="flex-1">
        <InputField
          id="node-icon"
          value={data.icon || ''}
          onChange={(value) => onChange({ icon: value })}
          placeholder="e.g., router, switch, pe"
        />
      </div>
      <button
        type="button"
        className="btn btn-small whitespace-nowrap"
        title="Edit icon color and shape"
      >
        Edit
      </button>
      <button
        type="button"
        className="btn btn-small whitespace-nowrap"
        title="Add a custom icon"
      >
        Add
      </button>
    </div>
  </FormField>
);

export const BasicTab: React.FC<TabProps> = ({ data, onChange }) => (
  <div className="space-y-3">
    {/* Show Node Name for regular nodes, Custom Template fields for custom node templates */}
    {data.isCustomTemplate ? (
      <CustomNodeTemplateFields data={data} onChange={onChange} />
    ) : (
      <NodeNameField data={data} onChange={onChange} />
    )}

    {/* Kind/Type/Image/Version/Icon fields are shown for all node types */}
    <KindField data={data} onChange={onChange} />
    <TypeField data={data} onChange={onChange} />
    <ImageVersionFields data={data} onChange={onChange} />
    <IconField data={data} onChange={onChange} />
  </div>
);
