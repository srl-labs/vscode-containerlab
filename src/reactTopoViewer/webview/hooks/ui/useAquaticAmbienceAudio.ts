/**
 * Aquatic Ambience Audio Hook
 *
 * Generates the iconic underwater melody from Donkey Kong Country.
 * Composed by David Wise - ethereal, dreamy aquatic atmosphere.
 *
 * Key: C minor
 * Chords: Cm(add9) - Abm(add9) - Cm(add9) - Abm(add9) - Fmaj7 - Bdim(add9)
 */

import { useCallback, useRef, useState } from 'react';

/**
 * Note frequencies in Hz - C minor scale
 * Scale degrees: 1=C, 2=D, 3=Eb, 4=F, 5=G, 6=Ab, 7=Bb
 */
const NOTES = {
  // Octave 3 (low)
  C3: 130.81,
  D3: 146.83,
  Eb3: 155.56,
  F3: 174.61,
  G3: 196.0,
  Ab3: 207.65,
  Bb3: 233.08,
  // Octave 4 (middle)
  C4: 261.63,
  D4: 293.66,
  Eb4: 311.13,
  F4: 349.23,
  G4: 392.0,
  Ab4: 415.30,
  Bb4: 466.16,
  // Octave 5
  C5: 523.25,
  D5: 587.33,
  Eb5: 622.25,
  F5: 698.46,
  G5: 783.99,
  Ab5: 830.61,
  Bb5: 932.33,
  // Octave 6
  C6: 1046.50,
  D6: 1174.66,
  Eb6: 1244.51,
  Bb6: 1864.66,
  REST: 0,
} as const;

/** Tempo: ~65 BPM for dreamy ambient feel */
const BEAT = 0.923; // Duration of one beat in seconds

/**
 * Convert scale degree and octave to frequency
 */
function getFrequency(sd: string, octave: number): number {
  const sdNum = parseInt(sd, 10);
  const baseOctave = 4; // octave 0 = C4
  const actualOctave = baseOctave + octave;

  const scaleMap: Record<number, Record<number, number>> = {
    3: { 1: NOTES.C3, 2: NOTES.D3, 3: NOTES.Eb3, 4: NOTES.F3, 5: NOTES.G3, 6: NOTES.Ab3, 7: NOTES.Bb3 },
    4: { 1: NOTES.C4, 2: NOTES.D4, 3: NOTES.Eb4, 4: NOTES.F4, 5: NOTES.G4, 6: NOTES.Ab4, 7: NOTES.Bb4 },
    5: { 1: NOTES.C5, 2: NOTES.D5, 3: NOTES.Eb5, 4: NOTES.F5, 5: NOTES.G5, 6: NOTES.Ab5, 7: NOTES.Bb5 },
    6: { 1: NOTES.C6, 2: NOTES.D6, 3: NOTES.Eb6, 7: NOTES.Bb6 },
  };

  const octaveNotes = scaleMap[actualOctave];
  if (!octaveNotes) return NOTES.C4;
  return octaveNotes[sdNum] || NOTES.C4;
}

/** Melody from JSON data */
interface MelodyNote {
  frequency: number;
  beat: number;
  duration: number;
  isRest: boolean;
}

/**
 * Build the Aquatic Ambience melody from the provided note data
 */
