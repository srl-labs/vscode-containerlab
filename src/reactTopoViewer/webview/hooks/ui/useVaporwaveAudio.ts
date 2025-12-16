/**
 * Vaporwave Audio Hook
 *
 * Generates that classic vaporwave aesthetic sound.
 * Based on "Computing of Lisa Frank 420 / Modern Computing" by MACINTOSH PLUS
 *
 * Uses pre-rendered audio for smooth playback on slow hardware.
 *
 * Key: B minor
 * Tempo: ~70 BPM (slow and dreamy)
 */

import { useCallback, useRef, useState } from 'react';

/**
 * B minor scale frequencies
 * B minor: B, C#, D, E, F#, G, A
 */
const B_MINOR_SCALE: Record<number, number[]> = {
  // Scale degrees 1-7 at different octaves
  // Octave -3 (very low)
  [-3]: [30.87, 34.65, 36.71, 41.20, 46.25, 49.00, 55.00], // B0, C#1, D1, E1, F#1, G1, A1
  // Octave -2
  [-2]: [61.74, 69.30, 73.42, 82.41, 92.50, 98.00, 110.00], // B1, C#2, D2, E2, F#2, G2, A2
  // Octave -1
  [-1]: [123.47, 138.59, 146.83, 164.81, 185.00, 196.00, 220.00], // B2, C#3, D3, E3, F#3, G3, A3
  // Octave 0 (base octave - around middle)
  [0]: [246.94, 277.18, 293.66, 329.63, 369.99, 392.00, 440.00], // B3, C#4, D4, E4, F#4, G4, A4
  // Octave 1
  [1]: [493.88, 554.37, 587.33, 659.25, 739.99, 783.99, 880.00], // B4, C#5, D5, E5, F#5, G5, A5
  // Octave 2
  [2]: [987.77, 1108.73, 1174.66, 1318.51, 1479.98, 1567.98, 1760.00], // B5, C#6, D6, E6, F#6, G6, A6
};

/**
 * Get frequency for a scale degree in B minor
 * @param sd Scale degree (1-7)
 * @param octave Octave offset from base
 */
function getBMinorFrequency(sd: number, octave: number): number {
  const scaleIndex = sd - 1; // Convert 1-7 to 0-6
  const frequencies = B_MINOR_SCALE[octave];
  if (!frequencies || scaleIndex < 0 || scaleIndex >= 7) {
    // Fallback to base octave
    return B_MINOR_SCALE[0][Math.max(0, Math.min(6, scaleIndex))];
  }
  return frequencies[scaleIndex];
}

/** ~70 BPM for that slowed down vaporwave feel */
const BEAT = 0.857; // seconds per beat
const LOOP_DURATION = 33 * BEAT; // 33 beats per loop
const SAMPLE_RATE = 44100;

/** Melody note interface */
interface MelodyNote {
  frequency: number;
  beat: number;
  duration: number;
}

/**
 * Build the Lisa Frank 420 melody
 * Based on hooktheory transcription - B minor
 */
