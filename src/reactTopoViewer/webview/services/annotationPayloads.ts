import type { Node } from "@xyflow/react";

import type { TopologyAnnotations } from "../../shared/types/topology";
import { nodesToAnnotations } from "../annotations/annotationNodeConverters";
import { useGraphStore } from "../stores/graphStore";

type AnnotationPayloadKeys =
  | "freeTextAnnotations"
  | "freeShapeAnnotations"
  | "trafficRateAnnotations"
  | "groupStyleAnnotations";

export type AnnotationNodesPayload = Pick<TopologyAnnotations, AnnotationPayloadKeys>;

export function buildAnnotationNodesPayload(nodes?: Node[]): AnnotationNodesPayload {
  const graphNodes = nodes ?? useGraphStore.getState().nodes;
  const { freeTextAnnotations, freeShapeAnnotations, trafficRateAnnotations, groups } =
    nodesToAnnotations(graphNodes);

  return {
    freeTextAnnotations,
    freeShapeAnnotations,
    trafficRateAnnotations,
    groupStyleAnnotations: groups
  };
}
