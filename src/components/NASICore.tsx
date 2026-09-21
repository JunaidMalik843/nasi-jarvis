import { useRef, useEffect } from 'react';
import type { CoreState } from '../hooks/useVoice';
import { subscribe } from '../lib/animLoop';

// ============================================================
// NASI CORE ORB — canvas particle sphere
// v2: STANDBY is never static. Slow continuous rotation + particle
// drift keep the orb "powered on"; LISTENING/THINKING/SPEAKING spin
// and swirl 2.4–3x faster so state changes read instantly.
// ============================================================

type Particle = { x: number; y: number; z: number; vx: number; vy: number; vz: number; size: number; hue: number; brightness: number };

export default function NASICore({ state }: { state: CoreState }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const particlesRef = useRef<Particle[]>([]);
  const timeRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    // v3: +15% (240→276) so the orb fills more of its card, with a denser,
    // wider particle cloud to match the reference's full-bodied sphere.
    const W = 276, H = 276, dpr = Math.min(window.devicePixelRatio || 1, 2);
    // Absolute pixel offsets scale with the orb so the rings/waves keep their
    // proportions after the 20% size reduction.
    const K = W / 300;
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px'; canvas.style.borderRadius = '50%';
    ctx.scale(dpr, dpr);
    const cx = W / 2, cy = H / 2, R = 107;

    if (particlesRef.current.length === 0) {
      const shells = [
        { count: 340, rMin: 0.2, rMax: 0.62 },
        { count: 300, rMin: 0.58, rMax: 0.92 },
        { count: 230, rMin: 0.88, rMax: 1.08 },
      ];
      for (const shell of shells) {
        for (let i = 0; i < shell.count; i++) {
          const theta = Math.random() * Math.PI * 2;
          const phi = Math.acos(2 * Math.random() - 1);
          const r = R * (shell.rMin + Math.random() * (shell.rMax - shell.rMin));
          particlesRef.current.push({
            x: r * Math.sin(phi) * Math.cos(theta), y: r * Math.sin(phi) * Math.sin(theta), z: r * Math.cos(phi),
            vx: (Math.random() - 0.5) * 0.06, vy: (Math.random() - 0.5) * 0.06, vz: (Math.random() - 0.5) * 0.06,
            size: 0.4 + Math.random() * 2.1, hue: 172 + Math.random() * 42, brightness: 0.45 + Math.random() * 0.55,
          });
        }
      }
    }

    let rotY = Math.random() * Math.PI * 2, rotX = 0.28;
    const getStateColor = () => {
      switch (stateRef.current) {
        // Colour values mirror the canonical CSS palette (#00ebf0 cyan,
        // #ffb020 amber, #00e88a emerald, #ff5252 crimson) so the orb edge
        // matches the rest of the interface instead of drifting blue.
        case 'LISTENING': return { r: 0, g: 228, b: 240, intensity: 1.0, glow: 0.7 };
        case 'THINKING': return { r: 255, g: 176, b: 32, intensity: 0.9, glow: 0.55 };
        case 'SPEAKING': return { r: 0, g: 232, b: 138, intensity: 1.0, glow: 0.7 };
        case 'ERROR': return { r: 255, g: 82, b: 82, intensity: 0.95, glow: 0.6 };
        default: return { r: 0, g: 216, b: 232, intensity: 0.5, glow: 0.26 };
      }
    };

    const animate = (dt: number) => {
      ctx.clearRect(0, 0, W, H);
      timeRef.current += 0.016 * dt;
      const t = timeRef.current;
      const st = stateRef.current;
      const sc = getStateColor();
      // STANDBY drift (~full revolution in 12s) — subtle but clearly alive.
      const speed = st === 'THINKING' ? 0.024 : st === 'LISTENING' ? 0.026 : st === 'SPEAKING' ? 0.02 : 0.0085;
      rotY += speed * dt;
      if (st === 'THINKING') rotX += 0.004 * dt;
      if (st === 'LISTENING') rotX = 0.28 + Math.sin(t * 2.2) * 0.12;
      const cosY = Math.cos(rotY), sinY = Math.sin(rotY), cosX = Math.cos(rotX), sinX = Math.sin(rotX);

      // Outer glow
      const outerGlow = ctx.createRadialGradient(cx, cy, R * 0.2, cx, cy, R * 1.6);
      outerGlow.addColorStop(0, `rgba(${sc.r},${sc.g},${sc.b},${0.08 * sc.intensity * sc.glow})`);
      outerGlow.addColorStop(0.5, `rgba(${sc.r},${sc.g},${sc.b},${0.03 * sc.intensity * sc.glow})`);
      outerGlow.addColorStop(1, 'transparent');
      ctx.fillStyle = outerGlow; ctx.beginPath(); ctx.arc(cx, cy, R * 1.6, 0, Math.PI * 2); ctx.fill();

      // Orbital rings
      for (let ring = 0; ring < 3; ring++) {
        const ringR = R + (15 + ring * 18) * K;
        const ringAlpha = (0.08 - ring * 0.02) * sc.intensity;
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(t * (0.3 + ring * 0.15) * (ring % 2 === 0 ? 1 : -1));
        ctx.scale(1, 0.3 + ring * 0.1);
        ctx.strokeStyle = `rgba(${sc.r},${sc.g},${sc.b},${ringAlpha})`; ctx.lineWidth = 0.8; ctx.setLineDash([4, 8]);
        ctx.beginPath(); ctx.arc(0, 0, ringR, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); ctx.restore();
      }

      // Particles — STANDBY keeps ~55% drift so the cloud swirls gently at idle
      const drift = st === 'IDLE' ? 0.55 : 1;
      const thinkBoost = st === 'THINKING' ? 1.5 : drift;
      const projected = particlesRef.current.map(p => {
        let x = p.x * cosY - p.z * sinY, z = p.x * sinY + p.z * cosY, y = p.y * cosX - z * sinX;
        z = p.y * sinX + z * cosX;
        p.x += p.vx * thinkBoost * dt; p.y += p.vy * thinkBoost * dt;
        p.z += p.vz * thinkBoost * dt;
        const dist = Math.sqrt(p.x * p.x + p.y * p.y + p.z * p.z);
        if (dist > R * 1.05) { p.vx *= -0.85; p.vy *= -0.85; p.vz *= -0.85; }
        return { sx: cx + x, sy: cy + y, z, size: p.size, hue: p.hue, brightness: p.brightness };
      });
      projected.sort((a, b) => a.z - b.z);
      projected.forEach(p => {
        const depth = (p.z + R) / (2 * R);
        const alpha = (0.1 + depth * 0.7) * sc.intensity * p.brightness;
        const sz = p.size * (0.4 + depth * 0.9);
        if (sz > 1.2) { ctx.fillStyle = `hsla(${p.hue},80%,70%,${alpha * 0.3})`; ctx.beginPath(); ctx.arc(p.sx, p.sy, sz * 2, 0, Math.PI * 2); ctx.fill(); }
        ctx.fillStyle = `hsla(${p.hue},75%,68%,${alpha})`; ctx.beginPath(); ctx.arc(p.sx, p.sy, sz, 0, Math.PI * 2); ctx.fill();
      });

      // Core energy — gentle pulse even at idle
      const pulse = st === 'IDLE' ? 1 + Math.sin(t * 1.6) * 0.045 : 1 + Math.sin(t * 3) * 0.12;
      const corePulse = st === 'THINKING' ? 0.8 : st === 'SPEAKING' ? 1.2 : 1;
      for (let layer = 3; layer >= 0; layer--) {
        const layerR = (20 + layer * 12) * pulse * corePulse;
        const layerAlpha = (0.15 - layer * 0.03) * sc.intensity;
        const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, layerR);
        coreGrad.addColorStop(0, `rgba(${sc.r},${sc.g},${sc.b},${layerAlpha * 1.5})`);
        coreGrad.addColorStop(0.5, `rgba(${sc.r},${sc.g},${sc.b},${layerAlpha * 0.5})`);
        coreGrad.addColorStop(1, 'transparent');
        ctx.fillStyle = coreGrad; ctx.beginPath(); ctx.arc(cx, cy, layerR, 0, Math.PI * 2); ctx.fill();
      }

      // Center point
      const centerGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, 8 * pulse);
      centerGrad.addColorStop(0, `rgba(${Math.min(255, sc.r + 80)},${Math.min(255, sc.g + 60)},${Math.min(255, sc.b + 40)},${0.9 * sc.intensity})`);
      centerGrad.addColorStop(1, 'transparent');
      ctx.fillStyle = centerGrad; ctx.beginPath(); ctx.arc(cx, cy, 8 * pulse, 0, Math.PI * 2); ctx.fill();

      // Rings
      ctx.strokeStyle = `rgba(${sc.r},${sc.g},${sc.b},${0.12 * sc.intensity})`; ctx.lineWidth = 0.6;
      ctx.beginPath(); ctx.arc(cx, cy, R * 0.45, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = `rgba(${sc.r},${sc.g},${sc.b},${0.06 * sc.intensity})`; ctx.lineWidth = 0.4;
      ctx.beginPath(); ctx.arc(cx, cy, R * 0.65, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = `rgba(${sc.r},${sc.g},${sc.b},${0.18 * sc.intensity})`; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(cx, cy, R + 8 * K, 0, Math.PI * 2); ctx.stroke();

      // State effects
      if (st === 'LISTENING') { for (let w = 0; w < 3; w++) { const waveR = R + (30 + w * 15) * K + Math.sin(t * 4 - w * 0.8) * 8 * K; ctx.strokeStyle = `rgba(0, 235, 240,${0.12 - w * 0.03})`; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.arc(cx, cy, waveR, 0, Math.PI * 2); ctx.stroke(); } }
      if (st === 'THINKING') { for (let a = 0; a < 3; a++) { const arcStart = t * 2 + a * (Math.PI * 2 / 3); const arcLen = 0.8 + Math.sin(t * 3 + a) * 0.3; ctx.strokeStyle = `rgba(0, 235, 240,${0.2 - a * 0.05})`; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(cx, cy, R * 0.75, arcStart, arcStart + arcLen); ctx.stroke(); } }
      if (st === 'SPEAKING') { const speakPulse = Math.sin(t * 8) * 0.5 + 0.5; ctx.strokeStyle = `rgba(0, 232, 138,${0.18 * speakPulse})`; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.arc(cx, cy, R * 0.55, 0, Math.PI * 2); ctx.stroke(); }

    };
    // The orb is the focal element: keep a real frame budget while it is
    // listening/thinking, ease off at idle where the drift is slow anyway.
    // Reads live state through stateRef, so this effect never has to restart.
    return subscribe(animate, {
      fps: () => (stateRef.current === 'IDLE' ? 24 : 36),
      element: canvas,
    });
  }, []);

  return <canvas ref={canvasRef} className="nasi-core-canvas" />;
}
