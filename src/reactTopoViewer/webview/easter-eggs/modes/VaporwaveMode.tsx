/**
 * Vaporwave Mode Component
 *
 * Classic vaporwave aesthetic with pink/cyan gradients,
 * perspective grid, and dreamy smooth jazz vibes.
 */

import React, { useEffect, useRef, useState } from 'react';
import type { Core as CyCore } from 'cytoscape';

import { useVaporwaveAudio } from '../audio';
import { BTN_VISIBLE, BTN_HIDDEN, BTN_BLUR, lerpColor, applyNodeGlow, restoreNodeStyles, MuteButton } from '../shared';
import type { RGBColor } from '../shared';

interface VaporwaveModeProps {
  isActive: boolean;
  onClose?: () => void;
  onSwitchMode?: () => void;
  modeName?: string;
  cyInstance?: CyCore | null;
}

/** Button border */
const BTN_BORDER = '2px solid rgba(255, 255, 255, 0.4)';

/** Vaporwave color palette */
const COLORS = {
  pink: { r: 255, g: 113, b: 206 },       // Hot pink
  cyan: { r: 1, g: 205, b: 254 },         // Neon cyan
  purple: { r: 185, g: 103, b: 255 },     // Light purple
  yellow: { r: 254, g: 255, b: 156 },     // Pastel yellow
  blue: { r: 120, g: 129, b: 255 },       // Periwinkle
  darkPurple: { r: 25, g: 4, b: 50 },     // Dark background
};

/** Section to color mapping - Lisa Frank 420 chord progression */
const SECTION_COLORS: Record<string, RGBColor> = {
  em7: COLORS.pink,
  bm: COLORS.cyan,
  em: COLORS.purple,
  csm7: COLORS.yellow,
  a: COLORS.blue,
};

/**
 * Get color for current section
 */
function getSectionColor(section: string): RGBColor {
  return SECTION_COLORS[section] || COLORS.cyan;
}

/**
 * Vaporwave Canvas - Retro aesthetic visualization
 */
const VaporwaveCanvas: React.FC<{
  isActive: boolean;
  getFrequencyData: () => Uint8Array<ArrayBuffer>;
  getCurrentSection: () => string;
}> = ({ isActive, getFrequencyData, getCurrentSection }) => {
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

    const animate = (): void => {
      const width = canvas.width;
      const height = canvas.height;
      timeRef.current += 1;
      const time = timeRef.current;

      const freqData = getFrequencyData();
      const currentSection = getCurrentSection();
      const avgIntensity = getAverageIntensity(freqData);

      // Clear canvas
      ctx.clearRect(0, 0, width, height);

      // Draw gradient background glow
      drawBackgroundGlow(ctx, width, height, time, currentSection, avgIntensity);

      // Draw perspective grid
      drawPerspectiveGrid(ctx, width, height, time, currentSection);

      // Draw sun/moon circle
      drawVaporwaveSun(ctx, width, height, time, avgIntensity, currentSection);

      // Draw horizontal bands
      drawHorizontalBands(ctx, width, height, time);

      // Draw frequency bars (minimalist style)
      drawMinimalistBars(ctx, width, height, freqData, currentSection);

      // Draw floating shapes
      drawFloatingShapes(ctx, width, height, time, avgIntensity);

      animationRef.current = window.requestAnimationFrame(animate);
    };

    animationRef.current = window.requestAnimationFrame(animate);

    return () => {
      window.removeEventListener('resize', updateSize);
      window.cancelAnimationFrame(animationRef.current);
    };
  }, [isActive, getFrequencyData, getCurrentSection]);

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
 * Calculate average intensity from frequency data
 */
function getAverageIntensity(freqData: Uint8Array<ArrayBuffer>): number {
  if (freqData.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < freqData.length; i++) {
    sum += freqData[i];
  }
  return sum / freqData.length / 255;
}

/**
 * Draw gradient background glow
 */
