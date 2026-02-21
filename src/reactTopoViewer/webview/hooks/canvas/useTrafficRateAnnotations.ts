import { useCallback, useMemo } from "react";

import type { TrafficRateAnnotation } from "../../../shared/types/topology";
import type { AnnotationUIActions, AnnotationUIState } from "../../stores/annotationUIStore";
import { saveAnnotationNodesFromGraph } from "../../services";
import { useGraphStore } from "../../stores/graphStore";
import { getTrafficMonitorOptions } from "../../utils/trafficRateAnnotation";

import type { UseDerivedAnnotationsReturn } from "./useDerivedAnnotations";
import { findDeepestGroupAtPosition } from "./groupUtils";

interface UseTrafficRateAnnotationsParams {
  isLocked: boolean;
  onLockedAction: () => void;
  derived: UseDerivedAnnotationsReturn;
  uiState: Pick<AnnotationUIState, "selectedTrafficRateIds">;
  uiActions: Pick<
    AnnotationUIActions,
    "setEditingTrafficRateAnnotation" | "removeFromTrafficRateSelection"
  >;
}

export interface TrafficRateAnnotationActions {
  createTrafficRateAtPosition: (position: { x: number; y: number }) => void;
  editTrafficRateAnnotation: (id: string) => void;
  saveTrafficRateAnnotation: (annotation: TrafficRateAnnotation) => void;
  deleteTrafficRateAnnotation: (id: string) => void;
  deleteSelectedTrafficRateAnnotations: () => void;
}

function resolveDefaultTarget(): { nodeId?: string; interfaceName?: string } {
  const edges = useGraphStore.getState().edges;
  const options = getTrafficMonitorOptions(edges);
  const nodeId = options.nodeIds[0];
  if (!nodeId) return {};
  const interfaceName = options.interfacesByNode.get(nodeId)?.[0];
  return {
    nodeId,
    interfaceName,
  };
}

function createTrafficRateAnnotationId(existingIds: Iterable<string>): string {
  const usedIds = new Set(existingIds);
  let nextIndex = usedIds.size + 1;
  let candidate = `traffic-rate-${nextIndex}`;
  while (usedIds.has(candidate)) {
    nextIndex += 1;
    candidate = `traffic-rate-${nextIndex}`;
  }
  return candidate;
}

export function useTrafficRateAnnotations(
  params: UseTrafficRateAnnotationsParams
): TrafficRateAnnotationActions {
  const { isLocked, onLockedAction, derived, uiState, uiActions } = params;
  const canEditAnnotations = !isLocked;

  const persist = useCallback(() => {
    void saveAnnotationNodesFromGraph();
  }, []);

  const createTrafficRateAtPosition = useCallback(
    (position: { x: number; y: number }) => {
      if (!canEditAnnotations) {
        onLockedAction();
        return;
      }

      const parentGroup = findDeepestGroupAtPosition(position, derived.groups);
      const defaults = resolveDefaultTarget();
      const annotation: TrafficRateAnnotation = {
        id: createTrafficRateAnnotationId(derived.trafficRateAnnotations.map((entry) => entry.id)),
        position,
        nodeId: defaults.nodeId,
        interfaceName: defaults.interfaceName,
        mode: "chart",
        textMetric: "combined",
        width: 280,
        height: 170,
        backgroundOpacity: 20,
        borderWidth: 1,
        borderRadius: 8,
        groupId: parentGroup?.id,
      };

      uiActions.setEditingTrafficRateAnnotation(annotation);
    },
    [canEditAnnotations, onLockedAction, derived.groups, derived.trafficRateAnnotations, uiActions]
  );

  const editTrafficRateAnnotation = useCallback(
    (id: string) => {
      const annotation = derived.trafficRateAnnotations.find((entry) => entry.id === id);
      if (!annotation) return;
      uiActions.setEditingTrafficRateAnnotation(annotation);
    },
    [derived.trafficRateAnnotations, uiActions]
  );

  const saveTrafficRateAnnotation = useCallback(
    (annotation: TrafficRateAnnotation) => {
      const isNew = !derived.trafficRateAnnotations.some((entry) => entry.id === annotation.id);
      if (isNew) {
        derived.addTrafficRateAnnotation(annotation);
      } else {
        derived.updateTrafficRateAnnotation(annotation.id, annotation);
      }
      persist();
    },
    [derived, persist]
  );

  const deleteTrafficRateAnnotation = useCallback(
    (id: string) => {
      derived.deleteTrafficRateAnnotation(id);
      uiActions.removeFromTrafficRateSelection(id);
      persist();
    },
    [derived, uiActions, persist]
  );

  const deleteSelectedTrafficRateAnnotations = useCallback(() => {
    const ids = Array.from(uiState.selectedTrafficRateIds);
    if (ids.length === 0) return;
    for (const id of ids) {
      derived.deleteTrafficRateAnnotation(id);
      uiActions.removeFromTrafficRateSelection(id);
    }
    persist();
  }, [derived, uiActions, persist, uiState.selectedTrafficRateIds]);

  return useMemo(
    () => ({
      createTrafficRateAtPosition,
      editTrafficRateAnnotation,
      saveTrafficRateAnnotation,
      deleteTrafficRateAnnotation,
      deleteSelectedTrafficRateAnnotations,
    }),
    [
      createTrafficRateAtPosition,
      editTrafficRateAnnotation,
      saveTrafficRateAnnotation,
      deleteTrafficRateAnnotation,
      deleteSelectedTrafficRateAnnotations,
    ]
  );
}
