/**
 * Nightcall Audio Hook
 *
 * Generates the iconic Nightcall by Kavinsky melody with arpeggio accompaniment.
 * Classic synthwave with the Am - G/B - F - Dm progression.
 *
 * Uses pre-rendered audio for smooth playback on slow hardware.
 *
 * Key: A minor
 * Tempo: ~91 BPM
 */

import { useCallback, useRef, useState } from 'react';

/**
 * A minor scale frequencies
 * A minor: A, B, C, D, E, F, G
 */
const A_MINOR_SCALE: Record<number, number[]> = {
  [-2]: [55.0, 61.74, 65.41, 73.42, 82.41, 87.31, 98.0],
  [-1]: [110.0, 123.47, 130.81, 146.83, 164.81, 174.61, 196.0],
  [0]: [220.0, 246.94, 261.63, 293.66, 329.63, 349.23, 392.0],
  [1]: [440.0, 493.88, 523.25, 587.33, 659.25, 698.46, 783.99],
};

function getAMinorFrequency(sd: number, octave: number): number {
  const scaleIndex = sd - 1;
  const frequencies = A_MINOR_SCALE[octave];
  if (!frequencies || scaleIndex < 0 || scaleIndex >= 7) {
    return A_MINOR_SCALE[0][Math.max(0, Math.min(6, scaleIndex))];
  }
  return frequencies[scaleIndex];
}

const BEAT = 0.659;
const SIXTEENTH = BEAT / 4;
const LOOP_DURATION = 32 * BEAT;
const SAMPLE_RATE = 44100;

interface MelodyNote {
  frequency: number;
  beat: number;
  duration: number;
}

function buildMelody(): MelodyNote[] {
  const rawNotes = [
    { sd: 1, octave: 0, beat: 1, duration: 3.5 },
    { sd: 2, octave: 0, beat: 4.5, duration: 3.5 },
    { sd: 7, octave: -1, beat: 8, duration: 0.5 },
    { sd: 6, octave: -1, beat: 8.5, duration: 3.5 },
    { sd: 5, octave: -1, beat: 12, duration: 0.5 },
    { sd: 4, octave: -1, beat: 12.5, duration: 3.5 },
    { sd: 3, octave: -1, beat: 16, duration: 0.5 },
    { sd: 1, octave: 0, beat: 16.5, duration: 4 },
    { sd: 2, octave: 0, beat: 20.5, duration: 3.5 },
    { sd: 7, octave: -1, beat: 24, duration: 0.5 },
    { sd: 6, octave: -1, beat: 24.5, duration: 3.5 },
    { sd: 5, octave: -1, beat: 28, duration: 0.5 },
    { sd: 4, octave: -1, beat: 28.5, duration: 4 },
    { sd: 3, octave: -1, beat: 32.5, duration: 0.5 },
  ];

  return rawNotes.map(note => ({
    frequency: getAMinorFrequency(note.sd, note.octave),
    beat: note.beat,
    duration: note.duration,
  }));
}

const FULL_MELODY = buildMelody();

