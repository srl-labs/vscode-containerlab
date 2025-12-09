/**
 * Runtime Tab for Node Editor
 */
import React from 'react';
import { TabProps } from './types';
import { FormField, InputField, SelectField, CheckboxField, DynamicList } from '../../shared/form';

const RESTART_POLICY_OPTIONS = [
  { value: '', label: 'Default' },
  { value: 'no', label: 'No' },
  { value: 'always', label: 'Always' },
  { value: 'on-failure', label: 'On Failure' },
  { value: 'unless-stopped', label: 'Unless Stopped' }
];

const UserAndEntrySection: React.FC<TabProps> = ({ data, onChange }) => (
  <>
    <FormField label="User">
      <InputField
        id="node-user"
        value={data.user || ''}
        onChange={(value) => onChange({ user: value })}
        placeholder="Container user"
      />
    </FormField>
    <FormField label="Entrypoint">
      <InputField
        id="node-entrypoint"
        value={data.entrypoint || ''}
        onChange={(value) => onChange({ entrypoint: value })}
        placeholder="Container entrypoint"
      />
    </FormField>
    <FormField label="Command">
      <InputField
        id="node-cmd"
        value={data.cmd || ''}
        onChange={(value) => onChange({ cmd: value })}
        placeholder="Container command"
      />
    </FormField>
    <FormField label="Exec Commands">
      <DynamicList
        items={data.exec || []}
        onChange={(items) => onChange({ exec: items })}
        placeholder="Command to execute"
        addLabel="Add Command"
      />
    </FormField>
  </>
);

const RestartAndDelaySection: React.FC<TabProps> = ({ data, onChange }) => (
  <>
    <FormField label="Restart Policy">
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
    <FormField label="Startup Delay (seconds)">
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

export const RuntimeTab: React.FC<TabProps> = ({ data, onChange }) => (
  <div className="space-y-3">
    <UserAndEntrySection data={data} onChange={onChange} />
    <RestartAndDelaySection data={data} onChange={onChange} />
  </div>
);
