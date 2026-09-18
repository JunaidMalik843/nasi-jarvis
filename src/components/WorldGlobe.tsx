import React, { useRef, useEffect, useCallback, useState } from 'react';
import { geoOrthographic, geoGraticule10, geoPath, geoInterpolate } from 'd3-geo';

interface Marker {
  name: string;
  lon: number;
  lat: number;
  color: string;
  status: 'active' | 'warning' | 'critical';
  label: string;
}

const MARKERS: Marker[] = [
  { name: 'NYC', lon: -74, lat: 40.7, color: '#00ff88', status: 'active', label: 'OPERATIONAL' },
  { name: 'London', lon: 0, lat: 51.5, color: '#00ff88', status: 'active', label: 'OPERATIONAL' },
  { name: 'Tokyo', lon: 139.7, lat: 35.7, color: '#00ff88', status: 'active', label: 'OPERATIONAL' },
  { name: 'Mumbai', lon: 72.9, lat: 19.1, color: '#00ff88', status: 'active', label: 'STANDBY' },
  { name: 'Sydney', lon: 151.2, lat: -33.9, color: '#00ff88', status: 'active', label: 'STANDBY' },
  { name: 'Dubai', lon: 55.3, lat: 25.2, color: '#ffaa00', status: 'warning', label: 'ELEVATED' },
  { name: 'São Paulo', lon: -46.6, lat: -23.5, color: '#00ff88', status: 'active', label: 'OPERATIONAL' },
  { name: 'Singapore', lon: 103.8, lat: 1.35, color: '#00ff88', status: 'active', label: 'OPERATIONAL' },
  { name: 'Seoul', lon: 127, lat: 37.5, color: '#ff4444', status: 'critical', label: 'ALERT' },
  { name: 'Moscow', lon: 37.6, lat: 55.7, color: '#ffaa00', status: 'warning', label: 'MONITORING' },
];

// Heat zones — regions with activity overlays
const HEAT_ZONES: { lon: number; lat: number; radius: number; color: string; intensity: number }[] = [
  { lon: 55, lat: 25, radius: 18, color: '#ffaa00', intensity: 0.12 },  // Middle East
  { lon: 37, lat: 55, radius: 14, color: '#ffaa00', intensity: 0.08 },  // Russia
  { lon: 127, lat: 37, radius: 10, color: '#ff4444', intensity: 0.15 }, // Korean peninsula
  { lon: -100, lat: 35, radius: 20, color: '#00e5ff', intensity: 0.05 }, // US
  { lon: 10, lat: 50, radius: 16, color: '#00e5ff', intensity: 0.06 },  // Europe
];

