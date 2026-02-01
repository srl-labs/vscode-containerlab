/**
 * Deus Ex Mode Component
 *
 * Silent easter egg with 3D rotating containerlab logo.
 * Inspired by the iconic Deus Ex main menu logo animation.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";

import { lerpColor, useNodeGlow } from "../shared";
import type { RGBColor, BaseModeProps } from "../shared";

/** Deus Ex color palette with neon accents */
const COLORS: Record<string, RGBColor> = {
  silver: { r: 192, g: 192, b: 192 },
  chrome: { r: 220, g: 220, b: 225 },
  steel: { r: 113, g: 121, b: 126 },
  dark: { r: 15, g: 18, b: 22 },
  highlight: { r: 255, g: 255, b: 255 },
  cyan: { r: 0, g: 255, b: 255 },
  magenta: { r: 255, g: 0, b: 255 }
};

/** Containerlab SVG content with original blue water/bubbles */
const CONTAINERLAB_SVG_CONTENT = `<?xml version="1.0" encoding="utf-8"?>
<svg viewBox="240.742 -24.784 81.8 87.413" xmlns="http://www.w3.org/2000/svg">
  <path data-name="containerlab export white ink-liquid" d="M 273.942 26.829 C 273.542 27.029 272.642 27.529 271.942 28.029 C 270.742 28.929 269.242 29.229 267.342 28.729 C 266.042 28.429 265.942 28.729 266.842 30.829 C 272.542 43.229 289.942 43.729 296.042 31.629 C 297.442 28.929 297.242 28.429 295.342 28.929 C 293.742 29.329 292.642 29.129 291.042 27.929 C 288.942 26.329 286.142 26.329 284.642 27.929 C 283.142 29.529 280.042 29.429 278.242 27.729 C 277.242 26.729 275.142 26.329 273.942 26.829" style="fill: rgb(30, 144, 255); stroke-width: 0px;"/>
  <path d="M 317.642 -9.571 L 309.842 -13.971 L 292.442 -24.071 C 290.742 -25.071 288.842 -24.971 287.142 -24.071 C 285.542 -23.071 284.542 -21.371 284.542 -19.471 L 284.842 -3.071 L 284.842 1.529 C 284.842 1.529 284.842 3.529 284.842 3.529 C 284.842 4.229 285.342 4.929 286.042 5.129 C 294.542 7.329 300.742 15.229 300.742 23.729 C 300.742 32.229 292.142 42.929 281.542 42.929 C 270.942 42.929 262.342 34.329 262.342 23.729 C 262.342 13.129 267.742 7.929 275.742 5.429 L 277.342 5.029 C 278.142 4.929 278.742 4.229 278.742 3.429 L 278.742 0.629 C 278.742 0.629 278.742 -1.571 278.742 -1.571 L 278.742 -19.571 C 278.742 -21.471 277.742 -23.171 276.142 -24.071 C 274.542 -24.971 272.542 -24.971 270.942 -24.071 L 263.342 -19.671 L 245.642 -9.471 C 242.642 -7.671 240.742 -4.471 240.742 -0.971 L 240.742 34.929 C 240.742 38.429 242.642 41.729 245.642 43.429 L 276.742 61.329 C 278.242 62.229 279.942 62.629 281.642 62.629 C 283.342 62.629 285.042 62.229 286.542 61.329 L 317.642 43.429 C 320.642 41.629 322.542 38.429 322.542 34.929 L 322.542 -0.971 C 322.542 -4.471 320.642 -7.771 317.642 -9.471 L 317.642 -9.571 Z M 319.342 34.929 C 319.342 37.229 318.042 39.429 316.042 40.629 L 284.942 58.529 C 282.942 59.729 280.342 59.729 278.342 58.529 L 247.242 40.629 C 245.242 39.429 243.942 37.229 243.942 34.929 L 243.942 -0.971 C 243.942 -3.271 245.242 -5.471 247.242 -6.671 L 260.242 -14.171 L 272.442 -21.271 C 273.342 -21.771 274.142 -21.471 274.442 -21.271 C 274.742 -21.071 275.442 -20.571 275.442 -19.571 L 275.442 2.029 C 275.442 2.029 274.942 2.129 274.942 2.229 C 265.542 5.129 259.142 13.829 259.142 23.729 C 259.142 33.629 269.242 46.229 281.642 46.229 C 294.042 46.229 304.142 36.129 304.142 23.729 C 304.142 11.329 297.642 5.329 288.242 2.329 L 288.242 -3.071 C 288.242 -3.071 287.942 -19.471 287.942 -19.471 C 287.942 -20.471 288.642 -20.971 288.942 -21.171 C 289.242 -21.371 290.042 -21.671 290.942 -21.171 L 308.342 -11.071 L 316.142 -6.671 C 318.142 -5.471 319.442 -3.271 319.442 -0.971 L 319.442 34.929 L 319.342 34.929 Z" style="stroke-width: 1px; fill: rgb(192, 192, 192);"/>
  <circle cx="283.442" cy="23.429" r="1.7" style="fill: none; stroke: rgb(30, 144, 255); stroke-miterlimit: 10; stroke-width: 0.8px;"/>
  <circle cx="275.842" cy="19.529" r="2.4" style="fill: none; stroke: rgb(30, 144, 255); stroke-miterlimit: 10; stroke-width: 0.8px;"/>
  <circle cx="280.642" cy="11.229" r="3.4" style="fill: none; stroke: rgb(30, 144, 255); stroke-miterlimit: 10; stroke-width: 0.8px;"/>
</svg>`;

