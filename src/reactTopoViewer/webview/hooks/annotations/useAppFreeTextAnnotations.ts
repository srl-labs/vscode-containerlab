/**
 * Hook for integrating free text annotations into App.tsx
 * Handles loading, state management, and callbacks for the App component
 */
import React from 'react';
import type { Core as CyCore } from 'cytoscape';

import type { FreeTextAnnotation, GroupStyleAnnotation } from '../../../shared/types/topology';
import { subscribeToWebviewMessages, type TypedMessageEvent } from '../../utils/webviewMessageBus';

import { useFreeTextAnnotations } from './useFreeTextAnnotations';
import type { AnnotationActionMethods, AnnotationSelectionMethods } from './freeTextTypes';

interface InitialData {
  freeTextAnnotations?: unknown[];
}

interface TopologyDataMessage {
  type: 'topology-data';
  data: {
    freeTextAnnotations?: FreeTextAnnotation[];
  };
}

interface UseAppFreeTextAnnotationsOptions {
  cyInstance: CyCore | null;
  mode: 'edit' | 'view';
  isLocked: boolean;
  onLockedAction: () => void;
  /** Groups for auto-assigning groupId when creating annotations inside groups */
  groups?: GroupStyleAnnotation[];
}

export interface UseAppFreeTextAnnotationsReturn extends Omit<AnnotationActionMethods, 'loadAnnotations'>, AnnotationSelectionMethods {
  annotations: FreeTextAnnotation[];
  editingAnnotation: FreeTextAnnotation | null;
  isAddTextMode: boolean;
  handleAddText: () => void;
  handleCanvasClick: (position: { x: number; y: number }) => void;
  editAnnotation: (id: string) => void;
}

/**
 * Hook that integrates free text annotations with App.tsx
 * Handles initialization from __INITIAL_DATA__ and message listeners
 */
export function useAppFreeTextAnnotations(options: UseAppFreeTextAnnotationsOptions): UseAppFreeTextAnnotationsReturn {
  const { cyInstance, mode, isLocked, onLockedAction, groups } = options;

  const freeTextAnnotations = useFreeTextAnnotations({
    cy: cyInstance,
    mode,
    isLocked,
    onLockedAction,
    groups
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
    const handleMessage = (event: TypedMessageEvent) => {
      const message = event.data as TopologyDataMessage | undefined;
      if (message?.type === 'topology-data') {
        // Always load to clear old annotations if empty
        loadAnnotations(message.data?.freeTextAnnotations || []);
      }
    };
    return subscribeToWebviewMessages(handleMessage, (e) => e.data?.type === 'topology-data');
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
    updateAnnotation: freeTextAnnotations.updateAnnotation,
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
    duplicateSelectedAnnotations: freeTextAnnotations.duplicateSelectedAnnotations,
    hasClipboardContent: freeTextAnnotations.hasClipboardContent,
    migrateGroupId: freeTextAnnotations.migrateGroupId
  };
}
