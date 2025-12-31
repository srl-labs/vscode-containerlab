/**
 * Final Countdown Mode Component
 *
 * New Year's Eve celebration with fireworks, countdown display, and gold sparkles.
 * Perfect for celebrating the new year with "The Final Countdown" playing!
 */

import React, { useEffect, useRef, useState } from 'react';
import type { Core as CyCore } from 'cytoscape';

import { useFinalCountdownAudio } from '../audio/useFinalCountdownAudio';
import { BTN_VISIBLE, BTN_HIDDEN, BTN_BLUR, lerpColor, applyNodeGlow, restoreNodeStyles, MuteButton } from '../shared';
import type { RGBColor } from '../shared';

interface FinalCountdownModeProps {
  isActive: boolean;
  onClose?: () => void;
  onSwitchMode?: () => void;
  modeName?: string;
  cyInstance?: CyCore | null;
}

/** Festive New Year color palette */
const COLORS = {
  gold: { r: 255, g: 215, b: 0 },
  silver: { r: 192, g: 192, b: 192 },
  champagne: { r: 247, g: 231, b: 206 },
  fireworkRed: { r: 255, g: 50, b: 50 },
  fireworkBlue: { r: 50, g: 100, b: 255 },
  fireworkGreen: { r: 50, g: 255, b: 100 },
  fireworkPurple: { r: 200, g: 50, b: 255 },
  fireworkOrange: { r: 255, g: 150, b: 50 },
  white: { r: 255, g: 255, b: 255 },
  darkBlue: { r: 10, g: 15, b: 40 },
};

/** Chord to color mapping */
const CHORD_COLORS: Record<string, RGBColor> = {
  FSharp: COLORS.gold,
  D: COLORS.silver,
  B: COLORS.champagne,
  E: COLORS.fireworkPurple,
  A: COLORS.fireworkBlue,
};

function getChordColor(chord: string): RGBColor {
  return CHORD_COLORS[chord] || COLORS.gold;
}

// Firework particle type
interface Firework {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: RGBColor;
  particles: FireworkParticle[];
  exploded: boolean;
  life: number;
}

interface FireworkParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  alpha: number;
  size: number;
  decay: number;
}

// Confetti particle type
interface Confetti {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  rotationSpeed: number;
  color: RGBColor;
  width: number;
  height: number;
  alpha: number;
}

// Storage for particles
const fireworks: Firework[] = [];
const confetti: Confetti[] = [];

// Finale state
let finaleTriggered = false;
let finaleFrame = 0;

/**
 * Final Countdown Canvas - Fireworks and celebration visualization
 */
