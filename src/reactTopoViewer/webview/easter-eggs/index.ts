/**
 * Easter Eggs - Hidden visual modes
 *
 * NOTE: Easter egg modes have been temporarily disabled during ReactFlow migration.
 * They required the cyCompat layer for visual effects and will be re-enabled
 * after proper ReactFlow integration is complete.
 */

// Main easter egg hook
export { useEasterEgg } from "./useEasterEgg";
export type {
  EasterEggMode,
  EasterEggState,
  UseEasterEggOptions,
  UseEasterEggReturn
} from "./useEasterEgg";

// Renderer component (currently returns null - modes disabled)
export { EasterEggRenderer } from "./EasterEggRenderer";
