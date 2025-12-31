/**
 * Final Countdown Audio Hook
 *
 * Generates "The Final Countdown" melody - perfect for New Year's Eve!
 * Classic 80s synth anthem by Europe.
 *
 * Uses pre-rendered audio for smooth playback.
 *
 * Key: F# minor
 * Tempo: ~118 BPM
 */

import { useCallback } from 'react';

import { getFSharpMinorFrequency, useAudioEngine, type MelodyNote } from './core';

const BEAT = 60 / 118; // ~0.508 seconds per beat
const LOOP_DURATION = 48 * BEAT; // Single pass + finale (~24 seconds)
const SAMPLE_RATE = 44100;

/**
 * Build the melody from scale degrees
 */
function buildMelody(): MelodyNote[] {
  const rawNotes = [
    // Main theme - single pass
    { sd: 5, octave: 0, beat: 2.5, duration: 0.25 },
    { sd: 4, octave: 0, beat: 2.75, duration: 0.25 },
    { sd: 5, octave: 0, beat: 3, duration: 1 },
    { sd: 1, octave: 0, beat: 4, duration: 1 },
    { sd: 6, octave: 0, beat: 6.5, duration: 0.25 },
    { sd: 5, octave: 0, beat: 6.75, duration: 0.25 },
    { sd: 6, octave: 0, beat: 7, duration: 0.5 },
    { sd: 5, octave: 0, beat: 7.5, duration: 0.5 },
    { sd: 4, octave: 0, beat: 8, duration: 1 },
    { sd: 6, octave: 0, beat: 10.5, duration: 0.25 },
    { sd: 5, octave: 0, beat: 10.75, duration: 0.25 },
    { sd: 6, octave: 0, beat: 11, duration: 1 },
    { sd: 1, octave: 0, beat: 12, duration: 1 },
    { sd: 4, octave: 0, beat: 14.5, duration: 0.25 },
    { sd: 3, octave: 0, beat: 14.75, duration: 0.25 },
    { sd: 4, octave: 0, beat: 15, duration: 0.5 },
    { sd: 3, octave: 0, beat: 15.5, duration: 0.5 },
    { sd: 2, octave: 0, beat: 16, duration: 0.5 },
    { sd: 4, octave: 0, beat: 16.5, duration: 0.5 },
    { sd: 3, octave: 0, beat: 17, duration: 1.5 },
    // Bridge section
    { sd: 2, octave: 0, beat: 18.5, duration: 0.25 },
    { sd: 3, octave: 0, beat: 18.75, duration: 0.25 },
    { sd: 4, octave: 0, beat: 19, duration: 1.5 },
    { sd: 3, octave: 0, beat: 20.5, duration: 0.25 },
    { sd: 4, octave: 0, beat: 20.75, duration: 0.25 },
    { sd: 5, octave: 0, beat: 21, duration: 0.5 },
    { sd: 4, octave: 0, beat: 21.5, duration: 0.5 },
    { sd: 3, octave: 0, beat: 22, duration: 0.5 },
    { sd: 2, octave: 0, beat: 22.5, duration: 0.5 },
    { sd: 1, octave: 0, beat: 23, duration: 1 },
    { sd: 6, octave: 0, beat: 24, duration: 1 },
    // Building to finale
    { sd: 5, octave: 0, beat: 25, duration: 2.5 },
    { sd: 5, octave: 0, beat: 27.5, duration: 0.25 },
    { sd: 6, octave: 0, beat: 27.75, duration: 0.25 },
    { sd: 5, octave: 0, beat: 28, duration: 0.25 },
    { sd: 4, octave: 0, beat: 28.25, duration: 0.25 },
    { sd: 5, octave: 0, beat: 28.5, duration: 3.5 },
    // Epic finale - ascending run to C#
    { sd: 1, octave: 0, beat: 38, duration: 1 },
    { sd: 7, octave: -1, beat: 39, duration: 1 },
    { sd: 5, octave: -1, beat: 40, duration: 1 },
    { sd: 3, octave: 0, beat: 41, duration: 1 },
    { sd: 2, octave: 0, beat: 42, duration: 1 },
    { sd: 7, octave: -1, beat: 43, duration: 1 },
    // Final triumphant C# (scale degree 5)
    { sd: 5, octave: 0, beat: 44, duration: 4 },
  ];

  return rawNotes.map(note => ({
    frequency: getFSharpMinorFrequency(note.sd, note.octave),
    beat: note.beat,
    duration: note.duration,
  }));
}