function buildMelody(): MelodyNote[] {
  const rawNotes = [
    { sd: 1, octave: 0, beat: 1, duration: 1.5 },
    { sd: 5, octave: 0, beat: 2.5, duration: 2 },
    { sd: 5, octave: 0, beat: 4.5, duration: 0.5 },
    { sd: 4, octave: 0, beat: 5, duration: 0.5 },
    { sd: 3, octave: 0, beat: 5.5, duration: 0.5 },
    { sd: 2, octave: 0, beat: 6, duration: 0.5 },
    { sd: 2, octave: 0, beat: 6.5, duration: 1.5 },
    { sd: 3, octave: 0, beat: 8, duration: 0.5 },
    { sd: 1, octave: 0, beat: 8.5, duration: 3.5 },
    { sd: 1, octave: 1, beat: 12, duration: 0.5 },
    { sd: 7, octave: 0, beat: 12.5, duration: 3.5 },
    { sd: 1, octave: 0, beat: 16, duration: 0.5 },
    { sd: 3, octave: 0, beat: 16.5, duration: 0.5 },
    { sd: 1, octave: 0, beat: 17, duration: 1.5 },
    { sd: 5, octave: 0, beat: 18.5, duration: 2 },
    { sd: 5, octave: 0, beat: 20.5, duration: 0.5 },
    { sd: 4, octave: 0, beat: 21, duration: 0.5 },
    { sd: 3, octave: 0, beat: 21.5, duration: 0.5 },
    { sd: 2, octave: 0, beat: 22, duration: 0.5 },
    { sd: 2, octave: 0, beat: 22.5, duration: 1.5 },
    { sd: 1, octave: 0, beat: 24, duration: 0.5 },
    { sd: 5, octave: 0, beat: 24.5, duration: 4.5 },
    { sd: 7, octave: -3, beat: 29, duration: 0.5 },
    { sd: 3, octave: -1, beat: 29.5, duration: 0.5 },
    { sd: 3, octave: -1, beat: 30, duration: 0.5 },
    { sd: 7, octave: -3, beat: 30.5, duration: 0.5 },
    { sd: 4, octave: -1, beat: 31, duration: 0.5 },
    { sd: 4, octave: -1, beat: 31.5, duration: 0.5 },
    { sd: 7, octave: -3, beat: 32, duration: 0.5 },
    { sd: 3, octave: 0, beat: 32.5, duration: 0.5 },
  ];

  return rawNotes.map(note => ({
    frequency: getBMinorFrequency(note.sd, note.octave),
    beat: note.beat,
    duration: note.duration,
  }));
}

const FULL_MELODY = buildMelody();

/**
 * Chord pads for Lisa Frank 420
 * Based on hooktheory chord progression
 */
const CHORD_PADS = {
  // Em7 (IV7) - beats 1-4
  Em7: [getBMinorFrequency(4, -1), getBMinorFrequency(6, -1), getBMinorFrequency(1, 0), getBMinorFrequency(3, 0)],
  // Bm (i) - beats 5-8, 13-16, 21-24
  Bm: [getBMinorFrequency(1, -1), getBMinorFrequency(3, -1), getBMinorFrequency(5, -1), getBMinorFrequency(1, 0)],
  // Em (iv) - beats 9-12, 17-20
  Em: [getBMinorFrequency(4, -1), getBMinorFrequency(6, -1), getBMinorFrequency(1, 0), getBMinorFrequency(4, 0)],
  // C#m7 (ii) - beats 25-28
  Csm7: [getBMinorFrequency(2, -1), getBMinorFrequency(4, -1), getBMinorFrequency(6, -1), getBMinorFrequency(1, 0)],
  // A (VII) - beats 29-32
  A: [getBMinorFrequency(7, -2), getBMinorFrequency(2, -1), getBMinorFrequency(4, -1), getBMinorFrequency(7, -1)],
};

/** Sections for visual sync - maps to chord changes */
type VaporwaveSection = 'em7' | 'bm' | 'em' | 'csm7' | 'a';

// Module-level cache for pre-rendered audio buffer
let cachedBuffer: AudioBuffer | null = null;
let isRendering = false;
let renderPromise: Promise<AudioBuffer> | null = null;

/**
 * Create a note in the offline context
 */