function drawBackgroundGlow(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
  section: string,
  intensity: number
): void {
  const color = getSectionColor(section);
  const pulseAlpha = 0.08 + Math.sin(time * 0.01) * 0.02 + intensity * 0.06;

  // Top gradient - pink to transparent
  const topGrad = ctx.createLinearGradient(0, 0, 0, height * 0.4);
  topGrad.addColorStop(0, `rgba(${COLORS.pink.r}, ${COLORS.pink.g}, ${COLORS.pink.b}, ${pulseAlpha * 1.2})`);
  topGrad.addColorStop(0.5, `rgba(${color.r}, ${color.g}, ${color.b}, ${pulseAlpha * 0.6})`);
  topGrad.addColorStop(1, 'transparent');
  ctx.fillStyle = topGrad;
  ctx.fillRect(0, 0, width, height * 0.4);

  // Bottom gradient - cyan to transparent
  const botGrad = ctx.createLinearGradient(0, height, 0, height * 0.6);
  botGrad.addColorStop(0, `rgba(${COLORS.cyan.r}, ${COLORS.cyan.g}, ${COLORS.cyan.b}, ${pulseAlpha})`);
  botGrad.addColorStop(1, 'transparent');
  ctx.fillStyle = botGrad;
  ctx.fillRect(0, height * 0.6, width, height * 0.4);
}

/**
 * Draw vaporwave perspective grid
 */
function drawPerspectiveGrid(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
  section: string
): void {
  const color = getSectionColor(section);
  const horizonY = height * 0.55;
  const vanishX = width / 2;

  ctx.save();
  ctx.globalAlpha = 0.15;
  ctx.strokeStyle = `rgb(${color.r}, ${color.g}, ${color.b})`;
  ctx.lineWidth = 1;

  // Vertical perspective lines
  const numLines = 16;
  for (let i = 0; i <= numLines; i++) {
    const t = i / numLines;
    const bottomX = t * width;

    ctx.beginPath();
    ctx.moveTo(vanishX, horizonY);
    ctx.lineTo(bottomX, height);
    ctx.stroke();
  }

  // Horizontal lines with perspective (moving effect)
  const offset = (time * 0.5) % 40;
  for (let i = 0; i < 12; i++) {
    const baseY = horizonY + (i * 40) + offset;
    if (baseY > height) continue;

    // Calculate perspective narrowing
    const progress = (baseY - horizonY) / (height - horizonY);
    const lineWidth = progress * width;
    const lineX = (width - lineWidth) / 2;

    ctx.globalAlpha = 0.1 + progress * 0.1;
    ctx.beginPath();
    ctx.moveTo(lineX, baseY);
    ctx.lineTo(lineX + lineWidth, baseY);
    ctx.stroke();
  }

  ctx.restore();
}

/**
 * Draw vaporwave sun/circle
 */
function drawVaporwaveSun(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
  intensity: number,
  section: string
): void {
  const color = getSectionColor(section);
  const centerX = width / 2;
  const centerY = height * 0.35;
  const baseRadius = Math.min(width, height) * 0.12;
  const radius = baseRadius + Math.sin(time * 0.015) * 5 + intensity * 15;

  // Outer glow
  const gradient = ctx.createRadialGradient(
    centerX, centerY, radius * 0.3,
    centerX, centerY, radius * 2
  );
  gradient.addColorStop(0, `rgba(${color.r}, ${color.g}, ${color.b}, 0.3)`);
  gradient.addColorStop(0.5, `rgba(${COLORS.pink.r}, ${COLORS.pink.g}, ${COLORS.pink.b}, 0.1)`);
  gradient.addColorStop(1, 'transparent');

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height * 0.6);

  // Main circle with horizontal bands
  ctx.save();
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  ctx.clip();

  // Pink to cyan gradient
  const sunGrad = ctx.createLinearGradient(centerX, centerY - radius, centerX, centerY + radius);
  sunGrad.addColorStop(0, `rgba(${COLORS.pink.r}, ${COLORS.pink.g}, ${COLORS.pink.b}, 0.4)`);
  sunGrad.addColorStop(0.5, `rgba(${COLORS.yellow.r}, ${COLORS.yellow.g}, ${COLORS.yellow.b}, 0.35)`);
  sunGrad.addColorStop(1, `rgba(${COLORS.cyan.r}, ${COLORS.cyan.g}, ${COLORS.cyan.b}, 0.4)`);

  ctx.fillStyle = sunGrad;
  ctx.fillRect(centerX - radius, centerY - radius, radius * 2, radius * 2);

  // Horizontal lines through sun
  ctx.globalAlpha = 0.3;
  ctx.fillStyle = `rgba(${COLORS.darkPurple.r}, ${COLORS.darkPurple.g}, ${COLORS.darkPurple.b}, 0.5)`;
  for (let i = 0; i < 8; i++) {
    const y = centerY + (i - 4) * (radius / 5) + Math.sin(time * 0.02 + i) * 2;
    const lineHeight = 2 + i * 0.5;
    ctx.fillRect(centerX - radius, y, radius * 2, lineHeight);
  }

  ctx.restore();
}

