import React, { useRef, useEffect, useCallback } from 'react';
import { geoOrthographic, geoGraticule10, geoPath, geoInterpolate } from 'd3-geo';

const MARKERS: { name: string; lon: number; lat: number; color: string }[] = [
  { name: 'NYC', lon: -74, lat: 40.7, color: '#3ad6ea' },
  { name: 'London', lon: 0, lat: 51.5, color: '#3ad6ea' },
  { name: 'Tokyo', lon: 139.7, lat: 35.7, color: '#3ad6ea' },
  { name: 'Mumbai', lon: 72.9, lat: 19.1, color: '#45df9b' },
  { name: 'Sydney', lon: 151.2, lat: -33.9, color: '#45df9b' },
  { name: 'Dubai', lon: 55.3, lat: 25.2, color: '#f09b47' },
  { name: 'São Paulo', lon: -46.6, lat: -23.5, color: '#3ad6ea' },
  { name: 'Singapore', lon: 103.8, lat: 1.35, color: '#45df9b' },
];

export default function WorldGlobe() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rotRef = useRef([-30, 10, 0]); // [λ, φ, γ]
  const dragging = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });
  const animRef = useRef(0);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = rect.width;
    const h = rect.height;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    const cx = w / 2;
    const cy = h / 2;
    const r = Math.min(cx, cy) * 0.82;

    // Slow auto-rotation
    if (!dragging.current) {
      rotRef.current[0] += 0.12;
    }

    const projection = geoOrthographic()
      .scale(r)
      .translate([cx, cy])
      .rotate(rotRef.current)
      .clipAngle(90);

    const path = geoPath(projection, ctx);

    ctx.clearRect(0, 0, w, h);

    // Atmosphere glow
    const atmoGrad = ctx.createRadialGradient(cx, cy, r * 0.85, cx, cy, r * 1.25);
    atmoGrad.addColorStop(0, 'rgba(58,214,234,0.07)');
    atmoGrad.addColorStop(0.6, 'rgba(58,214,234,0.02)');
    atmoGrad.addColorStop(1, 'transparent');
    ctx.fillStyle = atmoGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 1.25, 0, Math.PI * 2);
    ctx.fill();

    // Globe body
    const bodyGrad = ctx.createRadialGradient(cx - r * 0.15, cy - r * 0.15, 0, cx, cy, r);
    bodyGrad.addColorStop(0, 'rgba(14,38,48,0.95)');
    bodyGrad.addColorStop(0.7, 'rgba(8,18,28,0.98)');
    bodyGrad.addColorStop(1, 'rgba(4,10,16,1)');
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();

    // Globe border
    ctx.strokeStyle = 'rgba(58,214,234,0.18)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();

    // Graticule (lat/lon grid)
    const graticule = geoGraticule10();
    ctx.strokeStyle = 'rgba(58,214,234,0.08)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    path.context(ctx)(graticule);
    ctx.stroke();

    // Inner glow highlight
    const highlightGrad = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, 0, cx, cy, r);
    highlightGrad.addColorStop(0, 'rgba(58,214,234,0.06)');
    highlightGrad.addColorStop(0.5, 'transparent');
    highlightGrad.addColorStop(1, 'transparent');
    ctx.fillStyle = highlightGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();

    // Markers
    const t = Date.now() / 1000;
    MARKERS.forEach((m, idx) => {
      const projected = projection([m.lon, m.lat]);
      if (!projected) return;
      const [px, py] = projected;

      // Check if on visible side
      const center = projection.rotate();
      const d3Proj = projection as any;
      const greatCircle = d3Proj.greatCircle?.() || null;
      // Simple visibility check: is the dot on the front?
      const p3 = geoInterpolate(projection.rotate().map((v: number) => -v) as [number, number], [m.lon, m.lat]);
      // Just use the projected point; if it's within bounds, draw it
      const dx = px - cx;
      const dy = py - cy;
      if (dx * dx + dy * dy > r * r) return; // behind globe

      const pulse = Math.sin(t * 2.5 + idx * 1.1) * 2 + 5;

      // Pulse ring
      ctx.strokeStyle = `${m.color}44`;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.arc(px, py, pulse, 0, Math.PI * 2);
      ctx.stroke();

      // Dot
      ctx.fillStyle = m.color;
      ctx.beginPath();
      ctx.arc(px, py, 2.5, 0, Math.PI * 2);
      ctx.fill();

      // Label
      ctx.fillStyle = `${m.color}88`;
      ctx.font = `bold 7px "JetBrains Mono", monospace`;
      ctx.textAlign = 'center';
      ctx.fillText(m.name, px, py - 8);
    });

    // Specular reflection
    const specGrad = ctx.createRadialGradient(cx - r * 0.25, cy - r * 0.3, 0, cx - r * 0.25, cy - r * 0.3, r * 0.6);
    specGrad.addColorStop(0, 'rgba(255,255,255,0.03)');
    specGrad.addColorStop(1, 'transparent');
    ctx.fillStyle = specGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();

    animRef.current = requestAnimationFrame(draw);
  }, []);

  useEffect(() => {
    animRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animRef.current);
  }, [draw]);

  // Mouse drag for rotation
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

  return (
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
  );
}
