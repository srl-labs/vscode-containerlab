/**
 * Link Info Panel Component
 * Shows properties of a selected link/edge with endpoint tabs and traffic charts
 */
import React, { useState } from 'react';

import type { LinkData } from '../../hooks/useAppState';
import type { InterfaceStatsPayload } from '../../../shared/types/topology';

import { FloatingPanel, PropertyRow } from './FloatingPanel';
import { TrafficChart } from './TrafficChart';

interface EndpointData {
  node?: string;
  interface?: string;
  mac?: string;
  mtu?: string | number;
  type?: string;
  stats?: InterfaceStatsPayload;
}

type LinkInfoData = LinkData & {
  endpointA?: EndpointData;
  endpointB?: EndpointData;
  extraData?: {
    clabSourceStats?: InterfaceStatsPayload;
    clabTargetStats?: InterfaceStatsPayload;
    clabSourceMacAddress?: string;
    clabTargetMacAddress?: string;
    clabSourceMtu?: string | number;
    clabTargetMtu?: string | number;
    clabSourceType?: string;
    clabTargetType?: string;
    [key: string]: unknown;
  };
};

interface LinkInfoPanelProps {
  isVisible: boolean;
  linkData: LinkInfoData | null;
  onClose: () => void;
}

type EndpointTab = 'a' | 'b';

/**
 * Get endpoint data from link data, extracting stats from extraData
 */
function getEndpoints(linkData: LinkInfoData): { a: EndpointData; b: EndpointData } {
  const extraData = linkData.extraData || {};

  const a: EndpointData = linkData.endpointA || {
    node: linkData.source,
    interface: linkData.sourceEndpoint || 'N/A',
    mac: (extraData.clabSourceMacAddress as string) || 'N/A',
    mtu: extraData.clabSourceMtu || 'N/A',
    type: (extraData.clabSourceType as string) || 'N/A',
    stats: extraData.clabSourceStats
  };

  const b: EndpointData = linkData.endpointB || {
    node: linkData.target,
    interface: linkData.targetEndpoint || 'N/A',
    mac: (extraData.clabTargetMacAddress as string) || 'N/A',
    mtu: extraData.clabTargetMtu || 'N/A',
    type: (extraData.clabTargetType as string) || 'N/A',
    stats: extraData.clabTargetStats
  };

  return { a, b };
}

export const LinkInfoPanel: React.FC<LinkInfoPanelProps> = ({
  isVisible,
  linkData,
  onClose
}) => {
  const [activeTab, setActiveTab] = useState<EndpointTab>('a');

  if (!linkData) return null;

  const endpoints = getEndpoints(linkData);
  const currentEndpoint = activeTab === 'a' ? endpoints.a : endpoints.b;
  const endpointKey = `${activeTab}:${currentEndpoint.node}:${currentEndpoint.interface}`;

  return (
    <FloatingPanel
      title="Link Properties"
      isVisible={isVisible}
      onClose={onClose}
      initialPosition={{ x: 20, y: 100 }}
      width={400}
      height={450}
      resizable={true}
      minWidth={350}
      minHeight={400}
    >
      {/* Tabs */}
      <div className="flex border-b border-[var(--border)] mb-3 -mx-4 -mt-2 px-2">
        <TabButton
          label={`${linkData.source}:${linkData.sourceEndpoint || 'eth'}`}
          isActive={activeTab === 'a'}
          onClick={() => setActiveTab('a')}
        />
        <TabButton
          label={`${linkData.target}:${linkData.targetEndpoint || 'eth'}`}
          isActive={activeTab === 'b'}
          onClick={() => setActiveTab('b')}
        />
      </div>

      {/* Properties Grid */}
      <div className="grid grid-cols-3 gap-4 mb-4">
        <PropertyRow label="Node" value={currentEndpoint.node || 'N/A'} />
        <PropertyRow label="Interface" value={currentEndpoint.interface || 'N/A'} />
        <PropertyRow label="Type" value={currentEndpoint.type || 'N/A'} />

        <PropertyRow label="MAC" value={currentEndpoint.mac || 'N/A'} />
        <PropertyRow label="MTU" value={String(currentEndpoint.mtu || 'N/A')} />
        <div></div>
      </div>

      {/* Traffic Chart */}
      <div className="flex-1 min-h-[200px]">
        <TrafficChart
          stats={currentEndpoint.stats}
          endpointKey={endpointKey}
        />
      </div>
    </FloatingPanel>
  );
};

/**
 * Tab Button Component
 */
interface TabButtonProps {
  label: string;
  isActive: boolean;
  onClick: () => void;
}

const TabButton: React.FC<TabButtonProps> = ({ label, isActive, onClick }) => (
  <button
    className={`
      px-3 py-2 text-sm font-medium border-b-2 transition-colors
      ${isActive
        ? 'border-[var(--accent)] text-[var(--accent)]'
        : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
      }
    `}
    onClick={onClick}
  >
    {label}
  </button>
);
