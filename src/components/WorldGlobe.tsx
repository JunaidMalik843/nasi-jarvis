import React, { useRef, useEffect, useCallback, useState } from 'react';
import { geoOrthographic, geoGraticule10, geoPath, geoInterpolate } from 'd3-geo';
import { feature } from 'topojson-client';
import topo from 'world-atlas/countries-110m.json';
import { subscribe } from '../lib/animLoop';

// Real continent outlines (110m Natural Earth via world-atlas) — gives the
// radar a faint satellite texture instead of a bare wireframe sphere.
const LAND: GeoJSON.FeatureCollection = feature(
  topo as unknown as Parameters<typeof feature>[0],
  (topo as unknown as { objects: { countries: never } }).objects.countries,
) as unknown as GeoJSON.FeatureCollection;

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
  { name: 'Dubai', lon: 55.3, lat: 25.2, color: '#ff8c00', status: 'warning', label: 'ELEVATED' },
  { name: 'São Paulo', lon: -46.6, lat: -23.5, color: '#00ff88', status: 'active', label: 'OPERATIONAL' },
  { name: 'Singapore', lon: 103.8, lat: 1.35, color: '#00ff88', status: 'active', label: 'OPERATIONAL' },
  { name: 'Seoul', lon: 127, lat: 37.5, color: '#ff2244', status: 'critical', label: 'ALERT' },
  { name: 'Moscow', lon: 37.6, lat: 55.7, color: '#ff8c00', status: 'warning', label: 'MONITORING' },
];

// Heat zones — regions with activity overlays
const HEAT_ZONES: { lon: number; lat: number; radius: number; color: string; intensity: number }[] = [
  { lon: 55, lat: 25, radius: 18, color: '#ff8c00', intensity: 0.12 },  // Middle East
  { lon: 37, lat: 55, radius: 14, color: '#ff8c00', intensity: 0.08 },  // Russia
  { lon: 127, lat: 37, radius: 10, color: '#ff2244', intensity: 0.15 }, // Korean peninsula
  { lon: -100, lat: 35, radius: 20, color: '#00f0ff', intensity: 0.05 }, // US
  { lon: 10, lat: 50, radius: 16, color: '#00f0ff', intensity: 0.06 },  // Europe
];

