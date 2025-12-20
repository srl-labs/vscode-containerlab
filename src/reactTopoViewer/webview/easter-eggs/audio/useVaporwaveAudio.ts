/**
 * Vaporwave Audio Hook
 *
 * Generates that classic vaporwave aesthetic sound.
 * Inspired by the vaporwave genre aesthetic.
 *
 * Uses pre-rendered audio for smooth playback on slow hardware.
 *
 * Key: B minor
 * Tempo: ~70 BPM (slow and dreamy)
 */

import { useCallback } from 'react';

import { getBMinorFrequency, useAudioEngine, type MelodyNote } from './core';

/** ~70 BPM for that slowed down vaporwave feel */
const BEAT = 0.857; // seconds per beat
const LOOP_DURATION = 33 * BEAT; // 33 beats per loop
const SAMPLE_RATE = 44100;

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

const CHORD_PADS = {
  Em7: [getBMinorFrequency(4, -1), getBMinorFrequency(6, -1), getBMinorFrequency(1, 0), getBMinorFrequency(3, 0)],
  Bm: [getBMinorFrequency(1, -1), getBMinorFrequency(3, -1), getBMinorFrequency(5, -1), getBMinorFrequency(1, 0)],
  Em: [getBMinorFrequency(4, -1), getBMinorFrequency(6, -1), getBMinorFrequency(1, 0), getBMinorFrequency(4, 0)],
  Csm7: [getBMinorFrequency(2, -1), getBMinorFrequency(4, -1), getBMinorFrequency(6, -1), getBMinorFrequency(1, 0)],
  A: [getBMinorFrequency(7, -2), getBMinorFrequency(2, -1), getBMinorFrequency(4, -1), getBMinorFrequency(7, -1)],
};

type VaporwaveSection = 'em7' | 'bm' | 'em' | 'csm7' | 'a';

// Module-level cache for pre-rendered audio buffer
let cachedBuffer: AudioBuffer | null = null;
let isRendering = false;
let renderPromise: Promise<AudioBuffer> | null = null;

function createNoteOffline(
  ctx: OfflineAudioContext,
  frequency: number,
  startTime: number,
  duration: number,
  destination: AudioNode,
  volume: number = 0.15
): void {
  const mainOsc = ctx.createOscillator();
  mainOsc.type = 'sine';
  mainOsc.frequency.value = frequency;

  const subOsc = ctx.createOscillator();
  subOsc.type = 'sine';
  subOsc.frequency.value = frequency / 2;

  const bodyOsc = ctx.createOscillator();
  bodyOsc.type = 'triangle';
  bodyOsc.frequency.value = frequency;

  const mainGain = ctx.createGain();
  const subGain = ctx.createGain();
  const bodyGain = ctx.createGain();

  const lfo = ctx.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = 3;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 2;

  lfo.connect(lfoGain);
  lfoGain.connect(mainOsc.frequency);
  lfoGain.connect(bodyOsc.frequency);

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 1500;
  filter.Q.value = 0.7;

  mainOsc.connect(mainGain);
  subOsc.connect(subGain);
  bodyOsc.connect(bodyGain);

  mainGain.connect(filter);
  subGain.connect(filter);
  bodyGain.connect(filter);
  filter.connect(destination);

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

function createPadChordOffline(
  ctx: OfflineAudioContext,
  frequencies: number[],
  startTime: number,
  duration: number,
  destination: AudioNode
): void {
  frequencies.forEach((freq, i) => {
    const stagger = i * 0.08;
    createNoteOffline(ctx, freq, startTime + stagger, duration, destination, 0.04);
  });
}

async function renderLoop(): Promise<AudioBuffer> {
  if (cachedBuffer) return cachedBuffer;
  if (isRendering && renderPromise) return renderPromise;

  isRendering = true;

  renderPromise = (async () => {
    const totalDuration = LOOP_DURATION + 2;
    const ctx = new OfflineAudioContext(2, totalDuration * SAMPLE_RATE, SAMPLE_RATE);

    const masterGain = ctx.createGain();
    masterGain.gain.value = 0.7;

    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -20;
    compressor.knee.value = 20;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.01;
    compressor.release.value = 0.3;

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

    const outputMixer = ctx.createGain();
    outputMixer.gain.value = 1.0;

    masterGain.connect(compressor);
    compressor.connect(outputMixer);

    compressor.connect(chorusDelay);
    chorusDelay.connect(chorusGain);
    chorusGain.connect(outputMixer);

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

    const startTime = 0;
    FULL_MELODY.forEach(note => {
      const noteStart = startTime + (note.beat - 1) * BEAT;
      createNoteOffline(ctx, note.frequency, noteStart, note.duration * BEAT, masterGain, 0.18);
    });

    createPadChordOffline(ctx, CHORD_PADS.Em7, startTime, 4 * BEAT, masterGain);
    createPadChordOffline(ctx, CHORD_PADS.Bm, startTime + 4 * BEAT, 4 * BEAT, masterGain);
    createPadChordOffline(ctx, CHORD_PADS.Em, startTime + 8 * BEAT, 4 * BEAT, masterGain);
    createPadChordOffline(ctx, CHORD_PADS.Bm, startTime + 12 * BEAT, 4 * BEAT, masterGain);
    createPadChordOffline(ctx, CHORD_PADS.Em, startTime + 16 * BEAT, 4 * BEAT, masterGain);
    createPadChordOffline(ctx, CHORD_PADS.Bm, startTime + 20 * BEAT, 4 * BEAT, masterGain);
    createPadChordOffline(ctx, CHORD_PADS.Csm7, startTime + 24 * BEAT, 4 * BEAT, masterGain);
    createPadChordOffline(ctx, CHORD_PADS.A, startTime + 28 * BEAT, 5 * BEAT, masterGain);

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

export function useVaporwaveAudio(): UseVaporwaveAudioReturn {
  const engine = useAudioEngine(renderLoop, {
    loop: true,
    loopEnd: LOOP_DURATION,
    fftSize: 256,
  });

  const getCurrentSection = useCallback((): VaporwaveSection => {
    const { audioContextRef, startTimeRef } = engine.refs;
    if (!audioContextRef.current || !engine.isPlaying) return 'em7';

    const elapsed = audioContextRef.current.currentTime - startTimeRef.current;
    const positionInLoop = elapsed % LOOP_DURATION;
    const currentBeat = positionInLoop / BEAT;

    if (currentBeat < 4) return 'em7';
    if (currentBeat < 8) return 'bm';
    if (currentBeat < 12) return 'em';
    if (currentBeat < 16) return 'bm';
    if (currentBeat < 20) return 'em';
    if (currentBeat < 24) return 'bm';
    if (currentBeat < 28) return 'csm7';
    return 'a';
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
    getCurrentSection,
  };
}