const ARPEGGIO_PATTERNS = {
  Am: [
    { sd: 1, octave: -1 }, { sd: 5, octave: -1 }, { sd: 1, octave: 0 }, { sd: 5, octave: -1 },
    { sd: 1, octave: -1 }, { sd: 5, octave: -1 }, { sd: 1, octave: 0 }, { sd: 5, octave: -1 },
    { sd: 1, octave: -1 }, { sd: 5, octave: -1 }, { sd: 1, octave: 0 }, { sd: 5, octave: -1 },
    { sd: 1, octave: -1 }, { sd: 5, octave: -1 }, { sd: 1, octave: 0 }, { sd: 5, octave: -1 },
  ],
  GB: [
    { sd: 2, octave: -1 }, { sd: 7, octave: -1 }, { sd: 2, octave: 0 }, { sd: 7, octave: -1 },
    { sd: 2, octave: -1 }, { sd: 7, octave: -1 }, { sd: 2, octave: 0 }, { sd: 7, octave: -1 },
    { sd: 2, octave: -1 }, { sd: 7, octave: -1 }, { sd: 2, octave: 0 }, { sd: 7, octave: -1 },
    { sd: 2, octave: -1 }, { sd: 7, octave: -1 }, { sd: 2, octave: 0 }, { sd: 7, octave: -1 },
  ],
  F: [
    { sd: 6, octave: -2 }, { sd: 3, octave: -1 }, { sd: 6, octave: -1 }, { sd: 3, octave: -1 },
    { sd: 6, octave: -2 }, { sd: 3, octave: -1 }, { sd: 6, octave: -1 }, { sd: 3, octave: -1 },
    { sd: 6, octave: -2 }, { sd: 3, octave: -1 }, { sd: 6, octave: -1 }, { sd: 3, octave: -1 },
    { sd: 6, octave: -2 }, { sd: 3, octave: -1 }, { sd: 6, octave: -1 }, { sd: 3, octave: -1 },
  ],
  Dm: [
    { sd: 4, octave: -1 }, { sd: 1, octave: 0 }, { sd: 4, octave: 0 }, { sd: 1, octave: 0 },
    { sd: 4, octave: -1 }, { sd: 1, octave: 0 }, { sd: 4, octave: 0 }, { sd: 1, octave: 0 },
    { sd: 4, octave: -1 }, { sd: 1, octave: 0 }, { sd: 4, octave: 0 }, { sd: 1, octave: 0 },
    { sd: 4, octave: -1 }, { sd: 1, octave: 0 }, { sd: 4, octave: 0 }, { sd: 1, octave: 0 },
  ],
};

const BASS_NOTES = {
  Am: getAMinorFrequency(1, -2),
  GB: getAMinorFrequency(7, -2),
  F: getAMinorFrequency(6, -2),
  Dm: getAMinorFrequency(4, -2),
};

type NightcallChord = 'Am' | 'GB' | 'F' | 'Dm';

// Module-level cache for pre-rendered audio buffer
let cachedBuffer: AudioBuffer | null = null;
let isRendering = false;
let renderPromise: Promise<AudioBuffer> | null = null;

/**
 * Create lead synth note in offline context
 */
function createLeadNoteOffline(
  ctx: OfflineAudioContext,
  frequency: number,
  startTime: number,
  duration: number,
  destination: AudioNode,
  volume: number = 0.15
): void {
  const saw1 = ctx.createOscillator();
  saw1.type = 'sawtooth';
  saw1.frequency.value = frequency;

  const saw2 = ctx.createOscillator();
  saw2.type = 'sawtooth';
  saw2.frequency.value = frequency * 1.007;

  const saw3 = ctx.createOscillator();
  saw3.type = 'sawtooth';
  saw3.frequency.value = frequency * 0.993;

  const sub = ctx.createOscillator();
  sub.type = 'sine';
  sub.frequency.value = frequency / 2;

  const saw1Gain = ctx.createGain();
  const saw2Gain = ctx.createGain();
  const saw3Gain = ctx.createGain();
  const subGain = ctx.createGain();

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.Q.value = 2;

  filter.frequency.setValueAtTime(400, startTime);
  filter.frequency.linearRampToValueAtTime(3500, startTime + 0.08);
  filter.frequency.exponentialRampToValueAtTime(1800, startTime + 0.3);
  filter.frequency.exponentialRampToValueAtTime(800, startTime + duration);

  saw1.connect(saw1Gain);
  saw2.connect(saw2Gain);
  saw3.connect(saw3Gain);
  sub.connect(subGain);

  saw1Gain.connect(filter);
  saw2Gain.connect(filter);
  saw3Gain.connect(filter);
  subGain.connect(filter);
  filter.connect(destination);

  const attack = 0.02;
  const decay = 0.15;
  const sustain = 0.7;
  const release = 0.5;

  saw1Gain.gain.setValueAtTime(0, startTime);
  saw1Gain.gain.linearRampToValueAtTime(volume, startTime + attack);
  saw1Gain.gain.linearRampToValueAtTime(volume * sustain, startTime + attack + decay);
  saw1Gain.gain.setValueAtTime(volume * sustain, startTime + duration);
  saw1Gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration + release);

  saw2Gain.gain.setValueAtTime(0, startTime);
  saw2Gain.gain.linearRampToValueAtTime(volume * 0.7, startTime + attack);
  saw2Gain.gain.linearRampToValueAtTime(volume * sustain * 0.7, startTime + attack + decay);
  saw2Gain.gain.setValueAtTime(volume * sustain * 0.7, startTime + duration);
  saw2Gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration + release);

  saw3Gain.gain.setValueAtTime(0, startTime);
  saw3Gain.gain.linearRampToValueAtTime(volume * 0.7, startTime + attack);
  saw3Gain.gain.linearRampToValueAtTime(volume * sustain * 0.7, startTime + attack + decay);
  saw3Gain.gain.setValueAtTime(volume * sustain * 0.7, startTime + duration);
  saw3Gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration + release);

  subGain.gain.setValueAtTime(0, startTime);
  subGain.gain.linearRampToValueAtTime(volume * 0.5, startTime + attack);
  subGain.gain.setValueAtTime(volume * 0.4, startTime + duration);
  subGain.gain.exponentialRampToValueAtTime(0.001, startTime + duration + release);

  const stopTime = startTime + duration + release + 0.1;
  saw1.start(startTime);
  saw1.stop(stopTime);
  saw2.start(startTime);
  saw2.stop(stopTime);
  saw3.start(startTime);
  saw3.stop(stopTime);
  sub.start(startTime);
  sub.stop(stopTime);
}

