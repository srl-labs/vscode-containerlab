/**
 * Shared types for audio easter egg hooks
 */

/**
 * Common return interface for all audio hooks
 * Each hook extends this with track-specific methods
 */
export interface AudioEngineReturn {
  play: () => void;
  stop: () => void;
  isPlaying: boolean;
  isLoading: boolean;
  isMuted: boolean;
  toggleMute: () => void;
  getFrequencyData: () => Uint8Array<ArrayBuffer>;
  getTimeDomainData: () => Uint8Array<ArrayBuffer>;
}

/**
 * Configuration for audio engine
 */
export interface AudioEngineConfig {
  /** Whether to loop the audio buffer */
  loop?: boolean;
  /** Loop end time in seconds (for pre-rendered reverb tails) */
  loopEnd?: number;
  /** FFT size for analyser (default 256) */
  fftSize?: number;
  /** Smoothing time constant for analyser (default 0.85) */
  smoothingTimeConstant?: number;
  /** Called when playback starts successfully */
  onPlay?: () => void;
  /** Called when playback stops (manually or naturally) */
  onStop?: () => void;
}

/**
 * Refs exposed by audio engine for track-specific extensions
 */
export interface AudioEngineRefs {
  audioContextRef: { current: AudioContext | null };
  startTimeRef: { current: number };
  analyserRef: { current: AnalyserNode | null };
}

/**
 * Scale definition for frequency lookup
 * Maps octave offset to array of 7 frequencies (scale degrees 1-7)
 */
export type ScaleDefinition = Record<number, number[]>;

/**
 * Melody note interface used by all audio hooks
 */
export interface MelodyNote {
  frequency: number;
  beat: number;
  duration: number;
  isRest?: boolean;
}

/**
 * Buffer cache for pre-rendered audio
 */
export interface BufferCache {
  buffer: AudioBuffer | null;
  isRendering: boolean;
  renderPromise: Promise<AudioBuffer> | null;
}
