/**
 * Shared types for canvas configuration/state.
 * Keeps CanvasContext decoupled from component type definitions to avoid cycles.
 */

export type EdgeLabelMode = "show-all" | "on-select" | "hide";

export interface EdgeRenderConfig {
  labelMode: EdgeLabelMode;
  suppressLabels: boolean;
  suppressHitArea: boolean;
}

export interface NodeRenderConfig {
  suppressLabels: boolean;
}
