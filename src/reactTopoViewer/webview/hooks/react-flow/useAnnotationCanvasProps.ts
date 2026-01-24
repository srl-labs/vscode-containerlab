/**
 * Hook to create annotation props for ReactFlowCanvas
 */
import { useMemo } from 'react';

import type { AnnotationModeState, AnnotationHandlers } from '../../components/react-flow-canvas/types';

interface FreeTextAnnotationsAPI {
  isAddTextMode: boolean;
  handleCanvasClick: (position: { x: number; y: number }) => void;
  editAnnotation: (id: string) => void;
  deleteAnnotation: (id: string) => void;
  updatePosition: (id: string, position: { x: number; y: number }) => void;
  updateSize: (id: string, width: number, height: number) => void;
  updateRotation: (id: string, rotation: number) => void;
  disableAddTextMode: () => void;
}

interface FreeShapeAnnotationsAPI {
  isAddShapeMode: boolean;
  pendingShapeType?: 'rectangle' | 'circle' | 'line';
  handleCanvasClick: (position: { x: number; y: number }) => void;
  editAnnotation: (id: string) => void;
  deleteAnnotation: (id: string) => void;
  updatePosition: (id: string, position: { x: number; y: number }) => void;
  updateSize: (id: string, width: number, height: number) => void;
  updateRotation: (id: string, rotation: number) => void;
  updateEndPosition: (id: string, endPosition: { x: number; y: number }) => void;
  updateStartPosition: (id: string, startPosition: { x: number; y: number }) => void;
  disableAddShapeMode: () => void;
}

interface UseAnnotationCanvasPropsOptions {
  freeTextAnnotations: FreeTextAnnotationsAPI;
  freeShapeAnnotations: FreeShapeAnnotationsAPI;
}

interface UseAnnotationCanvasPropsReturn {
  annotationMode: AnnotationModeState;
  annotationHandlers: AnnotationHandlers;
}

/**
 * Hook to compute annotation mode state and handlers for ReactFlowCanvas
 */
export function useAnnotationCanvasProps(
  options: UseAnnotationCanvasPropsOptions
): UseAnnotationCanvasPropsReturn {
  const { freeTextAnnotations, freeShapeAnnotations } = options;

  const annotationMode = useMemo<AnnotationModeState>(() => ({
    isAddTextMode: freeTextAnnotations.isAddTextMode,
    isAddShapeMode: freeShapeAnnotations.isAddShapeMode,
    pendingShapeType: freeShapeAnnotations.pendingShapeType
  }), [
    freeTextAnnotations.isAddTextMode,
    freeShapeAnnotations.isAddShapeMode,
    freeShapeAnnotations.pendingShapeType
  ]);

  const annotationHandlers = useMemo<AnnotationHandlers>(() => ({
    onAddTextClick: freeTextAnnotations.handleCanvasClick,
    onAddShapeClick: freeShapeAnnotations.handleCanvasClick,
    onEditFreeText: freeTextAnnotations.editAnnotation,
    onEditFreeShape: freeShapeAnnotations.editAnnotation,
    onDeleteFreeText: freeTextAnnotations.deleteAnnotation,
    onDeleteFreeShape: freeShapeAnnotations.deleteAnnotation,
    onUpdateFreeTextPosition: freeTextAnnotations.updatePosition,
    onUpdateFreeShapePosition: freeShapeAnnotations.updatePosition,
    onUpdateFreeTextSize: freeTextAnnotations.updateSize,
    onUpdateFreeShapeSize: freeShapeAnnotations.updateSize,
    onUpdateFreeTextRotation: freeTextAnnotations.updateRotation,
    onUpdateFreeShapeRotation: freeShapeAnnotations.updateRotation,
    onUpdateFreeShapeEndPosition: freeShapeAnnotations.updateEndPosition,
    onUpdateFreeShapeStartPosition: freeShapeAnnotations.updateStartPosition,
    disableAddTextMode: freeTextAnnotations.disableAddTextMode,
    disableAddShapeMode: freeShapeAnnotations.disableAddShapeMode
  }), [freeTextAnnotations, freeShapeAnnotations]);

  return { annotationMode, annotationHandlers };
}