function buildMelody(): MelodyNote[] {
  const rawNotes = [
    { sd: "1", octave: 0, beat: 1, duration: 1, isRest: true },
    { sd: "2", octave: 1, beat: 2, duration: 0.5, isRest: false },
    { sd: "1", octave: 1, beat: 2.5, duration: 0.25, isRest: false },
    { sd: "5", octave: 0, beat: 2.75, duration: 2.25, isRest: false },
    { sd: "1", octave: 0, beat: 5, duration: 0.5, isRest: true },
    { sd: "2", octave: 1, beat: 5.5, duration: 0.25, isRest: false },
    { sd: "1", octave: 1, beat: 5.75, duration: 0.25, isRest: false },
    { sd: "2", octave: 1, beat: 6, duration: 0.5, isRest: false },
    { sd: "3", octave: 1, beat: 6.5, duration: 0.25, isRest: false },
    { sd: "4", octave: 1, beat: 6.75, duration: 0.75, isRest: false },
    { sd: "3", octave: 1, beat: 7.5, duration: 0.25, isRest: false },
    { sd: "2", octave: 1, beat: 7.75, duration: 0.75, isRest: false },
    { sd: "7", octave: 0, beat: 8.5, duration: 1.5, isRest: false },
    { sd: "7", octave: 0, beat: 10, duration: 0.5, isRest: false },
    { sd: "1", octave: 1, beat: 10.5, duration: 0.25, isRest: false },
    { sd: "3", octave: 0, beat: 10.75, duration: 2.25, isRest: false },
    { sd: "1", octave: 0, beat: 13, duration: 1, isRest: true },
    { sd: "7", octave: 0, beat: 14, duration: 0.5, isRest: false },
    { sd: "1", octave: 1, beat: 14.5, duration: 0.25, isRest: false },
    { sd: "3", octave: 0, beat: 14.75, duration: 2.25, isRest: false },
    { sd: "1", octave: 0, beat: 17, duration: 1, isRest: true },
    { sd: "2", octave: 1, beat: 18, duration: 0.5, isRest: false },
    { sd: "1", octave: 1, beat: 18.5, duration: 0.25, isRest: false },
    { sd: "5", octave: 0, beat: 18.75, duration: 2.25, isRest: false },
    { sd: "1", octave: 0, beat: 21, duration: 0.5, isRest: true },
    { sd: "2", octave: 1, beat: 21.5, duration: 0.25, isRest: false },
    { sd: "1", octave: 1, beat: 21.75, duration: 0.25, isRest: false },
    { sd: "2", octave: 1, beat: 22, duration: 0.5, isRest: false },
    { sd: "3", octave: 1, beat: 22.5, duration: 0.25, isRest: false },
    { sd: "4", octave: 1, beat: 22.75, duration: 0.75, isRest: false },
    { sd: "5", octave: 1, beat: 23.5, duration: 0.25, isRest: false },
    { sd: "7", octave: 1, beat: 23.75, duration: 0.75, isRest: false },
    { sd: "1", octave: 2, beat: 24.5, duration: 0.5, isRest: false },
    { sd: "3", octave: 1, beat: 25, duration: 1, isRest: false },
    { sd: "7", octave: 0, beat: 26, duration: 0.5, isRest: false },
    { sd: "1", octave: 1, beat: 26.5, duration: 0.25, isRest: false },
    { sd: "3", octave: 0, beat: 26.75, duration: 1.25, isRest: false },
    { sd: "7", octave: 1, beat: 28, duration: 0.5, isRest: false },
    { sd: "1", octave: 2, beat: 28.5, duration: 0.25, isRest: false },
    { sd: "3", octave: 1, beat: 28.75, duration: 1.25, isRest: false },
    { sd: "7", octave: 0, beat: 30, duration: 0.5, isRest: false },
    { sd: "1", octave: 1, beat: 30.5, duration: 0.25, isRest: false },
    { sd: "3", octave: 0, beat: 30.75, duration: 2.25, isRest: false },
    { sd: "1", octave: 0, beat: 33, duration: 0.5, isRest: true },
    { sd: "6", octave: 1, beat: 33.5, duration: 0.25, isRest: false },
    { sd: "5", octave: 1, beat: 33.75, duration: 0.25, isRest: false },
    { sd: "6", octave: 1, beat: 34, duration: 0.5, isRest: false },
    { sd: "5", octave: 1, beat: 34.5, duration: 0.25, isRest: false },
    { sd: "6", octave: 1, beat: 34.75, duration: 0.75, isRest: false },
    { sd: "5", octave: 1, beat: 35.5, duration: 0.25, isRest: false },
    { sd: "1", octave: 1, beat: 35.75, duration: 1.25, isRest: false },
    { sd: "1", octave: 0, beat: 37, duration: 0.5, isRest: true },
    { sd: "6", octave: 1, beat: 37.5, duration: 0.25, isRest: false },
    { sd: "5", octave: 1, beat: 37.75, duration: 0.25, isRest: false },
    { sd: "6", octave: 1, beat: 38, duration: 0.5, isRest: false },
    { sd: "5", octave: 1, beat: 38.5, duration: 0.25, isRest: false },
    { sd: "7", octave: 1, beat: 38.75, duration: 0.75, isRest: false },
    { sd: "6", octave: 1, beat: 39.5, duration: 0.25, isRest: false },
    { sd: "5", octave: 1, beat: 39.75, duration: 0.75, isRest: false },
    { sd: "4", octave: 1, beat: 40.5, duration: 0.5, isRest: false },
    // Arpeggio section
    { sd: "7", octave: 2, beat: 41, duration: 0.25, isRest: false },
    { sd: "7", octave: 1, beat: 41.25, duration: 0.25, isRest: false },
    { sd: "7", octave: 1, beat: 41.5, duration: 0.25, isRest: false },
    { sd: "7", octave: 2, beat: 41.75, duration: 0.25, isRest: false },
    { sd: "7", octave: 2, beat: 42, duration: 0.25, isRest: false },
    { sd: "7", octave: 1, beat: 42.25, duration: 0.25, isRest: false },
    { sd: "7", octave: 1, beat: 42.5, duration: 0.25, isRest: false },
    { sd: "7", octave: 2, beat: 42.75, duration: 0.25, isRest: false },
    { sd: "7", octave: 2, beat: 43, duration: 0.25, isRest: false },
    { sd: "7", octave: 1, beat: 43.25, duration: 0.25, isRest: false },
    { sd: "7", octave: 1, beat: 43.5, duration: 0.25, isRest: false },
    { sd: "7", octave: 2, beat: 43.75, duration: 0.25, isRest: false },
    { sd: "1", octave: 0, beat: 44, duration: 1, isRest: true },
    { sd: "7", octave: 2, beat: 45, duration: 0.25, isRest: false },
    { sd: "7", octave: 1, beat: 45.25, duration: 0.25, isRest: false },
    { sd: "7", octave: 1, beat: 45.5, duration: 0.25, isRest: false },
    { sd: "7", octave: 2, beat: 45.75, duration: 0.25, isRest: false },
    { sd: "7", octave: 2, beat: 46, duration: 0.25, isRest: false },
    { sd: "7", octave: 1, beat: 46.25, duration: 0.25, isRest: false },
    { sd: "7", octave: 1, beat: 46.5, duration: 0.25, isRest: false },
    { sd: "7", octave: 2, beat: 46.75, duration: 0.25, isRest: false },
    { sd: "7", octave: 2, beat: 47, duration: 0.25, isRest: false },
    { sd: "7", octave: 1, beat: 47.25, duration: 0.25, isRest: false },
    { sd: "7", octave: 1, beat: 47.5, duration: 0.25, isRest: false },
    { sd: "7", octave: 2, beat: 47.75, duration: 0.25, isRest: false },
  ];

  return rawNotes.map(note => ({
    frequency: note.isRest ? 0 : getFrequency(note.sd, note.octave),
    beat: note.beat,
    duration: note.duration,
    isRest: note.isRest,
  }));
}

