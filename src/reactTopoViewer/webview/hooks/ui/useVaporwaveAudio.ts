/**
 * Vaporwave Audio Hook
 *
 * Generates that classic vaporwave aesthetic sound.
 * Slowed down, dreamy smooth jazz vibes with heavy reverb.
 *
 * High-quality synthesis with:
 * - Multiple oscillator layers per note
 * - LFO-modulated chorus effect
 * - Extra long reverb tail
 * - Warm low-pass filtering for that "slowed" feel
 *
 * Key: F major (smooth jazz feel)
 * Tempo: ~70 BPM (slow and dreamy)
 */

import { useCallback, useRef, useState } from 'react';

/**
 * Note frequencies in Hz - F major pentatonic + jazz extensions
 */
const NOTES = {
  // Bass notes
  F2: 87.31,
  G2: 98.0,
  A2: 110.0,
  C3: 130.81,
  // Mid range
  F3: 174.61,
  G3: 196.0,
  A3: 220.0,
  Bb3: 233.08,
  C4: 261.63,
  D4: 293.66,
  E4: 329.63,
  F4: 349.23,
  G4: 392.0,
  A4: 440.0,
  Bb4: 466.16,
  C5: 523.25,
  D5: 587.33,
  E5: 659.25,
  F5: 698.46,
} as const;

/** ~70 BPM for that slowed down vaporwave feel */
const BEAT = 0.857; // seconds per beat

/** Melody note interface */
interface MelodyNote {
  frequency: number;
  beat: number;
  duration: number;
}

/**
 * Build the vaporwave melody - smooth pentatonic lines
 * F major pentatonic: F, G, A, C, D
 */
function buildMelody(): MelodyNote[] {
  const rawNotes = [
    // Phrase 1 - ascending dream
    { freq: NOTES.F4, beat: 1, duration: 1.5 },
    { freq: NOTES.A4, beat: 2.5, duration: 1 },
    { freq: NOTES.C5, beat: 4, duration: 2 },
    { freq: NOTES.D5, beat: 6.5, duration: 1.5 },
    { freq: NOTES.C5, beat: 8, duration: 1 },
    // Phrase 2 - gentle descent
    { freq: NOTES.A4, beat: 9.5, duration: 1.5 },
    { freq: NOTES.G4, beat: 11, duration: 1 },
    { freq: NOTES.F4, beat: 12.5, duration: 2 },
    { freq: NOTES.D4, beat: 15, duration: 1 },
    // Phrase 3 - smooth motion
    { freq: NOTES.F4, beat: 17, duration: 1 },
    { freq: NOTES.G4, beat: 18.5, duration: 1 },
    { freq: NOTES.A4, beat: 20, duration: 1.5 },
    { freq: NOTES.C5, beat: 22, duration: 2 },
    { freq: NOTES.A4, beat: 24.5, duration: 1.5 },
    // Phrase 4 - resolution
    { freq: NOTES.G4, beat: 26.5, duration: 1 },
    { freq: NOTES.F4, beat: 28, duration: 2 },
    { freq: NOTES.C4, beat: 30.5, duration: 1.5 },
    { freq: NOTES.F4, beat: 32, duration: 2 },
  ];

  return rawNotes.map(note => ({
    frequency: note.freq,
    beat: note.beat,
    duration: note.duration,
  }));
}

const FULL_MELODY = buildMelody();

/** Smooth jazz chord voicings - Fmaj9, Dm9, Bbmaj7, C9 */
const CHORD_PADS = {
  // Fmaj9 (F, A, C, E, G) - beats 1-8
  Fmaj9: [NOTES.F3, NOTES.A3, NOTES.C4, NOTES.E4, NOTES.G4],
  // Dm9 (D, F, A, C, E) - beats 9-16
  Dm9: [NOTES.D4, NOTES.F4, NOTES.A4, NOTES.C5, NOTES.E5],
  // Bbmaj7 (Bb, D, F, A) - beats 17-24
  Bbmaj7: [NOTES.Bb3, NOTES.D4, NOTES.F4, NOTES.A4],
  // C9 (C, E, G, Bb, D) - beats 25-32
  C9: [NOTES.C4, NOTES.E4, NOTES.G4, NOTES.Bb4, NOTES.D5],
};

/** Sections for visual sync */
type VaporwaveSection = 'fmaj9' | 'dm9' | 'bbmaj7' | 'c9';

export interface UseVaporwaveAudioReturn {
  play: () => void;
  stop: () => void;
  isPlaying: boolean;
  getFrequencyData: () => Uint8Array<ArrayBuffer>;
  getTimeDomainData: () => Uint8Array<ArrayBuffer>;
  getCurrentSection: () => VaporwaveSection;
}

/**
 * Vaporwave audio synthesis hook
 */