const FULL_MELODY = buildMelody();

// Chord progression patterns for arpeggios
const ARPEGGIO_PATTERNS = {
  FSharp: [
    { sd: 1, octave: -1 }, { sd: 5, octave: -1 }, { sd: 1, octave: 0 }, { sd: 5, octave: -1 },
  ],
  D: [
    { sd: 6, octave: -1 }, { sd: 3, octave: 0 }, { sd: 6, octave: 0 }, { sd: 3, octave: 0 },
  ],
  B: [
    { sd: 4, octave: -1 }, { sd: 1, octave: 0 }, { sd: 4, octave: 0 }, { sd: 1, octave: 0 },
  ],
  E: [
    { sd: 7, octave: -1 }, { sd: 4, octave: 0 }, { sd: 7, octave: 0 }, { sd: 4, octave: 0 },
  ],
  A: [
    { sd: 3, octave: -1 }, { sd: 7, octave: -1 }, { sd: 3, octave: 0 }, { sd: 7, octave: -1 },
  ],
};

const BASS_NOTES = {
  FSharp: getFSharpMinorFrequency(1, -2),
  D: getFSharpMinorFrequency(6, -2),
  B: getFSharpMinorFrequency(4, -2),
  E: getFSharpMinorFrequency(7, -2),
  A: getFSharpMinorFrequency(3, -2),
};

type FinalCountdownChord = 'FSharp' | 'D' | 'B' | 'E' | 'A';

// Chord progression for the song (single pass + finale)
const CHORD_PROGRESSION: Array<{ chord: FinalCountdownChord; startBeat: number; duration: number }> = [
  // Main theme
  { chord: 'FSharp', startBeat: 1, duration: 4 },
  { chord: 'D', startBeat: 5, duration: 4 },
  { chord: 'B', startBeat: 9, duration: 4 },
  { chord: 'E', startBeat: 13, duration: 4 },
  // Bridge section
  { chord: 'FSharp', startBeat: 17, duration: 2 },
  { chord: 'E', startBeat: 19, duration: 2 },
  { chord: 'A', startBeat: 21, duration: 2 },
  { chord: 'D', startBeat: 23, duration: 2 },
  // Building to finale
  { chord: 'E', startBeat: 25, duration: 4 },
  { chord: 'E', startBeat: 29, duration: 4 },
  // Tension before finale
  { chord: 'E', startBeat: 33, duration: 5 },
  // Epic finale - ending on A (for C# resolution)
  { chord: 'A', startBeat: 38, duration: 10 },
];

// Finale drum hits (beat positions)
const FINALE_DRUM_BEATS = [38, 39, 40, 41, 42, 43, 44, 45, 46, 47];

// Module-level cache for pre-rendered audio buffer
let cachedBuffer: AudioBuffer | null = null;
let isRendering = false;
let renderPromise: Promise<AudioBuffer> | null = null;

/**
 * Create a synth lead note with 80s character
 */
function createLeadNoteOffline(
  ctx: OfflineAudioContext,
  frequency: number,
  startTime: number,
  duration: number,
  destination: AudioNode,
  volume: number = 0.15
): void {
  // Three detuned sawtooth oscillators for thick 80s lead
  const saw1 = ctx.createOscillator();
  saw1.type = 'sawtooth';
  saw1.frequency.value = frequency;

  const saw2 = ctx.createOscillator();
  saw2.type = 'sawtooth';
  saw2.frequency.value = frequency * 1.005;

  const saw3 = ctx.createOscillator();
  saw3.type = 'sawtooth';
  saw3.frequency.value = frequency * 0.995;

  const saw1Gain = ctx.createGain();
  const saw2Gain = ctx.createGain();
  const saw3Gain = ctx.createGain();

  // Resonant lowpass filter for synth character
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.Q.value = 3;

  // Filter envelope
  filter.frequency.setValueAtTime(500, startTime);
  filter.frequency.linearRampToValueAtTime(4000, startTime + 0.05);
  filter.frequency.exponentialRampToValueAtTime(2000, startTime + 0.2);
  filter.frequency.exponentialRampToValueAtTime(800, startTime + duration);

  saw1.connect(saw1Gain);
  saw2.connect(saw2Gain);
  saw3.connect(saw3Gain);

  saw1Gain.connect(filter);
  saw2Gain.connect(filter);
  saw3Gain.connect(filter);
  filter.connect(destination);

  // ADSR envelope
  const attack = 0.01;
  const decay = 0.1;
  const sustain = 0.8;
  const release = 0.3;

  for (const gain of [saw1Gain, saw2Gain, saw3Gain]) {
    const v = gain === saw1Gain ? volume : volume * 0.7;
    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(v, startTime + attack);
    gain.gain.linearRampToValueAtTime(v * sustain, startTime + attack + decay);
    gain.gain.setValueAtTime(v * sustain, startTime + duration);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration + release);
  }

  const stopTime = startTime + duration + release + 0.1;
  saw1.start(startTime);
  saw1.stop(stopTime);
  saw2.start(startTime);
  saw2.stop(stopTime);
  saw3.start(startTime);
  saw3.stop(stopTime);
}

