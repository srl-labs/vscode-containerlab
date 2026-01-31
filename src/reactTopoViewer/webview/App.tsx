/**
 * React TopoViewer Main Application Component
 *
 * Uses Zustand stores for state management.
 * Graph state is managed by graphStore (React Flow is source of truth).
 */
import React from "react";
import type { ReactFlowInstance } from "@xyflow/react";

import type { CanvasRef } from "./hooks/ui";
import type { ReactFlowCanvasRef } from "./components/canvas";
import { useLayoutControls } from "./hooks/ui";
import {
  type InitialGraphData,
  useStoreInitialization,
  useGraphMessageSubscription,
  useTopoViewerMessageSubscription,
  useTopologyHostInitialization
} from "./hooks/app";
import { AppContent } from "./AppContent";

/** Main App component - initializes stores and subscriptions */
export const App: React.FC<{ initialData?: InitialGraphData }> = ({ initialData }) => {
  const reactFlowRef = React.useRef<ReactFlowCanvasRef>(null);
  const [rfInstance, setRfInstance] = React.useState<ReactFlowInstance | null>(null);
  const layoutControls = useLayoutControls(
    reactFlowRef as unknown as React.RefObject<CanvasRef | null>
  );

  // Initialize stores with initial data
  useStoreInitialization({ initialData });

  // Set up message subscriptions (side effects)
  useGraphMessageSubscription();
  useTopoViewerMessageSubscription();
  useTopologyHostInitialization();

  return (
    <AppContent
      reactFlowRef={reactFlowRef}
      rfInstance={rfInstance}
      layoutControls={layoutControls}
      onInit={setRfInstance}
    />
  );
};
