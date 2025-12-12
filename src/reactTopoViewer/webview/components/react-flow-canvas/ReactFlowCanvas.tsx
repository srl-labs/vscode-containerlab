/**
 * ReactFlowCanvas - Main React Flow canvas component for topology visualization
 * Replaces CytoscapeCanvas with @xyflow/react
 */
import React, {
  useRef,
  useEffect,
  useImperativeHandle,
  forwardRef,
  useMemo,
  useState
} from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  BackgroundVariant,
  SelectionMode,
  ConnectionLineType
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import type { CyElement } from '../../../shared/types/topology';
import type { ReactFlowCanvasRef, ReactFlowCanvasProps } from './types';
import { convertElements } from './conversion';
import { nodeTypes } from './nodes';
import { edgeTypes } from './edges';
import { applyLayout, hasPresetPositions, type LayoutName } from './layout';
import { useTopoViewer } from '../../context/TopoViewerContext';
import { useCanvasHandlers } from './useCanvasHandlers';
import { log } from '../../utils/logger';

/**
 * CSS styles for the canvas
 */
const canvasStyle: React.CSSProperties = {
  width: '100%',
  height: '100%',
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0
};

/**
 * MiniMap node color function
 */
function getMiniMapNodeColor(node: Node): string {
  switch (node.type) {
    case 'topology-node':
      return '#005aff';
    case 'cloud-node':
      return '#6B7280';
    case 'group-node':
      return 'rgba(200, 200, 200, 0.5)';
    case 'free-text-node':
      return '#F59E0B';
    case 'free-shape-node':
      return '#10B981';
    default:
      return '#888';
  }
}

// Pro options (disable attribution)
const proOptions = { hideAttribution: true };

// Default viewport
const defaultViewport = { x: 0, y: 0, zoom: 1 };

/**
 * ReactFlowCanvas component
 */
const ReactFlowCanvasComponent = forwardRef<ReactFlowCanvasRef, ReactFlowCanvasProps>(
  ({ elements }, ref) => {
    const { state, selectNode, selectEdge, editNode, editEdge } = useTopoViewer();
    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);
    const [isInitialized, setIsInitialized] = useState(false);
    const prevElementsRef = useRef<CyElement[]>([]);

    // Use extracted event handlers
    const handlers = useCanvasHandlers({
      selectNode,
      selectEdge,
      editNode,
      editEdge,
      mode: state.mode,
      onNodesChangeBase: onNodesChange
    });

    // Convert elements when they change
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

    // Expose ref methods
    useImperativeHandle(ref, () => ({
      fit: () => {
        handlers.reactFlowInstance.current?.fitView({ padding: 0.2, duration: 200 });
      },
      runLayout: (layoutName: string) => {
        const newNodes = applyLayout(layoutName as LayoutName, nodes, edges);
        setNodes(newNodes);
        setTimeout(() => {
          handlers.reactFlowInstance.current?.fitView({ padding: 0.2, duration: 200 });
        }, 100);
      },
      getReactFlowInstance: () => handlers.reactFlowInstance.current
    }), [nodes, edges, setNodes, handlers.reactFlowInstance]);

    return (
      <div style={canvasStyle} className="react-flow-canvas">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={handlers.handleNodesChange}
          onEdgesChange={onEdgesChange}
          onInit={handlers.onInit}
          onNodeClick={handlers.onNodeClick}
          onNodeDoubleClick={handlers.onNodeDoubleClick}
          onEdgeClick={handlers.onEdgeClick}
          onEdgeDoubleClick={handlers.onEdgeDoubleClick}
          onPaneClick={handlers.onPaneClick}
          onConnect={handlers.onConnect}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          defaultViewport={defaultViewport}
          minZoom={0.1}
          maxZoom={4}
          snapToGrid={false}
          selectionMode={SelectionMode.Partial}
          selectNodesOnDrag={false}
          panOnDrag
          selectionOnDrag={false}
          selectionKeyCode="Shift"
          connectionLineType={ConnectionLineType.Bezier}
          proOptions={proOptions}
          deleteKeyCode={null}
          multiSelectionKeyCode="Shift"
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={20}
            size={1}
            color="#555"
          />
          <Controls
            showZoom
            showFitView
            showInteractive={false}
            position="bottom-right"
          />
          <MiniMap
            nodeColor={getMiniMapNodeColor}
            nodeStrokeWidth={3}
            zoomable
            pannable
            position="bottom-left"
          />
        </ReactFlow>
      </div>
    );
  }
);

ReactFlowCanvasComponent.displayName = 'ReactFlowCanvas';

export const ReactFlowCanvas = ReactFlowCanvasComponent;
