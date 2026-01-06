/**
 * Node Info Panel Component
 * Shows properties of a selected node
 */
import React from 'react';

import type { NodeData } from '../../hooks/useAppState';

import { FloatingPanel, PropertyRow } from './InfoFloatingPanel';

interface NodeInfoPanelProps {
  isVisible: boolean;
  nodeData: NodeData | null;
  onClose: () => void;
}

export const NodeInfoPanel: React.FC<NodeInfoPanelProps> = ({
  isVisible,
  nodeData,
  onClose
}) => {
  if (!nodeData) return null;

  const nodeName = nodeData.label || nodeData.name || nodeData.id || 'Unknown';
  const kind = nodeData.kind || 'N/A';
  const state = nodeData.state || 'N/A';
  const image = nodeData.image || 'N/A';
  const mgmtIpv4 = nodeData.mgmtIpv4 || 'N/A';
  const mgmtIpv6 = nodeData.mgmtIpv6 || 'N/A';
  const fqdn = nodeData.fqdn || 'N/A';

  return (
    <FloatingPanel
      title="Node Properties"
      isVisible={isVisible}
      onClose={onClose}
      initialPosition={{ x: 20, y: 100 }}
      width={360}
    >
      <div className="grid grid-cols-3 gap-4">
        {/* Row 1: Name (spans full width) */}
        <PropertyRow
          label="Name"
          value={nodeName}
          className="col-span-3"
        />

        {/* Row 2: Kind, State, Image */}
        <PropertyRow label="Kind" value={kind} />
        <PropertyRow label="State" value={renderState(state)} />
        <PropertyRow label="Image" value={image} />

        {/* Row 3: IPs and FQDN */}
        <PropertyRow label="Mgmt IPv4" value={mgmtIpv4} />
        <PropertyRow label="Mgmt IPv6" value={mgmtIpv6} />
        <PropertyRow label="FQDN" value={fqdn} />
      </div>
    </FloatingPanel>
  );
};

/**
 * Get color based on node state
 */
function getStateColor(state: string): string {
  const lowerState = state.toLowerCase();
  if (lowerState === 'running' || lowerState === 'healthy') {
    return 'var(--vscode-charts-green, #89d185)';
  }
  if (lowerState === 'stopped' || lowerState === 'exited') {
    return 'var(--vscode-charts-red, #f48771)';
  }
  return 'var(--vscode-foreground)';
}

/**
 * Render node state with appropriate styling
 */
function renderState(state: string): React.ReactElement {
  const stateColor = getStateColor(state);
  return (
    <span style={{ color: stateColor }}>
      {state}
    </span>
  );
}
