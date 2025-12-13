/**
 * Custom hooks extracted from ReactFlowCanvas to reduce complexity
 */
import type React from 'react';
import { useRef, useEffect, useCallback, useMemo, useState } from 'react';
import type { Node, Edge, ReactFlowInstance } from '@xyflow/react';
import type { CyElement } from '../../../shared/types/topology';
import { convertElements } from '../../components/react-flow-canvas/conversion';
import { applyLayout, hasPresetPositions, type LayoutName } from '../../components/react-flow-canvas/layout';
import { sendCommandToExtension } from '../../utils/extensionMessaging';
import { log } from '../../utils/logger';

/**
 * Hook for managing element conversion from CyElements to React Flow nodes/edges
 */
export function useElementConversion(
  elements: CyElement[],
  setNodes: React.Dispatch<React.SetStateAction<Node[]>>,
  setEdges: React.Dispatch<React.SetStateAction<Edge[]>>
) {
  const [isInitialized, setIsInitialized] = useState(false);
  const prevElementsRef = useRef<CyElement[]>([]);

  useEffect(() => {
    if (!elements.length && isInitialized) {
      setNodes([]);
      setEdges([]);
      return;
    }

    if (prevElementsRef.current === elements) return;
    prevElementsRef.current = elements;

    log.info(`[ReactFlowCanvas] Converting ${elements.length} elements`);
    const { nodes: rfNodes, edges: rfEdges } = convertElements(elements);

    if (!hasPresetPositions(rfNodes) && rfNodes.length > 0) {
      log.info('[ReactFlowCanvas] Applying force layout (no preset positions)');
      setNodes(applyLayout('force', rfNodes, rfEdges));
    } else {
      setNodes(rfNodes);
    }

    setEdges(rfEdges);
    setIsInitialized(true);
  }, [elements, setNodes, setEdges, isInitialized]);
}

/**
 * Hook for delete node/edge handlers
 */
export function useDeleteHandlers(
  edges: Edge[],
  setNodes: React.Dispatch<React.SetStateAction<Node[]>>,
  setEdges: React.Dispatch<React.SetStateAction<Edge[]>>,
  selectNode: (id: string | null) => void,
  selectEdge: (id: string | null) => void,
  closeContextMenu: () => void,
  onNodeDelete?: (nodeId: string) => void,
  onEdgeDelete?: (edgeId: string) => void
) {
  const handleDeleteNode = useCallback((nodeId: string) => {
    log.info(`[ReactFlowCanvas] Deleting node: ${nodeId}`);
    setNodes((nds) => nds.filter((n) => n.id !== nodeId));
    setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
    sendCommandToExtension('panel-delete-node', { nodeId });
    onNodeDelete?.(nodeId);
    selectNode(null);
    closeContextMenu();
  }, [setNodes, setEdges, selectNode, onNodeDelete, closeContextMenu]);

  const handleDeleteEdge = useCallback((edgeId: string) => {
    log.info(`[ReactFlowCanvas] Deleting edge: ${edgeId}`);
    const edge = edges.find((e) => e.id === edgeId);
    setEdges((eds) => eds.filter((e) => e.id !== edgeId));

    if (edge) {
      const edgeData = edge.data as Record<string, unknown> | undefined;
      sendCommandToExtension('panel-delete-link', {
        edgeId,
        linkData: {
          source: edge.source,
          target: edge.target,
          sourceEndpoint: edgeData?.sourceEndpoint || '',
          targetEndpoint: edgeData?.targetEndpoint || ''
        }
      });
    }
    onEdgeDelete?.(edgeId);
    selectEdge(null);
    closeContextMenu();
  }, [edges, setEdges, selectEdge, onEdgeDelete, closeContextMenu]);

  return { handleDeleteNode, handleDeleteEdge };
}

/**
 * Hook for link creation mode
 */
