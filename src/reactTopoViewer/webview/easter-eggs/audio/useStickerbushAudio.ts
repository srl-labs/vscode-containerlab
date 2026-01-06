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
 * Key: A minor (from Hooktheory transcription)
 * Pattern: B-C-B-C-G(bass) repeating with Am7/Cmaj7 chord changes
 * G4 transitions only at phrase endings (beats 16.5-16.75, 32.5-32.75)
 */

import { useCallback, useRef } from 'react';

import { useAudioEngine, type MelodyNote } from './core';

const NOTES = {
  A3: 220.0, B3: 246.94, C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G3: 196.0,
  A4: 440.0, B4: 493.88, C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G4: 392.0,
  G5: 783.99,
} as const;

const BEAT = 0.8;
const SAMPLE_RATE = 44100;
const TOTAL_BEATS = 33;
const REVERB_TAIL = 4;
const TOTAL_DURATION = TOTAL_BEATS * BEAT + REVERB_TAIL;

const OCTAVE_0_FREQS: Record<number, number> = {
  1: NOTES.A4, 2: NOTES.B4, 3: NOTES.C5, 4: NOTES.D5,
  5: NOTES.E5, 6: NOTES.F5, 7: NOTES.G4
};

const OCTAVE_NEG1_FREQS: Record<number, number> = {
  1: NOTES.A3, 2: NOTES.B3, 3: NOTES.C4, 4: NOTES.D4,
  5: NOTES.E4, 6: NOTES.F4, 7: NOTES.G3
};

function getFrequency(sd: number, octave: number): number {
  const lookup = octave === 0 ? OCTAVE_0_FREQS : OCTAVE_NEG1_FREQS;
  return lookup[sd] ?? NOTES.A4;
}

function buildMelody(): MelodyNote[] {
  const rawNotes = [
    { sd: 2, octave: 0, beat: 1.5, duration: 0.5 },
    { sd: 3, octave: 0, beat: 2, duration: 0.75 },
    { sd: 2, octave: 0, beat: 2.75, duration: 0.75 },
    { sd: 3, octave: 0, beat: 3.5, duration: 0.5 },
    { sd: 7, octave: -1, beat: 4, duration: 1 },
    { sd: 2, octave: 0, beat: 5.5, duration: 0.5 },
    { sd: 3, octave: 0, beat: 6, duration: 0.75 },
    { sd: 2, octave: 0, beat: 6.75, duration: 0.75 },
    { sd: 3, octave: 0, beat: 7.5, duration: 0.5 },
    { sd: 7, octave: -1, beat: 8, duration: 1 },
    { sd: 2, octave: 0, beat: 9.5, duration: 0.5 },
    { sd: 3, octave: 0, beat: 10, duration: 0.75 },
    { sd: 2, octave: 0, beat: 10.75, duration: 0.75 },
    { sd: 3, octave: 0, beat: 11.5, duration: 0.5 },
    { sd: 7, octave: -1, beat: 12, duration: 1 },
    { sd: 2, octave: 0, beat: 13.5, duration: 0.5 },
    { sd: 3, octave: 0, beat: 14, duration: 0.75 },
    { sd: 2, octave: 0, beat: 14.75, duration: 0.75 },
    { sd: 3, octave: 0, beat: 15.5, duration: 0.5 },
    { sd: 7, octave: -1, beat: 16, duration: 0.5 },
    { sd: 7, octave: 0, beat: 16.5, duration: 0.25 },
    { sd: 7, octave: 0, beat: 16.75, duration: 0.25 },
    { sd: 2, octave: 0, beat: 17.5, duration: 0.5 },
    { sd: 3, octave: 0, beat: 18, duration: 0.75 },
    { sd: 2, octave: 0, beat: 18.75, duration: 0.75 },
    { sd: 3, octave: 0, beat: 19.5, duration: 0.5 },
    { sd: 7, octave: -1, beat: 20, duration: 1 },
    { sd: 2, octave: 0, beat: 21.5, duration: 0.5 },
    { sd: 3, octave: 0, beat: 22, duration: 0.75 },
    { sd: 2, octave: 0, beat: 22.75, duration: 0.75 },
    { sd: 3, octave: 0, beat: 23.5, duration: 0.5 },
    { sd: 7, octave: -1, beat: 24, duration: 1 },
    { sd: 2, octave: 0, beat: 25.5, duration: 0.5 },
    { sd: 3, octave: 0, beat: 26, duration: 0.75 },
    { sd: 2, octave: 0, beat: 26.75, duration: 0.75 },
    { sd: 3, octave: 0, beat: 27.5, duration: 0.5 },
    { sd: 7, octave: -1, beat: 28, duration: 1 },
    { sd: 2, octave: 0, beat: 29.5, duration: 0.5 },
    { sd: 3, octave: 0, beat: 30, duration: 0.75 },
    { sd: 2, octave: 0, beat: 30.75, duration: 0.75 },
    { sd: 3, octave: 0, beat: 31.5, duration: 0.5 },
    { sd: 7, octave: -1, beat: 32, duration: 0.5 },
    { sd: 7, octave: 0, beat: 32.5, duration: 0.25 },
    { sd: 7, octave: 0, beat: 32.75, duration: 0.25 },
  ];

  return rawNotes.map(note => ({
    frequency: getFrequency(note.sd, note.octave),
    beat: note.beat,
    duration: note.duration,
  }));
}

