/**
 * Nightcall Mode Component
 *
 * Retro 80s synthwave visualization with smooth purple gradients.
 * Dreamy, non-stressed aesthetic while keeping topology visible.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";

import { useNightcallAudio } from "../audio";
import { BTN_VISIBLE, BTN_HIDDEN, BTN_BLUR, lerpColor, useNodeGlow, MuteButton } from "../shared";
import type { RGBColor, BaseModeProps } from "../shared";

/** Retro synthwave color palette */
const COLORS = {
  purple: { r: 138, g: 43, b: 226 }, // Blue violet
  magenta: { r: 255, g: 0, b: 128 }, // Hot pink
  cyan: { r: 0, g: 255, b: 255 }, // Cyan
  darkPurple: { r: 48, g: 25, b: 88 }, // Dark purple
  pink: { r: 255, g: 105, b: 180 } // Hot pink
};

/** Chord to color mapping */
const CHORD_COLORS: Record<string, RGBColor> = {
  Am: COLORS.purple,
  GB: COLORS.cyan,
  F: COLORS.magenta,
  Dm: COLORS.pink
};

/**
 * Get color for current chord
 */
function getChordColor(chord: string): RGBColor {
  return CHORD_COLORS[chord] || COLORS.purple;
}

/**
 * Nightcall Canvas - Retro synthwave visualization
 */
const NightcallCanvas: React.FC<{
  isActive: boolean;
  getFrequencyData: () => Uint8Array<ArrayBuffer>;
  getBeatIntensity: () => number;
  getCurrentChord: () => string;
}> = ({ isActive, getFrequencyData, getBeatIntensity, getCurrentChord }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);
  const timeRef = useRef<number>(0);
  const prevChordRef = useRef<string>("Am");
  const colorTransitionRef = useRef<number>(1);

  useEffect(() => {
    if (!isActive) return undefined;

    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;

    const updateSize = (): void => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    updateSize();
    window.addEventListener("resize", updateSize);

    timeRef.current = 0;

    const animate = (): void => {
      const width = canvas.width;
      const height = canvas.height;
      timeRef.current += 1;
      const time = timeRef.current;

      const freqData = getFrequencyData();
      const beatIntensity = getBeatIntensity();
      const currentChord = getCurrentChord();

      // Handle color transitions between chords
      if (currentChord !== prevChordRef.current) {
        prevChordRef.current = currentChord;
        colorTransitionRef.current = 0;
      }
      colorTransitionRef.current = Math.min(1, colorTransitionRef.current + 0.02);

      // Clear canvas
      ctx.clearRect(0, 0, width, height);

      // Draw retro sun glow (bottom center, subtle)
      drawRetroSunGlow(ctx, width, height, beatIntensity, time, currentChord);

      // Draw horizontal scan lines (very subtle)
      drawScanLines(ctx, width, height, time);

      // Draw smooth edge glow
      drawSmoothEdgeGlow(ctx, width, height, beatIntensity, currentChord);

      // Draw frequency visualizer (subtle bars at bottom)
      drawFrequencyBars(ctx, width, height, freqData, beatIntensity, currentChord);

      // Draw floating particles
      drawFloatingParticles(ctx, width, height, time, beatIntensity);

      animationRef.current = window.requestAnimationFrame(animate);
    };

    animationRef.current = window.requestAnimationFrame(animate);

    return () => {
      window.removeEventListener("resize", updateSize);
      window.cancelAnimationFrame(animationRef.current);
    };
  }, [isActive, getFrequencyData, getBeatIntensity, getCurrentChord]);

  if (!isActive) return null;

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-[99998]"
      style={{ width: "100%", height: "100%" }}
    />
  );
};

/**
 * Draw retro sun glow effect
 */
function drawRetroSunGlow(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  intensity: number,
  time: number,
  chord: string
): void {
  const color = getChordColor(chord);
  const centerX = width / 2;
  const centerY = height + 100; // Below screen for subtle glow
  const baseRadius = height * 0.8;
  const pulseRadius = baseRadius + Math.sin(time * 0.02) * 20 + intensity * 30;

  // Outer glow
  const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, pulseRadius);

  const alpha = 0.08 + intensity * 0.06;
  gradient.addColorStop(0, `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha * 1.5})`);
  gradient.addColorStop(0.3, `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha})`);
  gradient.addColorStop(
    0.6,
    `rgba(${COLORS.darkPurple.r}, ${COLORS.darkPurple.g}, ${COLORS.darkPurple.b}, ${alpha * 0.5})`
  );
  gradient.addColorStop(1, "transparent");

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}