function createNoteOffline(
  ctx: OfflineAudioContext,
  frequency: number,
  startTime: number,
  duration: number,
  destination: AudioNode,
  volume: number = 0.15
): void {
  // Main sine wave - pure and clean
  const mainOsc = ctx.createOscillator();
  mainOsc.type = 'sine';
  mainOsc.frequency.value = frequency;

  // Sub oscillator - one octave down for warmth
  const subOsc = ctx.createOscillator();
  subOsc.type = 'sine';
  subOsc.frequency.value = frequency / 2;

  // Triangle for body
  const bodyOsc = ctx.createOscillator();
  bodyOsc.type = 'triangle';
  bodyOsc.frequency.value = frequency;

  // Gain envelopes
  const mainGain = ctx.createGain();
  const subGain = ctx.createGain();
  const bodyGain = ctx.createGain();

  // LFO for vibrato (slower for vaporwave)
  const lfo = ctx.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = 3; // Slow vibrato
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 2; // Subtle pitch wobble

  lfo.connect(lfoGain);
  lfoGain.connect(mainOsc.frequency);
  lfoGain.connect(bodyOsc.frequency);

  // Low-pass filter for that warm, slowed-down feel
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 1500;
  filter.Q.value = 0.7;

  // Connect oscillators
  mainOsc.connect(mainGain);
  subOsc.connect(subGain);
  bodyOsc.connect(bodyGain);

  mainGain.connect(filter);
  subGain.connect(filter);
  bodyGain.connect(filter);
  filter.connect(destination);

  // Envelope - slow attack, long release for dreamy feel
  const attackTime = 0.15;
  const releaseTime = 0.8;

  mainGain.gain.setValueAtTime(0, startTime);
  mainGain.gain.linearRampToValueAtTime(volume, startTime + attackTime);
  mainGain.gain.setValueAtTime(volume, startTime + duration - releaseTime);
  mainGain.gain.linearRampToValueAtTime(0, startTime + duration);

  subGain.gain.setValueAtTime(0, startTime);
  subGain.gain.linearRampToValueAtTime(volume * 0.4, startTime + attackTime);
  subGain.gain.setValueAtTime(volume * 0.4, startTime + duration - releaseTime);
  subGain.gain.linearRampToValueAtTime(0, startTime + duration);

  bodyGain.gain.setValueAtTime(0, startTime);
  bodyGain.gain.linearRampToValueAtTime(volume * 0.25, startTime + attackTime);
  bodyGain.gain.setValueAtTime(volume * 0.25, startTime + duration - releaseTime);
  bodyGain.gain.linearRampToValueAtTime(0, startTime + duration);

  // Start and stop
  const stopTime = startTime + duration + 0.1;
  mainOsc.start(startTime);
  mainOsc.stop(stopTime);
  subOsc.start(startTime);
  subOsc.stop(stopTime);
  bodyOsc.start(startTime);
  bodyOsc.stop(stopTime);
  lfo.start(startTime);
  lfo.stop(stopTime);
}

/**
 * Create pad chord in the offline context
 */
function createPadChordOffline(
  ctx: OfflineAudioContext,
  frequencies: number[],
  startTime: number,
  duration: number,
  destination: AudioNode
): void {
  frequencies.forEach((freq, i) => {
    // Stagger entries slightly for lush effect
    const stagger = i * 0.08;
    createNoteOffline(ctx, freq, startTime + stagger, duration, destination, 0.04);
  });
}

/**
 * Pre-render one loop of the vaporwave audio
 */