const CONTAINERLAB_SVG = "data:image/svg+xml," + encodeURIComponent(CONTAINERLAB_SVG_CONTENT);

/**
 * Deus Ex Canvas - 3D rotating logo
 */
const DeusExCanvas: React.FC<{
  isActive: boolean;
  getRotationAngle: () => number;
}> = ({ isActive, getRotationAngle }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);
  const logoRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    if (!isActive) return undefined;

    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;

    // Load logo image
    const logo = new window.Image();
    logo.src = CONTAINERLAB_SVG;
    logoRef.current = logo;

    const dpr = window.devicePixelRatio || 1;

    const updateSize = (): void => {
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    updateSize();
    window.addEventListener("resize", updateSize);

    const animate = (): void => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      const rotationAngle = getRotationAngle();

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const colorT = (Math.sin(rotationAngle * 0.5) + 1) / 2;
      const glowColor = lerpColor(COLORS.cyan, COLORS.magenta, colorT);

      drawRotatingLogo(ctx, width, height, rotationAngle, logoRef.current);
      drawLogoGlow(ctx, width, height, rotationAngle, glowColor);

      animationRef.current = window.requestAnimationFrame(animate);
    };

    logo.onload = () => {
      animationRef.current = window.requestAnimationFrame(animate);
    };

    logo.onerror = () => {
      animationRef.current = window.requestAnimationFrame(animate);
    };

    return () => {
      window.removeEventListener("resize", updateSize);
      window.cancelAnimationFrame(animationRef.current);
    };
  }, [isActive, getRotationAngle]);

  if (!isActive) return null;

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-[99998]"
      style={{ width: "100%", height: "100%" }}
    />
  );
};

function drawRotatingLogo(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  angle: number,
  logo: HTMLImageElement | null
): void {
  if (!logo || !logo.complete) return;

  const centerX = width / 2;
  const centerY = height * 0.35;

  const baseSize = Math.min(width, height) * 0.22;
  const aspectRatio = 81.8 / 87.413;
  const logoWidth = baseSize * aspectRatio;
  const logoHeight = baseSize;

  const scaleX = Math.cos(angle);
  const absScaleX = Math.abs(scaleX);
  const sinAngle = Math.sin(angle);

  const extrusionDepth = 15;
  const numLayers = 15;

  ctx.save();
  ctx.translate(centerX, centerY);

  const isBackFace = scaleX < 0;

  for (let i = numLayers - 1; i >= 0; i--) {
    const t = i / numLayers;
    const xOffset = sinAngle * extrusionDepth * t;

    ctx.save();
    ctx.translate(xOffset, 0);
    ctx.scale(scaleX, 1);

    const brightness = 0.3 + (1 - t) * 0.7;
    const alpha = (0.2 + (1 - t) * 0.2) * absScaleX + 0.05;

    ctx.globalAlpha = alpha;

    if (isBackFace) {
      ctx.filter = `brightness(${brightness * 0.6})`;
    } else {
      ctx.filter = `brightness(${brightness})`;
    }

    ctx.drawImage(logo, -logoWidth / 2, -logoHeight / 2, logoWidth, logoHeight);
    ctx.restore();
  }

  ctx.restore();
}

