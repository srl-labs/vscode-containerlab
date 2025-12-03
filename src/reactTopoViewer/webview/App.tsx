/**
 * React TopoViewer Main Application Component
 */
import React, { useRef, useCallback, useEffect, useState } from 'react';
import { useTopoViewer } from './context/TopoViewerContext';
import { Navbar } from './components/navbar/Navbar';
import { CytoscapeCanvas, CytoscapeCanvasRef } from './components/canvas/CytoscapeCanvas';
import { NodeInfoPanel } from './components/panels/NodeInfoPanel';
import { LinkInfoPanel } from './components/panels/LinkInfoPanel';

interface NodeData {
  id: string;
  label?: string;
  name?: string;
  kind?: string;
  state?: string;
  image?: string;
  mgmtIpv4?: string;
  mgmtIpv6?: string;
  fqdn?: string;
  [key: string]: unknown;
}

interface LinkData {
  id: string;
  source: string;
  target: string;
  sourceEndpoint?: string;
  targetEndpoint?: string;
  [key: string]: unknown;
}

export const App: React.FC = () => {
  const { state, isLoading, error, selectNode, selectEdge } = useTopoViewer();
  const cytoscapeRef = useRef<CytoscapeCanvasRef>(null);
  const [selectedNodeData, setSelectedNodeData] = useState<NodeData | null>(null);
  const [selectedLinkData, setSelectedLinkData] = useState<LinkData | null>(null);

  // Zoom to fit handler
  const handleZoomToFit = useCallback(() => {
    cytoscapeRef.current?.fit();
  }, []);

  // Run layout handler
  const handleToggleLayout = useCallback(() => {
    cytoscapeRef.current?.runLayout('cose');
  }, []);

  // Get element data when selection changes
  useEffect(() => {
    const cy = cytoscapeRef.current?.getCy();
    if (!cy) return;

    if (state.selectedNode) {
      const node = cy.getElementById(state.selectedNode);
      if (node.length > 0) {
        setSelectedNodeData(node.data() as NodeData);
      }
    } else {
      setSelectedNodeData(null);
    }

    if (state.selectedEdge) {
      const edge = cy.getElementById(state.selectedEdge);
      if (edge.length > 0) {
        const data = edge.data();
        setSelectedLinkData({
          id: data.id,
          source: data.source,
          target: data.target,
          sourceEndpoint: data.sourceEndpoint || data.sourceInterface,
          targetEndpoint: data.targetEndpoint || data.targetInterface,
          ...data
        } as LinkData);
      }
    } else {
      setSelectedLinkData(null);
    }
  }, [state.selectedNode, state.selectedEdge]);

  // Close node panel handler
  const handleCloseNodePanel = useCallback(() => {
    selectNode(null);
  }, [selectNode]);

  // Close link panel handler
  const handleCloseLinkPanel = useCallback(() => {
    selectEdge(null);
  }, [selectEdge]);

  // Loading state
  if (isLoading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Loading topology...</p>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="error-container">
        <div className="error-icon">⚠️</div>
        <h2 className="text-lg font-semibold">Error Loading Topology</h2>
        <p className="text-secondary">{error}</p>
      </div>
    );
  }

  // Main application
  return (
    <div className="topoviewer-app">
      {/* Navbar */}
      <Navbar
        onZoomToFit={handleZoomToFit}
        onToggleLayout={handleToggleLayout}
      />

      {/* Main Canvas Area */}
      <main className="topoviewer-main">
        <CytoscapeCanvas
          ref={cytoscapeRef}
          elements={state.elements}
        />

        {/* Node Info Panel */}
        <NodeInfoPanel
          isVisible={!!state.selectedNode}
          nodeData={selectedNodeData}
          onClose={handleCloseNodePanel}
        />

        {/* Link Info Panel */}
        <LinkInfoPanel
          isVisible={!!state.selectedEdge}
          linkData={selectedLinkData}
          onClose={handleCloseLinkPanel}
        />
      </main>
    </div>
  );
};
