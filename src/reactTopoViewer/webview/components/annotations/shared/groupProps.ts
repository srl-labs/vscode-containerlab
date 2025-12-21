/**
 * Shared group-related props for annotation layers
 * Used by FreeShapeLayer and FreeTextLayer for drag-to-reparent functionality
 */
import type { GroupStyleAnnotation } from '../../../../shared/types/topology';

/** Group-related props that are shared across annotation layers */
export interface GroupRelatedProps {
  /** Offsets to apply during group drag operations */
  groupDragOffsets?: Map<string, { dx: number; dy: number }>;
  /** Groups for drag-to-reparent functionality */
  groups?: GroupStyleAnnotation[];
  /** Callback to update annotation's groupId */
  onUpdateGroupId?: (annotationId: string, groupId: string | undefined) => void;
}