const FinalCountdownCanvas: React.FC<{
  isActive: boolean;
  getFrequencyData: () => Uint8Array<ArrayBuffer>;
  getBeatIntensity: () => number;
  getCurrentChord: () => string;
  getCountdownNumber: () => number;
}> = ({ isActive, getFrequencyData, getBeatIntensity, getCurrentChord, getCountdownNumber }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);
  const timeRef = useRef<number>(0);
  const lastCountdownRef = useRef<number>(10);
  const lastBeatRef = useRef<number>(0);

  useEffect(() => {
    if (!isActive) return undefined;

    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;

    const updateSize = (): void => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    updateSize();
    window.addEventListener('resize', updateSize);

    timeRef.current = 0;
    fireworks.length = 0;
    confetti.length = 0;
    finaleTriggered = false;
    finaleFrame = 0;

    const animate = (): void => {
      const width = canvas.width;
      const height = canvas.height;
      timeRef.current += 1;
      const time = timeRef.current;

      const freqData = getFrequencyData();
      const beatIntensity = getBeatIntensity();
      const currentChord = getCurrentChord();
      const countdownNumber = getCountdownNumber();

      // Calculate firework intensity based on countdown (more fireworks as we approach 1)
      const countdownIntensity = Math.max(0, (11 - countdownNumber) / 10);

      // Spawn fireworks on beat - more frequent as countdown progresses
      if (beatIntensity > 0.8 && lastBeatRef.current < 0.5) {
        // Spawn 1-3 fireworks depending on countdown progress
        const fireworkCount = 1 + Math.floor(countdownIntensity * 2);
        for (let i = 0; i < fireworkCount; i++) {
          spawnFirework(width, height);
        }
      }
      // Extra random fireworks during low countdown numbers
      if (countdownNumber <= 3 && time % 8 === 0) {
        spawnFirework(width, height);
      }
      lastBeatRef.current = beatIntensity;

      // Spawn confetti burst on countdown change
      if (countdownNumber !== lastCountdownRef.current) {
        const prevCount = lastCountdownRef.current;
        lastCountdownRef.current = countdownNumber;

        // Only spawn burst during active countdown (not Happy New Year time)
        if (countdownNumber > 0) {
          spawnConfettiBurst(width, height, countdownNumber);
        }

        // Trigger massive finale when countdown hits 0 (Happy New Year!)
        if (countdownNumber === 0 && prevCount > 0 && !finaleTriggered) {
          triggerFinale(width, height);
        }
      }

      // Continue finale effects
      if (finaleTriggered) {
        finaleFrame++;
        updateFinale(width, height, finaleFrame);
      }

      // Clear canvas with transparency to show topology underneath
      ctx.clearRect(0, 0, width, height);

      // Very subtle dark overlay for contrast (keeps topology visible)
      ctx.fillStyle = 'rgba(0, 0, 20, 0.3)';
      ctx.fillRect(0, 0, width, height);

      // Draw sparkle stars
      drawStars(ctx, width, height, time, countdownNumber);

      // Update and draw fireworks
      drawFireworks(ctx);

      // Draw confetti
      drawConfetti(ctx, height);

      // Draw frequency visualizer at bottom
      drawFrequencyBars(ctx, width, height, freqData, beatIntensity, currentChord);

      // Draw countdown number (with screen flash during finale)
      const isFinaleFlash = finaleTriggered && finaleFrame < 30 && finaleFrame % 6 < 3;
      drawCountdown(ctx, width, height, countdownNumber, beatIntensity, currentChord, isFinaleFlash);

      // Draw edge glow (intensified during finale)
      const glowIntensity = finaleTriggered ? Math.min(1, beatIntensity + 0.5) : beatIntensity;
      drawCelebrationGlow(ctx, width, height, glowIntensity, currentChord, finaleTriggered);

      animationRef.current = window.requestAnimationFrame(animate);
    };

    animationRef.current = window.requestAnimationFrame(animate);

    return () => {
      window.removeEventListener('resize', updateSize);
      window.cancelAnimationFrame(animationRef.current);
    };
  }, [isActive, getFrequencyData, getBeatIntensity, getCurrentChord, getCountdownNumber]);

  if (!isActive) return null;

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-[99998]"
      style={{ width: '100%', height: '100%' }}
    />
  );
};

/**
 * Spawn a new firework
 */
function spawnFirework(width: number, height: number, isFinale = false): void {
  if (fireworks.length > 20) return; // Higher limit for more spectacular display

  const fireworkColors = [
    COLORS.fireworkRed,
    COLORS.fireworkBlue,
    COLORS.fireworkGreen,
    COLORS.fireworkPurple,
    COLORS.fireworkOrange,
    COLORS.gold,
    COLORS.silver,
    COLORS.white,
  ];

  /* eslint-disable sonarjs/pseudo-random */
  const color = fireworkColors[Math.floor(Math.random() * fireworkColors.length)];
  // Wider spread during finale
  const spreadX = isFinale ? 0.9 : 0.6;
  const targetX = width * (0.5 - spreadX / 2) + Math.random() * width * spreadX;
  const targetY = height * 0.1 + Math.random() * height * (isFinale ? 0.5 : 0.35);
  /* eslint-enable sonarjs/pseudo-random */

  fireworks.push({
    x: targetX,
    y: height + 10,
    vx: 0,
    vy: -14 - (height - targetY) / 45,
    color,
    particles: [],
    exploded: false,
    life: 200,
  });
}

/**
 * Trigger the spectacular finale
 */
function triggerFinale(width: number, height: number): void {
  finaleTriggered = true;
  finaleFrame = 0;

  // Launch a barrage of fireworks
  for (let i = 0; i < 12; i++) {
    setTimeout(() => spawnFirework(width, height, true), i * 50);
  }

  // Massive confetti explosion
  spawnMassiveConfetti(width, height);
}

