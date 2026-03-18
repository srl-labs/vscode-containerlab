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
import { useFontScale } from "./stores/topoViewerStore";
import { TOPOVIEWER_FONT_SCALE_CSS_VAR } from "./theme";

/** Main App component - initializes stores and subscriptions */
export const App: React.FC<{ initialData?: InitialGraphData }> = ({ initialData }) => {
  const reactFlowRef = React.useRef<ReactFlowCanvasRef>(null);
  const [rfInstance, setRfInstance] = React.useState<ReactFlowInstance | null>(null);
  const layoutCanvasRef: React.RefObject<CanvasRef | null> = reactFlowRef;
  const layoutControls = useLayoutControls(layoutCanvasRef);

  // Initialize stores with initial data
  useStoreInitialization({ initialData });
  const fontScale = useFontScale();

  React.useLayoutEffect(() => {
    const target = document.body ?? document.documentElement;
    if (!target) {
      return;
    }

    target.style.setProperty(TOPOVIEWER_FONT_SCALE_CSS_VAR, String(fontScale));

    return () => {
      target.style.removeProperty(TOPOVIEWER_FONT_SCALE_CSS_VAR);
    };
  }, [fontScale]);

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
