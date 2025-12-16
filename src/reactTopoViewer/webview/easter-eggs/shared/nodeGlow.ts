/**
 * Shared node glow utilities for Easter Egg modes
 */

import { useEffect, useRef } from 'react';
import type { Core as CyCore } from 'cytoscape';
import type { RGBColor } from './types';

/**
 * Apply glow effect to cytoscape nodes
 */
export function applyNodeGlow(
  cyInstance: CyCore,
  color: RGBColor,
  intensity: number
): void {
  const borderWidth = `${2 + intensity * 2}px`;
  const borderColor = `rgba(${color.r}, ${color.g}, ${color.b}, ${0.6 + intensity * 0.4})`;

  cyInstance.nodes().forEach(node => {
    node.style({
      'border-width': borderWidth,
      'border-color': borderColor,
    });
  });
}

/**
 * Restore original node styles
 */
export function restoreNodeStyles(
  cyInstance: CyCore,
  originalStyles: Map<string, Record<string, string>>
): void {
  cyInstance.nodes().forEach(node => {
    const original = originalStyles.get(node.id());
    if (original) {
      node.style({
        'border-width': original['border-width'],
        'border-color': original['border-color'],
      });
    }
  });
}

/**
 * Hook to apply glow effect to nodes based on audio/animation
 *
 * @param cyInstance - Cytoscape instance
 * @param isActive - Whether the mode is active
 * @param getColor - Function to get current color
 * @param getIntensity - Function to get current intensity (0-1)
 */
export function useNodeGlow(
  cyInstance: CyCore | null | undefined,
  isActive: boolean,
  getColor: () => RGBColor,
  getIntensity: () => number
): void {
  const originalStylesRef = useRef<Map<string, Record<string, string>>>(new Map());
  const animationRef = useRef<number>(0);

  useEffect(() => {
    if (!isActive || !cyInstance) return undefined;

    const nodes = cyInstance.nodes();

    // Store original styles
    nodes.forEach(node => {
      const id = node.id();
      originalStylesRef.current.set(id, {
        'background-color': node.style('background-color'),
        'border-color': node.style('border-color'),
        'border-width': node.style('border-width'),
      });
    });

    const cy = cyInstance;

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
  }, [isActive, cyInstance, getColor, getIntensity]);
}
