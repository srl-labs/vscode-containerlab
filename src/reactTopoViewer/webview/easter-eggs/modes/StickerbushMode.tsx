/**
 * Stickerbrush Mode Component
 *
 * Dreamy forest/bramble visualization inspired by DKC2.
 * Ethereal greens and purples with floating firefly particles.
 */

import React, { useEffect, useRef, useState } from 'react';
import type { Core as CyCore } from 'cytoscape';

import { useStickerbushAudio } from '../audio';
import { BTN_VISIBLE, BTN_HIDDEN, BTN_BLUR, lerpColor, applyNodeGlow, restoreNodeStyles, MuteButton } from '../shared';
import type { RGBColor } from '../shared';

interface StickerbushModeProps {
  isActive: boolean;
  onClose?: () => void;
  onSwitchMode?: () => void;
  modeName?: string;
  cyInstance?: CyCore | null;
}

/** Forest/bramble color palette */
const COLORS = {
  deepGreen: { r: 0, g: 100, b: 60 },
  forestGreen: { r: 34, g: 139, b: 34 },
  emerald: { r: 80, g: 200, b: 120 },
  purple: { r: 128, g: 0, b: 128 },
  lavender: { r: 150, g: 120, b: 182 },
  gold: { r: 255, g: 215, b: 0 },
  warmWhite: { r: 255, g: 250, b: 240 },
};

/** Section to color mapping - cycling through forest colors */
const SECTION_COLORS: RGBColor[] = [
  COLORS.emerald,
  COLORS.forestGreen,
  COLORS.lavender,
  COLORS.purple,
];

/**
 * Get color for current section
 */
function getSectionColor(section: number): RGBColor {
  return SECTION_COLORS[section % SECTION_COLORS.length];
}

/** Firefly particle type */
interface Firefly {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  brightness: number;
  pulsePhase: number;
  pulseSpeed: number;
  hue: number;
}

// Persistent firefly storage
const fireflies: Firefly[] = [];

/**
 * Initialize fireflies for the canvas
 */
function initializeFireflies(width: number, height: number): void {
  if (fireflies.length > 0) return;

  for (let i = 0; i < 40; i++) {
    /* eslint-disable sonarjs/pseudo-random */
    fireflies.push({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.4,
      vy: (Math.random() - 0.5) * 0.4,
      size: 2 + Math.random() * 3,
      brightness: 0.3 + Math.random() * 0.7,
      pulsePhase: Math.random() * Math.PI * 2,
      pulseSpeed: 0.02 + Math.random() * 0.03,
      hue: 60 + Math.random() * 80, // Yellow to green range
    });
    /* eslint-enable sonarjs/pseudo-random */
  }
}

/**
 * Stickerbrush Canvas - Dreamy forest visualization
 */
