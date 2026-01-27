/**
 * React TopoViewer Main Application Component
 *
 * Uses context-based architecture for undo/redo and annotations.
 * Now uses ReactFlow as the rendering layer for rendering.
 * Graph state is managed by GraphContext (React Flow is source of truth).
 */
import React from "react";
import type { ReactFlowInstance } from "@xyflow/react";

import type { EdgeAnnotation } from "../shared/types/topology";

import type { CanvasRef } from "./hooks/ui/useAppState";
import type { TopoViewerState } from "./context/TopoViewerContext";
import type { ReactFlowCanvasRef } from "./components/canvas";
import type { FloatingActionPanelHandle } from "./components/panels";
import { useTopoViewerActions, useTopoViewerState } from "./context/TopoViewerContext";
import { GraphProvider } from "./context/GraphContext";
import { UndoRedoProvider } from "./context/UndoRedoContext";
import { AnnotationProvider } from "./context/AnnotationContext";
import { ViewportProvider } from "./context/ViewportContext";
import { useLayoutControls } from "./hooks/ui/useAppState";
import { useInitialGraphData } from "./hooks/app/useInitialGraphData";
import { AppContent } from "./AppContent";

/** Main App component with providers */
export const App: React.FC = () => {
  const { state } = useTopoViewerState();
  const { setEdgeAnnotations } = useTopoViewerActions();

  const { initialNodes, initialEdges } = useInitialGraphData();

  const reactFlowRef = React.useRef<ReactFlowCanvasRef>(null);
  const [rfInstance, setRfInstance] = React.useState<ReactFlowInstance | null>(null);
  const floatingPanelRef = React.useRef<FloatingActionPanelHandle>(null);
  const layoutControls = useLayoutControls(
    reactFlowRef as unknown as React.RefObject<CanvasRef | null>
  );

  const handleEdgeAnnotationsUpdate = React.useCallback(
    (annotations: EdgeAnnotation[]) => {
      setEdgeAnnotations(annotations);
    },
    [setEdgeAnnotations]
  );

  return (
    <GraphProvider
      initialNodes={initialNodes}
      initialEdges={initialEdges}
      onEdgeAnnotationsUpdate={handleEdgeAnnotationsUpdate}
    >
      <GraphProviderConsumer
        state={state}
        rfInstance={rfInstance}
        setRfInstance={setRfInstance}
        floatingPanelRef={floatingPanelRef}
        layoutControls={layoutControls}
        reactFlowRef={reactFlowRef}
      />
    </GraphProvider>
  );
};

/** Intermediate component to access GraphContext for AnnotationProvider */
const GraphProviderConsumer: React.FC<{
  state: TopoViewerState;
  rfInstance: ReactFlowInstance | null;
  setRfInstance: (instance: ReactFlowInstance) => void;
  floatingPanelRef: React.RefObject<FloatingActionPanelHandle | null>;
  layoutControls: ReturnType<typeof useLayoutControls>;
  reactFlowRef: React.RefObject<ReactFlowCanvasRef | null>;
}> = ({ state, rfInstance, setRfInstance, floatingPanelRef, layoutControls, reactFlowRef }) => {
  return (
    <ViewportProvider rfInstance={rfInstance}>
      <UndoRedoProvider enabled={state.mode === "edit"}>
        <AnnotationProvider
          rfInstance={rfInstance}
          mode={state.mode}
          isLocked={state.isLocked}
          onLockedAction={() => floatingPanelRef.current?.triggerShake()}
        >
          <AppContent
            floatingPanelRef={floatingPanelRef}
            reactFlowRef={reactFlowRef}
            rfInstance={rfInstance}
            layoutControls={layoutControls}
            onInit={setRfInstance}
          />
        </AnnotationProvider>
      </UndoRedoProvider>
    </ViewportProvider>
  );
};
