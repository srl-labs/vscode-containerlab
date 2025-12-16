/**
 * Stickerbrush Symphony Audio Hook
 *
 * Generates the iconic ambient melody from Donkey Kong Country 2.
 * Composed by Dave Wise - dreamy, ethereal arpeggios.
 *
 * Pre-rendered synthesis with:
 * - Multiple oscillator layers per note
 * - LFO-modulated chorus effect
 * - Rich 3-tap reverb chain
 * - Warm ethereal filtering
 *
 * Key: A minor
 * Pattern: B-C-B-C-G repeating with chord changes
 */

import { useCallback, useRef, useState } from 'react';

/**
 * Note frequencies in Hz - A minor scale
 * Scale degrees: 1=A, 2=B, 3=C, 4=D, 5=E, 6=F, 7=G
 */
const NOTES = {
  // Octave 3 (lower)
  A3: 220.0,
  B3: 246.94,
  C4: 261.63,
  D4: 293.66,
  E4: 329.63,
  F4: 349.23,
  G3: 196.0,
  // Octave 4 (middle - base octave)
  A4: 440.0,
  B4: 493.88,
  C5: 523.25,
  D5: 587.33,
  E5: 659.25,
  F5: 698.46,
  G4: 392.0,
  // Octave 5
  G5: 783.99,
} as const;

/** ~75 BPM timing for dreamy feel */
const BEAT = 0.8; // seconds per beat
const SAMPLE_RATE = 44100;
const TOTAL_BEATS = 33;
const REVERB_TAIL = 4; // seconds for reverb to decay
const TOTAL_DURATION = TOTAL_BEATS * BEAT + REVERB_TAIL;

/** Frequency lookup for octave 0 (main melody) - scale degrees 1-7 */
const OCTAVE_0_FREQS: Record<number, number> = {
  1: NOTES.A4, 2: NOTES.B4, 3: NOTES.C5, 4: NOTES.D5,
  5: NOTES.E5, 6: NOTES.F5, 7: NOTES.G4
};

/** Frequency lookup for octave -1 (lower) - scale degrees 1-7 */
const OCTAVE_NEG1_FREQS: Record<number, number> = {
  1: NOTES.A3, 2: NOTES.B3, 3: NOTES.C4, 4: NOTES.D4,
  5: NOTES.E4, 6: NOTES.F4, 7: NOTES.G3
};

/**
 * Convert scale degree and octave to frequency (A minor)
 */
function getFrequency(sd: number, octave: number): number {
  const lookup = octave === 0 ? OCTAVE_0_FREQS : OCTAVE_NEG1_FREQS;
  return lookup[sd] ?? NOTES.A4;
}

/** Melody note interface */
interface MelodyNote {
  frequency: number;
  beat: number;
  duration: number;
}

/**
 * Build the Stickerbrush melody from the correct JSON data
 */
