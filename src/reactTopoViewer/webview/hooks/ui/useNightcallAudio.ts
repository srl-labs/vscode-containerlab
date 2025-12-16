/**
 * Nightcall Audio Hook
 *
 * Generates a smooth synthwave melody inspired by 80s retro vibes.
 * Dreamy arpeggios with lush pads at 91 BPM.
 *
 * High-quality synthesis with:
 * - Multiple oscillator layers per note
 * - LFO-modulated chorus effect
 * - Rich 3-tap reverb chain
 * - Warm analog-style filtering
 */

import { useCallback, useRef, useState } from 'react';

/**
 * Note frequencies in Hz
 * Based on the Am - G/B - F - Dm progression
 */
const NOTES = {
  // Bass notes
  E2: 82.41,
  A2: 110.0,
  B2: 123.47,
  C3: 130.81,
  D3: 146.83,
  E3: 164.81,
  F3: 174.61,
  G3: 196.0,
  A3: 220.0,
  B3: 246.94,
  C4: 261.63,
  D4: 293.66,
  E4: 329.63,
  F4: 349.23,
  G4: 392.0,
  A4: 440.0,
  REST: 0,
} as const;

/** 91 BPM = 659ms per beat, ~165ms per 16th note */
const SIXTEENTH = 0.165;

/**
 * Main arpeggio pattern (Am - G/B - F - Dm)
 * Each chord is arpeggiated over one bar
 */
const AM_ARPEGGIO = [
  NOTES.E3, NOTES.A3, NOTES.C4, NOTES.A3, NOTES.E3, NOTES.A3, NOTES.C4, NOTES.A3,
];

const GB_ARPEGGIO = [
  NOTES.D3, NOTES.G3, NOTES.B3, NOTES.G3, NOTES.D3, NOTES.G3, NOTES.B3, NOTES.G3,
];

const F_ARPEGGIO = [
  NOTES.C3, NOTES.F3, NOTES.A3, NOTES.F3, NOTES.C3, NOTES.F3, NOTES.A3, NOTES.F3,
];

const DM_ARPEGGIO = [
  NOTES.D3, NOTES.F3, NOTES.A3, NOTES.F3, NOTES.D3, NOTES.F3, NOTES.A3, NOTES.F3,
];

/** Chord root notes for pad */
const CHORD_ROOTS = {
  Am: [NOTES.A2, NOTES.E3, NOTES.A3, NOTES.C4],
  GB: [NOTES.B2, NOTES.D3, NOTES.G3, NOTES.B3],
  F: [NOTES.C3, NOTES.F3, NOTES.A3, NOTES.C4],
  Dm: [NOTES.D3, NOTES.F3, NOTES.A3, NOTES.D4],
};

/**
 * Build the full intro melody (4 bars repeated)
 */
function buildMelody(): Array<{ notes: number[]; chord: string }> {
  const pattern: Array<{ notes: number[]; chord: string }> = [];

  // Repeat the progression 4 times for a nice length
  for (let rep = 0; rep < 4; rep++) {
    // Am bar
    for (const note of AM_ARPEGGIO) {
      pattern.push({ notes: [note], chord: 'Am' });
    }
    // G/B bar
    for (const note of GB_ARPEGGIO) {
      pattern.push({ notes: [note], chord: 'GB' });
    }
    // F bar
    for (const note of F_ARPEGGIO) {
      pattern.push({ notes: [note], chord: 'F' });
    }
    // Dm bar
    for (const note of DM_ARPEGGIO) {
      pattern.push({ notes: [note], chord: 'Dm' });
    }
  }

  return pattern;
}

const FULL_MELODY = buildMelody();

export interface UseNightcallAudioReturn {
  play: () => void;
  stop: () => void;
  isPlaying: boolean;
  getFrequencyData: () => Uint8Array<ArrayBuffer>;
  getTimeDomainData: () => Uint8Array<ArrayBuffer>;
  getBeatIntensity: () => number;
  getCurrentChord: () => string;
}

/**
 * Hook for generating and playing the synthwave melody
 */
