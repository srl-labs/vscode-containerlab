/**
 * Aquatic Ambience Mode Component
 *
 * Underwater visualization inspired by DKC's aquatic levels.
 * Deep blues, teals, floating bubbles, and soft light rays.
 */

import React, { useEffect, useRef, useState } from 'react';
import type { Core as CyCore } from 'cytoscape';
import { useAquaticAmbienceAudio } from '../hooks/ui/useAquaticAmbienceAudio';

interface AquaticAmbienceModeProps {
  isActive: boolean;
  onClose?: () => void;
  onSwitchMode?: () => void;
  modeName?: string;
  cyInstance?: CyCore | null;
}

/** Underwater color palette */
const COLORS = {
  deepBlue: { r: 10, g: 30, b: 80 },
  oceanBlue: { r: 30, g: 80, b: 140 },
  teal: { r: 0, g: 128, b: 128 },
  aqua: { r: 0, g: 180, b: 200 },
  lightBlue: { r: 135, g: 206, b: 235 },
  white: { r: 255, g: 255, b: 255 },
};

/** Section to color mapping */
const SECTION_COLORS: Array<{ r: number; g: number; b: number }> = [
  COLORS.teal,       // Cm(add9)
  COLORS.oceanBlue,  // Abm(add9)
  COLORS.teal,       // Cm(add9)
  COLORS.oceanBlue,  // Abm(add9)
  COLORS.aqua,       // Fmaj7
  COLORS.lightBlue,  // Bdim(add9)
];

/**
 * Get color for current section
 */
function getSectionColor(section: number): { r: number; g: number; b: number } {
  return SECTION_COLORS[section % SECTION_COLORS.length];
}

/** Bubble particle type */
interface Bubble {
  x: number;
  y: number;
  size: number;
  speed: number;
  wobblePhase: number;
  wobbleSpeed: number;
  alpha: number;
}

// Persistent bubble storage
const bubbles: Bubble[] = [];

/**
 * Initialize bubbles for the canvas
 */
function initializeBubbles(width: number, height: number): void {
  if (bubbles.length > 0) return;

  for (let i = 0; i < 35; i++) {
    /* eslint-disable sonarjs/pseudo-random */
    bubbles.push({
      x: Math.random() * width,
      y: height + Math.random() * height,
      size: 3 + Math.random() * 8,
      speed: 0.3 + Math.random() * 0.5,
      wobblePhase: Math.random() * Math.PI * 2,
      wobbleSpeed: 0.01 + Math.random() * 0.02,
      alpha: 0.3 + Math.random() * 0.4,
    });
    /* eslint-enable sonarjs/pseudo-random */
  }
}

/**
 * Aquatic Canvas - Underwater visualization
 */
const AquaticCanvas: React.FC<{
  isActive: boolean;
  getFrequencyData: () => Uint8Array<ArrayBuffer>;
  getBeatIntensity: () => number;
  getCurrentSection: () => number;
}> = ({ isActive, getFrequencyData, getBeatIntensity, getCurrentSection }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);
  const timeRef = useRef<number>(0);

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
    initializeBubbles(canvas.width, canvas.height);

    const animate = (): void => {
      const width = canvas.width;
      const height = canvas.height;
      timeRef.current += 1;
      const time = timeRef.current;

      const freqData = getFrequencyData();
      const beatIntensity = getBeatIntensity();
      const currentSection = getCurrentSection();

      // Clear canvas
      ctx.clearRect(0, 0, width, height);

      // Draw underwater gradient glow
      drawUnderwaterGlow(ctx, width, height, beatIntensity, time, currentSection);

      // Draw soft caustic light rays
      drawCausticRays(ctx, width, height, time, beatIntensity);

      // Draw subtle wave distortion at top
      drawWaterSurface(ctx, width, time);

      // Draw frequency visualizer (wave-like at bottom)
      drawWaveVisualizer(ctx, width, height, freqData, beatIntensity, currentSection);

      // Draw floating bubbles
      drawBubbles(ctx, width, height, time, beatIntensity);

      animationRef.current = window.requestAnimationFrame(animate);
    };

    animationRef.current = window.requestAnimationFrame(animate);

    return () => {
      window.removeEventListener('resize', updateSize);
      window.cancelAnimationFrame(animationRef.current);
    };
  }, [isActive, getFrequencyData, getBeatIntensity, getCurrentSection]);

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
 * Draw deep underwater gradient glow
 */
