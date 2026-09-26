import React, { useRef, useEffect, useCallback } from 'react';
import type { CoreState } from '../hooks/useVoice';
import { subscribe } from '../lib/animLoop';

// ============================================================
// NASI CORE ORB — Particle-based animated sphere with mouse interaction
// Status colors: IDLE=cyan (#00f0ff), ACTIVE=emerald (#00ff88), THINKING=amber (#ff8c00)
// Locked 60fps frame budget, interactive mouse parallax & particle drift
// ============================================================

type Particle = {
  x: number;
  y: number;
  z: number;
  baseX: number;
  baseY: number;
  baseZ: number;
  vx: number;
  vy: number;
  vz: number;
  size: number;
  hue: number;
  brightness: number;
};

interface NASICoreProps {
  state: CoreState;
}

function NASICoreComponent({ state }: NASICoreProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  const particlesRef = useRef<Particle[]>([]);
  const timeRef = useRef(0);
  const mouseRef = useRef({ x: 0, y: 0, targetX: 0, targetY: 0, hovering: false });

  // Mouse handlers with smooth interpolation
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const ny = ((e.clientY - rect.top) / rect.height) * 2 - 1;
    mouseRef.current.targetX = Math.max(-1, Math.min(1, nx));
    mouseRef.current.targetY = Math.max(-1, Math.min(1, ny));
    mouseRef.current.hovering = true;
  }, []);

  const handleMouseEnter = useCallback(() => {
    mouseRef.current.hovering = true;
  }, []);

  const handleMouseLeave = useCallback(() => {
    mouseRef.current.hovering = false;
    mouseRef.current.targetX = 0;
    mouseRef.current.targetY = 0;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    const W = 160;
    const H = 160;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const K = W / 300;

    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    canvas.style.borderRadius = '50%';
    ctx.scale(dpr, dpr);

    const cx = W / 2;
    const cy = H / 2;
    const R = 67;

    // Initialize 3-layer spherical shell particles if not populated
    if (particlesRef.current.length === 0) {
      const shells = [
        { count: 320, rMin: 0.22, rMax: 0.62 },
        { count: 280, rMin: 0.60, rMax: 0.92 },
        { count: 220, rMin: 0.88, rMax: 1.08 },
      ];
      for (const shell of shells) {
        for (let i = 0; i < shell.count; i++) {
          const theta = Math.random() * Math.PI * 2;
          const phi = Math.acos(2 * Math.random() - 1);
          const r = R * (shell.rMin + Math.random() * (shell.rMax - shell.rMin));
          const px = r * Math.sin(phi) * Math.cos(theta);
          const py = r * Math.sin(phi) * Math.sin(theta);
          const pz = r * Math.cos(phi);
          particlesRef.current.push({
            x: px,
            y: py,
            z: pz,
            baseX: px,
            baseY: py,
            baseZ: pz,
            vx: (Math.random() - 0.5) * 0.05,
            vy: (Math.random() - 0.5) * 0.05,
            vz: (Math.random() - 0.5) * 0.05,
            size: 0.4 + Math.random() * 2.1,
            hue: 172 + Math.random() * 42,
            brightness: 0.45 + Math.random() * 0.55,
          });
        }
      }
    }

    let rotY = Math.random() * Math.PI * 2;
    let rotX = 0.28;

    // Exact status color values:
    // IDLE = cyan (#00f0ff: 0, 240, 255)
    // ACTIVE = emerald (#00ff88: 0, 255, 136) [SPEAKING / LISTENING]
    // THINKING = amber (#ff8c00: 255, 140, 0)
    // ERROR = crimson (#ff2244: 255, 34, 68)
    const getStateColor = () => {
      switch (stateRef.current) {
        case 'LISTENING':
          // Active state (listening to user)
          return { r: 0, g: 255, b: 136, intensity: 1.0, glow: 0.8 };
        case 'THINKING':
          // Thinking state (neural processing)
          return { r: 255, g: 140, b: 0, intensity: 1.0, glow: 0.75 };
        case 'SPEAKING':
          // Active state (voice synthesis playback)
          return { r: 0, g: 255, b: 136, intensity: 1.0, glow: 0.85 };
        case 'ERROR':
          // Error state
          return { r: 255, g: 34, b: 68, intensity: 0.95, glow: 0.65 };
        case 'IDLE':
        default:
          // IDLE = cyan
          return { r: 0, g: 240, b: 255, intensity: 0.6, glow: 0.35 };
      }
    };

    const animate = (dt: number) => {
      ctx.clearRect(0, 0, W, H);
      timeRef.current += 0.016 * dt;
      const t = timeRef.current;
      const st = stateRef.current;
      const sc = getStateColor();

      // Smooth mouse parallax interpolation
      const m = mouseRef.current;
      m.x += (m.targetX - m.x) * 0.1 * dt;
      m.y += (m.targetY - m.y) * 0.1 * dt;

      // Dynamic rotation speed based on status
      const baseSpeed = st === 'THINKING' ? 0.028 : st === 'LISTENING' || st === 'SPEAKING' ? 0.024 : 0.009;
      rotY += baseSpeed * dt + m.x * 0.008 * dt;

      // Target X tilt influenced by mouse
      const targetTilt = 0.28 + m.y * 0.35;
      rotX += (targetTilt - rotX) * 0.08 * dt;

      const cosY = Math.cos(rotY);
      const sinY = Math.sin(rotY);
      const cosX = Math.cos(rotX);
      const sinX = Math.sin(rotX);

      // Outer radial glow halo
      const outerGlow = ctx.createRadialGradient(cx, cy, R * 0.2, cx, cy, R * 1.6);
      outerGlow.addColorStop(0, `rgba(${sc.r},${sc.g},${sc.b},${0.09 * sc.intensity * sc.glow})`);
      outerGlow.addColorStop(0.5, `rgba(${sc.r},${sc.g},${sc.b},${0.035 * sc.intensity * sc.glow})`);
      outerGlow.addColorStop(1, 'transparent');
      ctx.fillStyle = outerGlow;
      ctx.beginPath();
      ctx.arc(cx, cy, R * 1.6, 0, Math.PI * 2);
      ctx.fill();

      // Orbital rings
      for (let ring = 0; ring < 3; ring++) {
        const ringR = R + (15 + ring * 18) * K;
        const ringAlpha = (0.08 - ring * 0.02) * sc.intensity;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(t * (0.3 + ring * 0.15) * (ring % 2 === 0 ? 1 : -1) + m.x * 0.2);
        ctx.scale(1, 0.3 + ring * 0.1);
        ctx.strokeStyle = `rgba(${sc.r},${sc.g},${sc.b},${ringAlpha})`;
        ctx.lineWidth = 0.8;
        ctx.setLineDash([4, 8]);
        ctx.beginPath();
        ctx.arc(0, 0, ringR, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }

      // Particles with mouse pull & 3D projection
      const thinkBoost = st === 'THINKING' ? 1.6 : st === 'LISTENING' || st === 'SPEAKING' ? 1.2 : 0.6;
      const mouseAttract = m.hovering ? 0.08 : 0;

      const projected = particlesRef.current.map((p) => {
        let x = p.x * cosY - p.z * sinY;
        let z = p.x * sinY + p.z * cosY;
        let y = p.y * cosX - z * sinX;
        z = p.y * sinX + z * cosX;

        // Drift update
        p.x += p.vx * thinkBoost * dt;
        p.y += p.vy * thinkBoost * dt;
        p.z += p.vz * thinkBoost * dt;

        // Pull slightly toward mouse pointer on hover
        if (mouseAttract > 0) {
          p.x += (m.x * R * 0.4 - p.x) * mouseAttract * 0.02 * dt;
          p.y += (m.y * R * 0.4 - p.y) * mouseAttract * 0.02 * dt;
        }

        const dist = Math.sqrt(p.x * p.x + p.y * p.y + p.z * p.z);
        if (dist > R * 1.08) {
          p.vx *= -0.85;
          p.vy *= -0.85;
          p.vz *= -0.85;
        }

        return {
          sx: cx + x,
          sy: cy + y,
          z,
          size: p.size,
          hue: p.hue,
          brightness: p.brightness,
        };
      });

      projected.sort((a, b) => a.z - b.z);

      projected.forEach((p) => {
        const depth = (p.z + R) / (2 * R);
        const alpha = Math.max(0.08, Math.min(1, (0.12 + depth * 0.72) * sc.intensity * p.brightness));
        const sz = p.size * (0.4 + depth * 0.9);

        // Core status tint blending
        if (sz > 1.2) {
          ctx.fillStyle = `rgba(${sc.r},${sc.g},${sc.b},${alpha * 0.28})`;
          ctx.beginPath();
          ctx.arc(p.sx, p.sy, sz * 2.2, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.fillStyle = `rgba(${Math.round(sc.r * 0.7 + 76)},${Math.round(sc.g * 0.8 + 51)},${Math.round(sc.b * 0.9 + 25)},${alpha})`;
        ctx.beginPath();
        ctx.arc(p.sx, p.sy, sz, 0, Math.PI * 2);
        ctx.fill();
      });

      // Core pulse & energy center
      const pulse = st === 'IDLE' ? 1 + Math.sin(t * 1.6) * 0.05 : 1 + Math.sin(t * 3.2) * 0.14;
      const corePulse = st === 'THINKING' ? 0.85 : st === 'SPEAKING' ? 1.25 : 1;

      for (let layer = 3; layer >= 0; layer--) {
        const layerR = (20 + layer * 12) * pulse * corePulse;
        const layerAlpha = (0.16 - layer * 0.03) * sc.intensity;
        const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, layerR);
        coreGrad.addColorStop(0, `rgba(${sc.r},${sc.g},${sc.b},${layerAlpha * 1.6})`);
        coreGrad.addColorStop(0.5, `rgba(${sc.r},${sc.g},${sc.b},${layerAlpha * 0.5})`);
        coreGrad.addColorStop(1, 'transparent');
        ctx.fillStyle = coreGrad;
        ctx.beginPath();
        ctx.arc(cx, cy, layerR, 0, Math.PI * 2);
        ctx.fill();
      }

      // Hot center point
      const centerGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, 8 * pulse);
      centerGrad.addColorStop(0, `rgba(240, 255, 255, ${0.95 * sc.intensity})`);
      centerGrad.addColorStop(0.6, `rgba(${sc.r},${sc.g},${sc.b},${0.75 * sc.intensity})`);
      centerGrad.addColorStop(1, 'transparent');
      ctx.fillStyle = centerGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, 8 * pulse, 0, Math.PI * 2);
      ctx.fill();

      // Instrument rings
      ctx.strokeStyle = `rgba(${sc.r},${sc.g},${sc.b},${0.14 * sc.intensity})`;
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.arc(cx, cy, R * 0.45, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = `rgba(${sc.r},${sc.g},${sc.b},${0.08 * sc.intensity})`;
      ctx.lineWidth = 0.4;
      ctx.beginPath();
      ctx.arc(cx, cy, R * 0.65, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = `rgba(${sc.r},${sc.g},${sc.b},${0.22 * sc.intensity})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(cx, cy, R + 8 * K, 0, Math.PI * 2);
      ctx.stroke();

      // State specific overlays
      if (st === 'LISTENING') {
        for (let w = 0; w < 3; w++) {
          const waveR = R + (30 + w * 15) * K + Math.sin(t * 4 - w * 0.8) * 8 * K;
          ctx.strokeStyle = `rgba(0, 255, 136, ${0.14 - w * 0.03})`;
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          ctx.arc(cx, cy, waveR, 0, Math.PI * 2);
          ctx.stroke();
        }
      } else if (st === 'THINKING') {
        for (let a = 0; a < 3; a++) {
          const arcStart = t * 2.2 + a * ((Math.PI * 2) / 3);
          const arcLen = 0.8 + Math.sin(t * 3 + a) * 0.3;
          ctx.strokeStyle = `rgba(255, 140, 0, ${0.28 - a * 0.06})`;
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.arc(cx, cy, R * 0.75, arcStart, arcStart + arcLen);
          ctx.stroke();
        }
      } else if (st === 'SPEAKING') {
        const speakPulse = Math.sin(t * 8) * 0.5 + 0.5;
        ctx.strokeStyle = `rgba(0, 255, 136, ${0.24 * speakPulse})`;
        ctx.lineWidth = 2.0;
        ctx.beginPath();
        ctx.arc(cx, cy, R * 0.55, 0, Math.PI * 2);
        ctx.stroke();
      }
    };

    // Keep locked 60fps when active or hovering, 30fps when idle
    const unsub = subscribe(animate, {
      fps: () => (mouseRef.current.hovering || stateRef.current !== 'IDLE' ? 60 : 30),
      element: canvas,
    });

    return () => {
      unsub();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="nasi-core-canvas"
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{ cursor: 'pointer' }}
    />
  );
}

const NASICore = React.memo(NASICoreComponent);
export default NASICore;