/**
 * Continue finale effects over time
 */
function updateFinale(width: number, height: number, frame: number): void {
  // Keep spawning fireworks during finale
  if (frame < 180 && frame % 6 === 0) {
    spawnFirework(width, height, true);
  }

  // Continuous confetti rain during finale
  if (frame < 300 && frame % 4 === 0) {
    spawnConfettiRain(width);
  }
}

/**
 * Spawn massive confetti explosion for finale
 */
function spawnMassiveConfetti(width: number, height: number): void {
  const particleCount = 200;
  const confettiColors = [
    COLORS.gold, COLORS.silver, COLORS.fireworkRed, COLORS.fireworkBlue,
    COLORS.fireworkGreen, COLORS.fireworkPurple, COLORS.fireworkOrange, COLORS.white
  ];

  for (let i = 0; i < particleCount; i++) {
    /* eslint-disable sonarjs/pseudo-random */
    const angle = Math.random() * Math.PI * 2;
    const speed = 3 + Math.random() * 8;
    confetti.push({
      x: width / 2 + (Math.random() - 0.5) * width * 0.4,
      y: height * 0.35,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 3,
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 0.4,
      color: confettiColors[Math.floor(Math.random() * confettiColors.length)],
      width: 8 + Math.random() * 10,
      height: 12 + Math.random() * 10,
      alpha: 1,
    });
    /* eslint-enable sonarjs/pseudo-random */
  }
}

/**
 * Spawn confetti rain from top of screen
 */
function spawnConfettiRain(width: number): void {
  const confettiColors = [COLORS.gold, COLORS.silver, COLORS.white];

  for (let i = 0; i < 3; i++) {
    /* eslint-disable sonarjs/pseudo-random */
    confetti.push({
      x: Math.random() * width,
      y: -20,
      vx: (Math.random() - 0.5) * 2,
      vy: 2 + Math.random() * 3,
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 0.2,
      color: confettiColors[Math.floor(Math.random() * confettiColors.length)],
      width: 6 + Math.random() * 6,
      height: 8 + Math.random() * 8,
      alpha: 0.9,
    });
    /* eslint-enable sonarjs/pseudo-random */
  }
}

/**
 * Spawn confetti burst on countdown number change
 */
function spawnConfettiBurst(width: number, height: number, countdownNumber: number): void {
  // More confetti as we get closer to 1
  const particleCount = Math.floor(15 + (11 - countdownNumber) * 8);
  const confettiColors = [COLORS.gold, COLORS.silver, COLORS.fireworkRed, COLORS.fireworkBlue, COLORS.fireworkGreen];

  for (let i = 0; i < particleCount; i++) {
    /* eslint-disable sonarjs/pseudo-random */
    confetti.push({
      x: width / 2 + (Math.random() - 0.5) * width * 0.4,
      y: height * 0.35,
      vx: (Math.random() - 0.5) * 10,
      vy: Math.random() * -6 - 2,
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 0.3,
      color: confettiColors[Math.floor(Math.random() * confettiColors.length)],
      width: 6 + Math.random() * 6,
      height: 10 + Math.random() * 8,
      alpha: 1,
    });
    /* eslint-enable sonarjs/pseudo-random */
  }
}

/**
 * Draw twinkling stars and sparkles
 */
function drawStars(ctx: CanvasRenderingContext2D, width: number, height: number, time: number, countdown: number): void {
  ctx.save();

  // More stars as countdown progresses
  const starCount = 30 + (11 - countdown) * 10;

  for (let i = 0; i < starCount; i++) {
    // Deterministic star positions based on index
    const x = ((i * 137 + i * i * 3) % width);
    const y = ((i * 97 + i * 7) % height);
    const twinkle = Math.sin(time * 0.05 + i * 0.5) * 0.5 + 0.5;
    const alpha = 0.4 + twinkle * 0.6;
    const size = 1 + twinkle * 1.5;

    // Golden/white stars
    const isGold = i % 3 === 0;
    const color = isGold ? COLORS.gold : COLORS.white;

    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha})`;
    ctx.fill();

    // Add glow to some stars
    if (twinkle > 0.7) {
      ctx.beginPath();
      ctx.arc(x, y, size * 3, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha * 0.2})`;
      ctx.fill();
    }
  }

  ctx.restore();
}