/**
 * Create arpeggio note with fast decay
 */
function createArpNoteOffline(
  ctx: OfflineAudioContext,
  frequency: number,
  startTime: number,
  destination: AudioNode,
  volume: number = 0.06
): void {
  const duration = BEAT / 4 * 0.9;

  const osc1 = ctx.createOscillator();
  osc1.type = 'square';
  osc1.frequency.value = frequency;

  const osc2 = ctx.createOscillator();
  osc2.type = 'sawtooth';
  osc2.frequency.value = frequency * 1.002;

  const osc1Gain = ctx.createGain();
  const osc2Gain = ctx.createGain();

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.Q.value = 5;

  filter.frequency.setValueAtTime(400, startTime);
  filter.frequency.linearRampToValueAtTime(3000, startTime + 0.01);
  filter.frequency.exponentialRampToValueAtTime(800, startTime + duration);

  osc1.connect(osc1Gain);
  osc2.connect(osc2Gain);
  osc1Gain.connect(filter);
  osc2Gain.connect(filter);
  filter.connect(destination);

  osc1Gain.gain.setValueAtTime(0, startTime);
  osc1Gain.gain.linearRampToValueAtTime(volume, startTime + 0.003);
  osc1Gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

  osc2Gain.gain.setValueAtTime(0, startTime);
  osc2Gain.gain.linearRampToValueAtTime(volume * 0.5, startTime + 0.003);
  osc2Gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

  const stopTime = startTime + duration + 0.05;
  osc1.start(startTime);
  osc1.stop(stopTime);
  osc2.start(startTime);
  osc2.stop(stopTime);
}

/**
 * Create bass note with sub and punch
 */
function createBassNoteOffline(
  ctx: OfflineAudioContext,
  frequency: number,
  startTime: number,
  duration: number,
  destination: AudioNode,
  volume: number = 0.18
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
  filter.frequency.value = 180;
  filter.Q.value = 1;

  sub.connect(subGain);
  punch.connect(punchGain);
  punchGain.connect(filter);
  subGain.connect(destination);
  filter.connect(destination);

  subGain.gain.setValueAtTime(0, startTime);
  subGain.gain.linearRampToValueAtTime(volume, startTime + 0.02);
  subGain.gain.setValueAtTime(volume * 0.9, startTime + duration * 0.9);
  subGain.gain.linearRampToValueAtTime(0, startTime + duration);

  punchGain.gain.setValueAtTime(0, startTime);
  punchGain.gain.linearRampToValueAtTime(volume * 0.3, startTime + 0.01);
  punchGain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.12);

  const stopTime = startTime + duration + 0.1;
  sub.start(startTime);
  sub.stop(stopTime);
  punch.start(startTime);
  punch.stop(stopTime);
}

/**
 * Create 80s style kick drum for finale
 */
