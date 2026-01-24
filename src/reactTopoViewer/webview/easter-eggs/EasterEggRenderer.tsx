/**
 * Easter Egg Renderer - Renders the active easter egg mode component.
 * Extracts duplicated conditional rendering logic from App.tsx.
 *
 * NOTE: Easter eggs are temporarily disabled during ReactFlow migration.
 * They require cyCompat for visual effects and will be re-enabled after
 * proper ReactFlow integration is complete.
 */

import React from "react";

import type { UseEasterEggReturn } from "./useEasterEgg";

interface EasterEggRendererProps {
  easterEgg: UseEasterEggReturn;
}

/**
 * Renders the appropriate easter egg mode based on current state.
 * Currently disabled during ReactFlow migration.
 */
export const EasterEggRenderer: React.FC<EasterEggRendererProps> = ({ easterEgg }) => {
  // Easter eggs temporarily disabled - they require cyCompat for visual effects
  // TODO: Re-enable after ReactFlow integration is complete
  void easterEgg;
  return null;
};
