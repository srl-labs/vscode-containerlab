/**
 * Shared style constants for annotation layers
 */
import type React from 'react';

/** Click capture overlay style - used in add-annotation mode */
export const CLICK_CAPTURE_STYLE_BASE: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  pointerEvents: 'auto',
  zIndex: 8
};

/** Create click capture style with custom cursor */
export function createClickCaptureStyle(cursor: string): React.CSSProperties {
  return {
    ...CLICK_CAPTURE_STYLE_BASE,
    cursor
  };
}
