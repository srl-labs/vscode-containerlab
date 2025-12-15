/**
 * Hook for integrating free text annotations into App.tsx
 * Handles loading, state management, and callbacks for the App component
 */
import React from 'react';
import type { Core as CyCore } from 'cytoscape';
import { FreeTextAnnotation } from '../../../shared/types/topology';
import { useFreeTextAnnotations } from './useFreeTextAnnotations';

interface InitialData {
  freeTextAnnotations?: unknown[];
}

interface TopologyDataMessage {
  type: string;
  data?: {
    freeTextAnnotations?: FreeTextAnnotation[];
  };
}

interface UseAppFreeTextAnnotationsOptions {
  cyInstance: CyCore | null;
  mode: 'edit' | 'view';
  isLocked: boolean;
  onLockedAction: () => void;
}

export interface UseAppFreeTextAnnotationsReturn {
  annotations: FreeTextAnnotation[];
  editingAnnotation: FreeTextAnnotation | null;
  isAddTextMode: boolean;
  handleAddText: () => void;
  handleCanvasClick: (position: { x: number; y: number }) => void;
  editAnnotation: (id: string) => void;
  closeEditor: () => void;
  saveAnnotation: (annotation: FreeTextAnnotation) => void;
  deleteAnnotation: (id: string) => void;
  updatePosition: (id: string, position: { x: number; y: number }) => void;
  updateSize: (id: string, width: number, height: number) => void;
  updateRotation: (id: string, rotation: number) => void;
  /** Update geo coordinates for an annotation */
  updateGeoPosition: (id: string, geoCoords: { lat: number; lng: number }) => void;
  /** IDs of currently selected annotations */
  selectedAnnotationIds: Set<string>;
  /** Select a single annotation (clears existing selection) */
  selectAnnotation: (id: string) => void;
  /** Toggle annotation selection (Ctrl+click behavior) */
  toggleAnnotationSelection: (id: string) => void;
  /** Clear all annotation selection */
  clearAnnotationSelection: () => void;
  /** Delete all selected annotations */
  deleteSelectedAnnotations: () => void;
  /** Get selected annotations */
  getSelectedAnnotations: () => FreeTextAnnotation[];
  /** Box select multiple annotations (adds to existing selection) */
  boxSelectAnnotations: (ids: string[]) => void;
  /** Copy selected annotations to clipboard */
  copySelectedAnnotations: () => void;
  /** Paste annotations from clipboard */
  pasteAnnotations: () => void;
  /** Cut selected annotations */
  cutSelectedAnnotations: () => void;
  /** Duplicate selected annotations */
  duplicateSelectedAnnotations: () => void;
  /** Check if clipboard has annotations */
  hasClipboardContent: () => boolean;
}

/**
 * Hook that integrates free text annotations with App.tsx
 * Handles initialization from __INITIAL_DATA__ and message listeners
 */
export function useAppFreeTextAnnotations(options: UseAppFreeTextAnnotationsOptions): UseAppFreeTextAnnotationsReturn {
  const { cyInstance, mode, isLocked, onLockedAction } = options;

  const freeTextAnnotations = useFreeTextAnnotations({
    cy: cyInstance,
    mode,
    isLocked,
    onLockedAction
  });

  // Handle Add Text button from panel - enable add text mode
  const handleAddText = React.useCallback(() => {
    if (isLocked) {
      onLockedAction();
      return;
    }
    freeTextAnnotations.enableAddTextMode();
  }, [isLocked, onLockedAction, freeTextAnnotations]);

  // Extract stable callback reference
  const { loadAnnotations } = freeTextAnnotations;

  // Load initial free text annotations
  React.useEffect(() => {
    // Load from initial data on mount
    const initialData = (window as unknown as { __INITIAL_DATA__?: InitialData }).__INITIAL_DATA__;
    if (initialData?.freeTextAnnotations?.length) {
      loadAnnotations(initialData.freeTextAnnotations as FreeTextAnnotation[]);
    }

    // Also listen for topology data updates
    const handleMessage = (event: MessageEvent<TopologyDataMessage>) => {
      const message = event.data;
      if (message?.type === 'topology-data' && message.data?.freeTextAnnotations) {
        loadAnnotations(message.data.freeTextAnnotations);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [loadAnnotations]);

  return {
    annotations: freeTextAnnotations.annotations,
    editingAnnotation: freeTextAnnotations.editingAnnotation,
    isAddTextMode: freeTextAnnotations.isAddTextMode,
    handleAddText,
    handleCanvasClick: freeTextAnnotations.handleCanvasClick,
    editAnnotation: freeTextAnnotations.editAnnotation,
    closeEditor: freeTextAnnotations.closeEditor,
    saveAnnotation: freeTextAnnotations.saveAnnotation,
    deleteAnnotation: freeTextAnnotations.deleteAnnotation,
    updatePosition: freeTextAnnotations.updatePosition,
    updateSize: freeTextAnnotations.updateSize,
    updateRotation: freeTextAnnotations.updateRotation,
    updateGeoPosition: freeTextAnnotations.updateGeoPosition,
    selectedAnnotationIds: freeTextAnnotations.selectedAnnotationIds,
    selectAnnotation: freeTextAnnotations.selectAnnotation,
    toggleAnnotationSelection: freeTextAnnotations.toggleAnnotationSelection,
    clearAnnotationSelection: freeTextAnnotations.clearAnnotationSelection,
    deleteSelectedAnnotations: freeTextAnnotations.deleteSelectedAnnotations,
    getSelectedAnnotations: freeTextAnnotations.getSelectedAnnotations,
    boxSelectAnnotations: freeTextAnnotations.boxSelectAnnotations,
    copySelectedAnnotations: freeTextAnnotations.copySelectedAnnotations,
    pasteAnnotations: freeTextAnnotations.pasteAnnotations,
    cutSelectedAnnotations: freeTextAnnotations.cutSelectedAnnotations,
    duplicateSelectedAnnotations: freeTextAnnotations.duplicateSelectedAnnotations,
    hasClipboardContent: freeTextAnnotations.hasClipboardContent
  };
}
