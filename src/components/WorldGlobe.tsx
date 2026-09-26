import React, { useRef, useEffect, useCallback, useState } from 'react';
import { geoOrthographic, geoGraticule, geoGraticule10, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import topo from 'world-atlas/countries-110m.json';
import { subscribe } from '../lib/animLoop';

// Wireframe coastlines (110m Natural Earth via world-atlas)
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
  { name: 'Frankfurt', lon: 8.68, lat: 50.11, color: '#00ff88', status: 'active', label: 'OPERATIONAL' },
];

const CONNECTIONS: [string, string][] = [
  ['London', 'NYC'],
  ['London', 'Dubai'],
  ['London', 'Frankfurt'],
  ['NYC', 'São Paulo'],
  ['Dubai', 'Singapore'],
  ['Singapore', 'Tokyo'],
  ['Singapore', 'Sydney'],
  ['Tokyo', 'Seoul'],
  ['Frankfurt', 'Mumbai'],
];

function WorldGlobeComponent() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rotRef = useRef<[number, number, number]>([-30, 10, 0]);
  const zoomRef = useRef(1);
  const dragging = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });
  const sizeRef = useRef({ w: 0, h: 0 });
  const [, setZoomLevel] = useState(1);

  // Cached graticule geometries to avoid re-generating objects per frame
  const graticule10 = useRef(geoGraticule10()).current;
  const graticuleStep = useRef(geoGraticule().step([15, 15])()).current;
  const markersMap = useRef(new Map(MARKERS.map((m) => [m.name, m]))).current;

  const draw = useCallback((dt = 1) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const { w, h } = sizeRef.current;
    if (w < 10 || h < 10) return;

    // Resize backing store only if changed
    const targetW = Math.round(w * dpr);
    const targetH = Math.round(h * dpr);
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const cx = w / 2;
    const cy = h / 2;
    const zoom = zoomRef.current;
    const r = Math.min(cx, cy) * 0.76 * zoom;

    // Auto-rotation when not dragging
    if (!dragging.current) {
      rotRef.current[0] += 0.12 * dt;
    }

    const projection = geoOrthographic()
      .scale(r)
      .translate([cx, cy])
      .rotate(rotRef.current)
      .clipAngle(90);

    const path = geoPath(projection, ctx);

    ctx.clearRect(0, 0, w, h);

    // ── STONIC CYBER BACKGROUND: Transparent deep slate with scanlines ──
    const bgGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * 0.7);
    bgGrad.addColorStop(0, 'rgba(10, 14, 23, 0.95)');
    bgGrad.addColorStop(0.7, 'rgba(10, 14, 23, 0.88)');
    bgGrad.addColorStop(1, 'rgba(13, 17, 23, 0.98)');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    // Subtle HUD scanlines
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.02)';
    ctx.lineWidth = 0.5;
    for (let y = 0; y < h; y += 4) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // ── Atmosphere Glow ──
    const atmoGrad = ctx.createRadialGradient(cx, cy, r * 0.85, cx, cy, r * 1.35);
    atmoGrad.addColorStop(0, 'rgba(0, 240, 255, 0.18)');
    atmoGrad.addColorStop(0.4, 'rgba(0, 240, 255, 0.06)');
    atmoGrad.addColorStop(1, 'transparent');
    ctx.fillStyle = atmoGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 1.35, 0, Math.PI * 2);
    ctx.fill();

    // ── Globe Sphere Disk Base ──
    ctx.fillStyle = 'rgba(10, 16, 26, 0.85)';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();

    // Outer Edge Ring (Cyan Glow)
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.35)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();

    // Secondary dashed instrument ring
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.12)';
    ctx.lineWidth = 0.6;
    ctx.setLineDash([3, 5]);
    ctx.beginPath();
    ctx.arc(cx, cy, r + 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // ── Dense Graticule (Lat/Lon Wireframe Grid) ──
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.12)';
    ctx.lineWidth = 0.4;
    ctx.beginPath();
    path.context(ctx)(graticule10);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(0, 240, 255, 0.06)';
    ctx.lineWidth = 0.3;
    ctx.beginPath();
    path.context(ctx)(graticuleStep);
    ctx.stroke();

    // ── Wireframe Coastlines (Stroke-only with 3.5% cyan wash) ──
    ctx.save();
    ctx.beginPath();
    path.context(ctx)(LAND);

    // EXACT SPEC: 3.5% cyan wash fill
    ctx.fillStyle = 'rgba(0, 240, 255, 0.035)';
    ctx.fill();

    // Stroke-only coastline wireframe with subtle glow
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.55)';
    ctx.lineWidth = 0.85;
    ctx.shadowColor = 'rgba(0, 240, 255, 0.4)';
    ctx.shadowBlur = 4;
    ctx.stroke();
    ctx.restore();

    // ── Flowing Connection Arcs between Global Nodes ──
    const now = performance.now() / 1000;
    ctx.save();
    CONNECTIONS.forEach(([fromName, toName], i) => {
      const from = markersMap.get(fromName);
      const to = markersMap.get(toName);
      if (!from || !to) return;

      const p1 = projection([from.lon, from.lat]);
      const p2 = projection([to.lon, to.lat]);
      if (!p1 || !p2) return;

      const mx = (p1[0] + p2[0]) / 2;
      const my = (p1[1] + p2[1]) / 2;
      const dx = mx - cx;
      const dy = my - cy;
      const len = Math.hypot(dx, dy) || 1;
      const lift = Math.min(r * 0.32, len * 0.38);
      const qx = mx + (dx / len) * lift;
      const qy = my + (dy / len) * lift;

      // Base arc link
      ctx.strokeStyle = 'rgba(0, 240, 255, 0.16)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(p1[0], p1[1]);
      ctx.quadraticCurveTo(qx, qy, p2[0], p2[1]);
      ctx.stroke();

      // Flowing energy dash
      const flowOffset = (now * 24 + i * 14) % 36;
      ctx.strokeStyle = 'rgba(0, 240, 255, 0.85)';
      ctx.lineWidth = 1.6;
      ctx.setLineDash([4, 14]);
      ctx.lineDashOffset = -flowOffset;
      ctx.beginPath();
      ctx.moveTo(p1[0], p1[1]);
      ctx.quadraticCurveTo(qx, qy, p2[0], p2[1]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Flowing particle dot along the quadratic curve
      const tProgress = ((now * 0.45 + i * 0.15) % 1);
      const px = (1 - tProgress) * (1 - tProgress) * p1[0] + 2 * (1 - tProgress) * tProgress * qx + tProgress * tProgress * p2[0];
      const py = (1 - tProgress) * (1 - tProgress) * p1[1] + 2 * (1 - tProgress) * tProgress * qy + tProgress * tProgress * p2[1];

      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = '#00f0ff';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(px, py, 1.8, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();

    // ── Station Markers & Radar Pings ──
    MARKERS.forEach((m, idx) => {
      const projected = projection([m.lon, m.lat]);
      if (!projected) return;
      const [px, py] = projected;
      const dx = px - cx;
      const dy = py - cy;
      if (dx * dx + dy * dy > r * r) return;

      const [mr, mg, mb] = hexToRgb(m.color);
      const pulseR = m.status === 'critical' ? 4.8 + Math.sin(now * 5 + idx) * 1.2 : 3.8;

      // Expanding radar ripple ping
      const pingPeriod = 2.4;
      const pingPhase = ((now + idx * 0.4) % pingPeriod) / pingPeriod;
      const pingR = pulseR + pingPhase * 20;
      const pingA = (1 - pingPhase) * 0.65;

      ctx.strokeStyle = `rgba(${mr},${mg},${mb},${pingA})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(px, py, pingR, 0, Math.PI * 2);
      ctx.stroke();

      // Node glow
      const aura = ctx.createRadialGradient(px, py, 0, px, py, pulseR * 3.5);
      aura.addColorStop(0, `rgba(${mr},${mg},${mb},0.4)`);
      aura.addColorStop(1, 'transparent');
      ctx.fillStyle = aura;
      ctx.beginPath();
      ctx.arc(px, py, pulseR * 3.5, 0, Math.PI * 2);
      ctx.fill();

      // Core dot
      ctx.save();
      ctx.fillStyle = m.color;
      ctx.shadowColor = m.color;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(px, py, pulseR, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Hot center
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(px, py, pulseR * 0.4, 0, Math.PI * 2);
      ctx.fill();

      // Station label
      ctx.fillStyle = 'rgba(224, 230, 237, 0.85)';
      ctx.font = 'bold 7px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(m.name, px, py - pulseR - 5);

      ctx.fillStyle = `rgba(${mr},${mg},${mb},0.75)`;
      ctx.font = '5.5px "JetBrains Mono", monospace';
      ctx.fillText(m.label, px, py - pulseR - 0);
    });

    // ── HUD Corner Brackets & Readouts ──
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.25)';
    ctx.lineWidth = 1;
    const bSize = 8;
    // Corners
    ctx.beginPath(); ctx.moveTo(6, 6 + bSize); ctx.lineTo(6, 6); ctx.lineTo(6 + bSize, 6); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(w - 6 - bSize, 6); ctx.lineTo(w - 6, 6); ctx.lineTo(w - 6, 6 + bSize); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(6, h - 6 - bSize); ctx.lineTo(6, h - 6); ctx.lineTo(6 + bSize, h - 6); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(w - 6 - bSize, h - 6); ctx.lineTo(w - 6, h - 6); ctx.lineTo(w - 6, h - 6 - bSize); ctx.stroke();

    // Labels
    ctx.fillStyle = 'rgba(0, 240, 255, 0.45)';
    ctx.font = '7px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('SAT-LINK RADAR · WIREFRAME', 10, 16);
    ctx.fillStyle = 'rgba(0, 240, 255, 0.3)';
    ctx.font = '6px "JetBrains Mono", monospace';
    ctx.fillText(`ZOOM ${(zoom * 100).toFixed(0)}% · 10 NODES`, 10, 25);
    ctx.textAlign = 'right';
    ctx.fillText(`${MARKERS.filter((m) => m.status === 'active').length} ONLINE`, w - 10, 16);
  }, [graticule10, graticuleStep, markersMap]);

  // Size observer
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

  // Shared 60fps animation subscription with offscreen pausing
  useEffect(() => {
    return subscribe(draw, { fps: 60, element: canvasRef.current });
  }, [draw]);

  // Pointer drag interaction
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
  const onMouseUp = () => {
    dragging.current = false;
  };

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
  const onTouchEnd = () => {
    dragging.current = false;
  };

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
      <div
        style={{
          position: 'absolute',
          bottom: 8,
          right: 8,
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
          zIndex: 5,
        }}
      >
        <button
          onClick={() => handleZoom(0.2)}
          style={{
            width: 22,
            height: 22,
            borderRadius: 2,
            background: 'rgba(10, 14, 23, 0.9)',
            border: '1px solid rgba(0, 240, 255, 0.25)',
            color: '#00f0ff',
            fontFamily: 'var(--mono)',
            fontSize: 11,
            cursor: 'pointer',
            display: 'grid',
            placeItems: 'center',
            boxShadow: '0 0 10px rgba(0, 240, 255, 0.1)',
          }}
          title="Zoom in"
        >
          +
        </button>
        <button
          onClick={() => handleZoom(-0.2)}
          style={{
            width: 22,
            height: 22,
            borderRadius: 2,
            background: 'rgba(10, 14, 23, 0.9)',
            border: '1px solid rgba(0, 240, 255, 0.25)',
            color: '#00f0ff',
            fontFamily: 'var(--mono)',
            fontSize: 11,
            cursor: 'pointer',
            display: 'grid',
            placeItems: 'center',
            boxShadow: '0 0 10px rgba(0, 240, 255, 0.1)',
          }}
          title="Zoom out"
        >
          −
        </button>
      </div>
    </div>
  );
}

function hexToRgb(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) || 0;
  const g = parseInt(hex.slice(3, 5), 16) || 0;
  const b = parseInt(hex.slice(5, 7), 16) || 0;
  return [r, g, b];
}

const WorldGlobe = React.memo(WorldGlobeComponent);
export default WorldGlobe;