const FULL_MELODY = buildMelody();

const CHORD_PADS = {
  Am7: [NOTES.A3, NOTES.C4, NOTES.E4, NOTES.G3],
  Cmaj7: [NOTES.C4, NOTES.E4, NOTES.G4, NOTES.B4],
};

// Module-level audio buffer cache
let cachedBuffer: AudioBuffer | null = null;
let isRendering = false;
let renderPromise: Promise<AudioBuffer> | null = null;

function schedulePadChord(
  ctx: OfflineAudioContext,
  masterGain: GainNode,
  frequencies: number[],
  startTime: number,
  duration: number
): void {
  const padMixer = ctx.createGain();
  padMixer.gain.setValueAtTime(0.7, startTime);
  padMixer.connect(masterGain);

  const padFilter = ctx.createBiquadFilter();
  padFilter.type = 'lowpass';
  padFilter.frequency.setValueAtTime(800, startTime);
  padFilter.Q.setValueAtTime(0.5, startTime);
  padFilter.connect(padMixer);

  const filterLFO = ctx.createOscillator();
  filterLFO.type = 'sine';
  filterLFO.frequency.setValueAtTime(0.08, startTime);
  const filterLFOGain = ctx.createGain();
  filterLFOGain.gain.setValueAtTime(200, startTime);
  filterLFO.connect(filterLFOGain);
  filterLFOGain.connect(padFilter.frequency);
  filterLFO.start(startTime);
  filterLFO.stop(startTime + duration + 1);

  for (const freq of frequencies) {
    const voiceMixer = ctx.createGain();
    voiceMixer.connect(padFilter);

    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(0, startTime);
    envelope.gain.linearRampToValueAtTime(0.08, startTime + 1.5);
    envelope.gain.setValueAtTime(0.08, startTime + duration - 2.0);
    envelope.gain.linearRampToValueAtTime(0, startTime + duration + 0.5);
    envelope.connect(voiceMixer);

    const saw1 = ctx.createOscillator();
    saw1.type = 'sawtooth';
    saw1.frequency.setValueAtTime(freq, startTime);
    const saw1Gain = ctx.createGain();
    saw1Gain.gain.setValueAtTime(0.15, startTime);
    saw1.connect(saw1Gain);
    saw1Gain.connect(envelope);

    const saw2 = ctx.createOscillator();
    saw2.type = 'sawtooth';
    saw2.frequency.setValueAtTime(freq * 1.003, startTime);
    const saw2Gain = ctx.createGain();
    saw2Gain.gain.setValueAtTime(0.12, startTime);
    saw2.connect(saw2Gain);
    saw2Gain.connect(envelope);

    const saw3 = ctx.createOscillator();
    saw3.type = 'sawtooth';
    saw3.frequency.setValueAtTime(freq * 0.997, startTime);
    const saw3Gain = ctx.createGain();
    saw3Gain.gain.setValueAtTime(0.12, startTime);
    saw3.connect(saw3Gain);
    saw3Gain.connect(envelope);

    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(freq * 0.5, startTime);
    const subGain = ctx.createGain();
    subGain.gain.setValueAtTime(0.10, startTime);
    sub.connect(subGain);
    subGain.connect(envelope);

    const shimmer = ctx.createOscillator();
    shimmer.type = 'triangle';
    shimmer.frequency.setValueAtTime(freq * 2, startTime);
    const shimmerGain = ctx.createGain();
    shimmerGain.gain.setValueAtTime(0.03, startTime);
    shimmer.connect(shimmerGain);
    shimmerGain.connect(envelope);

    const endTime = startTime + duration + 1;
    saw1.start(startTime);
    saw1.stop(endTime);
    saw2.start(startTime);
    saw2.stop(endTime);
    saw3.start(startTime);
    saw3.stop(endTime);
    sub.start(startTime);
    sub.stop(endTime);
    shimmer.start(startTime);
    shimmer.stop(endTime);
  }
}

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