async function renderLoop(): Promise<AudioBuffer> {
  // Return cached buffer if available
  if (cachedBuffer) {
    return cachedBuffer;
  }

  // If already rendering, wait for it
  if (isRendering && renderPromise) {
    return renderPromise;
  }

  isRendering = true;

  renderPromise = (async () => {
    // Create offline context for rendering
    // Add extra time for reverb tail
    const totalDuration = LOOP_DURATION + 2;
    const ctx = new OfflineAudioContext(2, totalDuration * SAMPLE_RATE, SAMPLE_RATE);

    // Master gain
    const masterGain = ctx.createGain();
    masterGain.gain.value = 0.7;

    // Compressor for smooth dynamics
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -20;
    compressor.knee.value = 20;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.01;
    compressor.release.value = 0.3;

    // LFO-modulated chorus effect
    const chorusDelay = ctx.createDelay(0.05);
    chorusDelay.delayTime.value = 0.015;

    const chorusLfo = ctx.createOscillator();
    chorusLfo.type = 'sine';
    chorusLfo.frequency.value = 0.3;
    const chorusDepth = ctx.createGain();
    chorusDepth.gain.value = 0.004;
    chorusLfo.connect(chorusDepth);
    chorusDepth.connect(chorusDelay.delayTime);
    chorusLfo.start(0);
    chorusLfo.stop(totalDuration);

    const chorusGain = ctx.createGain();
    chorusGain.gain.value = 0.5;

    // Extra long reverb chain for vaporwave
    const reverb1 = ctx.createDelay(0.5);
    reverb1.delayTime.value = 0.15;
    const reverb1Gain = ctx.createGain();
    reverb1Gain.gain.value = 0.5;

    const reverb2 = ctx.createDelay(0.5);
    reverb2.delayTime.value = 0.25;
    const reverb2Gain = ctx.createGain();
    reverb2Gain.gain.value = 0.4;

    const reverb3 = ctx.createDelay(0.5);
    reverb3.delayTime.value = 0.4;
    const reverb3Gain = ctx.createGain();
    reverb3Gain.gain.value = 0.35;

    const reverb4 = ctx.createDelay(0.6);
    reverb4.delayTime.value = 0.55;
    const reverb4Gain = ctx.createGain();
    reverb4Gain.gain.value = 0.25;

    // Output mixer
    const outputMixer = ctx.createGain();
    outputMixer.gain.value = 1.0;

    // Connect audio graph
    masterGain.connect(compressor);

    // Dry path
    compressor.connect(outputMixer);

    // Chorus path
    compressor.connect(chorusDelay);
    chorusDelay.connect(chorusGain);
    chorusGain.connect(outputMixer);

    // Reverb chain (parallel)
    compressor.connect(reverb1);
    reverb1.connect(reverb1Gain);
    reverb1Gain.connect(outputMixer);
    reverb1Gain.connect(reverb2);

    reverb2.connect(reverb2Gain);
    reverb2Gain.connect(outputMixer);
    reverb2Gain.connect(reverb3);

    reverb3.connect(reverb3Gain);
    reverb3Gain.connect(outputMixer);
    reverb3Gain.connect(reverb4);

    reverb4.connect(reverb4Gain);
    reverb4Gain.connect(outputMixer);

    outputMixer.connect(ctx.destination);

    // Schedule melody notes
    const startTime = 0;
    FULL_MELODY.forEach(note => {
      const noteStart = startTime + (note.beat - 1) * BEAT;
      createNoteOffline(ctx, note.frequency, noteStart, note.duration * BEAT, masterGain, 0.18);
    });

    // Schedule chord pads
    createPadChordOffline(ctx, CHORD_PADS.Em7, startTime, 4 * BEAT, masterGain);
    createPadChordOffline(ctx, CHORD_PADS.Bm, startTime + 4 * BEAT, 4 * BEAT, masterGain);
    createPadChordOffline(ctx, CHORD_PADS.Em, startTime + 8 * BEAT, 4 * BEAT, masterGain);
    createPadChordOffline(ctx, CHORD_PADS.Bm, startTime + 12 * BEAT, 4 * BEAT, masterGain);
    createPadChordOffline(ctx, CHORD_PADS.Em, startTime + 16 * BEAT, 4 * BEAT, masterGain);
    createPadChordOffline(ctx, CHORD_PADS.Bm, startTime + 20 * BEAT, 4 * BEAT, masterGain);
    createPadChordOffline(ctx, CHORD_PADS.Csm7, startTime + 24 * BEAT, 4 * BEAT, masterGain);
    createPadChordOffline(ctx, CHORD_PADS.A, startTime + 28 * BEAT, 5 * BEAT, masterGain);

    // Render to buffer
    const buffer = await ctx.startRendering();
    cachedBuffer = buffer;
    isRendering = false;
    return buffer;
  })();

  return renderPromise;
}