/**
 * Create arpeggio note in offline context
 */
function createArpNoteOffline(
  ctx: OfflineAudioContext,
  frequency: number,
  startTime: number,
  destination: AudioNode,
  volume: number = 0.08
): void {
  const duration = SIXTEENTH * 0.9;

  const osc1 = ctx.createOscillator();
  osc1.type = 'square';
  osc1.frequency.value = frequency;

  const osc2 = ctx.createOscillator();
  osc2.type = 'sawtooth';
  osc2.frequency.value = frequency * 1.003;

  const osc1Gain = ctx.createGain();
  const osc2Gain = ctx.createGain();

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.Q.value = 4;

  filter.frequency.setValueAtTime(300, startTime);
  filter.frequency.linearRampToValueAtTime(2800, startTime + 0.01);
  filter.frequency.exponentialRampToValueAtTime(600, startTime + duration);

  osc1.connect(osc1Gain);
  osc2.connect(osc2Gain);
  osc1Gain.connect(filter);
  osc2Gain.connect(filter);
  filter.connect(destination);

  osc1Gain.gain.setValueAtTime(0, startTime);
  osc1Gain.gain.linearRampToValueAtTime(volume, startTime + 0.005);
  osc1Gain.gain.exponentialRampToValueAtTime(volume * 0.5, startTime + 0.03);
  osc1Gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

  osc2Gain.gain.setValueAtTime(0, startTime);
  osc2Gain.gain.linearRampToValueAtTime(volume * 0.6, startTime + 0.005);
  osc2Gain.gain.exponentialRampToValueAtTime(volume * 0.3, startTime + 0.03);
  osc2Gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

  const stopTime = startTime + duration + 0.05;
  osc1.start(startTime);
  osc1.stop(stopTime);
  osc2.start(startTime);
  osc2.stop(stopTime);
}

/**
 * Create bass note in offline context
 */