export default function WorldGlobe() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rotRef = useRef([-30, 10, 0]);
  const zoomRef = useRef(1);
  const dragging = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });
  const animRef = useRef(0);
  const [zoomLevel, setZoomLevel] = useState(1);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = rect.width;
    const h = rect.height;
    if (w < 10 || h < 10) { animRef.current = requestAnimationFrame(draw); return; }
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    const cx = w / 2;
    const cy = h / 2;
    const zoom = zoomRef.current;
    const r = Math.min(cx, cy) * 0.78 * zoom;

    // Slow auto-rotation
    if (!dragging.current) {
      rotRef.current[0] += 0.1;
    }

    const projection = geoOrthographic()
      .scale(r)
      .translate([cx, cy])
      .rotate(rotRef.current)
      .clipAngle(90);

    const path = geoPath(projection, ctx);

    ctx.clearRect(0, 0, w, h);

    // ── Background: dark satellite texture ──
    const bgGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * 0.7);
    bgGrad.addColorStop(0, '#060a10');
    bgGrad.addColorStop(0.5, '#040810');
    bgGrad.addColorStop(1, '#020406');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    // Scanline texture
    ctx.strokeStyle = 'rgba(0,229,255,0.015)';
    ctx.lineWidth = 0.5;
    for (let y = 0; y < h; y += 4) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // ── Atmosphere glow ──
    const atmoGrad = ctx.createRadialGradient(cx, cy, r * 0.82, cx, cy, r * 1.35);
    atmoGrad.addColorStop(0, 'rgba(0,229,255,0.12)');
    atmoGrad.addColorStop(0.4, 'rgba(0,229,255,0.04)');
    atmoGrad.addColorStop(1, 'transparent');
    ctx.fillStyle = atmoGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 1.35, 0, Math.PI * 2);
    ctx.fill();

    // ── Globe body ──
    const bodyGrad = ctx.createRadialGradient(cx - r * 0.2, cy - r * 0.2, 0, cx, cy, r);
    bodyGrad.addColorStop(0, 'rgba(12,30,42,0.95)');
    bodyGrad.addColorStop(0.6, 'rgba(6,16,24,0.98)');
    bodyGrad.addColorStop(1, 'rgba(3,8,14,1)');
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();

    // Globe border — bright ring
    ctx.strokeStyle = 'rgba(0,229,255,0.25)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();

    // Secondary ring
    ctx.strokeStyle = 'rgba(0,229,255,0.08)';
    ctx.lineWidth = 0.5;
    ctx.setLineDash([3, 5]);
    ctx.beginPath();
    ctx.arc(cx, cy, r + 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // ── Graticule (lat/lon grid) ──
    const graticule = geoGraticule10();
    ctx.strokeStyle = 'rgba(0,229,255,0.1)';
    ctx.lineWidth = 0.4;
    ctx.beginPath();
    path.context(ctx)(graticule);
    ctx.stroke();

    // ── Heat zones ──
    const t = Date.now() / 1000;
    HEAT_ZONES.forEach(zone => {
      const projected = projection([zone.lon, zone.lat]);
      if (!projected) return;
      const [px, py] = projected;
      const dx = px - cx;
      const dy = py - cy;
      if (dx * dx + dy * dy > r * r) return;

      const pulse = 1 + Math.sin(t * 1.5) * 0.15;
      const zoneR = zone.radius * zoom * pulse;
      const grad = ctx.createRadialGradient(px, py, 0, px, py, zoneR);
      const [cr, cg, cb] = hexToRgb(zone.color);
      grad.addColorStop(0, `rgba(${cr},${cg},${cb},${zone.intensity * 1.5})`);
      grad.addColorStop(0.5, `rgba(${cr},${cg},${cb},${zone.intensity * 0.6})`);
      grad.addColorStop(1, 'transparent');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(px, py, zoneR, 0, Math.PI * 2);
      ctx.fill();
    });

    // ── Markers ──
    MARKERS.forEach((m, idx) => {
      const projected = projection([m.lon, m.lat]);
      if (!projected) return;
      const [px, py] = projected;
      const dx = px - cx;
      const dy = py - cy;
      if (dx * dx + dy * dy > r * r) return;

      const [mr, mg, mb] = hexToRgb(m.color);
      const pulseR = m.status === 'critical' ? 3.5 + Math.sin(t * 5 + idx) * 1.5 :
                     m.status === 'warning' ? 3 + Math.sin(t * 3 + idx) * 1 : 2.5;

      // Outer pulse ring
      const ringR = pulseR + 4 + Math.sin(t * 2.5 + idx * 1.1) * 2;
      ctx.strokeStyle = `rgba(${mr},${mg},${mb},${m.status === 'critical' ? 0.35 : 0.2})`;
      ctx.lineWidth = m.status === 'critical' ? 1 : 0.7;
      ctx.beginPath();
      ctx.arc(px, py, ringR, 0, Math.PI * 2);
      ctx.stroke();

      // Glow aura
      const auraGrad = ctx.createRadialGradient(px, py, 0, px, py, pulseR * 3);
      auraGrad.addColorStop(0, `rgba(${mr},${mg},${mb},0.2)`);
      auraGrad.addColorStop(1, 'transparent');
      ctx.fillStyle = auraGrad;
      ctx.beginPath();
      ctx.arc(px, py, pulseR * 3, 0, Math.PI * 2);
      ctx.fill();

      // Core dot
      ctx.fillStyle = m.color;
      ctx.beginPath();
      ctx.arc(px, py, pulseR, 0, Math.PI * 2);
      ctx.fill();

      // Inner bright core
      ctx.fillStyle = `rgba(255,255,255,0.6)`;
      ctx.beginPath();
      ctx.arc(px, py, pulseR * 0.35, 0, Math.PI * 2);
      ctx.fill();

      // Label
      ctx.fillStyle = `rgba(${mr},${mg},${mb},0.7)`;
      ctx.font = `bold 7px "JetBrains Mono", monospace`;
      ctx.textAlign = 'center';
      ctx.fillText(m.name, px, py - pulseR - 5);

      // Status sub-label
      ctx.fillStyle = `rgba(${mr},${mg},${mb},0.4)`;
      ctx.font = `5px "JetBrains Mono", monospace`;
      ctx.fillText(m.label, px, py - pulseR - 0);
    });

    // ── Inner highlight ──
    const hlGrad = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, 0, cx, cy, r);
    hlGrad.addColorStop(0, 'rgba(0,229,255,0.06)');
    hlGrad.addColorStop(0.5, 'transparent');
    hlGrad.addColorStop(1, 'transparent');
    ctx.fillStyle = hlGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();

    // ── Specular reflection ──
    const specGrad = ctx.createRadialGradient(cx - r * 0.25, cy - r * 0.3, 0, cx - r * 0.25, cy - r * 0.3, r * 0.5);
    specGrad.addColorStop(0, 'rgba(255,255,255,0.04)');
    specGrad.addColorStop(1, 'transparent');
    ctx.fillStyle = specGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();

    // ── HUD corner brackets ──
    ctx.strokeStyle = 'rgba(0,229,255,0.2)';
    ctx.lineWidth = 1;
    const bSize = 8;
    // Top-left
    ctx.beginPath(); ctx.moveTo(6, 6 + bSize); ctx.lineTo(6, 6); ctx.lineTo(6 + bSize, 6); ctx.stroke();
    // Top-right
    ctx.beginPath(); ctx.moveTo(w - 6 - bSize, 6); ctx.lineTo(w - 6, 6); ctx.lineTo(w - 6, 6 + bSize); ctx.stroke();
    // Bottom-left
    ctx.beginPath(); ctx.moveTo(6, h - 6 - bSize); ctx.lineTo(6, h - 6); ctx.lineTo(6 + bSize, h - 6); ctx.stroke();
    // Bottom-right
    ctx.beginPath(); ctx.moveTo(w - 6 - bSize, h - 6); ctx.lineTo(w - 6, h - 6); ctx.lineTo(w - 6, h - 6 - bSize); ctx.stroke();

    // ── HUD labels ──
    ctx.fillStyle = 'rgba(0,229,255,0.35)';
    ctx.font = '6px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('SAT-LINK RADAR', 10, 16);
    ctx.fillStyle = 'rgba(0,229,255,0.2)';
    ctx.font = '5px "JetBrains Mono", monospace';
    ctx.fillText(`ZOOM ${(zoom * 100).toFixed(0)}%`, 10, 24);
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(0,229,255,0.25)';
    ctx.fillText(`${MARKERS.length} STATIONS`, w - 10, 16);
    const activeCount = MARKERS.filter(m => m.status === 'active').length;
    ctx.fillText(`${activeCount} ONLINE`, w - 10, 24);

    // ── Scan line ──
    const scanAngle = t * 0.8;
    const scanX = cx + Math.cos(scanAngle) * r * 0.95;
    const scanY = cy + Math.sin(scanAngle) * r * 0.95;
    ctx.strokeStyle = 'rgba(0,229,255,0.08)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(scanX, scanY);
    ctx.stroke();

    animRef.current = requestAnimationFrame(draw);
  }, []);

  useEffect(() => {
    animRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animRef.current);
  }, [draw]);

  // Mouse drag
  const onMouseDown = (e: React.MouseEvent) => {
    dragging.current = true;
    lastMouse.current = { x: e.clientX, y: e.clientY };
  };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!dragging.current) return;
    const dx = e.clientX - lastMouse.current.x;
    const dy = e.clientY - lastMouse.current.y;
    rotRef.current[0] += dx * 0.3;
    rotRef.current[1] = Math.max(-90, Math.min(90, rotRef.current[1] - dy * 0.3));
    lastMouse.current = { x: e.clientX, y: e.clientY };
  };
  const onMouseUp = () => { dragging.current = false; };

  // Touch support
  const onTouchStart = (e: React.TouchEvent) => {
    dragging.current = true;
    lastMouse.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (!dragging.current) return;
    const dx = e.touches[0].clientX - lastMouse.current.x;
    const dy = e.touches[0].clientY - lastMouse.current.y;
    rotRef.current[0] += dx * 0.3;
    rotRef.current[1] = Math.max(-90, Math.min(90, rotRef.current[1] - dy * 0.3));
    lastMouse.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const onTouchEnd = () => { dragging.current = false; };

  // Zoom controls
  const handleZoom = (delta: number) => {
    zoomRef.current = Math.max(0.5, Math.min(2.5, zoomRef.current + delta));
    setZoomLevel(zoomRef.current);
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: '100%', cursor: 'grab' }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      />
      {/* Zoom controls */}
      <div style={{
        position: 'absolute', bottom: 8, right: 8, display: 'flex', flexDirection: 'column', gap: 2, zIndex: 5,
      }}>
        <button onClick={() => handleZoom(0.2)} style={{
          width: 22, height: 22, borderRadius: 3, background: 'rgba(6,10,16,0.85)',
          border: '1px solid rgba(0,229,255,0.15)', color: 'rgba(0,229,255,0.5)',
          fontFamily: 'var(--mono)', fontSize: 11, cursor: 'pointer', display: 'grid', placeItems: 'center',
        }} title="Zoom in">+</button>
        <button onClick={() => handleZoom(-0.2)} style={{
          width: 22, height: 22, borderRadius: 3, background: 'rgba(6,10,16,0.85)',
          border: '1px solid rgba(0,229,255,0.15)', color: 'rgba(0,229,255,0.5)',
          fontFamily: 'var(--mono)', fontSize: 11, cursor: 'pointer', display: 'grid', placeItems: 'center',
        }} title="Zoom out">−</button>
      </div>
    </div>
  );
}

function hexToRgb(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [r, g, b];
}