/**
 * Draw a rising firework trail
 */
function drawRisingFirework(ctx: CanvasRenderingContext2D, fw: Firework): void {
  ctx.beginPath();
  ctx.arc(fw.x, fw.y, 3, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(${fw.color.r}, ${fw.color.g}, ${fw.color.b}, 0.9)`;
  ctx.fill();

  ctx.beginPath();
  ctx.arc(fw.x, fw.y, 8, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(${fw.color.r}, ${fw.color.g}, ${fw.color.b}, 0.3)`;
  ctx.fill();
}

/**
 * Create explosion particles for a firework
 */
function createExplosionParticles(fw: Firework): void {
  const particleCount = 60;
  for (let j = 0; j < particleCount; j++) {
    const angle = (j / particleCount) * Math.PI * 2;
    /* eslint-disable sonarjs/pseudo-random */
    const speed = 2 + Math.random() * 4;
    fw.particles.push({
      x: fw.x,
      y: fw.y,
      vx: Math.cos(angle) * speed + (Math.random() - 0.5),
      vy: Math.sin(angle) * speed + (Math.random() - 0.5),
      alpha: 1,
      size: 2 + Math.random() * 2,
      decay: 0.015 + Math.random() * 0.01,
    });
    /* eslint-enable sonarjs/pseudo-random */
  }
}

/**
 * Update and draw explosion particles
 */
function updateExplosionParticles(ctx: CanvasRenderingContext2D, fw: Firework): void {
  for (let j = fw.particles.length - 1; j >= 0; j--) {
    const p = fw.particles[j];
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.05;
    p.alpha -= p.decay;

    if (p.alpha > 0) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${fw.color.r}, ${fw.color.g}, ${fw.color.b}, ${p.alpha})`;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * 2, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${fw.color.r}, ${fw.color.g}, ${fw.color.b}, ${p.alpha * 0.3})`;
      ctx.fill();
    } else {
      fw.particles.splice(j, 1);
    }
  }
}

/**
 * Update and draw fireworks
 */
function drawFireworks(ctx: CanvasRenderingContext2D): void {
  for (let i = fireworks.length - 1; i >= 0; i--) {
    const fw = fireworks[i];
    fw.life--;

    if (!fw.exploded) {
      fw.y += fw.vy;
      fw.vy += 0.15;
      drawRisingFirework(ctx, fw);

      if (fw.vy >= 0) {
        fw.exploded = true;
        createExplosionParticles(fw);
      }
    } else {
      updateExplosionParticles(ctx, fw);
    }

    if (fw.life <= 0 || (fw.exploded && fw.particles.length === 0)) {
      fireworks.splice(i, 1);
    }
  }
}

/**
 * Draw and update confetti
 */
function drawConfetti(ctx: CanvasRenderingContext2D, height: number): void {
  for (let i = confetti.length - 1; i >= 0; i--) {
    const c = confetti[i];

    c.x += c.vx;
    c.y += c.vy;
    c.vy += 0.08; // Gravity (slightly slower for floatier feel)
    c.vx *= 0.99; // Air resistance
    c.rotation += c.rotationSpeed;
    c.alpha -= 0.004;

    if (c.alpha <= 0 || c.y > height + 20) {
      confetti.splice(i, 1);
      continue;
    }

    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(c.rotation);

    // Add shimmer effect
    const shimmer = Math.sin(c.rotation * 3) * 0.2 + 0.8;
    ctx.fillStyle = `rgba(${c.color.r}, ${c.color.g}, ${c.color.b}, ${c.alpha * shimmer})`;
    ctx.fillRect(-c.width / 2, -c.height / 2, c.width, c.height);

    // Add slight glow
    ctx.shadowColor = `rgba(${c.color.r}, ${c.color.g}, ${c.color.b}, ${c.alpha * 0.5})`;
    ctx.shadowBlur = 3;
    ctx.fill();

    ctx.restore();
  }
}