/**
 * Draw subtle scan lines for retro CRT effect
 */
function drawScanLines(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number
): void {
  ctx.save();
  ctx.globalAlpha = 0.03;

  const lineSpacing = 4;
  const offset = (time * 0.5) % lineSpacing;

  ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
  ctx.lineWidth = 1;

  for (let y = offset; y < height; y += lineSpacing) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  ctx.restore();
}

/**
 * Draw smooth gradient edge glow
 */
function drawSmoothEdgeGlow(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  intensity: number,
  chord: string
): void {
  const color = getChordColor(chord);
  const glowSize = 120 + intensity * 40;
  const alpha = 0.15 + intensity * 0.1;

  // Top edge - purple to transparent
  const topGrad = ctx.createLinearGradient(0, 0, 0, glowSize);
  topGrad.addColorStop(
    0,
    `rgba(${COLORS.purple.r}, ${COLORS.purple.g}, ${COLORS.purple.b}, ${alpha})`
  );
  topGrad.addColorStop(1, "transparent");
  ctx.fillStyle = topGrad;
  ctx.fillRect(0, 0, width, glowSize);

  // Bottom edge - chord color
  const botGrad = ctx.createLinearGradient(0, height, 0, height - glowSize);
  botGrad.addColorStop(0, `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha * 0.8})`);
  botGrad.addColorStop(1, "transparent");
  ctx.fillStyle = botGrad;
  ctx.fillRect(0, height - glowSize, width, glowSize);

  // Left edge - cyan accent
  const leftGrad = ctx.createLinearGradient(0, 0, glowSize * 0.7, 0);
  leftGrad.addColorStop(
    0,
    `rgba(${COLORS.cyan.r}, ${COLORS.cyan.g}, ${COLORS.cyan.b}, ${alpha * 0.5})`
  );
  leftGrad.addColorStop(1, "transparent");
  ctx.fillStyle = leftGrad;
  ctx.fillRect(0, 0, glowSize * 0.7, height);

  // Right edge - magenta accent
  const rightGrad = ctx.createLinearGradient(width, 0, width - glowSize * 0.7, 0);
  rightGrad.addColorStop(
    0,
    `rgba(${COLORS.magenta.r}, ${COLORS.magenta.g}, ${COLORS.magenta.b}, ${alpha * 0.5})`
  );
  rightGrad.addColorStop(1, "transparent");
  ctx.fillStyle = rightGrad;
  ctx.fillRect(width - glowSize * 0.7, 0, glowSize * 0.7, height);
}

/**
 * Draw smooth frequency bars at bottom
 */
function drawFrequencyBars(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  freqData: Uint8Array<ArrayBuffer>,
  _intensity: number,
  chord: string
): void {
  const barCount = Math.min(24, freqData.length);
  const totalWidth = width * 0.5;
  const barWidth = totalWidth / barCount;
  const maxBarHeight = 50;
  const startX = (width - totalWidth) / 2;
  const baseY = height - 30;

  const color = getChordColor(chord);

  for (let i = 0; i < barCount; i++) {
    const amplitude = freqData[i] / 255;
    const barHeight = amplitude * maxBarHeight;

    // Gradient from chord color to purple
    const t = i / barCount;
    const barColor = lerpColor(COLORS.cyan, color, t);

    const alpha = 0.4 + amplitude * 0.4;
    ctx.fillStyle = `rgba(${barColor.r}, ${barColor.g}, ${barColor.b}, ${alpha})`;

    const x = startX + i * barWidth;
    const y = baseY - barHeight;

    // Rounded rectangle
    const radius = 2;
    ctx.beginPath();
    ctx.roundRect(x + 1, y, barWidth - 2, barHeight, radius);
    ctx.fill();

    // Glow on high amplitude
    if (amplitude > 0.5) {
      ctx.shadowColor = `rgba(${barColor.r}, ${barColor.g}, ${barColor.b}, 0.8)`;
      ctx.shadowBlur = 10;
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }
}

// Particle storage
const particles: Array<{
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  hue: number;
}> = [];

/**
 * Draw floating ambient particles
 */
function drawFloatingParticles(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
  intensity: number
): void {
  // Initialize particles if needed (visual effect, not security-sensitive)
  if (particles.length === 0) {
    for (let i = 0; i < 30; i++) {
      /* eslint-disable sonarjs/pseudo-random */
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.3,
        vy: -0.2 - Math.random() * 0.3,
        size: 1 + Math.random() * 2,
        alpha: 0.2 + Math.random() * 0.3,
        hue: 260 + Math.random() * 60 // Purple to pink range
      });
      /* eslint-enable sonarjs/pseudo-random */
    }
  }

  for (const p of particles) {
    // Update position
    p.x += p.vx + Math.sin(time * 0.01 + p.y * 0.01) * 0.2;
    p.y += p.vy;

    // Wrap around
    if (p.y < -10) {
      p.y = height + 10;
      // eslint-disable-next-line sonarjs/pseudo-random
      p.x = Math.random() * width;
    }
    if (p.x < -10) p.x = width + 10;
    if (p.x > width + 10) p.x = -10;

    // Draw particle with glow
    const pulseAlpha = p.alpha + Math.sin(time * 0.05 + p.x * 0.01) * 0.1;
    const finalAlpha = pulseAlpha + intensity * 0.2;

    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fillStyle = `hsla(${p.hue}, 80%, 70%, ${finalAlpha})`;
    ctx.fill();

    // Subtle glow
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * 3, 0, Math.PI * 2);
    ctx.fillStyle = `hsla(${p.hue}, 80%, 70%, ${finalAlpha * 0.2})`;
    ctx.fill();
  }
}