/**
 * Draw horizontal decorative bands
 */
function drawHorizontalBands(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number
): void {
  ctx.save();
  ctx.globalAlpha = 0.04;

  // Subtle horizontal scan lines
  const lineSpacing = 3;
  const offset = (time * 0.3) % lineSpacing;

  for (let y = offset; y < height; y += lineSpacing) {
    const alpha = 0.02 + Math.sin(y * 0.01 + time * 0.01) * 0.01;
    ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
    ctx.fillRect(0, y, width, 1);
  }

  ctx.restore();
}

/**
 * Draw minimalist frequency bars
 */
function drawMinimalistBars(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  freqData: Uint8Array<ArrayBuffer>,
  section: string
): void {
  const color = getSectionColor(section);
  const barCount = Math.min(16, freqData.length);
  const totalWidth = width * 0.4;
  const barWidth = totalWidth / barCount;
  const maxBarHeight = 40;
  const startX = (width - totalWidth) / 2;
  const baseY = height - 25;

  for (let i = 0; i < barCount; i++) {
    const amplitude = freqData[i] / 255;
    const barHeight = amplitude * maxBarHeight;

    // Gradient from pink to cyan
    const t = i / barCount;
    const barColor = lerpColor(COLORS.pink, COLORS.cyan, t);

    const alpha = 0.3 + amplitude * 0.5;
    ctx.fillStyle = `rgba(${barColor.r}, ${barColor.g}, ${barColor.b}, ${alpha})`;

    const x = startX + i * barWidth;
    const y = baseY - barHeight;

    // Simple rectangle with slight rounding
    ctx.beginPath();
    ctx.roundRect(x + 2, y, barWidth - 4, barHeight, 2);
    ctx.fill();

    // Glow effect
    if (amplitude > 0.4) {
      ctx.shadowColor = `rgba(${color.r}, ${color.g}, ${color.b}, 0.6)`;
      ctx.shadowBlur = 8;
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }
}

// Floating shape storage
const shapes: Array<{
  x: number;
  y: number;
  size: number;
  rotation: number;
  rotSpeed: number;
  type: 'triangle' | 'circle' | 'diamond';
  alpha: number;
  hue: number;
}> = [];

/**
 * Draw floating geometric shapes
 */
function drawFloatingShapes(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
  intensity: number
): void {
  // Initialize shapes if needed
  if (shapes.length === 0) {
    const shapeTypes: Array<'triangle' | 'circle' | 'diamond'> = ['triangle', 'circle', 'diamond'];
    for (let i = 0; i < 15; i++) {
      /* eslint-disable sonarjs/pseudo-random */
      shapes.push({
        x: Math.random() * width,
        y: Math.random() * height,
        size: 8 + Math.random() * 15,
        rotation: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 0.01,
        type: shapeTypes[Math.floor(Math.random() * 3)],
        alpha: 0.1 + Math.random() * 0.15,
        hue: 280 + Math.random() * 100, // Pink to cyan range
      });
      /* eslint-enable sonarjs/pseudo-random */
    }
  }

  for (const s of shapes) {
    // Slow drift movement
    s.x += Math.sin(time * 0.005 + s.y * 0.01) * 0.3;
    s.y -= 0.1 + intensity * 0.2;
    s.rotation += s.rotSpeed;

    // Wrap around
    if (s.y < -20) {
      s.y = height + 20;
      // eslint-disable-next-line sonarjs/pseudo-random
      s.x = Math.random() * width;
    }

    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(s.rotation);
    ctx.globalAlpha = s.alpha + Math.sin(time * 0.02) * 0.05;
    ctx.strokeStyle = `hsla(${s.hue}, 80%, 70%, 0.6)`;
    ctx.lineWidth = 1.5;

    ctx.beginPath();
    if (s.type === 'triangle') {
      const h = s.size * 0.866;
      ctx.moveTo(0, -h / 2);
      ctx.lineTo(-s.size / 2, h / 2);
      ctx.lineTo(s.size / 2, h / 2);
      ctx.closePath();
    } else if (s.type === 'circle') {
      ctx.arc(0, 0, s.size / 2, 0, Math.PI * 2);
    } else {
      // Diamond
      ctx.moveTo(0, -s.size / 2);
      ctx.lineTo(s.size / 2, 0);
      ctx.lineTo(0, s.size / 2);
      ctx.lineTo(-s.size / 2, 0);
      ctx.closePath();
    }
    ctx.stroke();

    ctx.restore();
  }
}

/**
 * Hook to apply vaporwave glow to nodes
 */
function useVaporwaveNodeGlow(
  cyInstance: CyCore | null | undefined,
  isActive: boolean,
  getCurrentSection: () => string
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
    let t = 0;

    const animate = (): void => {
      t += 1;
      const currentSection = getCurrentSection();
      const color = getSectionColor(currentSection);
      const pulseIntensity = 0.3 + Math.sin(t * 0.03) * 0.2;

      cy.batch(() => applyNodeGlow(cy, color, pulseIntensity));

      animationRef.current = window.requestAnimationFrame(animate);
    };

    animationRef.current = window.requestAnimationFrame(animate);

    return () => {
      window.cancelAnimationFrame(animationRef.current);
      cy.batch(() => restoreNodeStyles(cy, styles));
      styles.clear();
    };
  }, [isActive, cyInstance, getCurrentSection]);
}