/**
 * Draw countdown number
 */
function drawCountdown(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  countdownNumber: number,
  intensity: number,
  chord: string,
  isFinaleFlash: boolean
): void {
  const color = getChordColor(chord);
  const isHappyNewYear = countdownNumber === 0;
  const text = isHappyNewYear ? 'HAPPY NEW YEAR!' : countdownNumber.toString();
  const fontSize = isHappyNewYear ? Math.min(width / 8, 100) : Math.min(width / 4, 200);
  const scale = 1 + intensity * 0.15;

  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Screen flash during finale
  if (isFinaleFlash) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.fillRect(0, 0, width, height);
  }

  // Extra large glow for Happy New Year
  const glowIntensity = isHappyNewYear ? 60 : 40;
  ctx.shadowColor = `rgba(${color.r}, ${color.g}, ${color.b}, 0.9)`;
  ctx.shadowBlur = glowIntensity + intensity * 40;

  ctx.font = `bold ${fontSize * scale}px "Arial Black", Arial, sans-serif`;

  // Multiple layers for glow effect
  ctx.fillStyle = `rgba(${color.r}, ${color.g}, ${color.b}, 0.4)`;
  ctx.fillText(text, width / 2, height * 0.38);

  ctx.shadowBlur = 25;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.fillText(text, width / 2, height * 0.38);

  ctx.shadowBlur = 0;

  // Gold gradient for Happy New Year text
  if (isHappyNewYear) {
    const gradient = ctx.createLinearGradient(0, height * 0.3, 0, height * 0.46);
    gradient.addColorStop(0, '#FFD700');
    gradient.addColorStop(0.5, '#FFFFFF');
    gradient.addColorStop(1, '#FFD700');
    ctx.fillStyle = gradient;
  } else {
    ctx.fillStyle = `rgb(${color.r}, ${color.g}, ${color.b})`;
  }
  ctx.fillText(text, width / 2, height * 0.38);

  // Add year below "Happy New Year"
  if (isHappyNewYear) {
    const year = new Date().getFullYear() + 1;
    ctx.font = `bold ${fontSize * 0.6}px "Arial Black", Arial, sans-serif`;
    ctx.shadowColor = 'rgba(255, 215, 0, 0.8)';
    ctx.shadowBlur = 20;
    ctx.fillStyle = '#FFD700';
    ctx.fillText(year.toString(), width / 2, height * 0.52);
  }

  ctx.restore();
}

/**
 * Draw frequency bars
 */
