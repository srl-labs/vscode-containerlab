/**
 * Runtime Tab for Node Editor
 */
import React from 'react';
import { TabProps } from './types';
import { FormField, InputField, SelectField, CheckboxField, DynamicList } from '../../shared/form';

/** Helper to check if a property is inherited */
const isInherited = (prop: string, inheritedProps: string[] = []) => inheritedProps.includes(prop);

const RESTART_POLICY_OPTIONS = [
  { value: '', label: 'Default' },
  { value: 'no', label: 'No' },
  { value: 'always', label: 'Always' },
  { value: 'on-failure', label: 'On Failure' },
  { value: 'unless-stopped', label: 'Unless Stopped' }
];

const UserAndEntrySection: React.FC<TabProps> = ({ data, onChange, inheritedProps = [] }) => (
  <>
    <FormField label="User" inherited={isInherited('user', inheritedProps)}>
      <InputField
        id="node-user"
        value={data.user || ''}
        onChange={(value) => onChange({ user: value })}
        placeholder="Container user"
      />
    </FormField>
    <FormField label="Entrypoint" inherited={isInherited('entrypoint', inheritedProps)}>
      <InputField
        id="node-entrypoint"
        value={data.entrypoint || ''}
        onChange={(value) => onChange({ entrypoint: value })}
        placeholder="Container entrypoint"
      />
    </FormField>
    <FormField label="Command" inherited={isInherited('cmd', inheritedProps)}>
      <InputField
        id="node-cmd"
        value={data.cmd || ''}
        onChange={(value) => onChange({ cmd: value })}
        placeholder="Container command"
      />
    </FormField>
    <FormField label="Exec Commands" inherited={isInherited('exec', inheritedProps)}>
      <DynamicList
        items={data.exec || []}
        onChange={(items) => onChange({ exec: items })}
        placeholder="Command to execute"
        addLabel="Add Command"
      />
    </FormField>
  </>
);

const RestartAndDelaySection: React.FC<TabProps> = ({ data, onChange, inheritedProps = [] }) => (
  <>
    <FormField label="Restart Policy" inherited={isInherited('restart-policy', inheritedProps)}>
      <SelectField
        id="node-restart-policy"
        value={data.restartPolicy || ''}
        onChange={(value) => onChange({ restartPolicy: value })}
        options={RESTART_POLICY_OPTIONS}
      />
    </FormField>
    <CheckboxField
      id="node-auto-remove"
      label="Auto-remove container on exit"
      checked={data.autoRemove || false}
      onChange={(checked) => onChange({ autoRemove: checked })}
    />
    <FormField label="Startup Delay (seconds)" inherited={isInherited('startup-delay', inheritedProps)}>
      <InputField
        id="node-startup-delay"
        type="number"
        value={String(data.startupDelay ?? '')}
        onChange={(value) => onChange({ startupDelay: value ? parseInt(value, 10) : undefined })}
        placeholder="0"
        min={0}
      />
    </FormField>
  </>
);

export const RuntimeTab: React.FC<TabProps> = ({ data, onChange, inheritedProps = [] }) => (
  <div className="space-y-3">
    <UserAndEntrySection data={data} onChange={onChange} inheritedProps={inheritedProps} />
    <RestartAndDelaySection data={data} onChange={onChange} inheritedProps={inheritedProps} />
  </div>
);
