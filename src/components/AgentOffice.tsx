import React, { useRef, useEffect, useCallback } from 'react';
import { getOrchestration, applyLiveStatus } from '../lib/orchestration';
import { isActiveStatus } from '../lib/agentRouter';
import { subscribe } from '../lib/animLoop';

interface Agent {
  name: string;
  role: string;
  color: string;
  status: string;
  initials: string;
  department: string;
}

interface AgentOfficeProps {
  agents: Agent[];
  onSelectAgent: (agent: Agent) => void;
  /** Agent currently holding a delegated task (the store is authoritative). */
  focusAgent?: string | null;
}

// ─────────────────────────────────────────────────────────────
// NASI Agent Office — canvas-rendered operations floor
// Textured floor (panels + seams + scuffs) → sparse per-zone props
// (one wall screen + one plant) → desks → monitors → seated agent
// sprites with varied idle behaviour → hover tooltip → click to select
// Deliberately spacious: each zone is a desk + agent + a prop or two,
// with clean, readable floor between zones (no wall-to-wall furniture).
// ─────────────────────────────────────────────────────────────

const GRID_COLS = 4;
const TILE = 34;
const ZONE_ORDER = ['Core', 'Research', 'Web', 'Commerce', 'Infrastructure', 'Communication', 'Security'];

type Desk = { agent: Agent; cx: number; deskY: number; w: number; h: number; scale: number };
type Cell = { dept: string; color: string; col: number; row: number; left: number; top: number; w: number; h: number; desks: Desk[] };
type Layout = { cells: Cell[]; rows: number; cellW: number; cellH: number; scale: number };

// Sprite / furniture dimensions at scale 1. Sprite totals ≈31px (head + torso),
// ~2.6× the previous 12px-wide placeholder while still fitting every zone.
const BASE = { deskW: 66, deskH: 18, spriteW: 16, torsoH: 20, headR: 5.5 };

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function computeLayout(list: Agent[], W: number, H: number): Layout {
  // Group agents by department in fixed zone order (Infrastructure holds 2 agents
  // → rendered as one merged zone spanning two cells, no wall between them).
  const grouped: { dept: string; agents: Agent[] }[] = [];
  for (const dept of ZONE_ORDER) {
    const inDept = list.filter(a => a.department === dept);
    if (inDept.length) grouped.push({ dept, agents: inDept });
  }
  for (const a of list) {
    if (!ZONE_ORDER.includes(a.department)) {
      let g = grouped.find(x => x.dept === a.department);
      if (!g) { g = { dept: a.department, agents: [] }; grouped.push(g); }
      g.agents.push(a);
    }
  }
  const rows = Math.max(1, Math.ceil(grouped.length / GRID_COLS));
  const cellW = W / GRID_COLS;
  const cellH = H / rows;
  // Sprites/furniture scale with the zone height so mobile and desktop keep the
  // same proportions instead of one breakpoint looking cramped.
  const s = clamp(cellH / 158, 0.6, 1.05);
  const deskW = BASE.deskW * s;
  const deskH = BASE.deskH * s;
  const cells: Cell[] = grouped.map((g, i) => {
    const col = i % GRID_COLS;
    const row = Math.floor(i / GRID_COLS);
    const left = col * cellW;
    const top = row * cellH;
    const desks: Desk[] = g.agents.map((agent, j) => ({
      agent,
      cx: left + cellW / 2 + (g.agents.length > 1 ? (j === 0 ? -0.2 : 0.2) * cellW : 0),
      // Desks sit below the wall zone but are raised ~17px from the old bottom-
      // hugging position: the reference gives the desk row visibly more air
      // above the zone divider / department labels. The 58px floor keeps sprite
      // heads (top ~ deskY - 34) clear of the wall band + screens (~21px deep).
      deskY: top + Math.max(cellH * 0.60 - 17, 58),
      w: deskW,
      h: deskH,
      scale: s,
    }));
    return { dept: g.dept, color: g.agents[0]?.color || '#2cb8d4', col, row, left, top, w: cellW, h: cellH, desks };
  });
  return { cells, rows, cellW, cellH, scale: s };
}

function pickDesk(list: Agent[], W: number, H: number, x: number, y: number): Desk | null {
  const layout = computeLayout(list, W, H);
  for (const cell of layout.cells) {
    for (const d of cell.desks) {
      if (
        x > d.cx - d.w / 2 - 6 && x < d.cx + d.w / 2 + 6 &&
        y > d.deskY - 32 * d.scale && y < d.deskY + d.h + 22
      ) return d;
    }
  }
  return null;
}

