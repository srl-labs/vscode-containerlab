/**
 * React TopoViewer Main Application Component
 *
 * Uses context-based architecture for undo/redo and annotations.
 * Now uses ReactFlow as the rendering layer for rendering.
 * Graph state is managed by GraphContext (React Flow is source of truth).
 */
import React from "react";
import type { ReactFlowInstance } from "@xyflow/react";

import type { CanvasRef } from "./hooks/ui/useAppState";
import type { ReactFlowCanvasRef } from "./components/canvas";
import type { FloatingActionPanelHandle } from "./components/panels";
import { AppProvider } from "./context/AppContext";
import { useLayoutControls } from "./hooks/ui/useAppState";
import { useInitialGraphData, type InitialGraphData } from "./hooks/app/useInitialGraphData";
import { AppContent } from "./AppContent";

/** Main App component with providers */
export const App: React.FC<{ initialData?: InitialGraphData }> = ({ initialData }) => {
  const { initialNodes, initialEdges } = useInitialGraphData(initialData);

  const reactFlowRef = React.useRef<ReactFlowCanvasRef>(null);
  const [rfInstance, setRfInstance] = React.useState<ReactFlowInstance | null>(null);
  const floatingPanelRef = React.useRef<FloatingActionPanelHandle>(null);
  const layoutControls = useLayoutControls(
    reactFlowRef as unknown as React.RefObject<CanvasRef | null>
  );
  const handleLockedAction = React.useCallback(() => {
    floatingPanelRef.current?.triggerShake();
  }, []);

  return (
    <AppProvider
      initialData={initialData}
      initialNodes={initialNodes}
      initialEdges={initialEdges}
      rfInstance={rfInstance}
      onLockedAction={handleLockedAction}
    >
      <AppContent
        floatingPanelRef={floatingPanelRef}
        reactFlowRef={reactFlowRef}
        rfInstance={rfInstance}
        layoutControls={layoutControls}
        onInit={setRfInstance}
      />
    </AppProvider>
  );
};