function buildMelody(): MelodyNote[] {
  // Complete Stickerbrush Symphony melody with all 22 G notes (scale degree 7)
  // Pattern: B-C-B-C-G with high G shimmer notes throughout
  const rawNotes = [
    // Phrase 1 (beats 1-8) - Am7 chord
    { sd: 7, octave: 0, beat: 1, duration: 0.25 },      // G4 shimmer
    { sd: 2, octave: 0, beat: 1.5, duration: 0.5 },     // B4
    { sd: 3, octave: 0, beat: 2, duration: 0.75 },      // C5
    { sd: 7, octave: 0, beat: 2.5, duration: 0.25 },    // G4 shimmer
    { sd: 2, octave: 0, beat: 2.75, duration: 0.75 },   // B4
    { sd: 3, octave: 0, beat: 3.5, duration: 0.5 },     // C5
    { sd: 7, octave: -1, beat: 4, duration: 1 },        // G3 bass
    { sd: 7, octave: 0, beat: 5, duration: 0.25 },      // G4 shimmer
    { sd: 2, octave: 0, beat: 5.5, duration: 0.5 },     // B4
    { sd: 3, octave: 0, beat: 6, duration: 0.75 },      // C5
    { sd: 7, octave: 0, beat: 6.5, duration: 0.25 },    // G4 shimmer
    { sd: 2, octave: 0, beat: 6.75, duration: 0.75 },   // B4
    { sd: 3, octave: 0, beat: 7.5, duration: 0.5 },     // C5
    { sd: 7, octave: -1, beat: 8, duration: 1 },        // G3 bass
    // Phrase 2 (beats 9-16) - Cmaj7 chord
    { sd: 7, octave: 0, beat: 9, duration: 0.25 },      // G4 shimmer
    { sd: 2, octave: 0, beat: 9.5, duration: 0.5 },     // B4
    { sd: 3, octave: 0, beat: 10, duration: 0.75 },     // C5
    { sd: 7, octave: 0, beat: 10.5, duration: 0.25 },   // G4 shimmer
    { sd: 2, octave: 0, beat: 10.75, duration: 0.75 },  // B4
    { sd: 3, octave: 0, beat: 11.5, duration: 0.5 },    // C5
    { sd: 7, octave: -1, beat: 12, duration: 1 },       // G3 bass
    { sd: 7, octave: 0, beat: 13, duration: 0.25 },     // G4 shimmer
    { sd: 2, octave: 0, beat: 13.5, duration: 0.5 },    // B4
    { sd: 3, octave: 0, beat: 14, duration: 0.75 },     // C5
    { sd: 7, octave: 0, beat: 14.5, duration: 0.25 },   // G4 shimmer
    { sd: 2, octave: 0, beat: 14.75, duration: 0.75 },  // B4
    { sd: 3, octave: 0, beat: 15.5, duration: 0.5 },    // C5
    { sd: 7, octave: -1, beat: 16, duration: 0.5 },     // G3 bass
    { sd: 7, octave: 0, beat: 16.5, duration: 0.25 },   // G4 transition
    { sd: 7, octave: 0, beat: 16.75, duration: 0.25 },  // G4 transition
    // Phrase 3 (beats 17-24) - Am7 chord
    { sd: 7, octave: 0, beat: 17, duration: 0.25 },     // G4 shimmer
    { sd: 2, octave: 0, beat: 17.5, duration: 0.5 },    // B4
    { sd: 3, octave: 0, beat: 18, duration: 0.75 },     // C5
    { sd: 2, octave: 0, beat: 18.75, duration: 0.75 },  // B4
    { sd: 3, octave: 0, beat: 19.5, duration: 0.5 },    // C5
    { sd: 7, octave: -1, beat: 20, duration: 1 },       // G3 bass
    { sd: 7, octave: 0, beat: 21, duration: 0.25 },     // G4 shimmer
    { sd: 2, octave: 0, beat: 21.5, duration: 0.5 },    // B4
    { sd: 3, octave: 0, beat: 22, duration: 0.75 },     // C5
    { sd: 2, octave: 0, beat: 22.75, duration: 0.75 },  // B4
    { sd: 3, octave: 0, beat: 23.5, duration: 0.5 },    // C5
    { sd: 7, octave: -1, beat: 24, duration: 1 },       // G3 bass
    // Phrase 4 (beats 25-32) - Cmaj7 chord
    { sd: 2, octave: 0, beat: 25.5, duration: 0.5 },    // B4
    { sd: 3, octave: 0, beat: 26, duration: 0.75 },     // C5
    { sd: 2, octave: 0, beat: 26.75, duration: 0.75 },  // B4
    { sd: 3, octave: 0, beat: 27.5, duration: 0.5 },    // C5
    { sd: 7, octave: -1, beat: 28, duration: 1 },       // G3 bass
    { sd: 2, octave: 0, beat: 29.5, duration: 0.5 },    // B4
    { sd: 3, octave: 0, beat: 30, duration: 0.75 },     // C5
    { sd: 2, octave: 0, beat: 30.75, duration: 0.75 },  // B4
    { sd: 3, octave: 0, beat: 31.5, duration: 0.5 },    // C5
    { sd: 7, octave: -1, beat: 32, duration: 0.5 },     // G3 bass
    { sd: 7, octave: 0, beat: 32.5, duration: 0.25 },   // G4 transition
    { sd: 7, octave: 0, beat: 32.75, duration: 0.25 },  // G4 transition
  ];

  return rawNotes.map(note => ({
    frequency: getFrequency(note.sd, note.octave),
    beat: note.beat,
    duration: note.duration,
  }));
}

const FULL_MELODY = buildMelody();

/** Chord pads - Amaj7 and Cmaj7 alternating */
const CHORD_PADS = {
  // Amaj7 (beats 1-8, 17-24): A, C#, E, G# - but in A minor context, use Am7: A, C, E, G
  Am7: [NOTES.A3, NOTES.C4, NOTES.E4, NOTES.G3],
  // Cmaj7 (beats 9-16, 25-32): C, E, G, B
  Cmaj7: [NOTES.C4, NOTES.E4, NOTES.G4, NOTES.B4],
};

// Module-level audio buffer cache
let cachedBuffer: AudioBuffer | null = null;
let isRendering = false;
let renderPromise: Promise<AudioBuffer> | null = null;

