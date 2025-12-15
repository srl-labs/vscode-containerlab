/**
 * Party Mode Component
 *
 * Fun party effects with disco lights, confetti burst, and 3D floating orbs.
 * Keeps focus on the topology while adding celebration vibes.
 */

import React, { useEffect, useRef, useState } from 'react';

interface PartyModeProps {
  isActive: boolean;
  onClose?: () => void;
}

/** Confetti colors */
const CONFETTI_COLORS = [
  '#ff6b6b', '#feca57', '#48dbfb', '#ff9ff3',
  '#54a0ff', '#5f27cd', '#00d2d3', '#ff9f43',
];

/** Light beam colors */
const LIGHT_COLORS = [
  'rgba(255, 0, 128, 0.15)',
  'rgba(0, 255, 255, 0.15)',
  'rgba(255, 255, 0, 0.12)',
  'rgba(128, 0, 255, 0.15)',
  'rgba(0, 255, 128, 0.12)',
];

interface Confetti {
  x: number;
  y: number;
  size: number;
  color: string;
  rotation: number;
  vx: number;
  vy: number;
  vr: number;
}

interface Orb {
  x: number;
  y: number;
  z: number;
  size: number;
  hue: number;
  speed: number;
  angle: number;
}

interface LightBeam {
  angle: number;
  speed: number;
  width: number;
  color: string;
}

/**
 * Party Canvas - Confetti burst, disco lights, and 3D floating orbs
 */
const PartyCanvas: React.FC<{ isActive: boolean }> = ({ isActive }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const confettiRef = useRef<Confetti[]>([]);
  const orbsRef = useRef<Orb[]>([]);
  const lightsRef = useRef<LightBeam[]>([]);
  const animationRef = useRef<number>(0);
  const timeRef = useRef<number>(0);
  const confettiDoneRef = useRef<boolean>(false);

  useEffect(() => {
    if (!isActive) return undefined;

    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;

    // eslint-disable-next-line sonarjs/pseudo-random
    const rand = (): number => Math.random();

    const updateSize = (): void => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    updateSize();
    window.addEventListener('resize', updateSize);

    // Initialize confetti burst
    confettiRef.current = [];
    confettiDoneRef.current = false;
    for (let i = 0; i < 120; i++) {
      confettiRef.current.push({
        x: canvas.width / 2 + (rand() - 0.5) * 200,
        y: canvas.height / 2,
        size: 6 + rand() * 10,
        color: CONFETTI_COLORS[Math.floor(rand() * CONFETTI_COLORS.length)],
        rotation: rand() * 360,
        vx: (rand() - 0.5) * 15,
        vy: -8 - rand() * 12,
        vr: (rand() - 0.5) * 15,
      });
    }

    // Initialize floating 3D orbs
    orbsRef.current = [];
    for (let i = 0; i < 15; i++) {
      orbsRef.current.push({
        x: rand() * canvas.width,
        y: rand() * canvas.height,
        z: rand() * 200 + 50,
        size: 20 + rand() * 40,
        hue: rand() * 360,
        speed: 0.5 + rand() * 1.5,
        angle: rand() * Math.PI * 2,
      });
    }

    // Initialize disco light beams
    lightsRef.current = [];
    for (let i = 0; i < 5; i++) {
      lightsRef.current.push({
        angle: (i / 5) * Math.PI * 2,
        speed: 0.01 + rand() * 0.02,
        width: 60 + rand() * 80,
        color: LIGHT_COLORS[i % LIGHT_COLORS.length],
      });
    }

    timeRef.current = 0;

    const animate = (): void => {
      const width = canvas.width;
      const height = canvas.height;
      timeRef.current += 1;
      const time = timeRef.current;

      // Clear canvas
      ctx.clearRect(0, 0, width, height);

      // Draw disco light beams from corners
      drawDiscoLights(ctx, width, height, lightsRef.current);

      // Draw and update 3D floating orbs
      drawOrbs(ctx, width, height, orbsRef.current, time);

      // Draw confetti (only at the start)
      if (!confettiDoneRef.current) {
        drawConfetti(ctx, confettiRef.current, height);
        if (confettiRef.current.length === 0) {
          confettiDoneRef.current = true;
        }
      }

      // Subtle pulsing vignette
      drawPulsingVignette(ctx, width, height, time);

      animationRef.current = window.requestAnimationFrame(animate);
    };

    animationRef.current = window.requestAnimationFrame(animate);

    return () => {
      window.removeEventListener('resize', updateSize);
      window.cancelAnimationFrame(animationRef.current);
    };
  }, [isActive]);

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
 * Draw disco light beams sweeping from corners
 */
function drawDiscoLights(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  lights: LightBeam[]
): void {
  const corners = [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: 0, y: height },
    { x: width, y: height },
  ];

  for (let i = 0; i < lights.length; i++) {
    const light = lights[i];
    const corner = corners[i % corners.length];

    // Update angle
    light.angle += light.speed;

    // Calculate beam end point
    const beamLength = Math.max(width, height) * 1.5;
    const endX = corner.x + Math.cos(light.angle) * beamLength;
    const endY = corner.y + Math.sin(light.angle) * beamLength;

    // Draw beam with gradient
    const gradient = ctx.createLinearGradient(corner.x, corner.y, endX, endY);
    gradient.addColorStop(0, light.color);
    gradient.addColorStop(0.3, light.color.replace('0.15', '0.08').replace('0.12', '0.06'));
    gradient.addColorStop(1, 'transparent');

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.beginPath();
    ctx.moveTo(corner.x, corner.y);

    // Create cone shape
    const angle1 = light.angle - 0.1;
    const angle2 = light.angle + 0.1;
    ctx.lineTo(
      corner.x + Math.cos(angle1) * beamLength,
      corner.y + Math.sin(angle1) * beamLength
    );
    ctx.lineTo(
      corner.x + Math.cos(angle2) * beamLength,
      corner.y + Math.sin(angle2) * beamLength
    );
    ctx.closePath();

    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.restore();
  }
}

