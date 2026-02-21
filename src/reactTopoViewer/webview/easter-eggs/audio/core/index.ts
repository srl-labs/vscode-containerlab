/**
 * Core audio utilities for easter egg hooks
 */

export { useAudioEngine } from "./useAudioEngine";
export type {
  AudioEngineConfig,
  AudioEngineRefs,
  AudioEngineReturn,
  BufferCache,
  MelodyNote,
  ScaleDefinition,
} from "./types";
export {
  A_MINOR_SCALE,
  B_MINOR_SCALE,
  C_MINOR_SCALE,
  getAMinorFrequency,
  getBMinorFrequency,
  getCMinorFrequency,
  getScaleFrequency,
} from "./frequencyUtils";