function createKickDrumOffline(
  ctx: OfflineAudioContext,
  startTime: number,
  destination: AudioNode,
  volume: number = 0.25
): void {
  // Kick drum - pitch-swept sine wave
  const kickOsc = ctx.createOscillator();
  kickOsc.type = 'sine';
  kickOsc.frequency.setValueAtTime(150, startTime);
  kickOsc.frequency.exponentialRampToValueAtTime(40, startTime + 0.1);

  const kickGain = ctx.createGain();
  kickGain.gain.setValueAtTime(volume, startTime);
  kickGain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.3);

  // Click transient for punch
  const clickOsc = ctx.createOscillator();
  clickOsc.type = 'square';
  clickOsc.frequency.value = 200;

  const clickGain = ctx.createGain();
  clickGain.gain.setValueAtTime(volume * 0.4, startTime);
  clickGain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.02);

  const kickFilter = ctx.createBiquadFilter();
  kickFilter.type = 'lowpass';
  kickFilter.frequency.value = 200;

  kickOsc.connect(kickGain);
  clickOsc.connect(clickGain);
  kickGain.connect(kickFilter);
  clickGain.connect(destination);
  kickFilter.connect(destination);

  kickOsc.start(startTime);
  kickOsc.stop(startTime + 0.35);
  clickOsc.start(startTime);
  clickOsc.stop(startTime + 0.05);
}

/**
 * Create 80s style snare drum for finale
 */
function createSnareDrumOffline(
  ctx: OfflineAudioContext,
  startTime: number,
  destination: AudioNode,
  volume: number = 0.25
): void {
  // Snare - noise burst with body
  const bufferSize = ctx.sampleRate * 0.15;
  const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const noiseData = noiseBuffer.getChannelData(0);
  // Audio synthesis noise - not security-sensitive
  for (let i = 0; i < bufferSize; i++) {
    // eslint-disable-next-line sonarjs/pseudo-random
    noiseData[i] = Math.random() * 2 - 1;
  }

  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer;

  const noiseFilter = ctx.createBiquadFilter();
  noiseFilter.type = 'highpass';
  noiseFilter.frequency.value = 1000;

  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(volume * 0.5, startTime);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.12);

  // Snare body
  const bodyOsc = ctx.createOscillator();
  bodyOsc.type = 'triangle';
  bodyOsc.frequency.value = 180;

  const bodyGain = ctx.createGain();
  bodyGain.gain.setValueAtTime(volume * 0.3, startTime);
  bodyGain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.08);

  noise.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  noiseGain.connect(destination);
  bodyOsc.connect(bodyGain);
  bodyGain.connect(destination);

  noise.start(startTime);
  bodyOsc.start(startTime);
  bodyOsc.stop(startTime + 0.15);
}

/**
 * Pre-render the audio loop
 */
async function renderLoop(): Promise<AudioBuffer> {
  if (cachedBuffer) return cachedBuffer;
  if (isRendering && renderPromise) return renderPromise;

  isRendering = true;

  renderPromise = (async () => {
    const totalDuration = LOOP_DURATION + 2;
    const ctx = new OfflineAudioContext(2, totalDuration * SAMPLE_RATE, SAMPLE_RATE);

    const masterGain = ctx.createGain();
    masterGain.gain.value = 0.65;

    // Compressor for punch
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -16;
    compressor.knee.value = 15;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.01;
    compressor.release.value = 0.2;

    // Chorus effect
    const chorusDelay = ctx.createDelay(0.05);
    chorusDelay.delayTime.value = 0.015;

    const chorusLfo = ctx.createOscillator();
    chorusLfo.type = 'sine';
    chorusLfo.frequency.value = 0.7;
    const chorusDepth = ctx.createGain();
    chorusDepth.gain.value = 0.004;
    chorusLfo.connect(chorusDepth);
    chorusDepth.connect(chorusDelay.delayTime);
    chorusLfo.start(0);
    chorusLfo.stop(totalDuration);

    const chorusGain = ctx.createGain();
    chorusGain.gain.value = 0.35;

    // Reverb delays
    const reverb1 = ctx.createDelay(0.5);
    reverb1.delayTime.value = 0.15;
    const reverb1Gain = ctx.createGain();
    reverb1Gain.gain.value = 0.35;

    const reverb2 = ctx.createDelay(0.5);
    reverb2.delayTime.value = 0.28;
    const reverb2Gain = ctx.createGain();
    reverb2Gain.gain.value = 0.25;

    const reverbFilter = ctx.createBiquadFilter();
    reverbFilter.type = 'lowpass';
    reverbFilter.frequency.value = 2000;

    const outputMixer = ctx.createGain();
    outputMixer.gain.value = 1.0;

    // Connect effects chain
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

    outputMixer.connect(ctx.destination);

    const startTime = 0;

    // Schedule melody
    FULL_MELODY.forEach(note => {
      const noteStart = startTime + (note.beat - 1) * BEAT;
      createLeadNoteOffline(ctx, note.frequency, noteStart, note.duration * BEAT, masterGain, 0.13);
    });

    // Schedule arpeggios and bass based on chord progression
    CHORD_PROGRESSION.forEach(({ chord, startBeat, duration }) => {
      const chordStart = startTime + (startBeat - 1) * BEAT;
      const pattern = ARPEGGIO_PATTERNS[chord];
      const bassFreq = BASS_NOTES[chord];

      // Arpeggios - 16th notes within the chord duration
      const sixteenthsPerBeat = 4;
      const totalSixteenths = duration * sixteenthsPerBeat;
      for (let i = 0; i < totalSixteenths; i++) {
        const noteTime = chordStart + (i * BEAT) / sixteenthsPerBeat;
        const patternNote = pattern[i % pattern.length];
        const freq = getFSharpMinorFrequency(patternNote.sd, patternNote.octave);
        createArpNoteOffline(ctx, freq, noteTime, masterGain);
      }

      // Bass note
      createBassNoteOffline(ctx, bassFreq, chordStart, duration * BEAT, masterGain, 0.14);
    });

    // Schedule finale drum hits - alternating kick and snare for epic ending
    FINALE_DRUM_BEATS.forEach((beat, index) => {
      const hitTime = startTime + (beat - 1) * BEAT;
      if (index % 2 === 0) {
        createKickDrumOffline(ctx, hitTime, masterGain, 0.22);
      } else {
        createSnareDrumOffline(ctx, hitTime, masterGain, 0.22);
      }
    });

    const buffer = await ctx.startRendering();
    cachedBuffer = buffer;
    isRendering = false;
    return buffer;
  })();

  return renderPromise;
}

