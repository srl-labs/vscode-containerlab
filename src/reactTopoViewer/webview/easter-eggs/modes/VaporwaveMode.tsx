/**
 * Vaporwave Mode Component
 *
 * Classic vaporwave aesthetic with pink/cyan gradients,
 * perspective grid, and dreamy smooth jazz vibes.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import Box from "@mui/material/Box";

import { useVaporwaveAudio } from "../audio";
import {
  BTN_VISIBLE_SX,
  BTN_HIDDEN_SX,
  BTN_BLUR,
  lerpColor,
  useNodeGlow,
  MuteButton
} from "../shared";
import type { RGBColor, BaseModeProps } from "../shared";

const BTN_BORDER = "2px solid rgba(255, 255, 255, 0.4)";

const COLORS = {
  pink: { r: 255, g: 113, b: 206 },
  cyan: { r: 1, g: 205, b: 254 },
  purple: { r: 185, g: 103, b: 255 },
  yellow: { r: 254, g: 255, b: 156 },
  blue: { r: 120, g: 129, b: 255 },
  darkPurple: { r: 25, g: 4, b: 50 }
};

const SECTION_COLORS: Record<string, RGBColor> = {
  em7: COLORS.pink,
  bm: COLORS.cyan,
  em: COLORS.purple,
  csm7: COLORS.yellow,
  a: COLORS.blue
};

function getSectionColor(section: string): RGBColor {
  return SECTION_COLORS[section] || COLORS.cyan;
}

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
      const currentSection = getCurrentSection();
      const avgIntensity = getAverageIntensity(freqData);

      ctx.clearRect(0, 0, width, height);

      drawBackgroundGlow(ctx, width, height, time, currentSection, avgIntensity);
      drawPerspectiveGrid(ctx, width, height, time, currentSection);
      drawVaporwaveSun(ctx, width, height, time, avgIntensity, currentSection);
      drawHorizontalBands(ctx, width, height, time);
      drawMinimalistBars(ctx, width, height, freqData, currentSection);
      drawFloatingShapes(ctx, width, height, time, avgIntensity);

      animationRef.current = window.requestAnimationFrame(animate);
    };

    animationRef.current = window.requestAnimationFrame(animate);

    return () => {
      window.removeEventListener("resize", updateSize);
      window.cancelAnimationFrame(animationRef.current);
    };
  }, [isActive, getFrequencyData, getCurrentSection]);

  if (!isActive) return null;

  return (
    <Box
      component="canvas"
      ref={canvasRef}
      sx={{
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        zIndex: 99998,
        width: "100%",
        height: "100%"
      }}
    />
  );
};

function getAverageIntensity(freqData: Uint8Array<ArrayBuffer>): number {
  if (freqData.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < freqData.length; i++) {
    sum += freqData[i];
  }
  return sum / freqData.length / 255;
}

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

  const topGrad = ctx.createLinearGradient(0, 0, 0, height * 0.4);
  topGrad.addColorStop(
    0,
    `rgba(${COLORS.pink.r}, ${COLORS.pink.g}, ${COLORS.pink.b}, ${pulseAlpha * 1.2})`
  );
  topGrad.addColorStop(0.5, `rgba(${color.r}, ${color.g}, ${color.b}, ${pulseAlpha * 0.6})`);
  topGrad.addColorStop(1, "transparent");
  ctx.fillStyle = topGrad;
  ctx.fillRect(0, 0, width, height * 0.4);

  const botGrad = ctx.createLinearGradient(0, height, 0, height * 0.6);
  botGrad.addColorStop(
    0,
    `rgba(${COLORS.cyan.r}, ${COLORS.cyan.g}, ${COLORS.cyan.b}, ${pulseAlpha})`
  );
  botGrad.addColorStop(1, "transparent");
  ctx.fillStyle = botGrad;
  ctx.fillRect(0, height * 0.6, width, height * 0.4);
}

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

  const numLines = 16;
  for (let i = 0; i <= numLines; i++) {
    const t = i / numLines;
    const bottomX = t * width;

    ctx.beginPath();
    ctx.moveTo(vanishX, horizonY);
    ctx.lineTo(bottomX, height);
    ctx.stroke();
  }

  const offset = (time * 0.5) % 40;
  for (let i = 0; i < 12; i++) {
    const baseY = horizonY + i * 40 + offset;
    if (baseY > height) continue;

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

  const gradient = ctx.createRadialGradient(
    centerX,
    centerY,
    radius * 0.3,
    centerX,
    centerY,
    radius * 2
  );
  gradient.addColorStop(0, `rgba(${color.r}, ${color.g}, ${color.b}, 0.3)`);
  gradient.addColorStop(0.5, `rgba(${COLORS.pink.r}, ${COLORS.pink.g}, ${COLORS.pink.b}, 0.1)`);
  gradient.addColorStop(1, "transparent");

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height * 0.6);

  ctx.save();
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  ctx.clip();

  const sunGrad = ctx.createLinearGradient(centerX, centerY - radius, centerX, centerY + radius);
  sunGrad.addColorStop(0, `rgba(${COLORS.pink.r}, ${COLORS.pink.g}, ${COLORS.pink.b}, 0.4)`);
  sunGrad.addColorStop(
    0.5,
    `rgba(${COLORS.yellow.r}, ${COLORS.yellow.g}, ${COLORS.yellow.b}, 0.35)`
  );
  sunGrad.addColorStop(1, `rgba(${COLORS.cyan.r}, ${COLORS.cyan.g}, ${COLORS.cyan.b}, 0.4)`);

  ctx.fillStyle = sunGrad;
  ctx.fillRect(centerX - radius, centerY - radius, radius * 2, radius * 2);

  ctx.globalAlpha = 0.3;
  ctx.fillStyle = `rgba(${COLORS.darkPurple.r}, ${COLORS.darkPurple.g}, ${COLORS.darkPurple.b}, 0.5)`;
  for (let i = 0; i < 8; i++) {
    const y = centerY + (i - 4) * (radius / 5) + Math.sin(time * 0.02 + i) * 2;
    const lineHeight = 2 + i * 0.5;
    ctx.fillRect(centerX - radius, y, radius * 2, lineHeight);
  }

  ctx.restore();
}

function drawHorizontalBands(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number
): void {
  ctx.save();
  ctx.globalAlpha = 0.04;

  const lineSpacing = 3;
  const offset = (time * 0.3) % lineSpacing;

  for (let y = offset; y < height; y += lineSpacing) {
    const alpha = 0.02 + Math.sin(y * 0.01 + time * 0.01) * 0.01;
    ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
    ctx.fillRect(0, y, width, 1);
  }

  ctx.restore();
}

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

    const t = i / barCount;
    const barColor = lerpColor(COLORS.pink, COLORS.cyan, t);

    const alpha = 0.3 + amplitude * 0.5;
    ctx.fillStyle = `rgba(${barColor.r}, ${barColor.g}, ${barColor.b}, ${alpha})`;

    const x = startX + i * barWidth;
    const y = baseY - barHeight;

    ctx.beginPath();
    ctx.roundRect(x + 2, y, barWidth - 4, barHeight, 2);
    ctx.fill();

    if (amplitude > 0.4) {
      ctx.shadowColor = `rgba(${color.r}, ${color.g}, ${color.b}, 0.6)`;
      ctx.shadowBlur = 8;
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }
}

const shapes: Array<{
  x: number;
  y: number;
  size: number;
  rotation: number;
  rotSpeed: number;
  type: "triangle" | "circle" | "diamond";
  alpha: number;
  hue: number;
}> = [];

function drawFloatingShapes(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
  intensity: number
): void {
  if (shapes.length === 0) {
    const shapeTypes: Array<"triangle" | "circle" | "diamond"> = ["triangle", "circle", "diamond"];
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
        hue: 280 + Math.random() * 100
      });
      /* eslint-enable sonarjs/pseudo-random */
    }
  }

  for (const s of shapes) {
    s.x += Math.sin(time * 0.005 + s.y * 0.01) * 0.3;
    s.y -= 0.1 + intensity * 0.2;
    s.rotation += s.rotSpeed;

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
    if (s.type === "triangle") {
      const h = s.size * 0.866;
      ctx.moveTo(0, -h / 2);
      ctx.lineTo(-s.size / 2, h / 2);
      ctx.lineTo(s.size / 2, h / 2);
      ctx.closePath();
    } else if (s.type === "circle") {
      ctx.arc(0, 0, s.size / 2, 0, Math.PI * 2);
    } else {
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

export const VaporwaveMode: React.FC<BaseModeProps> = ({
  isActive,
  onClose,
  onSwitchMode,
  modeName
}) => {
  const [visible, setVisible] = useState(false);
  const audio = useVaporwaveAudio();
  const timeRef = useRef(0);

  const getColor = useCallback((): RGBColor => {
    return getSectionColor(audio.getCurrentSection());
  }, [audio]);

  const getIntensity = useCallback((): number => {
    timeRef.current += 1;
    return 0.3 + Math.sin(timeRef.current * 0.03) * 0.2;
  }, []);

  useNodeGlow(isActive, getColor, getIntensity);

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
      <VaporwaveCanvas
        isActive={isActive}
        getFrequencyData={audio.getFrequencyData}
        getCurrentSection={audio.getCurrentSection}
      />

      <Box
        sx={{
          position: "fixed",
          inset: 0,
          pointerEvents: "none",
          zIndex: 99999,
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "center",
          pb: 4,
          gap: 2
        }}
      >
        <Box
          component="button"
          onClick={handleSwitch}
          sx={{
            px: 3,
            py: 1.25,
            borderRadius: "9999px",
            pointerEvents: "auto",
            transition: "all 0.5s",
            ...(visible ? BTN_VISIBLE_SX : BTN_HIDDEN_SX),
            background:
              "linear-gradient(135deg, rgba(120, 129, 255, 0.8) 0%, rgba(185, 103, 255, 0.8) 100%)",
            border: BTN_BORDER,
            color: "#ffffff",
            cursor: "pointer",
            backdropFilter: BTN_BLUR,
            fontSize: "14px",
            fontWeight: 600,
            textShadow: "0 0 10px rgba(185, 103, 255, 0.8)",
            boxShadow: "0 0 20px rgba(120, 129, 255, 0.5), inset 0 0 20px rgba(185, 103, 255, 0.1)"
          }}
          title={`Current: ${modeName}`}
        >
          S W I T C H
        </Box>
        <MuteButton
          isMuted={audio.isMuted}
          onToggle={audio.toggleMute}
          visible={visible}
          unmutedBackground="linear-gradient(135deg, rgba(254, 255, 156, 0.8) 0%, rgba(255, 113, 206, 0.8) 100%)"
          unmutedShadow="0 0 20px rgba(254, 255, 156, 0.5), inset 0 0 20px rgba(255, 113, 206, 0.1)"
          borderColor="rgba(255, 255, 255, 0.4)"
        />
        <Box
          component="button"
          onClick={handleClose}
          sx={{
            px: 3,
            py: 1.25,
            borderRadius: "9999px",
            pointerEvents: "auto",
            transition: "all 0.5s",
            ...(visible ? BTN_VISIBLE_SX : BTN_HIDDEN_SX),
            background:
              "linear-gradient(135deg, rgba(255, 113, 206, 0.8) 0%, rgba(1, 205, 254, 0.8) 100%)",
            border: BTN_BORDER,
            color: "#ffffff",
            cursor: "pointer",
            backdropFilter: BTN_BLUR,
            fontSize: "14px",
            fontWeight: 600,
            textShadow: "0 0 10px rgba(255, 113, 206, 0.8)",
            boxShadow: "0 0 20px rgba(1, 205, 254, 0.5), inset 0 0 20px rgba(255, 113, 206, 0.1)"
          }}
        >
          E X I T V A P O R
        </Box>
      </Box>
    </>
  );
};
