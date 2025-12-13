/**
 * Shared utility functions and constants for free text annotations.
 */

// Size and layout constants
export const MIN_FREE_TEXT_FONT_SIZE = 1;
export const DEFAULT_FREE_TEXT_FONT_SIZE = 8;
export const DEFAULT_FREE_TEXT_PADDING = 3;
export const PREVIEW_FONT_SCALE = 2;
export const DEFAULT_FREE_TEXT_WIDTH = 420;
export const MIN_FREE_TEXT_WIDTH = 5;
export const MIN_FREE_TEXT_HEIGHT = 5;
export const MIN_FREE_TEXT_NODE_SIZE = 6;

// UI constants
export const BUTTON_BASE_CLASS = 'btn btn-small';
export const BUTTON_PRIMARY_CLASS = 'btn-primary';
export const BUTTON_OUTLINED_CLASS = 'btn-outlined';
export const BUTTON_BASE_RIGHT_CLASS = 'btn btn-small ml-auto';
export const CLASS_HAS_CHANGES = 'btn-has-changes';
export const OVERLAY_HOVER_CLASS = 'free-text-overlay-hover';
export const HANDLE_VISIBLE_CLASS = 'free-text-overlay-resize-visible';
export const ROTATE_HANDLE_VISIBLE_CLASS = 'free-text-overlay-rotate-visible';
export const PANEL_FREE_TEXT_ID = 'panel-free-text';
export const MARKDOWN_EMPTY_STATE_MESSAGE = 'Use Markdown (including ```fences```) to format notes.';

// Text alignment type
export type TextAlignment = 'left' | 'center' | 'right';

// HTML escape utilities
const htmlEscapeMap: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
};

export const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, match => htmlEscapeMap[match]);

/**
 * Normalize font size to ensure it's within valid bounds.
 */
export function normalizeFontSize(fontSize?: number): number {
  const numeric = Number.isFinite(fontSize) && (fontSize as number) > 0
    ? Math.round(fontSize as number)
    : DEFAULT_FREE_TEXT_FONT_SIZE;
  return Math.max(MIN_FREE_TEXT_FONT_SIZE, numeric);
}

/**
 * Normalize rotation to 0-360 range.
 */
export function normalizeRotation(rotation?: number): number {
  if (typeof rotation !== 'number' || !Number.isFinite(rotation)) {
    return 0;
  }
  const normalized = rotation % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

/**
 * Convert degrees to radians.
 */
export function degToRad(degrees: number): number {
  return degrees * (Math.PI / 180);
}

/**
 * Rotate a point by the given angle in degrees.
 */
export function rotateOffset(x: number, y: number, rotationDeg: number): { x: number; y: number } {
  if (!rotationDeg) {
    return { x, y };
  }
  const angle = degToRad(rotationDeg);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    x: x * cos - y * sin,
    y: x * sin + y * cos
  };
}

/**
 * Apply preview font size scaling to a textarea.
 */
export function applyPreviewFontSize(textInput: HTMLTextAreaElement, fontSize?: number): void {
  const baseSize = normalizeFontSize(fontSize);
  const previewSize = Math.max(baseSize, Math.round(baseSize * PREVIEW_FONT_SCALE));
  textInput.style.fontSize = `${previewSize}px`;
}

/**
 * Resolve background color for display.
 * @param color The background color value
 * @param forInput If true, returns a fallback color for input elements
 */
export function resolveBackgroundColor(color: string | undefined, forInput: boolean): string {
  if (color === 'transparent') {
    return forInput ? '#000000' : 'transparent';
  }
  return color ?? '#000000';
}

/**
 * Apply an alpha value to a color string.
 */
export function applyAlphaToColor(color: string, alpha: number): string {
  if (!color || color === 'transparent') {
    return 'transparent';
  }
  const normalizedAlpha = Math.min(1, Math.max(0, alpha));
  const hexMatch = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(color);
  if (hexMatch) {
    const hex = hexMatch[1];
    const expandHex = (value: string): number => {
      if (value.length === 1) {
        return Number.parseInt(`${value}${value}`, 16);
      }
      return Number.parseInt(value, 16);
    };
    if (hex.length === 3) {
      const r = expandHex(hex[0]);
      const g = expandHex(hex[1]);
      const b = expandHex(hex[2]);
      return `rgba(${r}, ${g}, ${b}, ${normalizedAlpha})`;
    }
    if (hex.length === 6 || hex.length === 8) {
      const r = expandHex(hex.slice(0, 2));
      const g = expandHex(hex.slice(2, 4));
      const b = expandHex(hex.slice(4, 6));
      const baseAlpha = hex.length === 8 ? expandHex(hex.slice(6, 8)) / 255 : 1;
      return `rgba(${r}, ${g}, ${b}, ${baseAlpha * normalizedAlpha})`;
    }
  }
  const rgbMatch = /^rgba?\(([^)]+)\)$/i.exec(color);
  if (rgbMatch) {
    const [r, g, b, existingAlpha = '1'] = rgbMatch[1].split(',').map(part => part.trim());
    const currentAlpha = Number.parseFloat(existingAlpha);
    const combinedAlpha = Number.isFinite(currentAlpha) ? currentAlpha * normalizedAlpha : normalizedAlpha;
    return `rgba(${r}, ${g}, ${b}, ${combinedAlpha})`;
  }
  return color;
}

/**
 * Bind an event handler to an element and track it for cleanup.
 */
export function bindHandler(
  el: HTMLElement,
  prop: 'onclick' | 'oninput' | 'onchange' | 'onkeydown',
  handler: any,
  cleanupTasks: Array<() => void>
): void {
  (el as any)[prop] = handler;
  cleanupTasks.push(() => { (el as any)[prop] = null; });
}