/**
 * Schedule a pad chord in the offline context
 */
function schedulePadChord(
  ctx: OfflineAudioContext,
  masterGain: GainNode,
  frequencies: number[],
  startTime: number,
  duration: number
): void {
  for (const freq of frequencies) {
    // Layer 1: Main sine tone
    const osc1 = ctx.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(freq, startTime);

    // Layer 2: Slight detune for ethereal width
    const osc2 = ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(freq * 1.003, startTime);

    // Layer 3: Triangle for warmth (octave down)
    const osc3 = ctx.createOscillator();
    osc3.type = 'triangle';
    osc3.frequency.setValueAtTime(freq * 0.5, startTime);

    // Very slow, gentle envelope
    const oscGain = ctx.createGain();
    oscGain.gain.setValueAtTime(0, startTime);
    oscGain.gain.linearRampToValueAtTime(0.012, startTime + 2.0);
    oscGain.gain.setValueAtTime(0.012, startTime + duration - 2.5);
    oscGain.gain.linearRampToValueAtTime(0, startTime + duration);

    osc1.connect(oscGain);
    osc2.connect(oscGain);
    osc3.connect(oscGain);
    oscGain.connect(masterGain);

    osc1.start(startTime);
    osc1.stop(startTime + duration + 0.5);
    osc2.start(startTime);
    osc2.stop(startTime + duration + 0.5);
    osc3.start(startTime);
    osc3.stop(startTime + duration + 0.5);
  }
}

/**
 * Schedule a crystalline, bell-like note in the offline context
 */
function scheduleNote(
  ctx: OfflineAudioContext,
  masterGain: GainNode,
  frequency: number,
  startTime: number,
  duration: number
): void {
  if (frequency === 0) return;

  const noteDuration = duration * BEAT;
  const noteMixer = ctx.createGain();
  noteMixer.connect(masterGain);

  // --- Layer 1: Pure fundamental (sine) ---
  const mainOsc = ctx.createOscillator();
  mainOsc.type = 'sine';
  mainOsc.frequency.setValueAtTime(frequency, startTime);

  const mainGain = ctx.createGain();
  mainGain.gain.setValueAtTime(0, startTime);
  mainGain.gain.linearRampToValueAtTime(0.10, startTime + 0.04);
  mainGain.gain.exponentialRampToValueAtTime(0.07, startTime + 0.18);
  mainGain.gain.setValueAtTime(0.07, startTime + noteDuration * 0.4);
  mainGain.gain.exponentialRampToValueAtTime(0.001, startTime + noteDuration + 1.0);

  mainOsc.connect(mainGain);
  mainGain.connect(noteMixer);

  // --- Layer 2: Sub octave for depth ---
  const subOsc = ctx.createOscillator();
  subOsc.type = 'sine';
  subOsc.frequency.setValueAtTime(frequency / 2, startTime);

  const subGain = ctx.createGain();
  subGain.gain.setValueAtTime(0, startTime);
  subGain.gain.linearRampToValueAtTime(0.025, startTime + 0.08);
  subGain.gain.setValueAtTime(0.025, startTime + noteDuration * 0.5);
  subGain.gain.exponentialRampToValueAtTime(0.001, startTime + noteDuration + 0.7);

  subOsc.connect(subGain);
  subGain.connect(noteMixer);

  // --- Layer 3: Soft triangle for body ---
  const bodyOsc = ctx.createOscillator();
  bodyOsc.type = 'triangle';
  bodyOsc.frequency.setValueAtTime(frequency, startTime);

  const bodyGain = ctx.createGain();
  bodyGain.gain.setValueAtTime(0, startTime);
  bodyGain.gain.linearRampToValueAtTime(0.02, startTime + 0.05);
  bodyGain.gain.exponentialRampToValueAtTime(0.012, startTime + 0.2);
  bodyGain.gain.setValueAtTime(0.012, startTime + noteDuration * 0.3);
  bodyGain.gain.exponentialRampToValueAtTime(0.001, startTime + noteDuration + 0.5);

  bodyOsc.connect(bodyGain);
  bodyGain.connect(noteMixer);

  const endTime = startTime + noteDuration + 1.2;

  mainOsc.start(startTime);
  mainOsc.stop(endTime);

  subOsc.start(startTime);
  subOsc.stop(endTime);

  bodyOsc.start(startTime);
  bodyOsc.stop(endTime);
}

/**
 * Pre-render the entire Stickerbrush Symphony to an AudioBuffer
 */
