/**
 * Aquatic Ambience Audio Hook
 *
 * Generates the iconic underwater melody from Donkey Kong Country.
 * Composed by David Wise - ethereal, dreamy aquatic atmosphere.
 *
 * Uses pre-rendered audio for smooth playback on slow hardware.
 *
 * Key: C minor
 * Chords: Cm(add9) - Abm(add9) - Cm(add9) - Abm(add9) - Fmaj7 - Bdim(add9)
 */

import { useCallback } from "react";

import { getCMinorFrequency, useAudioEngine, type MelodyNote } from "./core";

const NOTES = {
  C3: 130.81,
  D3: 146.83,
  Eb3: 155.56,
  F3: 174.61,
  G3: 196.0,
  Ab3: 207.65,
  Bb3: 233.08,
  C4: 261.63,
  D4: 293.66,
  Eb4: 311.13,
  F4: 349.23,
  G4: 392.0,
  Ab4: 415.3,
  Bb4: 466.16,
  C5: 523.25,
  D5: 587.33,
  Eb5: 622.25,
  F5: 698.46,
  G5: 783.99,
  Ab5: 830.61,
  Bb5: 932.33,
  C6: 1046.5,
  D6: 1174.66,
  Eb6: 1244.51,
  Bb6: 1864.66,
} as const;

const BEAT = 0.923;
const TOTAL_BEATS = 48;
const TOTAL_DURATION = TOTAL_BEATS * BEAT;
const SAMPLE_RATE = 44100;

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

  return rawNotes.map((note) => ({
    frequency: note.isRest ? 0 : getCMinorFrequency(note.sd, note.octave),
    beat: note.beat,
    duration: note.duration,
    isRest: note.isRest,
  }));
}

const FULL_MELODY = buildMelody();

const CHORD_PADS = {
  Cm_add9: [NOTES.C3, NOTES.Eb3, NOTES.G3, NOTES.D4],
  Abm_add9: [NOTES.Ab3, NOTES.C4, NOTES.Eb4, NOTES.Bb4],
  Fmaj7: [NOTES.F3, NOTES.Ab3, NOTES.C4, NOTES.Eb4],
  Bdim_add9: [NOTES.Bb3, NOTES.D4, NOTES.F4, NOTES.C5],
};

// Module-level cache
let cachedBuffer: AudioBuffer | null = null;
let isRendering = false;
let renderPromise: Promise<AudioBuffer> | null = null;