/**
 * Draw 3D floating orbs with depth effect
 */
function drawOrbs(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  orbs: Orb[],
  time: number
): void {
  // Sort by z for proper depth
  orbs.sort((a, b) => b.z - a.z);

  for (const orb of orbs) {
    // Float around
    orb.angle += 0.02;
    orb.x += Math.sin(orb.angle) * orb.speed;
    orb.y += Math.cos(orb.angle * 0.7) * orb.speed * 0.5;
    orb.z += Math.sin(time * 0.02 + orb.angle) * 0.5;

    // Wrap around edges
    if (orb.x < -50) orb.x = width + 50;
    if (orb.x > width + 50) orb.x = -50;
    if (orb.y < -50) orb.y = height + 50;
    if (orb.y > height + 50) orb.y = -50;
    if (orb.z < 50) orb.z = 250;
    if (orb.z > 250) orb.z = 50;

    // Calculate size based on depth
    const scale = 200 / orb.z;
    const size = orb.size * scale;
    const alpha = Math.min(0.6, scale * 0.4);

    // Cycle hue
    orb.hue = (orb.hue + 0.5) % 360;

    // Draw orb with glow
    const gradient = ctx.createRadialGradient(orb.x, orb.y, 0, orb.x, orb.y, size);
    gradient.addColorStop(0, `hsla(${orb.hue}, 100%, 70%, ${alpha})`);
    gradient.addColorStop(0.4, `hsla(${orb.hue}, 100%, 50%, ${alpha * 0.5})`);
    gradient.addColorStop(1, 'transparent');

    ctx.beginPath();
    ctx.arc(orb.x, orb.y, size, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();
  }
}

/**
 * Draw and update confetti particles
 */
function drawConfetti(
  ctx: CanvasRenderingContext2D,
  confetti: Confetti[],
  height: number
): void {
  for (let i = confetti.length - 1; i >= 0; i--) {
    const c = confetti[i];

    // Update physics
    c.x += c.vx;
    c.y += c.vy;
    c.vy += 0.3; // gravity
    c.vx *= 0.99; // air resistance
    c.rotation += c.vr;

    // Remove if off screen
    if (c.y > height + 50) {
      confetti.splice(i, 1);
      continue;
    }

    // Draw confetti piece
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate((c.rotation * Math.PI) / 180);
    ctx.fillStyle = c.color;
    ctx.fillRect(-c.size / 2, -c.size / 4, c.size, c.size / 2);
    ctx.restore();
  }
}

/**
 * Draw subtle pulsing vignette for atmosphere
 */
function drawPulsingVignette(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number
): void {
  const pulse = Math.sin(time * 0.05) * 0.02 + 0.03;
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.max(width, height);

  const gradient = ctx.createRadialGradient(
    centerX, centerY, radius * 0.3,
    centerX, centerY, radius
  );
  gradient.addColorStop(0, 'transparent');
  gradient.addColorStop(1, `rgba(128, 0, 255, ${pulse})`);

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}

/**
 * Party Mode Overlay
 */
export const PartyMode: React.FC<PartyModeProps> = ({ isActive, onClose }) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isActive) {
      setVisible(true);
    } else {
      setVisible(false);
    }
  }, [isActive]);

  if (!isActive) return null;

  return (
    <>
      <PartyCanvas isActive={isActive} />

      {/* Close button */}
      <div className="fixed inset-0 pointer-events-none z-[99999] flex items-end justify-center pb-8">
        <button
          onClick={onClose}
          className={`px-5 py-2.5 rounded-full pointer-events-auto transition-all duration-300 ${
            visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
          }`}
          style={{
            background: 'rgba(0, 0, 0, 0.6)',
            border: '2px solid rgba(255, 255, 255, 0.3)',
            color: 'white',
            cursor: 'pointer',
            backdropFilter: 'blur(8px)',
            fontSize: '14px',
            fontWeight: 500,
          }}
        >
          End Party
        </button>
      </div>

      {/* Initial flash */}
      <div className="party-flash fixed inset-0 pointer-events-none z-[99997]" />
    </>
  );
};
