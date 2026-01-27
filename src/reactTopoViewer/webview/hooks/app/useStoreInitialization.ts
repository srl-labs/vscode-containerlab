/**
 * useStoreInitialization - Hook to initialize Zustand stores with bootstrap data
 *
 * This hook should be called once at the app root to set up initial state
 * from the extension's bootstrap data payload.
 */
import { useEffect, useRef } from "react";

import { useTopoViewerStore, parseInitialData } from "../../stores/topoViewerStore";

export interface StoreInitializationData {
  initialData?: unknown;
}

/**
 * Hook to initialize stores with initial data.
 * Should be called once at the app root.
 */
export function useStoreInitialization({ initialData }: StoreInitializationData): void {
  const initializedRef = useRef(false);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    // Initialize topoViewer store with parsed initial data
    if (initialData) {
      const parsedData = parseInitialData(initialData);
      useTopoViewerStore.getState().setInitialData(parsedData);
    }
  }, [initialData]);
}