/**
 * Static floor layer — checkerboard tiles, panel seams, tile grid, scuffs and
 * the ambient light pools. Nothing here changes between frames, yet it used to
 * be redrawn on every single frame: ~250 fillRect + ~250 strokeRect calls plus
 * six radial gradients per paint. It is now rendered once into an offscreen
 * canvas and blitted in one drawImage.
 */
function drawFloorLayer(g: CanvasRenderingContext2D, W: number, H: number, cellW: number) {
  g.fillStyle = '#070809';
  g.fillRect(0, 0, W, H);
  for (let c = 0; c < Math.ceil(W / TILE); c++) {
    for (let r = 0; r < Math.ceil(H / TILE); r++) {
      const x = c * TILE, y = r * TILE;
      g.fillStyle = (c + r) % 2 === 0 ? '#080a0d' : '#090c0f';
      g.fillRect(x, y, TILE, TILE);
    }
  }

  // Panel seams — larger floor bays every 3 tiles, brighter than the grid.
  g.strokeStyle = 'rgba(140, 180, 205, .055)';
  g.lineWidth = 1;
  for (let c = 0; c <= Math.ceil(W / TILE); c += 3) {
    g.beginPath(); g.moveTo(c * TILE + 0.5, 0); g.lineTo(c * TILE + 0.5, H); g.stroke();
  }
  for (let r = 0; r <= Math.ceil(H / TILE); r += 3) {
    g.beginPath(); g.moveTo(0, r * TILE + 0.5); g.lineTo(W, r * TILE + 0.5); g.stroke();
  }

  // Fine tile grid — subtle, keeps the checkerboard legible.
  g.strokeStyle = 'rgba(0, 240, 255, .038)';
  g.lineWidth = 0.5;
  for (let c = 0; c < Math.ceil(W / TILE); c++) {
    for (let r = 0; r < Math.ceil(H / TILE); r++) {
      g.strokeRect(c * TILE + 0.25, r * TILE + 0.25, TILE - 0.5, TILE - 0.5);
    }
  }

  // Scuffs / scratches — deterministic diagonal marks so the surface looks worn.
  g.lineWidth = 0.7;
  for (let n = 0; n < 46; n++) {
    const sx0 = ((n * 197) % (W + 120)) - 60;
    const sy0 = ((n * 331) % H);
    const len = 9 + (n % 5) * 5;
    g.strokeStyle = n % 3 === 0 ? 'rgba(160, 195, 215, .04)' : 'rgba(90, 120, 140, .035)';
    g.beginPath();
    g.moveTo(sx0, sy0);
    g.lineTo(sx0 + len * 0.7, sy0 + len * 0.28);
    g.stroke();
  }

  // Ambient ceiling lights: 1–2 soft light pools per zone column, cast low
  // on the floor so the surface reads as lit rather than uniformly flat.
  for (let c = 0; c < GRID_COLS; c++) {
    const cxm = (c + 0.5) * cellW;
    for (const [ly, lr, la] of [[H * 0.38, cellW * 0.62, 0.016], [H * 0.72, cellW * 0.5, 0.011]] as const) {
      const pool = g.createRadialGradient(cxm, ly, 6, cxm, ly, lr);
      pool.addColorStop(0, `rgba(120, 195, 225, ${la})`);
      pool.addColorStop(0.55, `rgba(120, 195, 225, ${la * 0.4})`);
      pool.addColorStop(1, 'transparent');
      g.fillStyle = pool;
      g.fillRect(c * cellW, 0, cellW, H);
    }
  }
}