async function renderAudio(): Promise<AudioBuffer> {
  if (cachedBuffer) return cachedBuffer;
  if (isRendering && renderPromise) return renderPromise;

  isRendering = true;
  renderPromise = (async () => {
    const totalSamples = Math.ceil(TOTAL_DURATION * SAMPLE_RATE);
    const ctx = new OfflineAudioContext(2, totalSamples, SAMPLE_RATE);

    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.30, 0);

    const warmFilter = ctx.createBiquadFilter();
    warmFilter.type = 'lowpass';
    warmFilter.frequency.setValueAtTime(1600, 0);
    warmFilter.Q.setValueAtTime(0.3, 0);

    const cleanFilter = ctx.createBiquadFilter();
    cleanFilter.type = 'highpass';
    cleanFilter.frequency.setValueAtTime(60, 0);

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

    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-24, 0);
    compressor.knee.setValueAtTime(28, 0);
    compressor.ratio.setValueAtTime(2, 0);
    compressor.attack.setValueAtTime(0.05, 0);
    compressor.release.setValueAtTime(0.5, 0);

    masterGain.connect(cleanFilter);
    cleanFilter.connect(warmFilter);
    warmFilter.connect(compressor);

    warmFilter.connect(chorusDelay);
    chorusDelay.connect(chorusGain);
    chorusGain.connect(compressor);

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

    const chordDuration = 8 * BEAT;
    let padTime = 0.1;

    schedulePadChord(ctx, masterGain, CHORD_PADS.Am7, padTime, chordDuration);
    padTime += chordDuration;
    schedulePadChord(ctx, masterGain, CHORD_PADS.Cmaj7, padTime, chordDuration);
    padTime += chordDuration;
    schedulePadChord(ctx, masterGain, CHORD_PADS.Am7, padTime, chordDuration);
    padTime += chordDuration;
    schedulePadChord(ctx, masterGain, CHORD_PADS.Cmaj7, padTime, chordDuration);

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
  play: () => Promise<void>;
  stop: () => void;
  isPlaying: boolean;
  isLoading: boolean;
  isMuted: boolean;
  toggleMute: () => void;
  getFrequencyData: () => Uint8Array<ArrayBuffer>;
  getTimeDomainData: () => Uint8Array<ArrayBuffer>;
  getBeatIntensity: () => number;
  getCurrentSection: () => number;
}

export function useStickerbushAudio(): UseStickerbushAudioReturn {
  const beatIntensityRef = useRef(0);
  const currentSectionRef = useRef(0);
  const beatDecayIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sectionIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startTracking = useCallback((audioContextRef: { current: AudioContext | null }, startTimeRef: { current: number }) => {
    beatDecayIntervalRef.current = setInterval(() => {
      beatIntensityRef.current = Math.max(0, beatIntensityRef.current - 0.015);
    }, 16);

    sectionIntervalRef.current = setInterval(() => {
      if (!audioContextRef.current) return;
      const elapsed = audioContextRef.current.currentTime - startTimeRef.current;
      const currentBeat = elapsed / BEAT;

      const section = Math.min(3, Math.floor(currentBeat / 8));
      currentSectionRef.current = section;

      const beatFraction = currentBeat % 1;
      if (beatFraction < 0.1) {
        beatIntensityRef.current = 0.75;
      }
    }, 50);
  }, []);

  const stopTracking = useCallback(() => {
    if (beatDecayIntervalRef.current) {
      clearInterval(beatDecayIntervalRef.current);
      beatDecayIntervalRef.current = null;
    }
    if (sectionIntervalRef.current) {
      clearInterval(sectionIntervalRef.current);
      sectionIntervalRef.current = null;
    }
    beatIntensityRef.current = 0;
    currentSectionRef.current = 0;
  }, []);

  const engine = useAudioEngine(renderAudio, {
    loop: false,
    fftSize: 256,
    smoothingTimeConstant: 0.93,
    onPlay: () => startTracking(engine.refs.audioContextRef, engine.refs.startTimeRef),
    onStop: stopTracking,
  });

  const getBeatIntensity = useCallback((): number => {
    return beatIntensityRef.current;
  }, []);

  const getCurrentSection = useCallback((): number => {
    return currentSectionRef.current;
  }, []);

  return {
    play: engine.play,
    stop: engine.stop,
    isPlaying: engine.isPlaying,
    isLoading: engine.isLoading,
    isMuted: engine.isMuted,
    toggleMute: engine.toggleMute,
    getFrequencyData: engine.getFrequencyData,
    getTimeDomainData: engine.getTimeDomainData,
    getBeatIntensity,
    getCurrentSection,
  };
}
