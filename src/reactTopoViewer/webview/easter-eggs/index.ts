/**
 * Easter Eggs - Hidden visual modes
 *
 * Click the Containerlab logo 10 times to trigger one of six easter eggs:
 * - Nightcall: 80s synthwave vibe (Kavinsky inspired)
 * - Stickerbrush Symphony: Dreamy forest ambient (DKC2 inspired)
 * - Aquatic Ambience: Underwater serenity (DKC inspired)
 * - Vaporwave: Slowed down smooth jazz aesthetic
 * - Deus Ex: 3D rotating logo with metallic theme (silent mode)
 * - Final Countdown: New Year's Eve celebration with fireworks (Europe inspired)
 */

// Main easter egg hook
export { useEasterEgg } from './useEasterEgg';
export type {
  EasterEggMode,
  EasterEggState,
  UseEasterEggOptions,
  UseEasterEggReturn,
} from './useEasterEgg';

// Mode components
export {
  AquaticAmbienceMode,
  VaporwaveMode,
  NightcallMode,
  StickerbushMode,
  DeusExMode,
  FinalCountdownMode,
} from './modes';

// Renderer component
export { EasterEggRenderer } from './EasterEggRenderer';

// Audio hooks
export {
  useAquaticAmbienceAudio,
  useVaporwaveAudio,
  useNightcallAudio,
  useStickerbushAudio,
  useFinalCountdownAudio,
} from './audio';

export type {
  UseAquaticAmbienceAudioReturn,
  UseVaporwaveAudioReturn,
  UseNightcallAudioReturn,
  UseStickerbushAudioReturn,
  UseFinalCountdownAudioReturn,
} from './audio';

// Shared utilities (re-export for convenience)
export type { RGBColor, BaseModeProps, BaseAudioReturn } from './shared';
export { lerpColor, BTN_VISIBLE, BTN_HIDDEN, BTN_BLUR, useNodeGlow, MuteButton } from './shared';