function drawUnderwaterGlow(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  intensity: number,
  time: number,
  section: number
): void {
  const color = getSectionColor(section);

  // Gradient from top (lighter) to bottom (darker)
  const gradient = ctx.createLinearGradient(0, 0, 0, height);

  const alpha = 0.06 + intensity * 0.04;
  const pulse = Math.sin(time * 0.008) * 0.02;

  gradient.addColorStop(0, `rgba(${COLORS.lightBlue.r}, ${COLORS.lightBlue.g}, ${COLORS.lightBlue.b}, ${alpha + pulse})`);
  gradient.addColorStop(0.3, `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha})`);
  gradient.addColorStop(0.7, `rgba(${COLORS.oceanBlue.r}, ${COLORS.oceanBlue.g}, ${COLORS.oceanBlue.b}, ${alpha * 0.8})`);
  gradient.addColorStop(1, `rgba(${COLORS.deepBlue.r}, ${COLORS.deepBlue.g}, ${COLORS.deepBlue.b}, ${alpha * 0.6})`);

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}

/**
 * Draw soft caustic light rays from above
 */
function drawCausticRays(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
  intensity: number
): void {
  ctx.save();
  ctx.globalAlpha = 0.04 + intensity * 0.02;

  const rayCount = 7;
  const baseWidth = width / rayCount;

  for (let i = 0; i < rayCount; i++) {
    // Slowly moving rays
    const offset = Math.sin(time * 0.003 + i * 2.0) * 60;
    const x = (i + 0.5) * baseWidth + offset;

    // Pulsing width
    const pulseWidth = 20 + Math.sin(time * 0.005 + i) * 10;

    const gradient = ctx.createLinearGradient(x, 0, x, height * 0.8);
    gradient.addColorStop(0, `rgba(${COLORS.white.r}, ${COLORS.white.g}, ${COLORS.white.b}, 0.6)`);
    gradient.addColorStop(0.3, `rgba(${COLORS.lightBlue.r}, ${COLORS.lightBlue.g}, ${COLORS.lightBlue.b}, 0.3)`);
    gradient.addColorStop(0.7, `rgba(${COLORS.aqua.r}, ${COLORS.aqua.g}, ${COLORS.aqua.b}, 0.1)`);
    gradient.addColorStop(1, 'transparent');

    ctx.beginPath();
    ctx.moveTo(x - pulseWidth, 0);
    ctx.lineTo(x + pulseWidth, 0);
    ctx.lineTo(x + pulseWidth * 2, height * 0.8);
    ctx.lineTo(x - pulseWidth * 2, height * 0.8);
    ctx.closePath();

    ctx.fillStyle = gradient;
    ctx.fill();
  }

  ctx.restore();
}

/**
 * Draw subtle water surface distortion at top
 */