export function useVaporwaveAudio(): UseVaporwaveAudioReturn {
  const [isPlaying, setIsPlaying] = useState(false);

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const scheduledNodesRef = useRef<AudioScheduledSourceNode[]>([]);
  const startTimeRef = useRef(0);
  const loopIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Empty frequency data for when not playing
  const emptyFrequencyData = useRef(new Uint8Array(128));
  const emptyTimeDomainData = useRef(new Uint8Array(128));

  /**
   * Get current section based on playback time
   */
  const getCurrentSection = useCallback((): VaporwaveSection => {
    if (!audioContextRef.current || !isPlaying) return 'fmaj9';

    const elapsed = audioContextRef.current.currentTime - startTimeRef.current;
    const loopDuration = 32 * BEAT;
    const positionInLoop = elapsed % loopDuration;
    const currentBeat = positionInLoop / BEAT;

    if (currentBeat < 8) return 'fmaj9';
    if (currentBeat < 16) return 'dm9';
    if (currentBeat < 24) return 'bbmaj7';
    return 'c9';
  }, [isPlaying]);

  /**
   * Create high-quality note with multiple oscillator layers
   */
  const createNote = useCallback((
    ctx: AudioContext,
    frequency: number,
    startTime: number,
    duration: number,
    destination: AudioNode,
    volume: number = 0.15
  ) => {
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

    scheduledNodesRef.current.push(mainOsc, subOsc, bodyOsc, lfo);
  }, []);

  /**
   * Create pad chord with extra reverb
   */
  const createPadChord = useCallback((
    ctx: AudioContext,
    frequencies: number[],
    startTime: number,
    duration: number,
    destination: AudioNode
  ) => {
    frequencies.forEach((freq, i) => {
      // Stagger entries slightly for lush effect
      const stagger = i * 0.08;
      createNote(ctx, freq, startTime + stagger, duration, destination, 0.04);
    });
  }, [createNote]);

  /**
   * Schedule a full loop of the melody
   */
  const scheduleLoop = useCallback((ctx: AudioContext, startTime: number, destination: AudioNode) => {
    const loopDuration = 32 * BEAT;

    // Schedule melody notes
    FULL_MELODY.forEach(note => {
      const noteStart = startTime + (note.beat - 1) * BEAT;
      createNote(ctx, note.frequency, noteStart, note.duration * BEAT, destination, 0.18);
    });

    // Schedule chord pads
    createPadChord(ctx, CHORD_PADS.Fmaj9, startTime, 8 * BEAT, destination);
    createPadChord(ctx, CHORD_PADS.Dm9, startTime + 8 * BEAT, 8 * BEAT, destination);
    createPadChord(ctx, CHORD_PADS.Bbmaj7, startTime + 16 * BEAT, 8 * BEAT, destination);
    createPadChord(ctx, CHORD_PADS.C9, startTime + 24 * BEAT, 8 * BEAT, destination);

    return loopDuration;
  }, [createNote, createPadChord]);

  /**
   * Start playback
   */
  const play = useCallback(() => {
    if (isPlaying) return;

    const ctx = new AudioContext();
    audioContextRef.current = ctx;

    // Create analyser for visualization
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyserRef.current = analyser;

    // Master gain
    const masterGain = ctx.createGain();
    masterGain.gain.value = 0.7;
    masterGainRef.current = masterGain;

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
    chorusLfo.frequency.value = 0.3; // Slow chorus for vaporwave
    const chorusDepth = ctx.createGain();
    chorusDepth.gain.value = 0.004;
    chorusLfo.connect(chorusDepth);
    chorusDepth.connect(chorusDelay.delayTime);
    chorusLfo.start();
    scheduledNodesRef.current.push(chorusLfo);

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

    // Connect audio graph
    masterGain.connect(compressor);

    // Dry path
    compressor.connect(analyser);

    // Chorus path
    compressor.connect(chorusDelay);
    chorusDelay.connect(chorusGain);
    chorusGain.connect(analyser);

    // Reverb chain (parallel)
    compressor.connect(reverb1);
    reverb1.connect(reverb1Gain);
    reverb1Gain.connect(analyser);
    reverb1Gain.connect(reverb2);

    reverb2.connect(reverb2Gain);
    reverb2Gain.connect(analyser);
    reverb2Gain.connect(reverb3);

    reverb3.connect(reverb3Gain);
    reverb3Gain.connect(analyser);
    reverb3Gain.connect(reverb4);

    reverb4.connect(reverb4Gain);
    reverb4Gain.connect(analyser);

    analyser.connect(ctx.destination);

    // Schedule first loop
    startTimeRef.current = ctx.currentTime + 0.1;
    const loopDuration = scheduleLoop(ctx, startTimeRef.current, masterGain);

    // Schedule subsequent loops
    let nextLoopTime = startTimeRef.current + loopDuration;
    loopIntervalRef.current = setInterval(() => {
      if (audioContextRef.current && isPlaying) {
        const currentTime = audioContextRef.current.currentTime;
        // Schedule next loop before current one ends
        if (currentTime > nextLoopTime - 2) {
          scheduleLoop(audioContextRef.current, nextLoopTime, masterGain);
          nextLoopTime += loopDuration;
        }
      }
    }, 1000);

    setIsPlaying(true);
  }, [isPlaying, scheduleLoop]);

  /**
   * Stop playback
   */
  const stop = useCallback(() => {
    if (loopIntervalRef.current) {
      clearInterval(loopIntervalRef.current);
      loopIntervalRef.current = null;
    }

    scheduledNodesRef.current.forEach(node => {
      try {
        node.stop();
      } catch {
        // Node may already be stopped
      }
    });
    scheduledNodesRef.current = [];

    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    analyserRef.current = null;
    masterGainRef.current = null;
    setIsPlaying(false);
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
    getFrequencyData,
    getTimeDomainData,
    getCurrentSection,
  };
}