export interface UseVaporwaveAudioReturn {
  play: () => void;
  stop: () => void;
  isPlaying: boolean;
  isLoading: boolean;
  isMuted: boolean;
  toggleMute: () => void;
  getFrequencyData: () => Uint8Array<ArrayBuffer>;
  getTimeDomainData: () => Uint8Array<ArrayBuffer>;
  getCurrentSection: () => VaporwaveSection;
}

/**
 * Vaporwave audio synthesis hook with pre-rendered audio
 */
export function useVaporwaveAudio(): UseVaporwaveAudioReturn {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const startTimeRef = useRef(0);
  // Generation counter to cancel pending loads when stop() is called
  const loadGenRef = useRef<number>(0);
  // Track muted state in ref for use in play() without stale closure
  const isMutedRef = useRef(false);

  // Empty frequency data for when not playing
  const emptyFrequencyData = useRef(new Uint8Array(128));
  const emptyTimeDomainData = useRef(new Uint8Array(128));

  /**
   * Get current section based on playback time
   * Maps to chord progression: Em7 -> Bm -> Em -> Bm -> Em -> Bm -> C#m7 -> A
   */
  const getCurrentSection = useCallback((): VaporwaveSection => {
    if (!audioContextRef.current || !isPlaying) return 'em7';

    const elapsed = audioContextRef.current.currentTime - startTimeRef.current;
    const positionInLoop = elapsed % LOOP_DURATION;
    const currentBeat = positionInLoop / BEAT;

    if (currentBeat < 4) return 'em7';      // beats 1-4
    if (currentBeat < 8) return 'bm';       // beats 5-8
    if (currentBeat < 12) return 'em';      // beats 9-12
    if (currentBeat < 16) return 'bm';      // beats 13-16
    if (currentBeat < 20) return 'em';      // beats 17-20
    if (currentBeat < 24) return 'bm';      // beats 21-24
    if (currentBeat < 28) return 'csm7';    // beats 25-28
    return 'a';                              // beats 29-33
  }, [isPlaying]);

  /**
   * Start playback with pre-rendered audio
   */
  const play = useCallback(async () => {
    if (isPlaying || isLoading) return;

    setIsLoading(true);
    const currentGen = ++loadGenRef.current;

    try {
      // Pre-render the audio (uses cache if already rendered)
      const buffer = await renderLoop();

      // Check if cancelled during loading
      if (loadGenRef.current !== currentGen) {
        return;
      }

      // Create playback context
      const ctx = new AudioContext({ latencyHint: 'playback' });
      audioContextRef.current = ctx;

      // Create analyser for visualization
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;

      // Create buffer source for playback
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      source.loopEnd = LOOP_DURATION; // Loop at the exact loop duration, before reverb tail
      sourceNodeRef.current = source;

      // Create gain node for mute control
      const gainNode = ctx.createGain();
      gainNode.gain.value = isMutedRef.current ? 0 : 1;
      gainNodeRef.current = gainNode;

      // Connect: source -> analyser -> gainNode -> destination
      source.connect(analyser);
      analyser.connect(gainNode);
      gainNode.connect(ctx.destination);

      // Start playback
      startTimeRef.current = ctx.currentTime;
      source.start(0);

      setIsPlaying(true);
    } finally {
      setIsLoading(false);
    }
  }, [isPlaying, isLoading]);

  /**
   * Stop playback
   */
  const stop = useCallback(() => {
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
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    analyserRef.current = null;
    gainNodeRef.current = null;
    setIsPlaying(false);
  }, []);

  /**
   * Toggle mute state
   */
  const toggleMute = useCallback(() => {
    const newMuted = !isMutedRef.current;
    isMutedRef.current = newMuted;
    setIsMuted(newMuted);
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = newMuted ? 0 : 1;
    }
  }, []);

  /**
   * Get frequency data for visualization
   */
  const getFrequencyData = useCallback((): Uint8Array<ArrayBuffer> => {
    if (!analyserRef.current) return emptyFrequencyData.current;
    const data = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(data);
    return data;
  }, []);

  /**
   * Get time domain data for waveform visualization
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
    getCurrentSection,
  };
}
