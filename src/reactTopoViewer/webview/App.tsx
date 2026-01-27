/**
 * React TopoViewer Main Application Component
 *
 * Uses Zustand stores for state management.
 * Graph state is managed by graphStore (React Flow is source of truth).
 */
import React from "react";
import type { ReactFlowInstance } from "@xyflow/react";

import type { CanvasRef } from "./hooks/ui/useAppState";
import type { ReactFlowCanvasRef } from "./components/canvas";
import type { FloatingActionPanelHandle } from "./components/panels";
import { useLayoutControls } from "./hooks/ui/useAppState";
import { useInitialGraphData, type InitialGraphData } from "./hooks/app/useInitialGraphData";
import { useStoreInitialization } from "./hooks/useStoreInitialization";
import { useGraphMessageSubscription } from "./hooks/useGraphMessageSubscription";
import { useTopoViewerMessageSubscription } from "./hooks/useTopoViewerMessageSubscription";
import { useUndoRedoPersistence } from "./hooks/useUndoRedoPersistence";
import { AppContent } from "./AppContent";

/** Main App component - initializes stores and subscriptions */
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

  // Initialize stores with initial data
  useStoreInitialization({
    initialNodes,
    initialEdges,
    initialData
  });

  // Set up message subscriptions (side effects)
  useGraphMessageSubscription();
  useTopoViewerMessageSubscription();
  useUndoRedoPersistence();

  return (
    <AppContent
      floatingPanelRef={floatingPanelRef}
      reactFlowRef={reactFlowRef}
      rfInstance={rfInstance}
      layoutControls={layoutControls}
      onInit={setRfInstance}
      onLockedAction={handleLockedAction}
    />
  );
};
