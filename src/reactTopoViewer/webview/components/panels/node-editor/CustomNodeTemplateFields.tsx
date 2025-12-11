/**
 * Custom Node Template Fields
 *
 * Fields shown when creating/editing custom node templates:
 * - Template Name, Base Name, Interface Pattern, Set as default
 */
import React, { useState, useCallback } from 'react';
import { TabProps } from './types';
import { FormField, InputField, CheckboxField, Section } from '../../shared/form';

/**
 * Interface pattern example with description
 */
interface PatternExample {
  pattern: string;
  description: string;
  result: string;
}

const PATTERN_EXAMPLES: PatternExample[] = [
  { pattern: 'e1-{n}', description: 'Sequential from 1', result: 'e1-1, e1-2, e1-3...' },
  { pattern: 'eth{n:0}', description: 'Sequential from 0', result: 'eth0, eth1, eth2...' },
  { pattern: 'Gi0/0/{n:1-4}', description: 'Range 1-4 only', result: 'Gi0/0/1, Gi0/0/2, Gi0/0/3, Gi0/0/4' },
  { pattern: 'xe-0/0/{n:0}', description: 'Juniper style', result: 'xe-0/0/0, xe-0/0/1...' },
];

/**
 * Copy text to clipboard with fallback
 */
async function copyToClipboard(text: string): Promise<boolean> {
  // Try modern clipboard API first
  if (typeof window !== 'undefined' && window.navigator?.clipboard) {
    try {
      await window.navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to fallback
    }
  }

  // Fallback using selection
  if (typeof document !== 'undefined') {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand('copy'); // eslint-disable-line sonarjs/deprecation
      return true;
    } finally {
      document.body.removeChild(textarea);
    }
  }

  return false;
}

/**
 * Copyable code snippet with copy button
 */
const CopyableCode: React.FC<{ text: string; className?: string }> = ({ text, className = '' }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    const success = await copyToClipboard(text);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }, [text]);

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={`inline-flex items-center gap-1.5 font-mono text-xs px-1.5 py-0.5 rounded
        bg-[var(--vscode-textCodeBlock-background)]
        hover:bg-[var(--vscode-list-hoverBackground)]
        text-[var(--vscode-textPreformat-foreground)]
        border border-[var(--vscode-widget-border)]
        transition-colors cursor-pointer ${className}`}
      title="Click to copy"
    >
      <span>{text}</span>
      <i className={`fas ${copied ? 'fa-check text-green-500' : 'fa-copy opacity-60'} text-[10px]`} />
    </button>
  );
};

/**
 * Interface pattern info panel with examples
 */
const InterfacePatternInfo: React.FC<{ isExpanded: boolean; onToggle: () => void }> = ({
  isExpanded,
  onToggle
}) => {
  return (
    <div className="mt-2 rounded border border-[var(--vscode-widget-border)] overflow-hidden">
      {/* Header - always visible */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs
          bg-[var(--vscode-editor-inactiveSelectionBackground)]
          hover:bg-[var(--vscode-list-hoverBackground)]
          transition-colors"
      >
        <i className={`fas fa-chevron-right text-[10px] transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
        <i className="fas fa-info-circle text-[var(--vscode-textLink-foreground)]" />
        <span className="text-[var(--vscode-descriptionForeground)]">
          Pattern syntax: Use <code className="px-1 bg-[var(--vscode-textCodeBlock-background)] rounded">{'{n}'}</code> for sequential numbering
        </span>
      </button>

      {/* Expandable content */}
      {isExpanded && (
        <div className="px-3 py-2 bg-[var(--vscode-editor-background)] border-t border-[var(--vscode-widget-border)]">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[var(--vscode-descriptionForeground)]">
                <th className="text-left font-medium pb-2 pr-3">Pattern</th>
                <th className="text-left font-medium pb-2 pr-3">Description</th>
                <th className="text-left font-medium pb-2">Result</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--vscode-widget-border)]">
              {PATTERN_EXAMPLES.map((example) => (
                <tr key={example.pattern}>
                  <td className="py-1.5 pr-3">
                    <CopyableCode text={example.pattern} />
                  </td>
                  <td className="py-1.5 pr-3 text-[var(--vscode-descriptionForeground)]">
                    {example.description}
                  </td>
                  <td className="py-1.5 text-[var(--vscode-descriptionForeground)] font-mono">
                    {example.result}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

/**
 * Custom Node Template fields - shown only when editing custom node templates
 */
export const CustomNodeTemplateFields: React.FC<TabProps> = ({ data, onChange }) => {
  const [showPatternInfo, setShowPatternInfo] = useState(false);

  return (
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
        <div>
          <FormField label="Interface Pattern">
            <InputField
              id="node-interface-pattern"
              value={data.interfacePattern || ''}
              onChange={(value) => onChange({ interfacePattern: value })}
              placeholder="e.g., e1-{n} or Gi0/0/{n:0}"
            />
          </FormField>
          <InterfacePatternInfo
            isExpanded={showPatternInfo}
            onToggle={() => setShowPatternInfo(!showPatternInfo)}
          />
        </div>
      </div>
    </Section>
  );
};
