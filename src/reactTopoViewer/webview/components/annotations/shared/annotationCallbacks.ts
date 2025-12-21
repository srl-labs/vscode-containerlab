/**
 * Utility for creating bound annotation callbacks
 * Reduces duplication between annotation layer components
 */

/** Base handler types that all annotation layers share */
export interface BaseAnnotationHandlers {
  onAnnotationSelect?: (id: string) => void;
  onAnnotationToggleSelect?: (id: string) => void;
  onPositionChange: (id: string, position: { x: number; y: number }) => void;
  onRotationChange: (id: string, rotation: number) => void;
  onSizeChange: (id: string, width: number, height: number) => void;
  onAnnotationDelete: (id: string) => void;
  onGeoPositionChange?: (id: string, geoCoords: { lat: number; lng: number }) => void;
}

/** Result of binding callbacks - handlers that don't need the id anymore */
export interface BoundAnnotationCallbacks {
  onSelect: () => void;
  onToggleSelect: () => void;
  onPositionChange: (pos: { x: number; y: number }) => void;
  onRotationChange: (rotation: number) => void;
  onSizeChange: (width: number, height: number) => void;
  onDelete: () => void;
  onGeoPositionChange?: (geoCoords: { lat: number; lng: number }) => void;
}

/**
 * Creates bound callbacks for a specific annotation
 * Converts handlers that take (id, ...args) into handlers that just take (...args)
 */
export function createBoundAnnotationCallbacks(
  annotationId: string,
  handlers: BaseAnnotationHandlers
): BoundAnnotationCallbacks {
  return {
    onSelect: () => handlers.onAnnotationSelect?.(annotationId),
    onToggleSelect: () => handlers.onAnnotationToggleSelect?.(annotationId),
    onPositionChange: (pos: { x: number; y: number }) => handlers.onPositionChange(annotationId, pos),
    onRotationChange: (rotation: number) => handlers.onRotationChange(annotationId, rotation),
    onSizeChange: (width: number, height: number) => handlers.onSizeChange(annotationId, width, height),
    onDelete: () => handlers.onAnnotationDelete(annotationId),
    onGeoPositionChange: handlers.onGeoPositionChange
      ? (geoCoords: { lat: number; lng: number }) => handlers.onGeoPositionChange!(annotationId, geoCoords)
      : undefined
  };
}