/**
 * Nightcall Mode Overlay
 */
export const NightcallMode: React.FC<BaseModeProps> = ({
  isActive,
  onClose,
  onSwitchMode,
  modeName
}) => {
  const [visible, setVisible] = useState(false);
  const audio = useNightcallAudio();

  // Get color and intensity for node glow
  const getColor = useCallback((): RGBColor => {
    return getChordColor(audio.getCurrentChord());
  }, [audio]);

  const getIntensity = useCallback((): number => {
    return audio.getBeatIntensity() * 0.5 + 0.3;
  }, [audio]);

  // Apply synthwave glow to nodes via canvas store
  useNodeGlow(isActive, getColor, getIntensity);

  // Start audio when activated
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
      <NightcallCanvas
        isActive={isActive}
        getFrequencyData={audio.getFrequencyData}
        getBeatIntensity={audio.getBeatIntensity}
        getCurrentChord={audio.getCurrentChord}
      />

      {/* Control buttons - retro style */}
      <div className="fixed inset-0 pointer-events-none z-[99999] flex items-end justify-center pb-8 gap-4">
        <button
          onClick={handleSwitch}
          className={`px-6 py-2.5 rounded-full pointer-events-auto transition-all duration-500 ${
            visible ? BTN_VISIBLE : BTN_HIDDEN
          }`}
          style={{
            background:
              "linear-gradient(135deg, rgba(0, 255, 255, 0.6) 0%, rgba(138, 43, 226, 0.6) 100%)",
            border: "2px solid rgba(255, 0, 128, 0.5)",
            color: "#ff0080",
            cursor: "pointer",
            backdropFilter: BTN_BLUR,
            fontSize: "14px",
            fontWeight: 600,
            textShadow: "0 0 10px rgba(255, 0, 128, 0.8)",
            boxShadow: "0 0 20px rgba(0, 255, 255, 0.5), inset 0 0 20px rgba(255, 0, 128, 0.1)"
          }}
          title={`Current: ${modeName}`}
        >
          Switch
        </button>
        <MuteButton
          isMuted={audio.isMuted}
          onToggle={audio.toggleMute}
          visible={visible}
          unmutedBackground="linear-gradient(135deg, rgba(255, 0, 128, 0.8) 0%, rgba(0, 255, 255, 0.8) 100%)"
          unmutedShadow="0 0 20px rgba(255, 0, 128, 0.5), inset 0 0 20px rgba(0, 255, 255, 0.1)"
          borderColor="rgba(255, 0, 128, 0.5)"
        />
        <button
          onClick={handleClose}
          className={`px-6 py-2.5 rounded-full pointer-events-auto transition-all duration-500 ${
            visible ? BTN_VISIBLE : BTN_HIDDEN
          }`}
          style={{
            background:
              "linear-gradient(135deg, rgba(138, 43, 226, 0.8) 0%, rgba(255, 0, 128, 0.8) 100%)",
            border: "2px solid rgba(0, 255, 255, 0.5)",
            color: "#00ffff",
            cursor: "pointer",
            backdropFilter: BTN_BLUR,
            fontSize: "14px",
            fontWeight: 600,
            textShadow: "0 0 10px rgba(0, 255, 255, 0.8)",
            boxShadow: "0 0 20px rgba(138, 43, 226, 0.5), inset 0 0 20px rgba(0, 255, 255, 0.1)"
          }}
        >
          End Nightcall
        </button>
      </div>
    </>
  );
};
