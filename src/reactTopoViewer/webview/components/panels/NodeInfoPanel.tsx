/**
 * Node Info Panel Component
 * Shows properties of a selected node with selectable/copyable values
 */
import React, { useCallback } from 'react';

import type { NodeData } from '../../hooks/useAppState';

import { FloatingPanel } from './InfoFloatingPanel';

interface NodeInfoPanelProps {
  isVisible: boolean;
  nodeData: NodeData | null;
  onClose: () => void;
}

/**
 * Extract a string property from extraData with fallback to top-level nodeData
 */
function getNodeProperty(
  extraData: Record<string, unknown>,
  nodeData: NodeData,
  extraKey: string,
  topLevelKey: keyof NodeData
): string {
  return (extraData[extraKey] as string) || (nodeData[topLevelKey] as string) || '';
}

/**
 * Extract display properties from node data
 */
function extractNodeDisplayProps(nodeData: NodeData) {
  const extraData = (nodeData.extraData as Record<string, unknown>) || {};

  return {
    nodeName: nodeData.label || nodeData.name || nodeData.id || 'Unknown',
    kind: getNodeProperty(extraData, nodeData, 'kind', 'kind'),
    state: getNodeProperty(extraData, nodeData, 'state', 'state'),
    image: getNodeProperty(extraData, nodeData, 'image', 'image'),
    mgmtIpv4: getNodeProperty(extraData, nodeData, 'mgmtIpv4Address', 'mgmtIpv4'),
    mgmtIpv6: getNodeProperty(extraData, nodeData, 'mgmtIpv6Address', 'mgmtIpv6'),
    fqdn: getNodeProperty(extraData, nodeData, 'fqdn', 'fqdn'),
  };
}

/**
 * Copyable value component with hover effect
 */
const CopyableValue: React.FC<{ value: string; className?: string }> = ({ value, className = '' }) => {
  const handleCopy = useCallback(() => {
    if (value) {
      window.navigator.clipboard.writeText(value).catch(() => {});
    }
  }, [value]);

  if (!value) {
    return <span className="text-[var(--vscode-descriptionForeground)] opacity-50">—</span>;
  }

  return (
    <span
      onClick={handleCopy}
      title="Click to copy"
      className={`
        cursor-pointer select-text
        hover:bg-[var(--vscode-toolbar-hoverBackground)]
        active:bg-[var(--vscode-toolbar-activeBackground)]
        rounded px-1 -mx-1 transition-colors duration-150
        ${className}
      `}
    >
      {value}
    </span>
  );
};

/**
 * Property row with label and copyable value
 */
const InfoRow: React.FC<{
  label: string;
  value: string;
  valueClassName?: string;
  fullWidth?: boolean;
}> = ({ label, value, valueClassName = '', fullWidth = false }) => (
  <div className={`flex flex-col gap-0.5 ${fullWidth ? 'col-span-full' : ''}`}>
    <span className="text-[10px] uppercase tracking-wider text-[var(--vscode-descriptionForeground)] font-medium">
      {label}
    </span>
    <CopyableValue value={value} className={valueClassName} />
  </div>
);

/**
 * Get state indicator dot color
 */
function getStateIndicatorColor(lowerState: string): string {
  if (lowerState === 'running' || lowerState === 'healthy') {
    return 'bg-green-400';
  }
  if (lowerState === 'stopped' || lowerState === 'exited') {
    return 'bg-red-400';
  }
  return 'bg-[var(--vscode-badge-foreground)]';
}

/**
 * State badge with color coding
 */
const StateBadge: React.FC<{ state: string }> = ({ state }) => {
  if (!state) {
    return <span className="text-[var(--vscode-descriptionForeground)] opacity-50">—</span>;
  }

  const lowerState = state.toLowerCase();

  let bgColor = 'bg-[var(--vscode-badge-background)]';
  let textColor = 'text-[var(--vscode-badge-foreground)]';

  if (lowerState === 'running' || lowerState === 'healthy') {
    bgColor = 'bg-green-500/20';
    textColor = 'text-green-400';
  } else if (lowerState === 'stopped' || lowerState === 'exited') {
    bgColor = 'bg-red-500/20';
    textColor = 'text-red-400';
  }

  const indicatorColor = getStateIndicatorColor(lowerState);

  return (
    <span className={`
      inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium
      ${bgColor} ${textColor}
    `}>
      <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${indicatorColor}`} />
      {state}
    </span>
  );
};

export const NodeInfoPanel: React.FC<NodeInfoPanelProps> = ({
  isVisible,
  nodeData,
  onClose
}) => {
  if (!nodeData) return null;

  const { nodeName, kind, state, image, mgmtIpv4, mgmtIpv6, fqdn } = extractNodeDisplayProps(nodeData);

  return (
    <FloatingPanel
      title="Node Properties"
      isVisible={isVisible}
      onClose={onClose}
      initialPosition={{ x: 20, y: 100 }}
      width={340}
      minWidth={280}
      minHeight={200}
    >
      <div className="flex flex-col gap-4 select-text">
        {/* Node Name - Hero section */}
        <div className="pb-3 border-b border-[var(--vscode-panel-border)]">
          <span className="text-[10px] uppercase tracking-wider text-[var(--vscode-descriptionForeground)] font-medium">
            Name
          </span>
          <div className="mt-1">
            <CopyableValue
              value={nodeName}
              className="text-base font-semibold text-[var(--vscode-foreground)]"
            />
          </div>
        </div>

        {/* Status row */}
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] uppercase tracking-wider text-[var(--vscode-descriptionForeground)] font-medium">
              Kind
            </span>
            <CopyableValue value={kind} className="text-sm" />
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] uppercase tracking-wider text-[var(--vscode-descriptionForeground)] font-medium">
              State
            </span>
            <StateBadge state={state} />
          </div>
        </div>

        {/* Image */}
        <InfoRow label="Image" value={image} fullWidth />

        {/* Network section */}
        <div className="pt-3 border-t border-[var(--vscode-panel-border)]">
          <div className="grid grid-cols-2 gap-4">
            <InfoRow label="Mgmt IPv4" value={mgmtIpv4} valueClassName="font-mono text-sm" />
            <InfoRow label="Mgmt IPv6" value={mgmtIpv6} valueClassName="font-mono text-sm" />
          </div>
        </div>

        {/* FQDN */}
        <InfoRow label="FQDN" value={fqdn} fullWidth valueClassName="font-mono text-sm" />
      </div>
    </FloatingPanel>
  );
};