/**
 * Vaporwave Mode Overlay
 */
export const VaporwaveMode: React.FC<VaporwaveModeProps> = ({
  isActive,
  onClose,
  onSwitchMode,
  modeName,
  cyInstance,
}) => {
  const [visible, setVisible] = useState(false);
  const audio = useVaporwaveAudio();

  // Apply vaporwave glow to nodes
  useVaporwaveNodeGlow(cyInstance, isActive, audio.getCurrentSection);

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
      <VaporwaveCanvas
        isActive={isActive}
        getFrequencyData={audio.getFrequencyData}
        getCurrentSection={audio.getCurrentSection}
      />

      {/* Control buttons - vaporwave style */}
      <div className="fixed inset-0 pointer-events-none z-[99999] flex items-end justify-center pb-8 gap-4">
        <button
          onClick={handleSwitch}
          className={`px-6 py-2.5 rounded-full pointer-events-auto transition-all duration-500 ${
            visible ? BTN_VISIBLE : BTN_HIDDEN
          }`}
          style={{
            background: 'linear-gradient(135deg, rgba(120, 129, 255, 0.8) 0%, rgba(185, 103, 255, 0.8) 100%)',
            border: BTN_BORDER,
            color: '#ffffff',
            cursor: 'pointer',
            backdropFilter: BTN_BLUR,
            fontSize: '14px',
            fontWeight: 600,
            textShadow: '0 0 10px rgba(185, 103, 255, 0.8)',
            boxShadow: '0 0 20px rgba(120, 129, 255, 0.5), inset 0 0 20px rgba(185, 103, 255, 0.1)',
          }}
          title={`Current: ${modeName}`}
        >
          S W I T C H
        </button>
        <MuteButton
          isMuted={audio.isMuted}
          onToggle={audio.toggleMute}
          visible={visible}
          unmutedBackground="linear-gradient(135deg, rgba(254, 255, 156, 0.8) 0%, rgba(255, 113, 206, 0.8) 100%)"
          unmutedShadow="0 0 20px rgba(254, 255, 156, 0.5), inset 0 0 20px rgba(255, 113, 206, 0.1)"
          borderColor="rgba(255, 255, 255, 0.4)"
        />
        <button
          onClick={handleClose}
          className={`px-6 py-2.5 rounded-full pointer-events-auto transition-all duration-500 ${
            visible ? BTN_VISIBLE : BTN_HIDDEN
          }`}
          style={{
            background: 'linear-gradient(135deg, rgba(255, 113, 206, 0.8) 0%, rgba(1, 205, 254, 0.8) 100%)',
            border: BTN_BORDER,
            color: '#ffffff',
            cursor: 'pointer',
            backdropFilter: BTN_BLUR,
            fontSize: '14px',
            fontWeight: 600,
            textShadow: '0 0 10px rgba(255, 113, 206, 0.8)',
            boxShadow: '0 0 20px rgba(1, 205, 254, 0.5), inset 0 0 20px rgba(255, 113, 206, 0.1)',
          }}
        >
          E X I T  V A P O R
        </button>
      </div>
    </>
  );
};
