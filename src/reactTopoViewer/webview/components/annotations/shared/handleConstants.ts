/**
 * Shared constants for annotation handles
 */
import React from 'react';

export const HANDLE_SIZE = 6;
export const ROTATION_HANDLE_OFFSET = 18;
export const HANDLE_BOX_SHADOW = '0 2px 4px rgba(0,0,0,0.3)';
export const HANDLE_BORDER = '2px solid #64b4ff';
export const CENTER_TRANSLATE = 'translate(-50%, -50%)';

export type ResizeCorner = 'nw' | 'ne' | 'sw' | 'se';

export const CORNER_STYLES: Record<ResizeCorner, React.CSSProperties> = {
  nw: { top: 0, left: 0, cursor: 'nw-resize', transform: CENTER_TRANSLATE },
  ne: { top: 0, right: 0, cursor: 'ne-resize', transform: 'translate(50%, -50%)' },
  sw: { bottom: 0, left: 0, cursor: 'sw-resize', transform: 'translate(-50%, 50%)' },
  se: { bottom: 0, right: 0, cursor: 'se-resize', transform: 'translate(50%, 50%)' }
};