function createPadChordOffline(
  ctx: OfflineAudioContext,
  masterGain: GainNode,
  frequencies: number[],
  startTime: number,
  duration: number
): void {
  for (const freq of frequencies) {
    const osc1 = ctx.createOscillator();
    osc1.type = "sine";
    osc1.frequency.value = freq;

    const osc2 = ctx.createOscillator();
    osc2.type = "sine";
    osc2.frequency.value = freq * 1.003;

    const osc3 = ctx.createOscillator();
    osc3.type = "triangle";
    osc3.frequency.value = freq * 0.5;

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

function scheduleNoteOffline(
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
  mainOsc.type = "sine";
  mainOsc.frequency.value = frequency;

  const mainGain = ctx.createGain();
  mainGain.gain.setValueAtTime(0, startTime);
  mainGain.gain.linearRampToValueAtTime(0.1, startTime + 0.04);
  mainGain.gain.exponentialRampToValueAtTime(0.07, startTime + 0.15);
  mainGain.gain.setValueAtTime(0.07, startTime + noteDuration * 0.4);
  mainGain.gain.exponentialRampToValueAtTime(0.001, startTime + noteDuration + 1.2);

  mainOsc.connect(mainGain);
  mainGain.connect(noteMixer);

  const subOsc = ctx.createOscillator();
  subOsc.type = "sine";
  subOsc.frequency.value = frequency / 2;

  const subGain = ctx.createGain();
  subGain.gain.setValueAtTime(0, startTime);
  subGain.gain.linearRampToValueAtTime(0.025, startTime + 0.08);
  subGain.gain.setValueAtTime(0.025, startTime + noteDuration * 0.5);
  subGain.gain.exponentialRampToValueAtTime(0.001, startTime + noteDuration + 0.8);

  subOsc.connect(subGain);
  subGain.connect(noteMixer);

  const bodyOsc = ctx.createOscillator();
  bodyOsc.type = "triangle";
  bodyOsc.frequency.value = frequency;

  const bodyGain = ctx.createGain();
  bodyGain.gain.setValueAtTime(0, startTime);
  bodyGain.gain.linearRampToValueAtTime(0.03, startTime + 0.06);
  bodyGain.gain.exponentialRampToValueAtTime(0.015, startTime + 0.2);
  bodyGain.gain.setValueAtTime(0.015, startTime + noteDuration * 0.3);
  bodyGain.gain.exponentialRampToValueAtTime(0.001, startTime + noteDuration + 0.6);

  bodyOsc.connect(bodyGain);
  bodyGain.connect(noteMixer);

  const endTime = startTime + noteDuration + 1.5;

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
    const totalDuration = TOTAL_DURATION + 4;
    const ctx = new OfflineAudioContext(2, totalDuration * SAMPLE_RATE, SAMPLE_RATE);

    const masterGain = ctx.createGain();
    masterGain.gain.value = 0.32;

    const underwaterFilter = ctx.createBiquadFilter();
    underwaterFilter.type = "lowpass";
    underwaterFilter.frequency.value = 1600;
    underwaterFilter.Q.value = 0.4;

    const cleanFilter = ctx.createBiquadFilter();
    cleanFilter.type = "highpass";
    cleanFilter.frequency.value = 60;

    const chorusDelay = ctx.createDelay(0.1);
    chorusDelay.delayTime.value = 0.02;

    const chorusLFO = ctx.createOscillator();
    chorusLFO.type = "sine";
    chorusLFO.frequency.value = 0.3;
    const chorusDepth = ctx.createGain();
    chorusDepth.gain.value = 0.003;
    chorusLFO.connect(chorusDepth);
    chorusDepth.connect(chorusDelay.delayTime);
    chorusLFO.start(0);
    chorusLFO.stop(totalDuration);

    const chorusGain = ctx.createGain();
    chorusGain.gain.value = 0.4;

    const reverbDelay1 = ctx.createDelay(2.0);
    reverbDelay1.delayTime.value = 0.35;
    const reverbGain1 = ctx.createGain();
    reverbGain1.gain.value = 0.3;

    const reverbFilter = ctx.createBiquadFilter();
    reverbFilter.type = "lowpass";
    reverbFilter.frequency.value = 1000;

    const reverbDelay2 = ctx.createDelay(2.0);
    reverbDelay2.delayTime.value = 0.7;
    const reverbGain2 = ctx.createGain();
    reverbGain2.gain.value = 0.2;

    const reverbDelay3 = ctx.createDelay(2.0);
    reverbDelay3.delayTime.value = 1.1;
    const reverbGain3 = ctx.createGain();
    reverbGain3.gain.value = 0.12;

    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -22;
    compressor.knee.value = 25;
    compressor.ratio.value = 2.5;
    compressor.attack.value = 0.04;
    compressor.release.value = 0.5;

    const outputMixer = ctx.createGain();
    outputMixer.gain.value = 1.0;

    masterGain.connect(cleanFilter);
    cleanFilter.connect(underwaterFilter);
    underwaterFilter.connect(compressor);

    underwaterFilter.connect(chorusDelay);
    chorusDelay.connect(chorusGain);
    chorusGain.connect(compressor);

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

    compressor.connect(outputMixer);
    outputMixer.connect(ctx.destination);

    const padDuration = 8 * BEAT;
    let padTime = 0;
    createPadChordOffline(ctx, masterGain, CHORD_PADS.Cm_add9, padTime, padDuration);
    padTime += padDuration;
    createPadChordOffline(ctx, masterGain, CHORD_PADS.Abm_add9, padTime, padDuration);
    padTime += padDuration;
    createPadChordOffline(ctx, masterGain, CHORD_PADS.Cm_add9, padTime, padDuration);
    padTime += padDuration;
    createPadChordOffline(ctx, masterGain, CHORD_PADS.Abm_add9, padTime, padDuration);
    padTime += padDuration;
    createPadChordOffline(ctx, masterGain, CHORD_PADS.Fmaj7, padTime, padDuration);
    padTime += padDuration;
    createPadChordOffline(ctx, masterGain, CHORD_PADS.Bdim_add9, padTime, padDuration);

    for (const note of FULL_MELODY) {
      if (note.isRest !== true) {
        const startTime = (note.beat - 1) * BEAT;
        scheduleNoteOffline(ctx, masterGain, note.frequency, startTime, note.duration);
      }
    }

    const buffer = await ctx.startRendering();
    cachedBuffer = buffer;
    isRendering = false;
    return buffer;
  })();

  return renderPromise;
}

export interface UseAquaticAmbienceAudioReturn {
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

export function useAquaticAmbienceAudio(): UseAquaticAmbienceAudioReturn {
  const engine = useAudioEngine(renderAudio, {
    loop: false,
    fftSize: 256,
    smoothingTimeConstant: 0.93,
  });

  const getCurrentSection = useCallback((): number => {
    const { audioContextRef, startTimeRef } = engine.refs;
    if (!audioContextRef.current || !engine.isPlaying) return 0;

    const elapsed = audioContextRef.current.currentTime - startTimeRef.current;
    const currentBeat = elapsed / BEAT;

    if (currentBeat < 8) return 0;
    if (currentBeat < 16) return 1;
    if (currentBeat < 24) return 2;
    if (currentBeat < 32) return 3;
    if (currentBeat < 40) return 4;
    return 5;
  }, [engine.isPlaying, engine.refs]);

  const getBeatIntensity = useCallback((): number => {
    const { audioContextRef, startTimeRef } = engine.refs;
    if (!audioContextRef.current || !engine.isPlaying) return 0;

    const elapsed = audioContextRef.current.currentTime - startTimeRef.current;
    const beatPosition = (elapsed / BEAT) % 1;

    return Math.max(0, 0.7 - beatPosition * 0.7);
  }, [engine.isPlaying, engine.refs]);

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