async function renderAudio(): Promise<AudioBuffer> {
  if (cachedBuffer) return cachedBuffer;
  if (isRendering && renderPromise) return renderPromise;

  isRendering = true;
  renderPromise = (async () => {
    const totalSamples = Math.ceil(TOTAL_DURATION * SAMPLE_RATE);
    const ctx = new OfflineAudioContext(2, totalSamples, SAMPLE_RATE);

    // Master gain - soft overall volume
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.30, 0);

    // Warm low-pass filter for ethereal sound
    const warmFilter = ctx.createBiquadFilter();
    warmFilter.type = 'lowpass';
    warmFilter.frequency.setValueAtTime(1600, 0);
    warmFilter.Q.setValueAtTime(0.3, 0);

    // High-pass to remove rumble
    const cleanFilter = ctx.createBiquadFilter();
    cleanFilter.type = 'highpass';
    cleanFilter.frequency.setValueAtTime(60, 0);

    // LFO-modulated chorus effect
    const chorusDelay = ctx.createDelay(0.1);
    chorusDelay.delayTime.setValueAtTime(0.022, 0);

    const chorusLFO = ctx.createOscillator();
    chorusLFO.type = 'sine';
    chorusLFO.frequency.setValueAtTime(0.25, 0);

    const chorusDepth = ctx.createGain();
    chorusDepth.gain.setValueAtTime(0.004, 0);

    chorusLFO.connect(chorusDepth);
    chorusDepth.connect(chorusDelay.delayTime);
    chorusLFO.start(0);
    chorusLFO.stop(TOTAL_DURATION);

    const chorusGain = ctx.createGain();
    chorusGain.gain.setValueAtTime(0.4, 0);

    // Rich 3-tap reverb chain (longer for ambient feel)
    const reverbDelay1 = ctx.createDelay(2.0);
    reverbDelay1.delayTime.setValueAtTime(0.35, 0);

    const reverbGain1 = ctx.createGain();
    reverbGain1.gain.setValueAtTime(0.30, 0);

    const reverbFilter = ctx.createBiquadFilter();
    reverbFilter.type = 'lowpass';
    reverbFilter.frequency.setValueAtTime(1000, 0);

    const reverbDelay2 = ctx.createDelay(2.0);
    reverbDelay2.delayTime.setValueAtTime(0.7, 0);

    const reverbGain2 = ctx.createGain();
    reverbGain2.gain.setValueAtTime(0.20, 0);

    const reverbDelay3 = ctx.createDelay(2.0);
    reverbDelay3.delayTime.setValueAtTime(1.1, 0);

    const reverbGain3 = ctx.createGain();
    reverbGain3.gain.setValueAtTime(0.12, 0);

    // Gentle compressor
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-24, 0);
    compressor.knee.setValueAtTime(28, 0);
    compressor.ratio.setValueAtTime(2, 0);
    compressor.attack.setValueAtTime(0.05, 0);
    compressor.release.setValueAtTime(0.5, 0);

    // Connect main chain
    masterGain.connect(cleanFilter);
    cleanFilter.connect(warmFilter);
    warmFilter.connect(compressor);

    // Chorus
    warmFilter.connect(chorusDelay);
    chorusDelay.connect(chorusGain);
    chorusGain.connect(compressor);

    // 3-tap reverb chain
    warmFilter.connect(reverbDelay1);
    reverbDelay1.connect(reverbFilter);
    reverbFilter.connect(reverbGain1);
    reverbGain1.connect(compressor);

    reverbFilter.connect(reverbDelay2);
    reverbDelay2.connect(reverbGain2);
    reverbGain2.connect(compressor);

    reverbDelay2.connect(reverbDelay3);
    reverbDelay3.connect(reverbGain3);
    reverbGain3.connect(compressor);

    compressor.connect(ctx.destination);

    // Schedule pad chords (8 beats each)
    const chordDuration = 8 * BEAT;
    let padTime = 0.1;

    // Am7 (beats 1-8)
    schedulePadChord(ctx, masterGain, CHORD_PADS.Am7, padTime, chordDuration);
    padTime += chordDuration;
    // Cmaj7 (beats 9-16)
    schedulePadChord(ctx, masterGain, CHORD_PADS.Cmaj7, padTime, chordDuration);
    padTime += chordDuration;
    // Am7 (beats 17-24)
    schedulePadChord(ctx, masterGain, CHORD_PADS.Am7, padTime, chordDuration);
    padTime += chordDuration;
    // Cmaj7 (beats 25-32)
    schedulePadChord(ctx, masterGain, CHORD_PADS.Cmaj7, padTime, chordDuration);

    // Schedule melody notes
    for (const note of FULL_MELODY) {
      const startTime = 0.1 + (note.beat - 1) * BEAT;
      scheduleNote(ctx, masterGain, note.frequency, startTime, note.duration);
    }

    const buffer = await ctx.startRendering();
    cachedBuffer = buffer;
    isRendering = false;
    return buffer;
  })();

  return renderPromise;
}

