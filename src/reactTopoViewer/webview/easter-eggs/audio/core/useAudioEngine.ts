/**
 * Base audio engine hook
 *
 * Provides common audio playback functionality:
 * - Play/stop/mute controls
 * - Audio context and analyser management
 * - Frequency and time domain data for visualizations
 *
 * Individual audio hooks compose this with their specific audio generation.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import type { AudioEngineConfig, AudioEngineRefs, AudioEngineReturn } from "./types";

/**
 * Default configuration values
 */
const DEFAULTS: Required<Omit<AudioEngineConfig, "onPlay" | "onStop" | "loopEnd">> = {
  loop: false,
  fftSize: 256,
  smoothingTimeConstant: 0.85,
};

/**
 * Global mute state that persists across all audio engine instances.
 * When muted, stays muted when switching songs until explicitly unmuted.
 */
let globalMuteState = false;

/**
 * Base audio engine hook
 *
 * @param renderBuffer - Function that returns a Promise<AudioBuffer> for playback
 * @param config - Optional configuration for playback behavior
 * @returns Audio engine controls and refs for track-specific extensions
 */
export function useAudioEngine(
  renderBuffer: () => Promise<AudioBuffer>,
  config: AudioEngineConfig = {}
): AudioEngineReturn & { refs: AudioEngineRefs } {
  const {
    loop = DEFAULTS.loop,
    loopEnd,
    fftSize = DEFAULTS.fftSize,
    smoothingTimeConstant = DEFAULTS.smoothingTimeConstant,
    onPlay,
    onStop,
  } = config;

  // React state - initialize mute from global state
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isMuted, setIsMuted] = useState(globalMuteState);

  // Audio node refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const startTimeRef = useRef(0);

  // Load generation counter for cancellation
  const loadGenRef = useRef(0);
  // Muted state ref (avoids stale closure in play()) - initialized from global state
  const isMutedRef = useRef(globalMuteState);

  // Sync with global mute state on mount (in case it changed externally)
  useEffect(() => {
    isMutedRef.current = globalMuteState;
    setIsMuted(globalMuteState);
  }, []);

  // Pre-allocated data arrays for getFrequencyData/getTimeDomainData
  const emptyFrequencyData = useRef(new Uint8Array(fftSize / 2));
  const emptyTimeDomainData = useRef(new Uint8Array(fftSize / 2));

  /**
   * Start playback
   */
  const play = useCallback(async () => {
    if (isPlaying || isLoading) return;

    setIsLoading(true);
    const currentGen = ++loadGenRef.current;

    try {
      const buffer = await renderBuffer();

      // Check if cancelled during loading
      if (loadGenRef.current !== currentGen) {
        return;
      }

      const ctx = new AudioContext({ latencyHint: "playback" });
      audioContextRef.current = ctx;

      // Resume if suspended (mobile browsers)
      if (ctx.state === "suspended") {
        await ctx.resume();
      }

      // Create analyser for visualizations
      const analyser = ctx.createAnalyser();
      analyser.fftSize = fftSize;
      analyser.smoothingTimeConstant = smoothingTimeConstant;
      analyserRef.current = analyser;

      // Create buffer source
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = loop;
      if (loop && loopEnd !== undefined) {
        source.loopEnd = loopEnd;
      }
      sourceNodeRef.current = source;

      // Create gain node for mute control
      const gainNode = ctx.createGain();
      gainNode.gain.value = isMutedRef.current ? 0 : 1;
      gainNodeRef.current = gainNode;

      // Connect: source -> analyser -> gainNode -> destination
      source.connect(analyser);
      analyser.connect(gainNode);
      gainNode.connect(ctx.destination);

      // Handle natural end of playback
      source.onended = () => {
        // Only trigger stop if still the active source
        if (sourceNodeRef.current === source) {
          stopPlayback();
        }
      };

      startTimeRef.current = ctx.currentTime;
      source.start(0);

      setIsPlaying(true);
      onPlay?.();
    } finally {
      setIsLoading(false);
    }
  }, [isPlaying, isLoading, renderBuffer, loop, loopEnd, fftSize, smoothingTimeConstant, onPlay]);

  /**
   * Internal stop implementation
   */
  const stopPlayback = useCallback(() => {
    // Cancel any pending load operations
    loadGenRef.current++;

    if (sourceNodeRef.current) {
      try {
        sourceNodeRef.current.stop();
      } catch {
        // Node may already be stopped
      }
      sourceNodeRef.current = null;
    }

    if (audioContextRef.current) {
      void audioContextRef.current.close();
      audioContextRef.current = null;
    }

    analyserRef.current = null;
    gainNodeRef.current = null;
    setIsPlaying(false);
    onStop?.();
  }, [onStop]);

  /**
   * Stop playback (public API)
   */
  const stop = useCallback(() => {
    stopPlayback();
  }, [stopPlayback]);

  /**
   * Toggle mute state - persists globally across song switches
   */
  const toggleMute = useCallback(() => {
    const newMuted = !isMutedRef.current;
    isMutedRef.current = newMuted;
    globalMuteState = newMuted; // Persist to global state
    setIsMuted(newMuted);
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = newMuted ? 0 : 1;
    }
  }, []);

  /**
   * Get frequency data for visualizations
   */
  const getFrequencyData = useCallback((): Uint8Array<ArrayBuffer> => {
    if (!analyserRef.current) return emptyFrequencyData.current;
    const data = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(data);
    return data;
  }, []);

  /**
   * Get time domain data for waveform visualizations
   */
  const getTimeDomainData = useCallback((): Uint8Array<ArrayBuffer> => {
    if (!analyserRef.current) return emptyTimeDomainData.current;
    const data = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteTimeDomainData(data);
    return data;
  }, []);

  return {
    play,
    stop,
    isPlaying,
    isLoading,
    isMuted,
    toggleMute,
    getFrequencyData,
    getTimeDomainData,
    refs: {
      audioContextRef,
      startTimeRef,
      analyserRef,
    },
  };
}