function createBassNoteOffline(
  ctx: OfflineAudioContext,
  frequency: number,
  startTime: number,
  duration: number,
  destination: AudioNode,
  volume: number = 0.2
): void {
  const sub = ctx.createOscillator();
  sub.type = 'sine';
  sub.frequency.value = frequency;

  const punch = ctx.createOscillator();
  punch.type = 'square';
  punch.frequency.value = frequency;

  const subGain = ctx.createGain();
  const punchGain = ctx.createGain();

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 200;
  filter.Q.value = 1;

  sub.connect(subGain);
  punch.connect(punchGain);
  punchGain.connect(filter);
  subGain.connect(destination);
  filter.connect(destination);

  subGain.gain.setValueAtTime(0, startTime);
  subGain.gain.linearRampToValueAtTime(volume, startTime + 0.02);
  subGain.gain.setValueAtTime(volume * 0.8, startTime + duration * 0.8);
  subGain.gain.linearRampToValueAtTime(0, startTime + duration);

  punchGain.gain.setValueAtTime(0, startTime);
  punchGain.gain.linearRampToValueAtTime(volume * 0.4, startTime + 0.01);
  punchGain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.15);

  const stopTime = startTime + duration + 0.1;
  sub.start(startTime);
  sub.stop(stopTime);
  punch.start(startTime);
  punch.stop(stopTime);
}

/**
 * Pre-render one loop of the Nightcall audio
 */
async function renderLoop(): Promise<AudioBuffer> {
  if (cachedBuffer) {
    return cachedBuffer;
  }

  if (isRendering && renderPromise) {
    return renderPromise;
  }

  isRendering = true;

  renderPromise = (async () => {
    const totalDuration = LOOP_DURATION + 2;
    const ctx = new OfflineAudioContext(2, totalDuration * SAMPLE_RATE, SAMPLE_RATE);

    const masterGain = ctx.createGain();
    masterGain.gain.value = 0.6;

    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -18;
    compressor.knee.value = 20;
    compressor.ratio.value = 3;
    compressor.attack.value = 0.02;
    compressor.release.value = 0.25;

    const chorusDelay = ctx.createDelay(0.05);
    chorusDelay.delayTime.value = 0.018;

    const chorusLfo = ctx.createOscillator();
    chorusLfo.type = 'sine';
    chorusLfo.frequency.value = 0.5;
    const chorusDepth = ctx.createGain();
    chorusDepth.gain.value = 0.003;
    chorusLfo.connect(chorusDepth);
    chorusDepth.connect(chorusDelay.delayTime);
    chorusLfo.start(0);
    chorusLfo.stop(totalDuration);

    const chorusGain = ctx.createGain();
    chorusGain.gain.value = 0.4;

    const reverb1 = ctx.createDelay(0.5);
    reverb1.delayTime.value = 0.18;
    const reverb1Gain = ctx.createGain();
    reverb1Gain.gain.value = 0.4;

    const reverb2 = ctx.createDelay(0.5);
    reverb2.delayTime.value = 0.35;
    const reverb2Gain = ctx.createGain();
    reverb2Gain.gain.value = 0.3;

    const reverb3 = ctx.createDelay(0.6);
    reverb3.delayTime.value = 0.5;
    const reverb3Gain = ctx.createGain();
    reverb3Gain.gain.value = 0.2;

    const reverbFilter = ctx.createBiquadFilter();
    reverbFilter.type = 'lowpass';
    reverbFilter.frequency.value = 1500;

    const outputMixer = ctx.createGain();
    outputMixer.gain.value = 1.0;

    masterGain.connect(compressor);
    compressor.connect(outputMixer);

    compressor.connect(chorusDelay);
    chorusDelay.connect(chorusGain);
    chorusGain.connect(outputMixer);

    compressor.connect(reverb1);
    reverb1.connect(reverbFilter);
    reverbFilter.connect(reverb1Gain);
    reverb1Gain.connect(outputMixer);
    reverb1Gain.connect(reverb2);

    reverb2.connect(reverb2Gain);
    reverb2Gain.connect(outputMixer);
    reverb2Gain.connect(reverb3);

    reverb3.connect(reverb3Gain);
    reverb3Gain.connect(outputMixer);

    outputMixer.connect(ctx.destination);

    const startTime = 0;

    // Schedule melody
    FULL_MELODY.forEach(note => {
      const noteStart = startTime + (note.beat - 1) * BEAT;
      createLeadNoteOffline(ctx, note.frequency, noteStart, note.duration * BEAT, masterGain, 0.12);
    });

    // Schedule arpeggios
    const chords: NightcallChord[] = ['Am', 'GB', 'F', 'Dm', 'Am', 'GB', 'F', 'Dm'];
    chords.forEach((chord, i) => {
      const chordStart = startTime + i * 4 * BEAT;
      const pattern = ARPEGGIO_PATTERNS[chord];
      pattern.forEach((note, j) => {
        const noteTime = chordStart + j * SIXTEENTH;
        const freq = getAMinorFrequency(note.sd, note.octave);
        createArpNoteOffline(ctx, freq, noteTime, masterGain);
      });
    });

    // Schedule bass
    chords.forEach((chord, i) => {
      const bassStart = startTime + i * 4 * BEAT;
      const bassFreq = BASS_NOTES[chord];
      createBassNoteOffline(ctx, bassFreq, bassStart, 4 * BEAT, masterGain, 0.15);
    });

    const buffer = await ctx.startRendering();
    cachedBuffer = buffer;
    isRendering = false;
    return buffer;
  })();

  return renderPromise;
}