export function useLinkCreation(
  setEdges: React.Dispatch<React.SetStateAction<Edge[]>>
) {
  const [linkSourceNode, setLinkSourceNode] = useState<string | null>(null);
  const [mousePosition, setMousePosition] = useState<{ x: number; y: number } | null>(null);

  const startLinkCreation = useCallback((nodeId: string) => {
    log.info(`[ReactFlowCanvas] Starting link creation from: ${nodeId}`);
    setLinkSourceNode(nodeId);
  }, []);

  const cancelLinkCreation = useCallback(() => {
    log.info('[ReactFlowCanvas] Cancelling link creation');
    setLinkSourceNode(null);
    setMousePosition(null);
  }, []);

  const completeLinkCreation = useCallback((targetNodeId: string) => {
    if (!linkSourceNode) return;

    const isLoopLink = linkSourceNode === targetNodeId;
    log.info(`[ReactFlowCanvas] Completing ${isLoopLink ? 'loop ' : ''}link: ${linkSourceNode} -> ${targetNodeId}`);
    const edgeId = `${linkSourceNode}-${targetNodeId}-${Date.now()}`;

    sendCommandToExtension('create-link', {
      linkData: {
        id: edgeId,
        source: linkSourceNode,
        target: targetNodeId,
        sourceEndpoint: 'eth1',
        targetEndpoint: 'eth1'
      }
    });

    const newEdge = {
      id: edgeId,
      source: linkSourceNode,
      target: targetNodeId,
      type: 'topology-edge',
      data: { sourceEndpoint: 'eth1', targetEndpoint: 'eth1', linkStatus: 'unknown' }
    };

    setEdges((eds) => [...eds, newEdge]);
    setLinkSourceNode(null);
    setMousePosition(null);
  }, [linkSourceNode, setEdges]);

  // Track mouse movement when in link creation mode
  useEffect(() => {
    if (!linkSourceNode) return;

    const handleMouseMove = (e: MouseEvent) => setMousePosition({ x: e.clientX, y: e.clientY });
    const handleKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') cancelLinkCreation(); };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [linkSourceNode, cancelLinkCreation]);

  return {
    linkSourceNode,
    mousePosition,
    startLinkCreation,
    completeLinkCreation,
    cancelLinkCreation
  };
}

/**
 * Hook for calculating source node position for link creation line
 */
export function useSourceNodePosition(linkSourceNode: string | null, nodes: Node[]) {
  return useMemo(() => {
    if (!linkSourceNode) return null;
    const node = nodes.find(n => n.id === linkSourceNode);
    if (!node) return null;
    const nodeWidth = 60;
    const nodeHeight = 60;
    return {
      x: node.position.x + nodeWidth / 2,
      y: node.position.y + nodeHeight / 2
    };
  }, [linkSourceNode, nodes]);
}

/**
 * Hook for keyboard delete handlers
 */
export function useKeyboardDeleteHandlers(
  mode: 'view' | 'edit',
  isLocked: boolean,
  selectedNode: string | null,
  selectedEdge: string | null,
  handleDeleteNode: (nodeId: string) => void,
  handleDeleteEdge: (edgeId: string) => void
) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Delete' && event.key !== 'Backspace') return;
      if (mode !== 'edit' || isLocked) return;

      const tagName = (event.target as HTMLElement).tagName;
      if (tagName === 'INPUT' || tagName === 'TEXTAREA') return;

      if (selectedNode) handleDeleteNode(selectedNode);
      else if (selectedEdge) handleDeleteEdge(selectedEdge);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mode, isLocked, selectedNode, selectedEdge, handleDeleteNode, handleDeleteEdge]);
}

/**
 * Hook to create imperative handle methods
 */
export function useCanvasRefMethods(
  reactFlowInstanceRef: React.RefObject<ReactFlowInstance | null>,
  nodes: Node[],
  edges: Edge[],
  setNodes: React.Dispatch<React.SetStateAction<Node[]>>
) {
  return useMemo(() => ({
    fit: () => {
      reactFlowInstanceRef.current?.fitView({ padding: 0.2, duration: 200 });
    },
    runLayout: (layoutName: string) => {
      const newNodes = applyLayout(layoutName as LayoutName, nodes, edges);
      setNodes(newNodes);
      setTimeout(() => {
        reactFlowInstanceRef.current?.fitView({ padding: 0.2, duration: 200 });
      }, 100);
    },
    getReactFlowInstance: () => reactFlowInstanceRef.current
  }), [nodes, edges, setNodes, reactFlowInstanceRef]);
}