const StickerbushCanvas: React.FC<{
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
    initializeFireflies(canvas.width, canvas.height);

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

      // Draw ambient forest glow
      drawForestGlow(ctx, width, height, beatIntensity, time, currentSection);

      // Draw subtle vignette
      drawVignette(ctx, width, height);

      // Draw soft light rays
      drawLightRays(ctx, width, height, time, beatIntensity);

      // Draw frequency visualizer (subtle vertical bars like grass)
      drawGrassBars(ctx, width, height, freqData, beatIntensity, currentSection);

      // Draw floating fireflies
      drawFireflies(ctx, width, height, time, beatIntensity);

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
 * Draw ambient forest glow effect
 */
function drawForestGlow(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  intensity: number,
  time: number,
  section: number
): void {
  const color = getSectionColor(section);
  const centerX = width / 2;
  const centerY = height / 2;
  const baseRadius = Math.max(width, height) * 0.7;
  const pulseRadius = baseRadius + Math.sin(time * 0.01) * 30 + intensity * 40;

  // Central ethereal glow
  const gradient = ctx.createRadialGradient(
    centerX, centerY, 0,
    centerX, centerY, pulseRadius
  );

  const alpha = 0.06 + intensity * 0.04;
  gradient.addColorStop(0, `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha * 1.5})`);
  gradient.addColorStop(0.4, `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha})`);
  gradient.addColorStop(0.7, `rgba(${COLORS.deepGreen.r}, ${COLORS.deepGreen.g}, ${COLORS.deepGreen.b}, ${alpha * 0.5})`);
  gradient.addColorStop(1, 'transparent');

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}

/**
 * Draw soft vignette around edges
 */
function drawVignette(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
): void {
  const gradient = ctx.createRadialGradient(
    width / 2, height / 2, Math.min(width, height) * 0.3,
    width / 2, height / 2, Math.max(width, height) * 0.8
  );

  gradient.addColorStop(0, 'transparent');
  gradient.addColorStop(0.7, 'transparent');
  gradient.addColorStop(1, 'rgba(0, 30, 20, 0.4)');

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}

/**
 * Draw soft light rays from top
 */
function drawLightRays(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
  intensity: number
): void {
  ctx.save();
  ctx.globalAlpha = 0.03 + intensity * 0.02;

  const rayCount = 5;
  const baseWidth = width / rayCount;

  for (let i = 0; i < rayCount; i++) {
    const offset = Math.sin(time * 0.005 + i * 1.5) * 50;
    const x = (i + 0.5) * baseWidth + offset;

    const gradient = ctx.createLinearGradient(x, 0, x, height * 0.7);
    gradient.addColorStop(0, `rgba(${COLORS.warmWhite.r}, ${COLORS.warmWhite.g}, ${COLORS.warmWhite.b}, 0.8)`);
    gradient.addColorStop(0.5, `rgba(${COLORS.gold.r}, ${COLORS.gold.g}, ${COLORS.gold.b}, 0.3)`);
    gradient.addColorStop(1, 'transparent');

    ctx.beginPath();
    ctx.moveTo(x - 30, 0);
    ctx.lineTo(x + 30, 0);
    ctx.lineTo(x + 60, height * 0.7);
    ctx.lineTo(x - 60, height * 0.7);
    ctx.closePath();

    ctx.fillStyle = gradient;
    ctx.fill();
  }

  ctx.restore();
}

/**
 * Draw grass-like frequency bars at bottom
 */
function drawGrassBars(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  freqData: Uint8Array<ArrayBuffer>,
  _intensity: number,
  section: number
): void {
  const barCount = Math.min(32, freqData.length);
  const totalWidth = width * 0.8;
  const barWidth = totalWidth / barCount;
  const maxBarHeight = 40;
  const startX = (width - totalWidth) / 2;
  const baseY = height - 20;

  const color = getSectionColor(section);

  for (let i = 0; i < barCount; i++) {
    const amplitude = freqData[i] / 255;
    const barHeight = amplitude * maxBarHeight;

    // Gradient from forest green to phrase color
    const t = i / barCount;
    const barColor = lerpColor(COLORS.forestGreen, color, t);

    const alpha = 0.3 + amplitude * 0.4;
    ctx.fillStyle = `rgba(${barColor.r}, ${barColor.g}, ${barColor.b}, ${alpha})`;

    const x = startX + i * barWidth;
    const y = baseY - barHeight;

    // Thin blade-like shape
    ctx.beginPath();
    ctx.moveTo(x + barWidth / 2, y);
    ctx.lineTo(x + barWidth - 1, baseY);
    ctx.lineTo(x + 1, baseY);
    ctx.closePath();
    ctx.fill();
  }
}

/**
 * Draw floating firefly particles
 */
function drawFireflies(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
  intensity: number
): void {
  for (const f of fireflies) {
    // Update position with gentle drift
    f.x += f.vx + Math.sin(time * 0.008 + f.pulsePhase) * 0.3;
    f.y += f.vy + Math.cos(time * 0.006 + f.pulsePhase) * 0.2;

    // Wrap around screen
    if (f.x < -20) f.x = width + 20;
    if (f.x > width + 20) f.x = -20;
    if (f.y < -20) f.y = height + 20;
    if (f.y > height + 20) f.y = -20;

    // Pulsing glow
    const pulse = Math.sin(time * f.pulseSpeed + f.pulsePhase);
    const currentBrightness = f.brightness * (0.5 + pulse * 0.5) + intensity * 0.3;

    // Draw outer glow
    const glowSize = f.size * 4;
    const gradient = ctx.createRadialGradient(
      f.x, f.y, 0,
      f.x, f.y, glowSize
    );
    gradient.addColorStop(0, `hsla(${f.hue}, 80%, 70%, ${currentBrightness * 0.6})`);
    gradient.addColorStop(0.3, `hsla(${f.hue}, 70%, 60%, ${currentBrightness * 0.3})`);
    gradient.addColorStop(1, 'transparent');

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(f.x, f.y, glowSize, 0, Math.PI * 2);
    ctx.fill();

    // Draw core
    ctx.beginPath();
    ctx.arc(f.x, f.y, f.size, 0, Math.PI * 2);
    ctx.fillStyle = `hsla(${f.hue}, 90%, 85%, ${currentBrightness})`;
    ctx.fill();
  }
}

/**
 * Hook to apply forest glow to nodes
 */
function useStickerbushNodeGlow(
  cyInstance: CyCore | null | undefined,
  isActive: boolean,
  getBeatIntensity: () => number,
  getCurrentSection: () => number
): void {
  const originalStylesRef = useRef<Map<string, Record<string, string>>>(new Map());
  const animationRef = useRef<number>(0);

  useEffect(() => {
    if (!isActive || !cyInstance) return undefined;

    // Capture ref value at effect run time for cleanup
    const styles = originalStylesRef.current;
    const nodes = cyInstance.nodes();

    // Store original styles
    nodes.forEach(node => {
      const id = node.id();
      styles.set(id, {
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

      // Smooth continuous glow
      cy.batch(() => applyNodeGlow(cy, color, beatIntensity * 0.4 + 0.2));

      animationRef.current = window.requestAnimationFrame(animate);
    };

    animationRef.current = window.requestAnimationFrame(animate);

    return () => {
      window.cancelAnimationFrame(animationRef.current);
      cy.batch(() => restoreNodeStyles(cy, styles));
      styles.clear();
    };
  }, [isActive, cyInstance, getBeatIntensity, getCurrentSection]);
}

/**
 * Stickerbrush Mode Overlay
 */
export const StickerbushMode: React.FC<StickerbushModeProps> = ({
  isActive,
  onClose,
  onSwitchMode,
  modeName,
  cyInstance,
}) => {
  const [visible, setVisible] = useState(false);
  const audio = useStickerbushAudio();

  // Apply forest glow to nodes
  useStickerbushNodeGlow(cyInstance, isActive, audio.getBeatIntensity, audio.getCurrentSection);

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
      <StickerbushCanvas
        isActive={isActive}
        getFrequencyData={audio.getFrequencyData}
        getBeatIntensity={audio.getBeatIntensity}
        getCurrentSection={audio.getCurrentSection}
      />

      {/* Control buttons - forest style */}
      <div className="fixed inset-0 pointer-events-none z-[99999] flex items-end justify-center pb-8 gap-4">
        <button
          onClick={handleSwitch}
          className={`px-6 py-2.5 rounded-full pointer-events-auto transition-all duration-500 ${
            visible ? BTN_VISIBLE : BTN_HIDDEN
          }`}
          style={{
            background: 'linear-gradient(135deg, rgba(128, 0, 128, 0.6) 0%, rgba(150, 120, 182, 0.6) 100%)',
            border: '2px solid rgba(255, 215, 0, 0.5)',
            color: '#ffd700',
            cursor: 'pointer',
            backdropFilter: BTN_BLUR,
            fontSize: '14px',
            fontWeight: 600,
            textShadow: '0 0 10px rgba(255, 215, 0, 0.8)',
            boxShadow: '0 0 20px rgba(128, 0, 128, 0.5), inset 0 0 20px rgba(255, 215, 0, 0.1)',
          }}
          title={`Current: ${modeName}`}
        >
          Switch
        </button>
        <MuteButton
          isMuted={audio.isMuted}
          onToggle={audio.toggleMute}
          visible={visible}
          unmutedBackground="linear-gradient(135deg, rgba(255, 215, 0, 0.8) 0%, rgba(128, 0, 128, 0.8) 100%)"
          unmutedShadow="0 0 20px rgba(255, 215, 0, 0.5), inset 0 0 20px rgba(128, 0, 128, 0.1)"
          borderColor="rgba(255, 215, 0, 0.5)"
        />
        <button
          onClick={handleClose}
          className={`px-6 py-2.5 rounded-full pointer-events-auto transition-all duration-500 ${
            visible ? BTN_VISIBLE : BTN_HIDDEN
          }`}
          style={{
            background: 'linear-gradient(135deg, rgba(34, 139, 34, 0.8) 0%, rgba(128, 0, 128, 0.8) 100%)',
            border: '2px solid rgba(80, 200, 120, 0.5)',
            color: '#50c878',
            cursor: 'pointer',
            backdropFilter: BTN_BLUR,
            fontSize: '14px',
            fontWeight: 600,
            textShadow: '0 0 10px rgba(80, 200, 120, 0.8)',
            boxShadow: '0 0 20px rgba(34, 139, 34, 0.5), inset 0 0 20px rgba(80, 200, 120, 0.1)',
          }}
        >
          End Stickerbrush
        </button>
      </div>
    </>
  );
};
