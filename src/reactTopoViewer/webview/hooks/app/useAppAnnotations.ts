/**
 * useAppAnnotations - app-level annotation wiring.
 */
import type { ReactFlowInstance } from "@xyflow/react";

import { useAnnotations } from "../canvas";

import { useAnnotationCanvasHandlers } from "./useAppContentHelpers";

interface UseAppAnnotationsParams {
  rfInstance: ReactFlowInstance | null;
  onLockedAction?: () => void;
}

export function useAppAnnotations({ rfInstance, onLockedAction }: UseAppAnnotationsParams) {
  const annotations = useAnnotations({ rfInstance, onLockedAction });
  const { annotationMode, canvasAnnotationHandlers } = useAnnotationCanvasHandlers(annotations);

  return { annotations, annotationMode, canvasAnnotationHandlers };
}