function drawFrequencyBars(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  freqData: Uint8Array<ArrayBuffer>,
  _intensity: number,
  chord: string
): void {
  const barCount = Math.min(32, freqData.length);
  const totalWidth = width * 0.6;
  const barWidth = totalWidth / barCount;
  const maxBarHeight = 60;
  const startX = (width - totalWidth) / 2;
  const baseY = height - 40;

  const color = getChordColor(chord);

  for (let i = 0; i < barCount; i++) {
    const amplitude = freqData[i] / 255;
    const barHeight = amplitude * maxBarHeight;

    const t = i / barCount;
    const barColor = lerpColor(COLORS.gold, color, t);

    const alpha = 0.5 + amplitude * 0.5;
    ctx.fillStyle = `rgba(${barColor.r}, ${barColor.g}, ${barColor.b}, ${alpha})`;

    const x = startX + i * barWidth;
    const y = baseY - barHeight;

    ctx.beginPath();
    ctx.roundRect(x + 1, y, barWidth - 2, barHeight, 3);
    ctx.fill();

    if (amplitude > 0.6) {
      ctx.shadowColor = `rgba(${barColor.r}, ${barColor.g}, ${barColor.b}, 0.9)`;
      ctx.shadowBlur = 15;
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }
}

/**
 * Draw edge glow celebration effect
 */
function drawCelebrationGlow(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  intensity: number,
  chord: string,
  isFinale: boolean
): void {
  const color = getChordColor(chord);
  // Bigger, more intense glow during finale
  const glowMultiplier = isFinale ? 1.5 : 1;
  const glowSize = (100 + intensity * 60) * glowMultiplier;
  const alpha = (0.15 + intensity * 0.12) * glowMultiplier;

  // Top - gold glow
  const topGrad = ctx.createLinearGradient(0, 0, 0, glowSize);
  topGrad.addColorStop(0, `rgba(${COLORS.gold.r}, ${COLORS.gold.g}, ${COLORS.gold.b}, ${alpha})`);
  topGrad.addColorStop(1, 'transparent');
  ctx.fillStyle = topGrad;
  ctx.fillRect(0, 0, width, glowSize);

  // Bottom - chord color with extra intensity
  const botGrad = ctx.createLinearGradient(0, height, 0, height - glowSize);
  botGrad.addColorStop(0, `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha})`);
  botGrad.addColorStop(1, 'transparent');
  ctx.fillStyle = botGrad;
  ctx.fillRect(0, height - glowSize, width, glowSize);

  // Left - silver/gold gradient
  const leftGrad = ctx.createLinearGradient(0, 0, glowSize * 0.7, 0);
  leftGrad.addColorStop(0, `rgba(${COLORS.silver.r}, ${COLORS.silver.g}, ${COLORS.silver.b}, ${alpha * 0.6})`);
  leftGrad.addColorStop(1, 'transparent');
  ctx.fillStyle = leftGrad;
  ctx.fillRect(0, 0, glowSize * 0.7, height);

  // Right - gold
  const rightGrad = ctx.createLinearGradient(width, 0, width - glowSize * 0.7, 0);
  rightGrad.addColorStop(0, `rgba(${COLORS.gold.r}, ${COLORS.gold.g}, ${COLORS.gold.b}, ${alpha * 0.6})`);
  rightGrad.addColorStop(1, 'transparent');
  ctx.fillStyle = rightGrad;
  ctx.fillRect(width - glowSize * 0.7, 0, glowSize * 0.7, height);

  // During finale, add corner bursts
  if (isFinale) {
    drawCornerBursts(ctx, width, height, intensity);
  }
}

/**
 * Draw corner light bursts during finale
 */
function drawCornerBursts(ctx: CanvasRenderingContext2D, width: number, height: number, intensity: number): void {
  const corners = [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: 0, y: height },
    { x: width, y: height },
  ];

  const burstSize = 200 + intensity * 100;
  const alpha = 0.15 + intensity * 0.1;

  for (const corner of corners) {
    const gradient = ctx.createRadialGradient(corner.x, corner.y, 0, corner.x, corner.y, burstSize);
    gradient.addColorStop(0, `rgba(${COLORS.gold.r}, ${COLORS.gold.g}, ${COLORS.gold.b}, ${alpha})`);
    gradient.addColorStop(0.5, `rgba(${COLORS.silver.r}, ${COLORS.silver.g}, ${COLORS.silver.b}, ${alpha * 0.5})`);
    gradient.addColorStop(1, 'transparent');

    ctx.fillStyle = gradient;
    ctx.fillRect(
      corner.x === 0 ? 0 : width - burstSize,
      corner.y === 0 ? 0 : height - burstSize,
      burstSize,
      burstSize
    );
  }
}

/**
 * Hook to apply celebration glow to nodes
 */
function useFinalCountdownNodeGlow(
  cyInstance: CyCore | null | undefined,
  isActive: boolean,
  getBeatIntensity: () => number,
  getCurrentChord: () => string
): void {
  const originalStylesRef = useRef<Map<string, Record<string, string>>>(new Map());
  const animationRef = useRef<number>(0);

  useEffect(() => {
    if (!isActive || !cyInstance) return undefined;

    const styles = originalStylesRef.current;
    const nodes = cyInstance.nodes();

    nodes.forEach(node => {
      const id = node.id();
      styles.set(id, {
        'background-color': node.style('background-color') as string,
        'border-color': node.style('border-color') as string,
        'border-width': node.style('border-width') as string,
      });
    });

    const cy = cyInstance;

    const animate = (): void => {
      const beatIntensity = getBeatIntensity();
      const currentChord = getCurrentChord();
      const color = getChordColor(currentChord);

      cy.batch(() => applyNodeGlow(cy, color, beatIntensity * 0.6 + 0.3));

      animationRef.current = window.requestAnimationFrame(animate);
    };

    animationRef.current = window.requestAnimationFrame(animate);

    return () => {
      window.cancelAnimationFrame(animationRef.current);
      cy.batch(() => restoreNodeStyles(cy, styles));
      styles.clear();
    };
  }, [isActive, cyInstance, getBeatIntensity, getCurrentChord]);
}

