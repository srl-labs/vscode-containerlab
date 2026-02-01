/**
 * Free shape annotation constants (used across panels and SVG helpers).
 */
import type { FreeShapeAnnotation } from "../../shared/types/topology";

export const DEFAULT_SHAPE_WIDTH = 50;
export const DEFAULT_SHAPE_HEIGHT = 50;
export const DEFAULT_LINE_LENGTH = 150;
export const DEFAULT_FILL_COLOR = "#ffffff";
export const DEFAULT_FILL_OPACITY = 0;
export const DEFAULT_BORDER_COLOR = "#646464";
export const DEFAULT_BORDER_WIDTH = 2;
export const DEFAULT_BORDER_STYLE: NonNullable<FreeShapeAnnotation["borderStyle"]> = "solid";
export const DEFAULT_ARROW_SIZE = 10;
export const DEFAULT_CORNER_RADIUS = 0;
export const MIN_SHAPE_SIZE = 5;