function drawWaterSurface(
  ctx: CanvasRenderingContext2D,
  width: number,
  time: number
): void {
  ctx.save();
  ctx.globalAlpha = 0.08;

  const gradient = ctx.createLinearGradient(0, 0, 0, 50);
  gradient.addColorStop(0, `rgba(${COLORS.lightBlue.r}, ${COLORS.lightBlue.g}, ${COLORS.lightBlue.b}, 1)`);
  gradient.addColorStop(1, 'transparent');

  ctx.fillStyle = gradient;

  ctx.beginPath();
  ctx.moveTo(0, 0);

  // Gentle wave pattern
  for (let x = 0; x <= width; x += 20) {
    const y = Math.sin(x * 0.02 + time * 0.02) * 5 + Math.sin(x * 0.01 + time * 0.015) * 3;
    ctx.lineTo(x, y + 30);
  }

  ctx.lineTo(width, 0);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

/**
 * Draw wave-like frequency visualizer at bottom
 */
function drawWaveVisualizer(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  freqData: Uint8Array<ArrayBuffer>,
  _intensity: number,
  section: number
): void {
  const barCount = Math.min(24, freqData.length);
  const totalWidth = width * 0.7;
  const segmentWidth = totalWidth / barCount;
  const startX = (width - totalWidth) / 2;
  const baseY = height - 35;

  const color = getSectionColor(section);

  ctx.save();

  // Draw as connected wave
  ctx.beginPath();
  ctx.moveTo(startX, baseY);

  for (let i = 0; i <= barCount; i++) {
    const amplitude = (freqData[Math.min(i, barCount - 1)] || 0) / 255;
    const waveHeight = amplitude * 35;
    const x = startX + i * segmentWidth;
    const y = baseY - waveHeight;

    if (i === 0) {
      ctx.lineTo(x, y);
    } else {
      // Smooth curve between points
      const prevX = startX + (i - 1) * segmentWidth;
      const cpX = (prevX + x) / 2;
      ctx.quadraticCurveTo(prevX, baseY - (freqData[i - 1] || 0) / 255 * 35, cpX, (baseY - (freqData[i - 1] || 0) / 255 * 35 + y) / 2);
    }
  }

  ctx.lineTo(startX + totalWidth, baseY);
  ctx.closePath();

  // Fill with gradient
  const waveGradient = ctx.createLinearGradient(0, baseY - 40, 0, baseY);
  waveGradient.addColorStop(0, `rgba(${color.r}, ${color.g}, ${color.b}, 0.5)`);
  waveGradient.addColorStop(1, `rgba(${color.r}, ${color.g}, ${color.b}, 0.2)`);

  ctx.fillStyle = waveGradient;
  ctx.fill();

  ctx.restore();
}

/**
 * Draw floating bubble particles
 */
function drawBubbles(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
  intensity: number
): void {
  for (const b of bubbles) {
    // Move upward with wobble
    b.y -= b.speed + intensity * 0.2;
    b.x += Math.sin(time * b.wobbleSpeed + b.wobblePhase) * 0.5;

    // Reset when off screen
    if (b.y < -b.size * 2) {
      b.y = height + b.size * 2;
      // eslint-disable-next-line sonarjs/pseudo-random
      b.x = Math.random() * width;
    }

    // Wrap horizontally
    if (b.x < -b.size) b.x = width + b.size;
    if (b.x > width + b.size) b.x = -b.size;

    // Draw bubble
    const gradient = ctx.createRadialGradient(
      b.x - b.size * 0.3, b.y - b.size * 0.3, 0,
      b.x, b.y, b.size
    );

    const alpha = b.alpha + intensity * 0.15;
    gradient.addColorStop(0, `rgba(255, 255, 255, ${alpha * 0.8})`);
    gradient.addColorStop(0.5, `rgba(${COLORS.lightBlue.r}, ${COLORS.lightBlue.g}, ${COLORS.lightBlue.b}, ${alpha * 0.4})`);
    gradient.addColorStop(1, `rgba(${COLORS.aqua.r}, ${COLORS.aqua.g}, ${COLORS.aqua.b}, ${alpha * 0.1})`);

    ctx.beginPath();
    ctx.arc(b.x, b.y, b.size, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();

    // Highlight
    ctx.beginPath();
    ctx.arc(b.x - b.size * 0.3, b.y - b.size * 0.3, b.size * 0.2, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.6})`;
    ctx.fill();
  }
}

/**
 * Apply aquatic glow to nodes
 */
function applyNodeGlow(
  cyInstance: CyCore,
  color: { r: number; g: number; b: number },
  intensity: number
): void {
  const borderWidth = `${2 + intensity * 2}px`;
  const borderColor = `rgba(${color.r}, ${color.g}, ${color.b}, ${0.6 + intensity * 0.4})`;

  cyInstance.nodes().forEach(node => {
    node.style({
      'border-width': borderWidth,
      'border-color': borderColor,
    });
  });
}

/**
 * Restore original node styles
 */
function restoreNodeStyles(
  cyInstance: CyCore,
  originalStyles: Map<string, Record<string, string>>
): void {
  cyInstance.nodes().forEach(node => {
    const original = originalStyles.get(node.id());
    if (original) {
      node.style({
        'border-width': original['border-width'],
        'border-color': original['border-color'],
      });
    }
  });
}

/**
 * Hook to apply aquatic glow to nodes
 */
function useNodeGlow(
  cyInstance: CyCore | null | undefined,
  isActive: boolean,
  getBeatIntensity: () => number,
  getCurrentSection: () => number
): void {
  const originalStylesRef = useRef<Map<string, Record<string, string>>>(new Map());
  const animationRef = useRef<number>(0);

  useEffect(() => {
    if (!isActive || !cyInstance) return undefined;

    const nodes = cyInstance.nodes();

    // Store original styles
    nodes.forEach(node => {
      const id = node.id();
      originalStylesRef.current.set(id, {
        'background-color': node.style('background-color'),
        'border-color': node.style('border-color'),
        'border-width': node.style('border-width'),
      });
    });

    const cy = cyInstance;

    const animate = (): void => {
      const beatIntensity = getBeatIntensity();
      const currentSection = getCurrentSection();
      const color = getSectionColor(currentSection);

      cy.batch(() => applyNodeGlow(cy, color, beatIntensity * 0.4 + 0.2));

      animationRef.current = window.requestAnimationFrame(animate);
    };

    animationRef.current = window.requestAnimationFrame(animate);

    return () => {
      window.cancelAnimationFrame(animationRef.current);
      cy.batch(() => restoreNodeStyles(cy, originalStylesRef.current));
      originalStylesRef.current.clear();
    };
  }, [isActive, cyInstance, getBeatIntensity, getCurrentSection]);
}

/**
 * Aquatic Ambience Mode Overlay
 */
export const AquaticAmbienceMode: React.FC<AquaticAmbienceModeProps> = ({
  isActive,
  onClose,
  onSwitchMode,
  modeName,
  cyInstance,
}) => {
  const [visible, setVisible] = useState(false);
  const audio = useAquaticAmbienceAudio();

  // Apply aquatic glow to nodes
  useNodeGlow(cyInstance, isActive, audio.getBeatIntensity, audio.getCurrentSection);

  // Start audio when activated
  useEffect(() => {
    if (isActive && !audio.isPlaying && !audio.isLoading) {
      audio.play();
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
      <AquaticCanvas
        isActive={isActive}
        getFrequencyData={audio.getFrequencyData}
        getBeatIntensity={audio.getBeatIntensity}
        getCurrentSection={audio.getCurrentSection}
      />

      {/* Control buttons - underwater style */}
      <div className="fixed inset-0 pointer-events-none z-[99999] flex items-end justify-center pb-8 gap-4">
        <button
          onClick={handleSwitch}
          className={`px-6 py-2.5 rounded-full pointer-events-auto transition-all duration-500 ${
            visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
          }`}
          style={{
            background: 'linear-gradient(135deg, rgba(135, 206, 235, 0.6) 0%, rgba(0, 180, 200, 0.6) 100%)',
            border: '2px solid rgba(255, 255, 255, 0.5)',
            color: '#ffffff',
            cursor: 'pointer',
            backdropFilter: 'blur(10px)',
            fontSize: '14px',
            fontWeight: 600,
            textShadow: '0 0 10px rgba(135, 206, 235, 0.8)',
            boxShadow: '0 0 20px rgba(0, 180, 200, 0.5), inset 0 0 20px rgba(255, 255, 255, 0.1)',
          }}
          title={`Current: ${modeName}`}
        >
          Switch
        </button>
        <button
          onClick={handleClose}
          className={`px-6 py-2.5 rounded-full pointer-events-auto transition-all duration-500 ${
            visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
          }`}
          style={{
            background: 'linear-gradient(135deg, rgba(0, 128, 128, 0.8) 0%, rgba(30, 80, 140, 0.8) 100%)',
            border: '2px solid rgba(0, 180, 200, 0.5)',
            color: '#00b4c8',
            cursor: 'pointer',
            backdropFilter: 'blur(10px)',
            fontSize: '14px',
            fontWeight: 600,
            textShadow: '0 0 10px rgba(0, 180, 200, 0.8)',
            boxShadow: '0 0 20px rgba(0, 128, 128, 0.5), inset 0 0 20px rgba(0, 180, 200, 0.1)',
          }}
        >
          Surface
        </button>
      </div>
    </>
  );
};
