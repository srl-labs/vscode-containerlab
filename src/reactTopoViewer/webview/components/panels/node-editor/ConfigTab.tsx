/**
 * Configuration Tab for Node Editor
 */
import React from "react";

import { FormField, InputField, CheckboxField, DynamicList, KeyValueList } from "../../ui/form";

import type { TabProps } from "./types";

/** Helper to check if a property is inherited */
const isInherited = (prop: string, inheritedProps: string[] = []) => inheritedProps.includes(prop);

const StartupConfigSection: React.FC<TabProps> = ({ data, onChange, inheritedProps = [] }) => (
  <>
    <FormField label="Startup Config" inherited={isInherited("startup-config", inheritedProps)}>
      <InputField
        id="node-startup-config"
        value={data.startupConfig || ""}
        onChange={(value) => onChange({ startupConfig: value })}
        placeholder="Path to config file"
      />
    </FormField>
    <CheckboxField
      id="node-enforce-startup-config"
      label="Enforce startup config"
      checked={data.enforceStartupConfig || false}
      onChange={(checked) => onChange({ enforceStartupConfig: checked })}
    />
    <CheckboxField
      id="node-suppress-startup-config"
      label="Suppress startup config"
      checked={data.suppressStartupConfig || false}
      onChange={(checked) => onChange({ suppressStartupConfig: checked })}
    />
    <FormField label="License File" inherited={isInherited("license", inheritedProps)}>
      <InputField
        id="node-license"
        value={data.license || ""}
        onChange={(value) => onChange({ license: value })}
        placeholder="Path to license file"
      />
    </FormField>
  </>
);

const BindsAndEnvSection: React.FC<TabProps> = ({ data, onChange, inheritedProps = [] }) => (
  <>
    <FormField label="Bind Mounts" inherited={isInherited("binds", inheritedProps)}>
      <DynamicList
        items={data.binds || []}
        onChange={(items) => onChange({ binds: items })}
        placeholder="host:container[:options]"
        addLabel="Add Bind"
      />
    </FormField>
    <FormField label="Environment Variables" inherited={isInherited("env", inheritedProps)}>
      <KeyValueList
        items={data.env || {}}
        onChange={(items) => onChange({ env: items })}
        keyPlaceholder="Variable"
        valuePlaceholder="Value"
        addLabel="Add Variable"
      />
    </FormField>
    <FormField label="Environment Files" inherited={isInherited("env-files", inheritedProps)}>
      <DynamicList
        items={data.envFiles || []}
        onChange={(items) => onChange({ envFiles: items })}
        placeholder="Path to env file"
        addLabel="Add Env File"
      />
    </FormField>
    <FormField label="Labels" inherited={isInherited("labels", inheritedProps)}>
      <KeyValueList
        items={data.labels || {}}
        onChange={(items) => onChange({ labels: items })}
        keyPlaceholder="Label"
        valuePlaceholder="Value"
        addLabel="Add Label"
      />
    </FormField>
  </>
);

export const ConfigTab: React.FC<TabProps> = ({ data, onChange, inheritedProps = [] }) => (
  <div className="space-y-3">
    <StartupConfigSection data={data} onChange={onChange} inheritedProps={inheritedProps} />
    <BindsAndEnvSection data={data} onChange={onChange} inheritedProps={inheritedProps} />
  </div>
);
