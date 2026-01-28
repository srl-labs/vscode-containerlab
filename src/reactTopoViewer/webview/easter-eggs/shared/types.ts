/**
 * Shared types for Easter Egg modes
 */

import type { Core as CyCore } from "cytoscape";

/** RGB color type */
export interface RGBColor {
  r: number;
  g: number;
  b: number;
}

/** Base props for all easter egg mode components */
export interface BaseModeProps {
  isActive: boolean;
  onClose?: () => void;
  onSwitchMode?: () => void;
  modeName?: string;
  cyInstance?: CyCore | null;
}

/** Base return type for audio hooks */
export interface BaseAudioReturn {
  play: () => void;
  stop: () => void;
  isPlaying: boolean;
  isLoading: boolean;
  isMuted: boolean;
  toggleMute: () => void;
  getFrequencyData: () => Uint8Array<ArrayBuffer>;
  getTimeDomainData: () => Uint8Array<ArrayBuffer>;
}
