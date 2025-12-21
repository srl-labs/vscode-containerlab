/**
 * Shared annotation components
 */
export {
  HANDLE_SIZE,
  ROTATION_HANDLE_OFFSET,
  HANDLE_BOX_SHADOW,
  HANDLE_BORDER,
  CENTER_TRANSLATE,
  CORNER_STYLES
} from './handleConstants';
export type { ResizeCorner } from './handleConstants';

export { RotationHandle } from './RotationHandle';
export { ResizeHandle } from './ResizeHandle';
export { SelectionOutline } from './SelectionOutline';
export { AnnotationContextMenu } from './AnnotationContextMenu';
export { AnnotationHandles } from './AnnotationHandles';
export type { AnnotationHandlesProps } from './AnnotationHandles';
export { applyAlphaToColor } from './colorUtils';
export { CLICK_CAPTURE_STYLE_BASE, createClickCaptureStyle } from './layerStyles';
export { createBoundAnnotationCallbacks } from './annotationCallbacks';
export type { BaseAnnotationHandlers, BoundAnnotationCallbacks } from './annotationCallbacks';
export type { GroupRelatedProps } from './groupProps';