export interface UseNightcallAudioReturn {
  play: () => void;
  stop: () => void;
  isPlaying: boolean;
  isLoading: boolean;
  getFrequencyData: () => Uint8Array<ArrayBuffer>;
  getTimeDomainData: () => Uint8Array<ArrayBuffer>;
  getBeatIntensity: () => number;
  getCurrentChord: () => string;
}

export function useNightcallAudio(): UseNightcallAudioReturn {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const startTimeRef = useRef(0);

  const emptyFrequencyData = useRef(new Uint8Array(128));
  const emptyTimeDomainData = useRef(new Uint8Array(128));

  const getCurrentChord = useCallback((): string => {
    if (!audioContextRef.current || !isPlaying) return 'Am';

    const elapsed = audioContextRef.current.currentTime - startTimeRef.current;
    const positionInLoop = elapsed % LOOP_DURATION;
    const currentBeat = positionInLoop / BEAT;

    if (currentBeat < 4) return 'Am';
    if (currentBeat < 8) return 'GB';
    if (currentBeat < 12) return 'F';
    if (currentBeat < 16) return 'Dm';
    if (currentBeat < 20) return 'Am';
    if (currentBeat < 24) return 'GB';
    if (currentBeat < 28) return 'F';
    return 'Dm';
  }, [isPlaying]);

  const getBeatIntensity = useCallback((): number => {
    if (!audioContextRef.current || !isPlaying) return 0;

    const elapsed = audioContextRef.current.currentTime - startTimeRef.current;
    const positionInLoop = elapsed % LOOP_DURATION;
    const sixteenthPosition = (positionInLoop / SIXTEENTH) % 1;

    // Pulse on each 16th note
    return Math.max(0, 1 - sixteenthPosition * 4);
  }, [isPlaying]);

  const play = useCallback(async () => {
    if (isPlaying || isLoading) return;

    setIsLoading(true);

    try {
      const buffer = await renderLoop();

      const ctx = new AudioContext({ latencyHint: 'playback' });
      audioContextRef.current = ctx;

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.85;
      analyserRef.current = analyser;

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      source.loopEnd = LOOP_DURATION;
      sourceNodeRef.current = source;

      source.connect(analyser);
      analyser.connect(ctx.destination);

      startTimeRef.current = ctx.currentTime;
      source.start(0);

      setIsPlaying(true);
    } finally {
      setIsLoading(false);
    }
  }, [isPlaying, isLoading]);

  const stop = useCallback(() => {
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
    setIsPlaying(false);
  }, []);

  const getFrequencyData = useCallback((): Uint8Array<ArrayBuffer> => {
    if (!analyserRef.current) return emptyFrequencyData.current;
    const data = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(data);
    return data;
  }, []);

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
    getFrequencyData,
    getTimeDomainData,
    getBeatIntensity,
    getCurrentChord,
  };
}