export default function WorldGlobe() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rotRef = useRef([-30, 10, 0]);
  const zoomRef = useRef(1);
  const dragging = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });
  const sizeRef = useRef({ w: 0, h: 0 });
  const [zoomLevel, setZoomLevel] = useState(1);

  const draw = useCallback((dt = 1) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const { w, h } = sizeRef.current;
    if (w < 10 || h < 10) return;
    // Resize the backing store only when the box (or DPR) really changed.
    // This used to run unconditionally every frame: assigning width/height
    // reallocates the pixel buffer, clears it and drops the canvas state —
    // pure per-frame waste on top of the per-frame layout read.
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const cx = w / 2;
    const cy = h / 2;
    const zoom = zoomRef.current;
    const r = Math.min(cx, cy) * 0.78 * zoom;

    // Slow auto-rotation (dt keeps the speed identical at any frame budget)
    if (!dragging.current) {
      rotRef.current[0] += 0.1 * dt;
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
    bgGrad.addColorStop(0, '#071419');
    bgGrad.addColorStop(0.5, '#040e12');
    bgGrad.addColorStop(1, '#010405');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    // Scanline texture
    ctx.strokeStyle = 'rgba(0, 240, 255,0.015)';
    ctx.lineWidth = 0.5;
    for (let y = 0; y < h; y += 4) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // ── Atmosphere glow + depth vignette ──
    // Two stacked radial falloffs read as a lit atmosphere bleeding into a dark
    // surround, so the sphere has visible volume instead of flat line-art.
    const atmoGrad = ctx.createRadialGradient(cx, cy, r * 0.78, cx, cy, r * 1.55);
    atmoGrad.addColorStop(0, 'rgba(0, 240, 255, 0.30)');
    atmoGrad.addColorStop(0.28, 'rgba(0, 240, 255, 0.13)');
    atmoGrad.addColorStop(0.62, 'rgba(0, 240, 255, 0.045)');
    atmoGrad.addColorStop(1, 'transparent');
    ctx.fillStyle = atmoGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 1.55, 0, Math.PI * 2);
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

    // Limb darkening — the sphere's limb falls off to black, which is what
    // actually sells the 3D volume (a flat disc keeps reading as a wireframe).
    const limb = ctx.createRadialGradient(cx, cy, r * 0.52, cx, cy, r);
    limb.addColorStop(0, 'rgba(0, 0, 0, 0)');
    limb.addColorStop(0.72, 'rgba(0, 0, 0, 0.28)');
    limb.addColorStop(1, 'rgba(0, 0, 0, 0.78)');
    ctx.fillStyle = limb;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();

    // Globe border — bright ring with its own bloom
    ctx.save();
    ctx.shadowColor = 'rgba(0, 240, 255, 0.7)';
    ctx.shadowBlur = 10;
    ctx.strokeStyle = 'rgba(120, 245, 255, 0.5)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // Secondary ring
    ctx.strokeStyle = 'rgba(0, 240, 255,0.08)';
    ctx.lineWidth = 0.5;
    ctx.setLineDash([3, 5]);
    ctx.beginPath();
    ctx.arc(cx, cy, r + 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // ── Graticule (lat/lon grid) ──
    const graticule = geoGraticule10();
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.14)';
    ctx.lineWidth = 0.4;
    ctx.beginPath();
    path.context(ctx)(graticule);
    ctx.stroke();

    // ── Continent landmass (satellite texture) ──
    // Subtle two-pass fill+stroke reads as real geography under the scanlines
    // while staying far too dim to break the black theme.
    ctx.save();
    ctx.beginPath();
    path.context(ctx)(LAND);
    // Real landmass is the single strongest "this is a satellite display" cue,
    // so it gets real contrast: a lit teal continent mass with a glowing coast.
    ctx.fillStyle = 'rgba(40, 96, 110, 0.92)';
    ctx.shadowColor = 'rgba(0, 240, 255, 0.35)';
    ctx.shadowBlur = 9;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(140, 250, 255, 0.5)';
    ctx.lineWidth = 0.55;
    ctx.stroke();
    ctx.restore();

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
    // Radar sweep geometry (shared with marker highlighting below):
    // one thin bright leading edge + a fading trailing wedge, ~24s per revolution.
    const sweepAngle = (t * 0.26) % (Math.PI * 2);
    const sweepTrailing = Math.PI * 0.62; // ~112° fade behind the leading edge
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.995, 0, Math.PI * 2);
    ctx.clip();
    const swGrad = ctx.createConicGradient(sweepAngle - sweepTrailing, cx, cy);
    swGrad.addColorStop(0, 'rgba(0, 240, 255, 0)');
    swGrad.addColorStop(sweepTrailing / (Math.PI * 2), 'rgba(0, 240, 255, 0.035)');
    swGrad.addColorStop(sweepTrailing / (Math.PI * 2) + 0.002, 'rgba(0, 240, 255, 0)');
    swGrad.addColorStop(1, 'rgba(0, 240, 255, 0)');
    ctx.fillStyle = swGrad;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    // Leading edge line
    ctx.strokeStyle = 'rgba(140, 245, 255, 0.4)';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(sweepAngle) * r * 0.99, cy + Math.sin(sweepAngle) * r * 0.99);
    ctx.stroke();
    ctx.restore();

    // Soft outer glow ring around the whole radar face
    ctx.save();
    ctx.shadowColor = 'rgba(0, 240, 255, 0.85)';
    ctx.shadowBlur = 26;
    ctx.strokeStyle = 'rgba(130, 248, 255, 0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, r + 3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // Instrument frame: a dashed range ring plus a HUD tick bezel, so the face
    // reads as a mounted satellite sensor rather than a drawn circle.
    ctx.save();
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.22)';
    ctx.lineWidth = 0.7;
    ctx.setLineDash([2, 4]);
    ctx.beginPath();
    ctx.arc(cx, cy, r + 10, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    for (let i = 0; i < 60; i++) {
      const ang = (i / 60) * Math.PI * 2;
      const major = i % 5 === 0;
      const inner = r + 14;
      const outer = r + (major ? 26 : 20);
      ctx.strokeStyle = major ? 'rgba(0, 240, 255, 0.42)' : 'rgba(0, 240, 255, 0.22)';
      ctx.lineWidth = major ? 1.1 : 0.7;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(ang) * inner, cy + Math.sin(ang) * inner);
      ctx.lineTo(cx + Math.cos(ang) * outer, cy + Math.sin(ang) * outer);
      ctx.stroke();
    }
    ctx.restore();

    MARKERS.forEach((m, idx) => {
      const projected = projection([m.lon, m.lat]);
      if (!projected) return;
      const [px, py] = projected;
      const dx = px - cx;
      const dy = py - cy;
      if (dx * dx + dy * dy > r * r) return;

      const [mr, mg, mb] = hexToRgb(m.color);
      const pulseR = m.status === 'critical' ? 5.4 + Math.sin(t * 5 + idx) * 1.6 :
                     m.status === 'warning' ? 4.6 + Math.sin(t * 3 + idx) * 1.2 : 4.1;

      // Radar "ping" — expanding, fading ripple every ~2.3s per marker
      // (staggered by index so the map never ripples in unison).
      const pingPeriod = 46;
      const pingPhase = ((t * 20 + idx * 2.9) % pingPeriod) / pingPeriod; // 0..1
      const pingR = pulseR + 3 + pingPhase * 24;
      const pingA = (1 - pingPhase) * 0.72;
      ctx.strokeStyle = `rgba(${mr},${mg},${mb},${pingA})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(px, py, pingR, 0, Math.PI * 2);
      ctx.stroke();

      // Sweep highlight: markers recently swept by the beam light up briefly
      let a = sweepAngle - Math.atan2(py - cy, px - cx);
      while (a < 0) a += Math.PI * 2;
      while (a >= Math.PI * 2) a -= Math.PI * 2;
      const swept = a < sweepTrailing;
      const sweepBoost = swept ? 0.28 * (1 - a / sweepTrailing) : 0;

      // Glow aura (brightens as the sweep passes)
      const auraGrad = ctx.createRadialGradient(px, py, 0, px, py, pulseR * 4.4);
      auraGrad.addColorStop(0, `rgba(${mr},${mg},${mb},${0.4 + sweepBoost})`);
      auraGrad.addColorStop(0.42, `rgba(${mr},${mg},${mb},${0.13 + sweepBoost * 0.45})`);
      auraGrad.addColorStop(1, 'transparent');
      ctx.fillStyle = auraGrad;
      ctx.beginPath();
      ctx.arc(px, py, pulseR * 4.4, 0, Math.PI * 2);
      ctx.fill();

      // Core dot — with its own bloom so it is a clear focal point
      ctx.save();
      ctx.shadowColor = `rgba(${mr},${mg},${mb},0.95)`;
      ctx.shadowBlur = 14;
      ctx.fillStyle = m.color;
      ctx.beginPath();
      ctx.arc(px, py, pulseR, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Inner bright core
      ctx.fillStyle = `rgba(255,255,255,0.88)`;
      ctx.beginPath();
      ctx.arc(px, py, pulseR * 0.4, 0, Math.PI * 2);
      ctx.fill();

      // Label (dim until swept, then pops)
      ctx.fillStyle = `rgba(${mr},${mg},${mb},${Math.min(1, 0.82 + sweepBoost * 1.5)})`;
      ctx.font = `bold 7.5px "JetBrains Mono", monospace`;
      ctx.textAlign = 'center';
      ctx.fillText(m.name, px, py - pulseR - 6);

      // Status sub-label
      ctx.fillStyle = `rgba(${mr},${mg},${mb},0.58)`;
      ctx.font = `5.5px "JetBrains Mono", monospace`;
      ctx.fillText(m.label, px, py - pulseR - 0);
    });

    // ── Inner highlight ──
    const hlGrad = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, 0, cx, cy, r);
    hlGrad.addColorStop(0, 'rgba(0, 240, 255,0.06)');
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
    ctx.strokeStyle = 'rgba(0, 240, 255,0.2)';
    ctx.lineWidth = 1;
    const bSize = 8;
    // Top-left
    ctx.beginPath(); ctx.moveTo(6, 6 + bSize); ctx.lineTo(6, 6); ctx.lineTo(6 + bSize, 6); ctx.stroke();
    // Top-right
    ctx.beginPath(); ctx.moveTo(w - 6 - bSize, 6); ctx.lineTo(w - 6, 6); ctx.lineTo(w - 6, 6 + bSize); ctx.stroke();
    // Bottom-left
    ctx.beginPath(); ctx.moveTo(6, h - 6 - bSize); ctx.lineTo(6, h - 6); ctx.lineTo(6 + bSize, h - 6); ctx.stroke();
    // Bottom-right
    ctx.beginPath(); ctx.moveTo(w - 6 - bSize, h - 6); ctx.lineTo(w - 6, h - 6); ctx.lineTo(w - 6, h - 6 - bSize); ctx.stroke();    // ── HUD labels ──
    ctx.fillStyle = 'rgba(0, 240, 255,0.35)';
    ctx.font = '6px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('SAT-LINK RADAR', 10, 16);
    ctx.fillStyle = 'rgba(0, 240, 255,0.2)';
    ctx.font = '5px "JetBrains Mono", monospace';
    ctx.fillText(`ZOOM ${(zoom * 100).toFixed(0)}%`, 10, 24);
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(0, 240, 255,0.25)';
    ctx.fillText(`${MARKERS.length} STATIONS`, w - 10, 16);
    const activeCount = MARKERS.filter(m => m.status === 'active').length;
    ctx.fillText(`${activeCount} ONLINE`, w - 10, 24);

    // (legacy straight scan line superseded by the conic sweep wedge above)
  }, []);

  // Size is measured once and then tracked with a ResizeObserver, instead of
  // being read from the DOM (forcing layout) on every single frame.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const measure = () => {
      sizeRef.current = { w: canvas.clientWidth, h: canvas.clientHeight };
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    // 20fps is plenty for a slow sweep, and it is driven by the shared loop
    // (one rAF for the whole dashboard instead of one per canvas).
    return subscribe(draw, { fps: 20, element: canvasRef.current });
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
          width: 22, height: 22, borderRadius: 3,
          background: 'linear-gradient(180deg, rgba(30,44,54,.95), rgba(9,16,22,.95))',
          border: '1px solid rgba(0, 240, 255,0.22)', color: 'rgba(140,240,255,0.85)',
          fontFamily: 'var(--mono)', fontSize: 11, cursor: 'pointer', display: 'grid', placeItems: 'center',
          boxShadow: '0 1px 4px rgba(0,0,0,.55), inset 0 1px 0 rgba(180,240,255,.14), 0 0 10px rgba(0, 240, 255,.05)',
          textShadow: '0 0 6px rgba(0, 240, 255,.5)',
        }} title="Zoom in">+</button>
        <button onClick={() => handleZoom(-0.2)} style={{
          width: 22, height: 22, borderRadius: 3,
          background: 'linear-gradient(180deg, rgba(30,44,54,.95), rgba(9,16,22,.95))',
          border: '1px solid rgba(0, 240, 255,0.22)', color: 'rgba(140,240,255,0.85)',
          fontFamily: 'var(--mono)', fontSize: 11, cursor: 'pointer', display: 'grid', placeItems: 'center',
          boxShadow: '0 1px 4px rgba(0,0,0,.55), inset 0 1px 0 rgba(180,240,255,.14), 0 0 10px rgba(0, 240, 255,.05)',
          textShadow: '0 0 6px rgba(0, 240, 255,.5)',
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
