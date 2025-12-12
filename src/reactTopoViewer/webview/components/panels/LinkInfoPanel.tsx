/**
 * Link Info Panel Component
 * Shows properties of a selected link/edge with endpoint tabs
 */
import React, { useState } from 'react';
import { FloatingPanel, PropertyRow } from './FloatingPanel';
import type { LinkData } from '../../hooks';

interface EndpointData {
  node?: string;
  interface?: string;
  mac?: string;
  mtu?: string | number;
  type?: string;
}

type LinkInfoData = LinkData & {
  endpointA?: EndpointData;
  endpointB?: EndpointData;
};

interface LinkInfoPanelProps {
  isVisible: boolean;
  linkData: LinkInfoData | null;
  onClose: () => void;
}

type EndpointTab = 'a' | 'b';

/**
 * Create default endpoint data
 */
function createDefaultEndpoint(node: string, iface: string | undefined): EndpointData {
  return {
    node,
    interface: iface || 'N/A',
    mac: 'N/A',
    mtu: 'N/A',
    type: 'N/A'
  };
}

/**
 * Get endpoint data from link data
 */
function getEndpoints(linkData: LinkInfoData): { a: EndpointData; b: EndpointData } {
  const a = linkData.endpointA || createDefaultEndpoint(linkData.source, linkData.sourceEndpoint);
  const b = linkData.endpointB || createDefaultEndpoint(linkData.target, linkData.targetEndpoint);
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

  return (
    <FloatingPanel
      title="Link Properties"
      isVisible={isVisible}
      onClose={onClose}
      initialPosition={{ x: 20, y: 100 }}
      width={360}
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

      {/* Tab Content */}
      <div className="grid grid-cols-3 gap-4">
        <PropertyRow label="Node" value={currentEndpoint.node || 'N/A'} />
        <PropertyRow label="Interface" value={currentEndpoint.interface || 'N/A'} />
        <PropertyRow label="Type" value={currentEndpoint.type || 'N/A'} />

        <PropertyRow label="MAC" value={currentEndpoint.mac || 'N/A'} />
        <PropertyRow label="MTU" value={String(currentEndpoint.mtu || 'N/A')} />
        <div></div>
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