/**
 * Final Countdown Mode Overlay
 */
export const FinalCountdownMode: React.FC<FinalCountdownModeProps> = ({
  isActive,
  onClose,
  onSwitchMode,
  modeName,
  cyInstance,
}) => {
  const [visible, setVisible] = useState(false);
  const audio = useFinalCountdownAudio();

  useFinalCountdownNodeGlow(cyInstance, isActive, audio.getBeatIntensity, audio.getCurrentChord);

  useEffect(() => {
    if (isActive && !audio.isPlaying && !audio.isLoading) {
      void audio.play();
      setVisible(true);
    } else if (!isActive && audio.isPlaying) {
      audio.stop();
      setVisible(false);
    }
  }, [isActive, audio]);

  const handleClose = (): void => {
    audio.stop();
    onClose?.();
  };

  const handleSwitch = (): void => {
    audio.stop();
    onSwitchMode?.();
  };

  if (!isActive) return null;

  return (
    <>
      <FinalCountdownCanvas
        isActive={isActive}
        getFrequencyData={audio.getFrequencyData}
        getBeatIntensity={audio.getBeatIntensity}
        getCurrentChord={audio.getCurrentChord}
        getCountdownNumber={audio.getCountdownNumber}
      />

      {/* Control buttons - festive gold style */}
      <div className="fixed inset-0 pointer-events-none z-[99999] flex items-end justify-center pb-8 gap-4">
        <button
          onClick={handleSwitch}
          className={`px-6 py-2.5 rounded-full pointer-events-auto transition-all duration-500 ${
            visible ? BTN_VISIBLE : BTN_HIDDEN
          }`}
          style={{
            background: 'linear-gradient(135deg, rgba(192, 192, 192, 0.7) 0%, rgba(255, 215, 0, 0.7) 100%)',
            border: '2px solid rgba(255, 215, 0, 0.6)',
            color: '#FFD700',
            cursor: 'pointer',
            backdropFilter: BTN_BLUR,
            fontSize: '14px',
            fontWeight: 600,
            textShadow: '0 0 10px rgba(255, 215, 0, 0.8)',
            boxShadow: '0 0 20px rgba(255, 215, 0, 0.4), inset 0 0 20px rgba(255, 255, 255, 0.1)',
          }}
          title={`Current: ${modeName}`}
        >
          Switch
        </button>
        <MuteButton
          isMuted={audio.isMuted}
          onToggle={audio.toggleMute}
          visible={visible}
          unmutedBackground="linear-gradient(135deg, rgba(255, 215, 0, 0.8) 0%, rgba(255, 150, 50, 0.8) 100%)"
          unmutedShadow="0 0 20px rgba(255, 215, 0, 0.5), inset 0 0 20px rgba(255, 255, 255, 0.1)"
          borderColor="rgba(255, 215, 0, 0.6)"
        />
        <button
          onClick={handleClose}
          className={`px-6 py-2.5 rounded-full pointer-events-auto transition-all duration-500 ${
            visible ? BTN_VISIBLE : BTN_HIDDEN
          }`}
          style={{
            background: 'linear-gradient(135deg, rgba(255, 215, 0, 0.8) 0%, rgba(255, 100, 50, 0.8) 100%)',
            border: '2px solid rgba(192, 192, 192, 0.6)',
            color: '#FFFFFF',
            cursor: 'pointer',
            backdropFilter: BTN_BLUR,
            fontSize: '14px',
            fontWeight: 600,
            textShadow: '0 0 10px rgba(255, 255, 255, 0.8)',
            boxShadow: '0 0 20px rgba(255, 215, 0, 0.5), inset 0 0 20px rgba(255, 255, 255, 0.2)',
          }}
        >
          End Countdown
        </button>
      </div>
    </>
  );
};
