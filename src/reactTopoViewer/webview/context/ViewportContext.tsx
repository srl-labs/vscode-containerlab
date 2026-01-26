/**
 * Viewport Context
 * Provides viewport transform (pan/zoom) to annotation layers
 * Replaces the need for direct pan/zoom methods in annotation components
 */
import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";
import type { ReactFlowInstance } from "@xyflow/react";

export interface ViewportState {
  pan: { x: number; y: number };
  zoom: number;
}

export interface ViewportContextValue {
  /** Current viewport state */
  viewport: ViewportState;
  /** Update viewport state */
  setViewport: (viewport: ViewportState) => void;
  /** Get container element */
  getContainer: () => HTMLElement | null;
  /** ReactFlow instance (for advanced operations) */
  rfInstance: ReactFlowInstance | null;
}

const defaultViewport: ViewportState = { pan: { x: 0, y: 0 }, zoom: 1 };

const ViewportContext = createContext<ViewportContextValue>({
  viewport: defaultViewport,
  setViewport: () => {},
  getContainer: () => null,
  rfInstance: null
});

export interface ViewportProviderProps {
  children: React.ReactNode;
  rfInstance: ReactFlowInstance | null;
}

/**
 * Provider component that syncs with ReactFlow viewport
 */
export const ViewportProvider: React.FC<ViewportProviderProps> = ({ children, rfInstance }) => {
  const [viewport, setViewportState] = useState<ViewportState>(defaultViewport);
  const rafRef = useRef<number | null>(null);

  // Sync viewport with ReactFlow
  useEffect(() => {
    if (!rfInstance) return;

    const syncViewport = () => {
      const v = rfInstance.getViewport();
      setViewportState({
        pan: { x: v.x, y: v.y },
        zoom: v.zoom
      });
      rafRef.current = window.requestAnimationFrame(syncViewport);
    };

    syncViewport();

    return () => {
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
      }
    };
  }, [rfInstance]);

  const setViewport = useCallback(
    (v: ViewportState) => {
      setViewportState(v);
      if (rfInstance) {
        Promise.resolve(rfInstance.setViewport({ x: v.pan.x, y: v.pan.y, zoom: v.zoom })).catch(
          () => {
            /* ignore */
          }
        );
      }
    },
    [rfInstance]
  );

  const getContainer = useCallback(() => {
    return document.querySelector(".react-flow") as HTMLElement | null;
  }, []);

  const value: ViewportContextValue = {
    viewport,
    setViewport,
    getContainer,
    rfInstance
  };

  return <ViewportContext.Provider value={value}>{children}</ViewportContext.Provider>;
};

/**
 * Hook to access viewport context
 */
export function useViewport(): ViewportContextValue {
  return useContext(ViewportContext);
}

/**
 * Hook to get just the viewport state (for annotation layers)
 */
export function useViewportTransform(): ViewportState {
  const { viewport } = useContext(ViewportContext);
  return viewport;
}
