/**
 * Shared node glow utilities for Easter Egg modes
 */

import { useEffect, useRef } from "react";

import type { CyCompatCore } from "../../hooks/useCytoCompatInstance";
import type { RGBColor } from "./types";

/**
 * Apply glow effect to nodes via CyCompatCore
 * Note: In ReactFlow, styling is handled via React state, so this is a no-op placeholder.
 * The visual glow effects are rendered through the canvas overlays instead.
 */
export function applyNodeGlow(_cyCompat: CyCompatCore, _color: RGBColor, _intensity: number): void {
  // No-op: ReactFlow handles node styling through React state
  // The glow effect is achieved through the canvas overlay instead
}

/**
 * Restore original node styles
 * Note: In ReactFlow, styling is handled via React state, so this is a no-op placeholder.
 */
export function restoreNodeStyles(
  _cyCompat: CyCompatCore,
  _originalStyles: Map<string, Record<string, string>>
): void {
  // No-op: ReactFlow handles node styling through React state
}

/**
 * Hook to apply glow effect to nodes based on audio/animation
 *
 * @param cyCompat - CyCompatCore instance
 * @param isActive - Whether the mode is active
 * @param getColor - Function to get current color
 * @param getIntensity - Function to get current intensity (0-1)
 *
 * Note: In ReactFlow, node styling is handled differently. This hook
 * maintains the same interface for compatibility but the visual effects
 * are achieved through canvas overlays rather than direct node styling.
 */
export function useNodeGlow(
  cyCompat: CyCompatCore | null | undefined,
  isActive: boolean,
  getColor: () => RGBColor,
  getIntensity: () => number
): void {
  const originalStylesRef = useRef<Map<string, Record<string, string>>>(new Map());
  const animationRef = useRef<number>(0);

  useEffect(() => {
    if (!isActive || !cyCompat) return undefined;

    const nodes = cyCompat.nodes();

    // Store original styles (for compatibility, though not used in ReactFlow)
    nodes.forEach((node) => {
      const id = node.id();
      originalStylesRef.current.set(id, {
        "background-color": "",
        "border-color": "",
        "border-width": ""
      });
    });

    const cy = cyCompat;

    const animate = (): void => {
      const color = getColor();
      const intensity = getIntensity();

      cy.batch(() => applyNodeGlow(cy, color, intensity));

      animationRef.current = window.requestAnimationFrame(animate);
    };

    animationRef.current = window.requestAnimationFrame(animate);

    return () => {
      window.cancelAnimationFrame(animationRef.current);
      cy.batch(() => restoreNodeStyles(cy, originalStylesRef.current));
      originalStylesRef.current.clear();
    };
  }, [isActive, cyCompat, getColor, getIntensity]);
}
