/**
 * React Flow Instance Hook
 * Manages ReactFlow instance and provides a compatibility interface for migration from Cytoscape
 */
import { useRef, useCallback, useState } from "react";
import type { ReactFlowInstance } from "@xyflow/react";

import type { ReactFlowCanvasRef } from "../components/react-flow-canvas/types";

/**
 * Viewport transform interface (compatible with Cytoscape's pan/zoom)
 */
export interface ViewportTransform {
  pan: { x: number; y: number };
  zoom: number;
}

/**
 * Hook for managing ReactFlow canvas instance
 * Provides a similar interface to useCytoscapeInstance for migration compatibility
 */
export function useReactFlowInstance(): {
  reactFlowRef: React.RefObject<ReactFlowCanvasRef | null>;
  rfInstance: ReactFlowInstance | null;
  onInit: (instance: ReactFlowInstance) => void;
  getViewport: () => ViewportTransform;
  getContainer: () => HTMLElement | null;
} {
  const reactFlowRef = useRef<ReactFlowCanvasRef>(null);
  const [rfInstance, setRfInstance] = useState<ReactFlowInstance | null>(null);

  const onInit = useCallback((instance: ReactFlowInstance) => {
    setRfInstance(instance);
  }, []);

  const getViewport = useCallback((): ViewportTransform => {
    if (!rfInstance) {
      return { pan: { x: 0, y: 0 }, zoom: 1 };
    }
    const viewport = rfInstance.getViewport();
    return {
      pan: { x: viewport.x, y: viewport.y },
      zoom: viewport.zoom
    };
  }, [rfInstance]);

  const getContainer = useCallback((): HTMLElement | null => {
    // ReactFlow container is the .react-flow element
    const container = document.querySelector(".react-flow");
    return container as HTMLElement | null;
  }, []);

  return { reactFlowRef, rfInstance, onInit, getViewport, getContainer };
}

/**
 * Compatibility interface that mimics Cytoscape Core for annotation layers
 * This is a temporary bridge during migration - will be removed once all
 * annotation layers are updated to use ReactFlow directly
 */
export interface CyCompatInterface {
  pan: () => { x: number; y: number };
  zoom: () => number;
  container: () => HTMLElement | null;
  on: (events: string, handler: () => void) => void;
  off: (events: string, handler: () => void) => void;
  scratch: (key: string, value?: unknown) => unknown;
}

/**
 * Create a Cytoscape-compatible interface from ReactFlow instance
 * This allows existing annotation layers to work without modification
 */
export function createCyCompatInterface(
  rfInstance: ReactFlowInstance | null
): CyCompatInterface | null {
  if (!rfInstance) return null;

  const scratchData: Record<string, unknown> = {};
  const eventHandlers: Map<string, Set<() => void>> = new Map();

  return {
    pan: () => {
      const viewport = rfInstance.getViewport();
      return { x: viewport.x, y: viewport.y };
    },
    zoom: () => {
      return rfInstance.getViewport().zoom;
    },
    container: () => {
      return document.querySelector(".react-flow") as HTMLElement | null;
    },
    on: (events: string, handler: () => void) => {
      // For now, we don't need to actually bind events since ReactFlow
      // handles viewport changes differently. This is a no-op stub.
      const eventList = events.split(" ");
      eventList.forEach((event) => {
        if (!eventHandlers.has(event)) {
          eventHandlers.set(event, new Set());
        }
        eventHandlers.get(event)!.add(handler);
      });
    },
    off: (events: string, handler: () => void) => {
      const eventList = events.split(" ");
      eventList.forEach((event) => {
        eventHandlers.get(event)?.delete(handler);
      });
    },
    scratch: (key: string, value?: unknown) => {
      if (value !== undefined) {
        scratchData[key] = value;
      }
      return scratchData[key];
    }
  };
}

/**
 * Hook for selection data using ReactFlow state
 */
export function useReactFlowSelectionData(
  reactFlowRef: React.RefObject<ReactFlowCanvasRef | null>,
  selectedNode: string | null,
  selectedEdge: string | null,
  _refreshTrigger?: unknown
): {
  selectedNodeData: Record<string, unknown> | null;
  selectedLinkData: Record<string, unknown> | null;
} {
  const [selectedNodeData, setSelectedNodeData] = useState<Record<string, unknown> | null>(null);
  const [selectedLinkData, setSelectedLinkData] = useState<Record<string, unknown> | null>(null);

  // Use useEffect to update selection data when selection changes
  // This will be called when selectedNode, selectedEdge, or refreshTrigger changes
  const nodes = reactFlowRef.current?.getNodes() ?? [];
  const edges = reactFlowRef.current?.getEdges() ?? [];

  if (selectedNode) {
    const node = nodes.find((n) => n.id === selectedNode);
    if (node && (!selectedNodeData || selectedNodeData.id !== selectedNode)) {
      setSelectedNodeData(node.data as Record<string, unknown>);
    }
  } else if (selectedNodeData) {
    setSelectedNodeData(null);
  }

  if (selectedEdge) {
    const edge = edges.find((e) => e.id === selectedEdge);
    if (edge && (!selectedLinkData || selectedLinkData.id !== selectedEdge)) {
      const edgeData = {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        ...((edge.data as Record<string, unknown>) ?? {})
      };
      setSelectedLinkData(edgeData);
    }
  } else if (selectedLinkData) {
    setSelectedLinkData(null);
  }

  return { selectedNodeData, selectedLinkData };
}