export function useNightcallAudio(): UseNightcallAudioReturn {
  const [isPlaying, setIsPlaying] = useState(false);

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const oscillatorsRef = useRef<OscillatorNode[]>([]);
  const frequencyDataRef = useRef<Uint8Array<ArrayBuffer>>(new Uint8Array(64));
  const timeDomainDataRef = useRef<Uint8Array<ArrayBuffer>>(new Uint8Array(64));
  const beatIntensityRef = useRef<number>(0);
  const currentChordRef = useRef<string>('Am');
  const beatDecayIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const padOscillatorsRef = useRef<OscillatorNode[]>([]);

  /**
   * Create a lush, evolving pad chord with multiple oscillator layers
   */
  const createPadChord = useCallback(
    (
      ctx: AudioContext,
      masterGain: GainNode,
      frequencies: number[],
      startTime: number,
      duration: number
    ): void => {
      for (const freq of frequencies) {
        // Layer 1: Main sine tone
        const osc1 = ctx.createOscillator();
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(freq, startTime);

        // Layer 2: Slight detune for width (synthwave sound)
        const osc2 = ctx.createOscillator();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(freq * 1.004, startTime);

        // Layer 3: Triangle for warmth
        const osc3 = ctx.createOscillator();
        osc3.type = 'triangle';
        osc3.frequency.setValueAtTime(freq * 0.5, startTime);

        // Very slow, gentle envelope
        const oscGain = ctx.createGain();
        oscGain.gain.setValueAtTime(0, startTime);
        oscGain.gain.linearRampToValueAtTime(0.015, startTime + 0.5);
        oscGain.gain.setValueAtTime(0.015, startTime + duration - 0.5);
        oscGain.gain.linearRampToValueAtTime(0, startTime + duration);

        osc1.connect(oscGain);
        osc2.connect(oscGain);
        osc3.connect(oscGain);
        oscGain.connect(masterGain);

        osc1.start(startTime);
        osc1.stop(startTime + duration + 0.2);
        osc2.start(startTime);
        osc2.stop(startTime + duration + 0.2);
        osc3.start(startTime);
        osc3.stop(startTime + duration + 0.2);

        padOscillatorsRef.current.push(osc1, osc2, osc3);
      }
    },
    []
  );

  /**
   * Schedule a rich arpeggio note with multiple oscillator layers
   */
  const scheduleNote = useCallback(
    (
      ctx: AudioContext,
      masterGain: GainNode,
      frequency: number,
      startTime: number,
      duration: number,
      chord: string
    ): OscillatorNode | null => {
      if (frequency === 0) return null;

      const noteMixer = ctx.createGain();
      noteMixer.connect(masterGain);

      // --- Layer 1: Pure fundamental (sine) ---
      const mainOsc = ctx.createOscillator();
      mainOsc.type = 'sine';
      mainOsc.frequency.setValueAtTime(frequency, startTime);

      const mainGain = ctx.createGain();
      mainGain.gain.setValueAtTime(0, startTime);
      mainGain.gain.linearRampToValueAtTime(0.11, startTime + 0.03);
      mainGain.gain.exponentialRampToValueAtTime(0.08, startTime + 0.12);
      mainGain.gain.setValueAtTime(0.08, startTime + duration * 0.5);
      mainGain.gain.exponentialRampToValueAtTime(0.001, startTime + duration + 0.4);

      mainOsc.connect(mainGain);
      mainGain.connect(noteMixer);

      // --- Layer 2: Sub bass for warmth (octave down) ---
      const subOsc = ctx.createOscillator();
      subOsc.type = 'sine';
      subOsc.frequency.setValueAtTime(frequency / 2, startTime);

      const subGain = ctx.createGain();
      subGain.gain.setValueAtTime(0, startTime);
      subGain.gain.linearRampToValueAtTime(0.03, startTime + 0.05);
      subGain.gain.setValueAtTime(0.03, startTime + duration * 0.6);
      subGain.gain.exponentialRampToValueAtTime(0.001, startTime + duration + 0.3);

      subOsc.connect(subGain);
      subGain.connect(noteMixer);

      // --- Layer 3: Triangle for body ---
      const bodyOsc = ctx.createOscillator();
      bodyOsc.type = 'triangle';
      bodyOsc.frequency.setValueAtTime(frequency, startTime);

      const bodyGain = ctx.createGain();
      bodyGain.gain.setValueAtTime(0, startTime);
      bodyGain.gain.linearRampToValueAtTime(0.025, startTime + 0.04);
      bodyGain.gain.exponentialRampToValueAtTime(0.015, startTime + 0.15);
      bodyGain.gain.setValueAtTime(0.015, startTime + duration * 0.4);
      bodyGain.gain.exponentialRampToValueAtTime(0.001, startTime + duration + 0.25);

      bodyOsc.connect(bodyGain);
      bodyGain.connect(noteMixer);

      // Schedule beat intensity update
      const delayMs = (startTime - ctx.currentTime) * 1000;
      if (delayMs > 0) {
        setTimeout(() => {
          beatIntensityRef.current = 0.8;
          currentChordRef.current = chord;
        }, delayMs);
      }

      const endTime = startTime + duration + 0.6;

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
    analyser.smoothingTimeConstant = 0.88;
    analyserRef.current = analyser;

    // Master gain - soft overall volume
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.30, ctx.currentTime);
    gainRef.current = masterGain;

    // Warm low-pass filter for analog synth sound
    const warmFilter = ctx.createBiquadFilter();
    warmFilter.type = 'lowpass';
    warmFilter.frequency.setValueAtTime(1800, ctx.currentTime);
    warmFilter.Q.setValueAtTime(0.4, ctx.currentTime);

    // High-pass to clean up
    const cleanFilter = ctx.createBiquadFilter();
    cleanFilter.type = 'highpass';
    cleanFilter.frequency.setValueAtTime(70, ctx.currentTime);

    // LFO-modulated chorus effect (like Aquatic Ambience)
    const chorusDelay = ctx.createDelay(0.1);
    chorusDelay.delayTime.setValueAtTime(0.022, ctx.currentTime);

    const chorusLFO = ctx.createOscillator();
    chorusLFO.type = 'sine';
    chorusLFO.frequency.setValueAtTime(0.4, ctx.currentTime);

    const chorusDepth = ctx.createGain();
    chorusDepth.gain.setValueAtTime(0.004, ctx.currentTime);

    chorusLFO.connect(chorusDepth);
    chorusDepth.connect(chorusDelay.delayTime);
    chorusLFO.start(ctx.currentTime);

    const chorusGain = ctx.createGain();
    chorusGain.gain.setValueAtTime(0.35, ctx.currentTime);

    // Rich 3-tap reverb chain
    const reverbDelay1 = ctx.createDelay(2.0);
    reverbDelay1.delayTime.setValueAtTime(0.2, ctx.currentTime);

    const reverbGain1 = ctx.createGain();
    reverbGain1.gain.setValueAtTime(0.28, ctx.currentTime);

    const reverbFilter = ctx.createBiquadFilter();
    reverbFilter.type = 'lowpass';
    reverbFilter.frequency.setValueAtTime(1100, ctx.currentTime);

    const reverbDelay2 = ctx.createDelay(2.0);
    reverbDelay2.delayTime.setValueAtTime(0.4, ctx.currentTime);

    const reverbGain2 = ctx.createGain();
    reverbGain2.gain.setValueAtTime(0.18, ctx.currentTime);

    const reverbDelay3 = ctx.createDelay(2.0);
    reverbDelay3.delayTime.setValueAtTime(0.7, ctx.currentTime);

    const reverbGain3 = ctx.createGain();
    reverbGain3.gain.setValueAtTime(0.10, ctx.currentTime);

    // Soft compressor
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-20, ctx.currentTime);
    compressor.knee.setValueAtTime(22, ctx.currentTime);
    compressor.ratio.setValueAtTime(2.5, ctx.currentTime);
    compressor.attack.setValueAtTime(0.02, ctx.currentTime);
    compressor.release.setValueAtTime(0.3, ctx.currentTime);

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

    compressor.connect(analyser);
    analyser.connect(ctx.destination);

    frequencyDataRef.current = new Uint8Array(analyser.frequencyBinCount);
    timeDomainDataRef.current = new Uint8Array(analyser.frequencyBinCount);

    // Beat decay
    beatDecayIntervalRef.current = setInterval(() => {
      beatIntensityRef.current = Math.max(0, beatIntensityRef.current - 0.06);
    }, 16);

    // Schedule pad chords (one per bar)
    let padTime = ctx.currentTime + 0.1;
    const barDuration = SIXTEENTH * 8;

    for (let rep = 0; rep < 4; rep++) {
      createPadChord(ctx, masterGain, CHORD_ROOTS.Am, padTime, barDuration);
      padTime += barDuration;
      createPadChord(ctx, masterGain, CHORD_ROOTS.GB, padTime, barDuration);
      padTime += barDuration;
      createPadChord(ctx, masterGain, CHORD_ROOTS.F, padTime, barDuration);
      padTime += barDuration;
      createPadChord(ctx, masterGain, CHORD_ROOTS.Dm, padTime, barDuration);
      padTime += barDuration;
    }

    // Schedule arpeggio notes
    let currentTime = ctx.currentTime + 0.1;

    for (const { notes, chord } of FULL_MELODY) {
      for (const note of notes) {
        const osc = scheduleNote(ctx, masterGain, note, currentTime, SIXTEENTH * 1.5, chord);
        if (osc) {
          oscillatorsRef.current.push(osc);
        }
      }
      currentTime += SIXTEENTH;
    }

    setIsPlaying(true);

    // Auto-stop when done
    const totalDuration = (currentTime - ctx.currentTime) * 1000 + 2000;
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
    currentChordRef.current = 'Am';
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

  const getCurrentChord = useCallback((): string => {
    return currentChordRef.current;
  }, []);

  return {
    play,
    stop,
    isPlaying,
    getFrequencyData,
    getTimeDomainData,
    getBeatIntensity,
    getCurrentChord,
  };
}