const FULL_MELODY = buildMelody();

/** Chord progressions for pads */
const CHORD_PADS = {
  Cm_add9: [NOTES.C3, NOTES.Eb3, NOTES.G3, NOTES.D4],      // Cm(add9)
  Abm_add9: [NOTES.Ab3, NOTES.C4, NOTES.Eb4, NOTES.Bb4],   // Abm(add9) - using C minor context
  Fmaj7: [NOTES.F3, NOTES.Ab3, NOTES.C4, NOTES.Eb4],       // Fmaj7
  Bdim_add9: [NOTES.Bb3, NOTES.D4, NOTES.F4, NOTES.C5],    // Bdim(add9)
};

export interface UseAquaticAmbienceAudioReturn {
  play: () => void;
  stop: () => void;
  isPlaying: boolean;
  getFrequencyData: () => Uint8Array<ArrayBuffer>;
  getTimeDomainData: () => Uint8Array<ArrayBuffer>;
  getBeatIntensity: () => number;
  getCurrentSection: () => number;
}

/**
 * Hook for generating and playing the Aquatic Ambience melody
 */
export function useAquaticAmbienceAudio(): UseAquaticAmbienceAudioReturn {
  const [isPlaying, setIsPlaying] = useState(false);

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const oscillatorsRef = useRef<OscillatorNode[]>([]);
  const frequencyDataRef = useRef<Uint8Array<ArrayBuffer>>(new Uint8Array(64));
  const timeDomainDataRef = useRef<Uint8Array<ArrayBuffer>>(new Uint8Array(64));
  const beatIntensityRef = useRef<number>(0);
  const currentSectionRef = useRef<number>(0);
  const beatDecayIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const padOscillatorsRef = useRef<OscillatorNode[]>([]);

  /**
   * Create a lush, evolving pad chord
   */
  const createPadChord = useCallback(
    (
      ctx: AudioContext,
      masterGain: GainNode,
      frequencies: number[],
      startTime: number,
      duration: number,
      section: number
    ): void => {
      for (const freq of frequencies) {
        // Layer 1: Main sine tone
        const osc1 = ctx.createOscillator();
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(freq, startTime);

        // Layer 2: Slight detune for width
        const osc2 = ctx.createOscillator();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(freq * 1.003, startTime);

        // Layer 3: Triangle for warmth
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

        padOscillatorsRef.current.push(osc1, osc2, osc3);
      }

      // Update section
      const delayMs = (startTime - ctx.currentTime) * 1000;
      if (delayMs > 0) {
        setTimeout(() => {
          currentSectionRef.current = section;
        }, delayMs);
      }
    },
    []
  );

  /**
   * Schedule a crystalline, bell-like melody note with rich harmonics
   */
  const scheduleNote = useCallback(
    (
      ctx: AudioContext,
      masterGain: GainNode,
      frequency: number,
      startTime: number,
      duration: number
    ): OscillatorNode | null => {
      if (frequency === 0) return null;

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
      mainGain.gain.exponentialRampToValueAtTime(0.07, startTime + 0.15);
      mainGain.gain.setValueAtTime(0.07, startTime + noteDuration * 0.4);
      mainGain.gain.exponentialRampToValueAtTime(0.001, startTime + noteDuration + 1.2);

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
      subGain.gain.exponentialRampToValueAtTime(0.001, startTime + noteDuration + 0.8);

      subOsc.connect(subGain);
      subGain.connect(noteMixer);

      // --- Layer 3: Soft triangle for body ---
      const bodyOsc = ctx.createOscillator();
      bodyOsc.type = 'triangle';
      bodyOsc.frequency.setValueAtTime(frequency, startTime);

      const bodyGain = ctx.createGain();
      bodyGain.gain.setValueAtTime(0, startTime);
      bodyGain.gain.linearRampToValueAtTime(0.03, startTime + 0.06);
      bodyGain.gain.exponentialRampToValueAtTime(0.015, startTime + 0.2);
      bodyGain.gain.setValueAtTime(0.015, startTime + noteDuration * 0.3);
      bodyGain.gain.exponentialRampToValueAtTime(0.001, startTime + noteDuration + 0.6);

      bodyOsc.connect(bodyGain);
      bodyGain.connect(noteMixer);

      // Schedule beat intensity update
      const delayMs = (startTime - ctx.currentTime) * 1000;
      if (delayMs > 0) {
        setTimeout(() => {
          beatIntensityRef.current = 0.7;
        }, delayMs);
      }

      const endTime = startTime + noteDuration + 1.5;

      mainOsc.start(startTime);
      mainOsc.stop(endTime);

      subOsc.start(startTime);
      subOsc.stop(endTime);

      bodyOsc.start(startTime);
      bodyOsc.stop(endTime);

      return mainOsc;
    },
    []
  );

  /**
   * Start playing the melody
   */
  const play = useCallback(() => {
    if (isPlaying) return;

    const ctx = new AudioContext();
    audioContextRef.current = ctx;

    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.93;
    analyserRef.current = analyser;

    // Master gain - soft overall volume
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.32, ctx.currentTime);
    gainRef.current = masterGain;

    // Warm low-pass filter for underwater sound
    const underwaterFilter = ctx.createBiquadFilter();
    underwaterFilter.type = 'lowpass';
    underwaterFilter.frequency.setValueAtTime(1600, ctx.currentTime);
    underwaterFilter.Q.setValueAtTime(0.4, ctx.currentTime);

    // High-pass to remove rumble
    const cleanFilter = ctx.createBiquadFilter();
    cleanFilter.type = 'highpass';
    cleanFilter.frequency.setValueAtTime(60, ctx.currentTime);

    // Chorus effect via modulated delay
    const chorusDelay = ctx.createDelay(0.1);
    chorusDelay.delayTime.setValueAtTime(0.02, ctx.currentTime);

    const chorusLFO = ctx.createOscillator();
    chorusLFO.type = 'sine';
    chorusLFO.frequency.setValueAtTime(0.3, ctx.currentTime);

    const chorusDepth = ctx.createGain();
    chorusDepth.gain.setValueAtTime(0.003, ctx.currentTime);

    chorusLFO.connect(chorusDepth);
    chorusDepth.connect(chorusDelay.delayTime);
    chorusLFO.start(ctx.currentTime);

    const chorusGain = ctx.createGain();
    chorusGain.gain.setValueAtTime(0.4, ctx.currentTime);

    // Rich, long reverb
    const reverbDelay1 = ctx.createDelay(2.0);
    reverbDelay1.delayTime.setValueAtTime(0.35, ctx.currentTime);

    const reverbGain1 = ctx.createGain();
    reverbGain1.gain.setValueAtTime(0.3, ctx.currentTime);

    const reverbFilter = ctx.createBiquadFilter();
    reverbFilter.type = 'lowpass';
    reverbFilter.frequency.setValueAtTime(1000, ctx.currentTime);

    const reverbDelay2 = ctx.createDelay(2.0);
    reverbDelay2.delayTime.setValueAtTime(0.7, ctx.currentTime);

    const reverbGain2 = ctx.createGain();
    reverbGain2.gain.setValueAtTime(0.2, ctx.currentTime);

    const reverbDelay3 = ctx.createDelay(2.0);
    reverbDelay3.delayTime.setValueAtTime(1.1, ctx.currentTime);

    const reverbGain3 = ctx.createGain();
    reverbGain3.gain.setValueAtTime(0.12, ctx.currentTime);

    // Soft compressor
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-22, ctx.currentTime);
    compressor.knee.setValueAtTime(25, ctx.currentTime);
    compressor.ratio.setValueAtTime(2.5, ctx.currentTime);
    compressor.attack.setValueAtTime(0.04, ctx.currentTime);
    compressor.release.setValueAtTime(0.5, ctx.currentTime);

    // Connect main chain
    masterGain.connect(cleanFilter);
    cleanFilter.connect(underwaterFilter);
    underwaterFilter.connect(compressor);

    // Chorus
    underwaterFilter.connect(chorusDelay);
    chorusDelay.connect(chorusGain);
    chorusGain.connect(compressor);

    // Reverb chain
    underwaterFilter.connect(reverbDelay1);
    reverbDelay1.connect(reverbFilter);
    reverbFilter.connect(reverbGain1);
    reverbGain1.connect(compressor);

    reverbFilter.connect(reverbDelay2);
    reverbDelay2.connect(reverbGain2);
    reverbGain2.connect(compressor);

    reverbDelay2.connect(reverbDelay3);
    reverbDelay3.connect(reverbGain3);
    reverbGain3.connect(compressor);

    compressor.connect(analyser);
    analyser.connect(ctx.destination);

    frequencyDataRef.current = new Uint8Array(analyser.frequencyBinCount);
    timeDomainDataRef.current = new Uint8Array(analyser.frequencyBinCount);

    // Very slow beat decay for ambient feel
    beatDecayIntervalRef.current = setInterval(() => {
      beatIntensityRef.current = Math.max(0, beatIntensityRef.current - 0.015);
    }, 16);

    // Schedule pad chords (8 beats each)
    const padDuration = 8 * BEAT;
    let padTime = ctx.currentTime + 0.1;

    createPadChord(ctx, masterGain, CHORD_PADS.Cm_add9, padTime, padDuration, 0);
    padTime += padDuration;
    createPadChord(ctx, masterGain, CHORD_PADS.Abm_add9, padTime, padDuration, 1);
    padTime += padDuration;
    createPadChord(ctx, masterGain, CHORD_PADS.Cm_add9, padTime, padDuration, 2);
    padTime += padDuration;
    createPadChord(ctx, masterGain, CHORD_PADS.Abm_add9, padTime, padDuration, 3);
    padTime += padDuration;
    createPadChord(ctx, masterGain, CHORD_PADS.Fmaj7, padTime, padDuration, 4);
    padTime += padDuration;
    createPadChord(ctx, masterGain, CHORD_PADS.Bdim_add9, padTime, padDuration, 5);

    // Schedule melody notes
    for (const note of FULL_MELODY) {
      if (!note.isRest) {
        const startTime = ctx.currentTime + 0.1 + (note.beat - 1) * BEAT;
        const osc = scheduleNote(ctx, masterGain, note.frequency, startTime, note.duration);
        if (osc) {
          oscillatorsRef.current.push(osc);
        }
      }
    }

    setIsPlaying(true);

    // Auto-stop when done (48 beats + tail)
    const totalDuration = 48 * BEAT * 1000 + 4000;
    setTimeout(() => {
      stop();
    }, totalDuration);
  }, [isPlaying, scheduleNote, createPadChord]);

  /**
   * Stop playing
   */
  const stop = useCallback(() => {
    if (beatDecayIntervalRef.current) {
      clearInterval(beatDecayIntervalRef.current);
      beatDecayIntervalRef.current = null;
    }

    for (const osc of oscillatorsRef.current) {
      try { osc.stop(); } catch { /* Already stopped */ }
    }
    oscillatorsRef.current = [];

    for (const osc of padOscillatorsRef.current) {
      try { osc.stop(); } catch { /* Already stopped */ }
    }
    padOscillatorsRef.current = [];

    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    analyserRef.current = null;
    gainRef.current = null;
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
    getFrequencyData,
    getTimeDomainData,
    getBeatIntensity,
    getCurrentSection,
  };
}