export interface UseStickerbushAudioReturn {
  play: () => void;
  stop: () => void;
  isPlaying: boolean;
  isLoading: boolean;
  getFrequencyData: () => Uint8Array<ArrayBuffer>;
  getTimeDomainData: () => Uint8Array<ArrayBuffer>;
  getBeatIntensity: () => number;
  getCurrentSection: () => number;
}

/**
 * Hook for generating and playing the Stickerbrush Symphony melody
 */
export function useStickerbushAudio(): UseStickerbushAudioReturn {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const frequencyDataRef = useRef<Uint8Array<ArrayBuffer>>(new Uint8Array(64));
  const timeDomainDataRef = useRef<Uint8Array<ArrayBuffer>>(new Uint8Array(64));
  const beatIntensityRef = useRef<number>(0);
  const currentSectionRef = useRef<number>(0);
  const beatDecayIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sectionIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const playbackStartTimeRef = useRef<number>(0);

  /**
   * Start playing the melody
   */
  const play = useCallback(async () => {
    if (isPlaying || isLoading) return;

    setIsLoading(true);

    try {
      const buffer = await renderAudio();

      const ctx = new AudioContext({ latencyHint: 'playback' });
      audioContextRef.current = ctx;

      if (ctx.state === 'suspended') {
        await ctx.resume();
      }

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.93;
      analyserRef.current = analyser;

      frequencyDataRef.current = new Uint8Array(analyser.frequencyBinCount);
      timeDomainDataRef.current = new Uint8Array(analyser.frequencyBinCount);

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = false;
      sourceRef.current = source;

      source.connect(analyser);
      analyser.connect(ctx.destination);

      playbackStartTimeRef.current = ctx.currentTime;

      // Slower beat decay for ambient feel
      beatDecayIntervalRef.current = setInterval(() => {
        beatIntensityRef.current = Math.max(0, beatIntensityRef.current - 0.015);
      }, 16);

      // Track beat intensity and section based on playback position
      sectionIntervalRef.current = setInterval(() => {
        if (!audioContextRef.current) return;
        const elapsed = audioContextRef.current.currentTime - playbackStartTimeRef.current;
        const currentBeat = elapsed / BEAT;

        // Update section (0-3 for four 8-beat sections)
        const section = Math.min(3, Math.floor(currentBeat / 8));
        currentSectionRef.current = section;

        // Pulse beat intensity on note boundaries
        const beatFraction = currentBeat % 1;
        if (beatFraction < 0.1) {
          beatIntensityRef.current = 0.75;
        }
      }, 50);

      source.onended = () => {
        stop();
      };

      source.start(0);
      setIsPlaying(true);
    } finally {
      setIsLoading(false);
    }
  }, [isPlaying, isLoading]);

  /**
   * Stop playing
   */
  const stop = useCallback(() => {
    if (beatDecayIntervalRef.current) {
      clearInterval(beatDecayIntervalRef.current);
      beatDecayIntervalRef.current = null;
    }

    if (sectionIntervalRef.current) {
      clearInterval(sectionIntervalRef.current);
      sectionIntervalRef.current = null;
    }

    if (sourceRef.current) {
      try { sourceRef.current.stop(); } catch { /* Already stopped */ }
      sourceRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    analyserRef.current = null;
    beatIntensityRef.current = 0;
    currentSectionRef.current = 0;
    setIsPlaying(false);
  }, []);

  const getFrequencyData = useCallback((): Uint8Array<ArrayBuffer> => {
    if (analyserRef.current) {
      analyserRef.current.getByteFrequencyData(frequencyDataRef.current);
    }
    return frequencyDataRef.current;
  }, []);

  const getTimeDomainData = useCallback((): Uint8Array<ArrayBuffer> => {
    if (analyserRef.current) {
      analyserRef.current.getByteTimeDomainData(timeDomainDataRef.current);
    }
    return timeDomainDataRef.current;
  }, []);

  const getBeatIntensity = useCallback((): number => {
    return beatIntensityRef.current;
  }, []);

  const getCurrentSection = useCallback((): number => {
    return currentSectionRef.current;
  }, []);

  return {
    play,
    stop,
    isPlaying,
    isLoading,
    getFrequencyData,
    getTimeDomainData,
    getBeatIntensity,
    getCurrentSection,
  };
}