export interface UseFinalCountdownAudioReturn {
  play: () => Promise<void>;
  stop: () => void;
  isPlaying: boolean;
  isLoading: boolean;
  isMuted: boolean;
  toggleMute: () => void;
  getFrequencyData: () => Uint8Array<ArrayBuffer>;
  getTimeDomainData: () => Uint8Array<ArrayBuffer>;
  getBeatIntensity: () => number;
  getCurrentChord: () => string;
  getCountdownNumber: () => number;
}

export function useFinalCountdownAudio(): UseFinalCountdownAudioReturn {
  const engine = useAudioEngine(renderLoop, {
    loop: true,
    loopEnd: LOOP_DURATION,
    fftSize: 256,
    smoothingTimeConstant: 0.8,
  });

  const getCurrentChord = useCallback((): string => {
    const { audioContextRef, startTimeRef } = engine.refs;
    if (!audioContextRef.current || !engine.isPlaying) return 'FSharp';

    const elapsed = audioContextRef.current.currentTime - startTimeRef.current;
    const positionInLoop = elapsed % LOOP_DURATION;
    const currentBeat = positionInLoop / BEAT + 1;

    for (let i = CHORD_PROGRESSION.length - 1; i >= 0; i--) {
      if (currentBeat >= CHORD_PROGRESSION[i].startBeat) {
        return CHORD_PROGRESSION[i].chord;
      }
    }
    return 'FSharp';
  }, [engine.isPlaying, engine.refs]);

  const getBeatIntensity = useCallback((): number => {
    const { audioContextRef, startTimeRef } = engine.refs;
    if (!audioContextRef.current || !engine.isPlaying) return 0;

    const elapsed = audioContextRef.current.currentTime - startTimeRef.current;
    const positionInLoop = elapsed % LOOP_DURATION;
    const beatPosition = (positionInLoop / BEAT) % 1;

    return Math.max(0, 1 - beatPosition * 3);
  }, [engine.isPlaying, engine.refs]);

  // Returns countdown: 10-1 during countdown, 0 for "Happy New Year" time
  const getCountdownNumber = useCallback((): number => {
    const { audioContextRef, startTimeRef } = engine.refs;
    if (!audioContextRef.current || !engine.isPlaying) return 10;

    const elapsed = audioContextRef.current.currentTime - startTimeRef.current;

    // Real 10-second countdown from the start
    if (elapsed < 10) {
      return Math.max(1, 10 - Math.floor(elapsed));
    }

    // After 10 seconds: Happy New Year time!
    return 0;
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
    getCurrentChord,
    getCountdownNumber,
  };
}
