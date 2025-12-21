/**
 * Annotation interaction hooks for drag, resize, rotation, and selection
 */

// Drag interaction
export { useAnnotationDrag } from '../useAnnotationDrag';

// Handle interactions (rotation and resize)
export { useRotationDrag, useResizeDrag } from '../useAnnotationHandles';

// Line resize
export { useLineResizeDrag } from '../useLineResize';

// Selection and click handlers
export {
  useAnnotationClickHandlers,
  useLayerClickHandler,
  useAnnotationBoxSelection
} from '../useAnnotationSelection';

// Combined interactions
export { useAnnotationInteractions } from '../useAnnotationInteractions';

// Shape layer
export { useShapeLayer } from '../useShapeLayer';
