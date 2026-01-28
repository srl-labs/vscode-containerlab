/**
 * Easter Eggs - Hidden visual modes
 *
 * Click the Containerlab logo 10 times to trigger one of five easter eggs:
 * - Nightcall: 80s synthwave vibe (Kavinsky inspired)
 * - Stickerbrush Symphony: Dreamy forest ambient (DKC2 inspired)
 * - Aquatic Ambience: Underwater serenity (DKC inspired)
 * - Vaporwave: Slowed down smooth jazz aesthetic
 * - Deus Ex: 3D rotating logo with metallic theme (silent mode)
 */

// Main easter egg hook
export { useEasterEgg } from "./useEasterEgg";
export type {
  EasterEggMode,
  EasterEggState,
  UseEasterEggOptions,
  UseEasterEggReturn
} from "./useEasterEgg";

// Renderer component
export { EasterEggRenderer } from "./EasterEggRenderer";

// Mode components (for direct use if needed)
export {
  NightcallMode,
  StickerbushMode,
  AquaticAmbienceMode,
  VaporwaveMode,
  DeusExMode
} from "./modes";