export default function AgentOffice({ agents, onSelectAgent, focusAgent = null }: AgentOfficeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const timeRef = useRef(0);
  /** Canvas CSS size, tracked by a ResizeObserver instead of being read from
   *  the DOM (which forces layout) on every frame. */
  const sizeRef = useRef({ w: 0, h: 0 });
  /** Cached static floor layer (offscreen canvas) + the key it was built for. */
  const floorRef = useRef<{ key: string; canvas: HTMLCanvasElement } | null>(null);
  const hoverRef = useRef<{ x: number; y: number } | null>(null);
  const agentsRef = useRef(agents);
  agentsRef.current = agents;
  const onSelectRef = useRef(onSelectAgent);
  onSelectRef.current = onSelectAgent;
  const focusRef = useRef<string | null>(focusAgent);
  focusRef.current = focusAgent;

  /** Environmental prop set for one zone — makes the floor read as a real room. */
  const drawProps = (ctx: CanvasRenderingContext2D, cell: Cell, s: number, t: number) => {
    const { left, top, w, h } = cell;
    const kind = cell.col + cell.row * GRID_COLS;

    // ── Wall screen / notice board (top-left of the zone) ──
    const pw = 30 * s, ph = 21 * s;
    const px0 = left + 10 * s, py0 = top + 5 * s;
    ctx.fillStyle = '#0e141c';
    ctx.fillRect(px0, py0, pw, ph);
    ctx.strokeStyle = 'rgba(0, 240, 255, .28)';
    ctx.lineWidth = 0.8;
    ctx.strokeRect(px0 + 0.5, py0 + 0.5, pw - 1, ph - 1);
    // Faint glowing text lines (slight per-screen flicker)
    const flick = 0.5 + 0.2 * Math.sin(t * 1.7 + kind * 1.3);
    const colors = ['rgba(0,240,255,', 'rgba(0,232,138,', 'rgba(255,179,71,'];
    for (let li = 0; li < 3; li++) {
      ctx.fillStyle = colors[(kind + li) % 3] + (0.22 * flick).toFixed(3) + ')';
      ctx.fillRect(px0 + 3 * s, py0 + (4 + li * 5) * s, (pw - 8 * s) * (li === 1 ? 0.62 : 0.85), 1.6 * s);
    }

    // ── Potted plant (bottom-left of the zone, on the floor) ──
    const fx0 = left + 16 * s, fy0 = top + h - 46 * s;
    ctx.fillStyle = '#1d2a20';
    for (let l = 0; l < 5; l++) {
      const ang = -Math.PI / 2 + (l - 2) * 0.42;
      ctx.beginPath();
      ctx.ellipse(fx0 + Math.cos(ang) * 5 * s, fy0 + Math.sin(ang) * 7 * s, 2.6 * s, 5.2 * s, ang + Math.PI / 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(120, 190, 150, .16)';
    ctx.beginPath(); ctx.ellipse(fx0 - 2 * s, fy0 - 5 * s, 1.6 * s, 3.6 * s, 0.4, 0, Math.PI * 2); ctx.fill();
    // Pot
    ctx.fillStyle = '#3a2a1e';
    ctx.beginPath();
    ctx.moveTo(fx0 - 5 * s, fy0 + 4 * s); ctx.lineTo(fx0 + 5 * s, fy0 + 4 * s);
    ctx.lineTo(fx0 + 3.6 * s, fy0 + 12 * s); ctx.lineTo(fx0 - 3.6 * s, fy0 + 12 * s);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(190, 150, 110, .28)'; ctx.lineWidth = 0.7; ctx.stroke();

    // ── One floor mat per workstation ── Keeps the desk anchored to the floor
    // without surrounding it with furniture; everything else stays open floor.
    for (const d of cell.desks) {
      const ds = d.scale;
      // Floor mat under the workstation — anchors the desk visually
      ctx.fillStyle = 'rgba(22, 29, 37, .32)';
      ctx.fillRect(d.cx - (d.w / 2 + 14 * ds), d.deskY + d.h + 1 * ds, d.w + 28 * ds, 9 * ds);
      ctx.strokeStyle = 'rgba(0, 240, 255, .07)';
      ctx.lineWidth = 0.6;
      ctx.strokeRect(d.cx - (d.w / 2 + 14 * ds) + 0.5, d.deskY + d.h + 1.5 * ds, d.w + 28 * ds - 1, 8 * ds);
    }

  };

  /** Break area — a deliberately calm corner for grid slots no department
   *  occupies: rug, sofa, one round table. Nothing else. */
  const drawBreakArea = (ctx: CanvasRenderingContext2D, left: number, top: number, w: number, h: number, s: number, t: number, seed: number) => {
    const bob = 0.5 + 0.5 * Math.sin(t * 0.9 + seed);

    // Rug
    const rgx = left + w * 0.12, rgy = top + h * 0.34, rgw = w * 0.76, rgh = h * 0.46;
    ctx.fillStyle = 'rgba(24, 42, 48, .5)';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(rgx, rgy, rgw, rgh, 5 * s); else ctx.rect(rgx, rgy, rgw, rgh);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0, 240, 255, .12)';
    ctx.lineWidth = 0.8;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(0, 240, 255, .09)';
    ctx.strokeRect(rgx + 4 * s, rgy + 4 * s, rgw - 8 * s, rgh - 8 * s);

    // Sofa along the top of the rug
    const sfW = w * 0.5, sfH = 16 * s;
    const sfX = left + w * 0.5 - sfW / 2, sfY = top + h * 0.26;
    ctx.fillStyle = '#1b2430';
    ctx.fillRect(sfX, sfY, sfW, sfH);
    ctx.fillStyle = '#233040';
    ctx.fillRect(sfX + 2 * s, sfY + 3 * s, sfW / 3 - 3 * s, sfH - 6 * s);
    ctx.fillRect(sfX + sfW / 3 + 0.5 * s, sfY + 3 * s, sfW / 3 - 3 * s, sfH - 6 * s);
    ctx.fillRect(sfX + (sfW * 2) / 3 + 1 * s, sfY + 3 * s, sfW / 3 - 3 * s, sfH - 6 * s);
    ctx.fillStyle = '#2b3949';
    ctx.fillRect(sfX, sfY, sfW, 4 * s);
    ctx.strokeStyle = 'rgba(150, 175, 196, .22)'; ctx.lineWidth = 0.8;
    ctx.strokeRect(sfX + 0.5, sfY + 0.5, sfW - 1, sfH - 1);

    // Round table
    const tx = left + w * 0.5, ty = top + h * 0.6;
    ctx.fillStyle = '#26313d';
    ctx.beginPath(); ctx.ellipse(tx, ty, 15 * s, 6.5 * s, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(0, 240, 255, .18)'; ctx.lineWidth = 0.8; ctx.stroke();
    ctx.fillStyle = '#1a222c';
    ctx.fillRect(tx - 1.2 * s, ty + 4 * s, 2.4 * s, 8 * s);
    // Mugs on the table
    ctx.fillStyle = `rgba(255, 179, 71, ${0.5 + 0.2 * bob})`;
    ctx.fillRect(tx - 6 * s, ty - 3 * s, 2.6 * s, 2.6 * s);
    ctx.fillStyle = 'rgba(0, 240, 255, .55)';
    ctx.fillRect(tx + 4 * s, ty - 2 * s, 2.6 * s, 2.6 * s);

    // Sign
    ctx.fillStyle = 'rgba(255, 179, 71, .5)';
    ctx.font = '7px monospace'; ctx.textAlign = 'left';
    ctx.fillText('\u25b8 BREAK AREA', left + 8, top + (seed % 2 === 0 ? 36 : 18));
  };

  const draw = useCallback((dt = 1) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const W = sizeRef.current.w;
    const H = sizeRef.current.h;
    if (W < 10 || H < 10) return;

    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      canvas.style.width = W + 'px';
      canvas.style.height = H + 'px';
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const t = (timeRef.current += 0.016 * dt);
    const list = agentsRef.current;
    // Live orchestration state → real Active/Working statuses on the floor.
    const orch = getOrchestration();
    const liveList = applyLiveStatus<Agent>(list, orch);
    const layout = computeLayout(liveList, W, H);
    const s = layout.scale;

    // ══ FLOOR ══ Blitted from the cached static layer (see drawFloorLayer).
    // Deliberately a touch above the page black so the floor reads as a surface
    // rather than a void.
    const floorKey = `${Math.round(W)}x${Math.round(H)}x${Math.round(layout.cellW)}x${dpr}`;
    if (!floorRef.current || floorRef.current.key !== floorKey) {
      const off = document.createElement('canvas');
      off.width = Math.max(1, Math.round(W * dpr));
      off.height = Math.max(1, Math.round(H * dpr));
      const octx = off.getContext('2d');
      if (octx) {
        octx.setTransform(dpr, 0, 0, dpr, 0, 0);
        drawFloorLayer(octx, W, H, layout.cellW);
      }
      floorRef.current = { key: floorKey, canvas: off };
    }
    ctx.drawImage(floorRef.current.canvas, 0, 0, W, H);

    // ══ WALLS ══ Thin baseline only — the roster row directly above acts as
    // this canvas's header, so no top band is wasted here.
    ctx.fillStyle = '#141a21';
    ctx.fillRect(0, 0, W, 3);
    ctx.strokeStyle = 'rgba(0, 240, 255, .22)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, 3.5); ctx.lineTo(W, 3.5); ctx.stroke();
    ctx.fillStyle = 'rgba(0, 240, 255, .26)';
    ctx.font = '7px monospace';
    ctx.textAlign = 'right';
    ctx.fillText('AGENT OPERATIONS CENTER', W - 8, 11);

    const drawSeg = (x1: number, y1: number, x2: number, y2: number) => {
      ctx.strokeStyle = '#161d25'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      ctx.strokeStyle = 'rgba(0, 240, 255, .16)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    };
    for (const cell of layout.cells) {
      // Vertical wall on the cell's right edge (skipped between merged same-dept zones)
      if (cell.col < GRID_COLS - 1) {
        const neighbor = layout.cells.find(c => c.row === cell.row && c.col === cell.col + 1);
        if (!neighbor || neighbor.dept !== cell.dept) {
          const x = cell.left + cell.w;
          const gy = cell.top + cell.h * 0.62;
          const gh = Math.min(34, cell.h * 0.28);
          drawSeg(x, cell.top + 8, x, gy);
          drawSeg(x, gy + gh, x, cell.top + cell.h);
        }
      }
      // Horizontal wall below this cell with a door gap at the walkway
      if (cell.row < layout.rows - 1) {
        const y = cell.top + cell.h;
        const gx = cell.left + cell.w / 2;
        const gw = Math.min(26, cell.w * 0.2);
        drawSeg(cell.left + 8, y, gx - gw / 2, y);
        drawSeg(gx + gw / 2, y, cell.left + cell.w - 8, y);
      }
    }

    // ══ ZONE LABELS ══
    for (const cell of layout.cells) {
      ctx.fillStyle = cell.color;
      ctx.globalAlpha = 0.45;
      ctx.font = '7px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`▸ ${cell.dept.toUpperCase()}`, cell.left + (cell.row === 0 ? 48 : 8), cell.top + (cell.row === 0 ? 20 : 15));
      ctx.globalAlpha = 1;
    }

    // ══ ENVIRONMENTAL PROPS ══ (behind desks/sprites so they read as furniture)
    for (const cell of layout.cells) drawProps(ctx, cell, s, t);

    // ══ BREAK AREAS ══ fill grid slots no department occupies so the floor
    // never leaves a large empty bay.
    const occupied = new Set(layout.cells.map(c => `${c.row}:${c.col}`));
    for (let row = 0; row < layout.rows; row++) {
      for (let col = 0; col < GRID_COLS; col++) {
        if (occupied.has(`${row}:${col}`)) continue;
        drawBreakArea(ctx, col * layout.cellW, row * layout.cellH, layout.cellW, layout.cellH, s, t, row * GRID_COLS + col);
      }
    }

    // ══ DESKS + SPRITES + MONITORS ══
    let gi = 0;
    for (const cell of layout.cells) {
      for (const d of cell.desks) {
        const i = gi++;
        const active = isActiveStatus(d.agent.status);
        const focused = focusRef.current === d.agent.name || orch.agent === d.agent.name;
        const ds = d.scale;

        // ── Idle variation ── Each agent owns its own rhythm (frequency + phase),
        // and periodically performs a distinct micro-action on a staggered timer.
        const freq = 2.55 + (i % 3) * 0.5;              // ~2.5–3.5 rad/s, per agent
        const phase = i * 1.7 + (i % 5) * 0.61;
        const bob = Math.sin(t * (active ? 3.4 : freq) + phase) * (active ? 1.5 : 1.4) * ds;
        const leanX = Math.sin(t * (active ? 2.3 : freq * 0.42) + phase * 0.7) * (active ? 1.0 : 0.7) * ds;
        const typingY = active
          ? Math.abs(Math.sin(t * 11 + i * 4)) * 2.2 * ds
          : Math.sin(t * 1.5 + phase) * 0.7 * ds;

        // Micro-action: 8–15s period per agent, ~1.8s action window.
        const period = 8 + (i % 4) * 2.3 + (i % 2) * 0.7;
        const cyc = ((t + phase * 3.1) % period) / period;
        const inAct = !active && cyc < 0.15;
        const ap = inAct ? Math.sin((cyc / 0.15) * Math.PI) : 0;  // 0→1→0 ease
        const actKind = i % 3;                                     // 0 head-turn, 1 lean-back, 2 stretch
        const headTurn = actKind === 0 ? ap * 4.5 * ds * Math.sin(t * 1.3 + i) : 0;
        const leanBack = actKind === 1 ? ap * 3 * ds : 0;
        const stretch = actKind === 2 ? ap : 0;

        const bodyTop = d.deskY - (BASE.torsoH - 6) * ds + bob + leanBack;
        const sx = d.cx + leanX;
        const torsoW = BASE.spriteW * ds;
        const torsoH = BASE.torsoH * ds;
        const headR = BASE.headR * ds;

        // Chair back (behind the body)
        ctx.fillStyle = '#1b2231';
        ctx.beginPath();
        const chW = torsoW + 6 * ds, chH = torsoH * 0.62;
        const chX = sx - chW / 2, chY = bodyTop + torsoH * 0.34;
        ctx.moveTo(chX + 3 * ds, chY);
        ctx.lineTo(chX + chW - 3 * ds, chY);
        ctx.lineTo(chX + chW, chY + chH);
        ctx.lineTo(chX, chY + chH);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(150, 180, 210, .16)';
        ctx.fillRect(chX + 2 * ds, chY, chW - 4 * ds, 1.6 * ds);
        // Chair post
        ctx.fillStyle = '#141a22';
        ctx.fillRect(sx - 2 * ds, chY + chH, 4 * ds, 6 * ds);

        // Body — visible outfit: shirt block over darker trousers/lower
        ctx.fillStyle = d.agent.color;
        ctx.fillRect(sx - torsoW / 2, bodyTop, torsoW, torsoH);
        // Shoulders (slightly lighter top band)
        ctx.fillStyle = 'rgba(255,255,255,.13)';
        ctx.fillRect(sx - torsoW / 2, bodyTop, torsoW, 4 * ds);
        // Collar notch
        ctx.fillStyle = 'rgba(0,0,0,.35)';
        ctx.beginPath();
        ctx.moveTo(sx - 3 * ds, bodyTop);
        ctx.lineTo(sx + 3 * ds, bodyTop);
        ctx.lineTo(sx, bodyTop + 4.5 * ds);
        ctx.closePath(); ctx.fill();
        // Shirt shading + belt line
        ctx.fillStyle = 'rgba(0,0,0,.28)';
        ctx.fillRect(sx - torsoW / 2, bodyTop + torsoH * 0.66, torsoW, torsoH * 0.34);
        ctx.fillStyle = 'rgba(0,0,0,.45)';
        ctx.fillRect(sx - torsoW / 2, bodyTop + torsoH - 2.5 * ds, torsoW, 2.5 * ds);

        // Arms reaching toward the desk (stretch raises them)
        const armW = 5 * ds, armH = 12 * ds;
        const armLift = stretch * 9 * ds;
        ctx.fillStyle = d.agent.color;
        ctx.fillRect(sx - torsoW / 2 - armW + 1 * ds, bodyTop + 4 * ds - armLift, armW, armH);
        ctx.fillRect(sx + torsoW / 2 - 1 * ds, bodyTop + 4 * ds - armLift, armW, armH);
        // Hands (skin) — breathe/type
        ctx.fillStyle = '#c9a882';
        ctx.fillRect(sx - torsoW / 2 - armW + 1 * ds, bodyTop + 4 * ds + armH - 4 * ds + typingY - armLift, armW, 4 * ds);
        ctx.fillRect(sx + torsoW / 2 - 1 * ds, bodyTop + 4 * ds + armH - 4 * ds - typingY - armLift, armW, 4 * ds);

        // Head (turns during the head-turn micro-action)
        const hx = sx + headTurn, hy = bodyTop - headR - 2 * ds;
        ctx.fillStyle = '#c9a882';
        ctx.beginPath(); ctx.arc(hx, hy, headR, 0, Math.PI * 2); ctx.fill();
        // Hair
        ctx.fillStyle = '#1c1f33';
        ctx.beginPath(); ctx.arc(hx, hy - headR * 0.28, headR, Math.PI * 1.06, Math.PI * 2.02); ctx.fill();
        // Facing indicator — nose wedge + eye pointing at the monitor (+x)
        ctx.fillStyle = '#d8b58d';
        ctx.beginPath();
        ctx.moveTo(hx + headR * 0.72, hy + headR * 0.02);
        ctx.lineTo(hx + headR * 1.22, hy + headR * 0.22);
        ctx.lineTo(hx + headR * 0.72, hy + headR * 0.42);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(hx + headR * 0.42, hy - headR * 0.10, headR * 0.24, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#12161c';
        ctx.beginPath(); ctx.arc(hx + headR * 0.52, hy - headR * 0.10, headR * 0.12, 0, Math.PI * 2); ctx.fill();

        // Desk — wood top + front face for depth (drawn after sprite → seated look)
        ctx.fillStyle = '#4a3524';
        ctx.fillRect(d.cx - d.w / 2, d.deskY, d.w, d.h);
        ctx.fillStyle = '#2e2015';
        ctx.fillRect(d.cx - d.w / 2, d.deskY + d.h * 0.55, d.w, d.h * 0.45);
        ctx.strokeStyle = 'rgba(170, 125, 75, .6)';
        ctx.lineWidth = 1;
        ctx.strokeRect(d.cx - d.w / 2 + 0.5, d.deskY + 0.5, d.w - 1, d.h - 1);
        // Floor reflection — a faint mirrored glow beneath the desk, stronger
        // when the agent's monitor is active (the screen "lights" the floor).
        const refl = ctx.createLinearGradient(0, d.deskY + d.h + 9 * ds, 0, d.deskY + d.h + 9 * ds + 12 * ds);
        refl.addColorStop(0, active ? 'rgba(0, 240, 255, .05)' : 'rgba(150, 190, 215, .022)');
        refl.addColorStop(1, 'transparent');
        ctx.fillStyle = refl;
        ctx.fillRect(d.cx - d.w / 2, d.deskY + d.h + 9 * ds, d.w, 12 * ds);
        // Desk clutter: mug + papers (both on the character's left, clear of the monitor)
        ctx.fillStyle = '#8a6a45';
        ctx.fillRect(d.cx - d.w / 2 + 5 * ds, d.deskY - 4 * ds, 5 * ds, 4 * ds);
        ctx.fillStyle = 'rgba(210, 220, 230, .35)';
        ctx.fillRect(d.cx - d.w / 2 + 14 * ds, d.deskY + 1.5 * ds, 11 * ds, 7 * ds);

        // Monitor — offset to the character's RIGHT so the outfit, arms and face
        // stay visible instead of the screen covering the whole sprite.
        const mW = 19 * ds, mH = 13 * ds;
        const mx = d.cx + 8 * ds, my = d.deskY - mH - 4 * ds;
        ctx.fillStyle = '#0b111c';
        ctx.fillRect(mx, my, mW, mH);
        const scrX = mx + 2 * ds, scrY = my + 2 * ds, scrW = mW - 4 * ds, scrH = mH - 4 * ds;
        if (active) {
          ctx.shadowColor = '#00e5ff';
          ctx.shadowBlur = 12;
          ctx.fillStyle = `rgba(0, 240, 255, ${0.62 + 0.38 * Math.abs(Math.sin(t * 3 + i))})`;
          ctx.fillRect(scrX, scrY, scrW, scrH);
          ctx.shadowBlur = 0;
          // Faint "code editor" UI: 4 rows of mono text blocks with an
          // indented line — reads as a real IDE at a glance.
          ctx.fillStyle = 'rgba(0, 22, 34, .55)';
          for (let k = 0; k < 4; k++) {
            const indent = k % 3 === 2 ? 3.5 * ds : 1 * ds;
            ctx.fillRect(scrX + indent, scrY + 2.2 * ds + k * 2.6 * ds, (scrW - indent - 1 * ds) * (0.42 + 0.3 * ((k + i) % 3) / 2), 1.15 * ds);
          }
          // Tiny sparkline graph in the screen corner
          ctx.strokeStyle = 'rgba(255, 255, 255, .5)';
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          const gy0 = scrY + scrH - 2.5 * ds;
          for (let k = 0; k <= 5; k++) {
            const gx = scrX + 1 * ds + (k / 5) * (scrW * 0.4);
            const gy2 = gy0 - (0.4 + 0.6 * Math.abs(Math.sin(t * 2.2 + k * 1.3 + i))) * 3.2 * ds;
            if (k === 0) ctx.moveTo(gx, gy2); else ctx.lineTo(gx, gy2);
          }
          ctx.stroke();
          // Scan shimmer
          ctx.fillStyle = 'rgba(0, 18, 28, .5)';
          for (let k = 0; k < 3; k++) {
            ctx.fillRect(scrX, scrY + ((t * 9 + k * 3.5 + i) % scrH), scrW, 1);
          }
          ctx.fillStyle = 'rgba(255, 255, 255, .18)';
          ctx.fillRect(scrX, scrY + ((t * 4 + i) % scrH), scrW, 1);
        } else {
          // Idle screen: dim with a faint drifting code glow
          ctx.fillStyle = '#26313f';
          ctx.fillRect(scrX, scrY, scrW, scrH);
          ctx.fillStyle = 'rgba(120, 160, 190, .25)';
          for (let k = 0; k < 4; k++) {
            const indent = k % 3 === 2 ? 3 * ds : 1 * ds;
            const lw = (scrW - indent - 1 * ds) * (0.35 + 0.4 * ((k + i) % 3) / 2);
            ctx.fillRect(scrX + indent, scrY + 2.4 * ds + k * 2.8 * ds, lw, 1);
          }
        }
        ctx.strokeStyle = active ? 'rgba(0, 240, 255, .55)' : 'rgba(130, 150, 170, .34)';
        ctx.lineWidth = 1;
        ctx.strokeRect(mx - 1, my - 1, mW + 2, mH + 2);
        // Stand
        ctx.fillStyle = '#141a22';
        ctx.fillRect(mx + mW / 2 - 3 * ds, my + mH, 6 * ds, 4 * ds);

        // Name label
        ctx.fillStyle = active ? '#7df9ff' : d.agent.color;
        ctx.globalAlpha = 0.92;
        ctx.font = '8px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(d.agent.name.toUpperCase(), d.cx, d.deskY + d.h + 13);
        ctx.globalAlpha = 1;

        // ── Working indicators (active agents only) ──
        if (active) {
          const halo = 0.26 + 0.34 * Math.abs(Math.sin(t * 4 + i));
          ctx.strokeStyle = `rgba(0, 240, 255, ${halo})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.ellipse(sx, bodyTop + torsoH * 0.5, torsoW * 0.85, torsoH * 0.72, 0, 0, Math.PI * 2);
          ctx.stroke();
          ctx.fillStyle = 'rgba(0, 240, 255, .95)';
          ctx.font = '7px monospace';
          ctx.textAlign = 'center';
          ctx.fillText('● ACTIVE', d.cx, d.deskY + d.h + 23);
        }
        // Focus ring on the agent the Manager routed this task to
        if (focused && active) {
          ctx.strokeStyle = 'rgba(0, 255, 200, .85)';
          ctx.lineWidth = 1.5;
          ctx.setLineDash([3, 4]);
          ctx.strokeRect(d.cx - d.w / 2 - 7, d.deskY - 36 * ds, d.w + 14, d.h + 52 * ds);
          ctx.setLineDash([]);
        }
      }
    }

    // ══ Hover: highlight + tooltip ══
    const hover = hoverRef.current;
    if (hover) {
      const hovered = pickDesk(liveList, W, H, hover.x, hover.y);
      if (hovered) {
        ctx.strokeStyle = hovered.agent.color;
        ctx.lineWidth = 1.5;
        ctx.globalAlpha = 0.9;
        ctx.strokeRect(hovered.cx - hovered.w / 2 - 6, hovered.deskY - 34 * hovered.scale, hovered.w + 12, hovered.h + 44 * hovered.scale);
        ctx.globalAlpha = 1;
        const label = `${hovered.agent.name} · ${hovered.agent.status}`;
        ctx.font = '9px monospace';
        const tw = ctx.measureText(label).width + 12;
        const tx = Math.min(Math.max(hovered.cx - tw / 2, 4), W - tw - 4);
        const ty = Math.max(10, hovered.deskY - 52 * hovered.scale);
        ctx.fillStyle = 'rgba(4, 8, 14, .94)';
        ctx.fillRect(tx, ty, tw, 16);
        ctx.strokeStyle = hovered.agent.color;
        ctx.lineWidth = 1;
        ctx.strokeRect(tx, ty, tw, 16);
        ctx.fillStyle = hovered.agent.color;
        ctx.textAlign = 'left';
        ctx.fillText(label, tx + 6, ty + 11);
      }
    }

    // ══ Corner HUD readout ══
    ctx.font = '8px monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(0, 240, 255, .35)';
    ctx.fillText(`OFFICE FLOOR — ${list.length} DESKS · ${layout.cells.length} ZONES`, 8, H - 6);
    if (orch.phase !== 'idle') {
      const txt = orch.phase === 'delegating'
        ? `MANAGER DELEGATING → ${(orch.route?.agent ?? '').toUpperCase()}`
        : orch.phase === 'working'
          ? `ACTIVE · ${(orch.agent ?? '').toUpperCase()} — ${orch.route?.reason ?? ''}`
          : `TASK COMPLETE · ${(orch.agent ?? '').toUpperCase()}`;
      ctx.fillStyle = 'rgba(0, 255, 200, .85)';
      ctx.fillText(txt, 8, H - 18);
    }

    // Depth-of-field vignette: darkens the canvas edges so the desk rows
    // read as the focal centre of the room.
    const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.34, W / 2, H / 2, Math.max(W, H) * 0.74);
    vg.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vg.addColorStop(1, 'rgba(0, 0, 0, .5)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);

  }, []); // eslint-disable-line

  useEffect(() => {
    // 16fps idle is smooth for a slow breathing office and costs ~4x less than
    // a full-refresh repaint; a delegating/working office gets 30fps. Driven by
    // the shared single-rAF loop, and it stops while scrolled out of view.
    return subscribe(draw, {
      fps: () => (getOrchestration().phase === 'idle' ? 16 : 30),
      element: canvasRef.current,
    });
  }, [draw]);

  // Track the canvas size once + on resize (ResizeObserver), replacing the
  // per-frame clientWidth/clientHeight reads that forced a layout each frame.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      sizeRef.current = { w: el.clientWidth, h: el.clientHeight };
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Hover + click interaction
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const getPos = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };
    const onMove = (e: MouseEvent) => { hoverRef.current = getPos(e); };
    const onLeave = () => { hoverRef.current = null; };
    const onClick = (e: MouseEvent) => {
      const W = containerRef.current?.clientWidth ?? 0;
      const H = containerRef.current?.clientHeight ?? 0;
      const pos = getPos(e);
      const live = applyLiveStatus<Agent>(agentsRef.current, getOrchestration());
      const desk = pickDesk(live, W, H, pos.x, pos.y);
      if (desk) onSelectRef.current(desk.agent);
    };
    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('mouseleave', onLeave);
    canvas.addEventListener('click', onClick);
    return () => {
      canvas.removeEventListener('mousemove', onMove);
      canvas.removeEventListener('mouseleave', onLeave);
      canvas.removeEventListener('click', onClick);
    };
  }, []);

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative' }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
    </div>
  );
}