function drawLogoGlow(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  angle: number,
  color: RGBColor
): void {
  const centerX = width / 2;
  const centerY = height * 0.35;
  const glowSize = Math.min(width, height) * 0.25;

  const intensity = 0.15 + Math.abs(Math.sin(angle)) * 0.1;

  const gradient = ctx.createRadialGradient(
    centerX,
    centerY,
    glowSize * 0.2,
    centerX,
    centerY,
    glowSize * 1.2
  );

  gradient.addColorStop(0, `rgba(${color.r}, ${color.g}, ${color.b}, ${intensity})`);
  gradient.addColorStop(0.4, `rgba(${color.r}, ${color.g}, ${color.b}, ${intensity * 0.5})`);
  gradient.addColorStop(1, "transparent");

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}

export const DeusExMode: React.FC<BaseModeProps> = ({
  isActive,
  onClose,
  onSwitchMode,
  modeName
}) => {
  const [visible, setVisible] = useState(false);
  const timeRef = useRef<number>(0);
  const animationRef = useRef<number>(0);

  const getRotationAngle = useCallback((): number => {
    return timeRef.current * 0.5;
  }, []);

  const getColor = useCallback((): RGBColor => {
    const angle = getRotationAngle();
    const colorT = (Math.sin(angle * 0.5) + 1) / 2;
    return lerpColor(COLORS.cyan, COLORS.magenta, colorT);
  }, [getRotationAngle]);

  const getIntensity = useCallback((): number => {
    const angle = getRotationAngle();
    return 0.3 + Math.abs(Math.sin(angle)) * 0.5;
  }, [getRotationAngle]);

  useNodeGlow(isActive, getColor, getIntensity);

  useEffect(() => {
    if (isActive) {
      setVisible(true);
      timeRef.current = 0;

      const animate = (): void => {
        timeRef.current += 0.016;
        animationRef.current = window.requestAnimationFrame(animate);
      };

      animationRef.current = window.requestAnimationFrame(animate);

      return () => {
        window.cancelAnimationFrame(animationRef.current);
      };
    } else {
      setVisible(false);
      return undefined;
    }
  }, [isActive]);

  const handleClose = (): void => {
    onClose?.();
  };

  const handleSwitch = (): void => {
    onSwitchMode?.();
  };

  if (!isActive) return null;

  return (
    <>
      <DeusExCanvas isActive={isActive} getRotationAngle={getRotationAngle} />

      <div className="fixed inset-0 pointer-events-none z-[99999] flex items-end justify-center pb-8 gap-4">
        <button
          onClick={handleSwitch}
          className={`px-6 py-2.5 rounded-full pointer-events-auto transition-all duration-500 ${
            visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
          }`}
          style={{
            background:
              "linear-gradient(135deg, rgba(113, 121, 126, 0.4) 0%, rgba(70, 75, 80, 0.4) 100%)",
            border: "2px solid rgba(192, 192, 192, 0.5)",
            color: "#c0c0c0",
            cursor: "pointer",
            backdropFilter: "blur(10px)",
            fontSize: "14px",
            fontWeight: 600,
            textShadow: "0 0 10px rgba(220, 220, 225, 0.8)",
            boxShadow: "0 0 20px rgba(113, 121, 126, 0.3), inset 0 0 20px rgba(192, 192, 192, 0.1)"
          }}
          title={`Current: ${modeName}`}
        >
          Switch
        </button>
        <button
          onClick={handleClose}
          className={`px-6 py-2.5 rounded-full pointer-events-auto transition-all duration-500 ${
            visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
          }`}
          style={{
            background:
              "linear-gradient(135deg, rgba(192, 192, 192, 0.7) 0%, rgba(113, 121, 126, 0.7) 100%)",
            border: "2px solid rgba(220, 220, 225, 0.5)",
            color: "#dcdce1",
            cursor: "pointer",
            backdropFilter: "blur(10px)",
            fontSize: "14px",
            fontWeight: 600,
            textShadow: "0 0 10px rgba(255, 255, 255, 0.8)",
            boxShadow: "0 0 20px rgba(192, 192, 192, 0.5), inset 0 0 20px rgba(220, 220, 225, 0.1)"
          }}
        >
          Shutdown
        </button>
      </div>
    </>
  );
};
