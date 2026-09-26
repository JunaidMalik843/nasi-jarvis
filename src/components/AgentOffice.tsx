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
// Architectural floor plan: a horizontal corridor splits the plate into
// two bands of rooms, with a vertical spur off the corridor. Rooms get
// real walls with doorways and open passages, varied furniture kits,
// desks and agents — not a uniform grid of bordered cells.
// ─────────────────────────────────────────────────────────────

const TILE = 32;
const ZONE_ORDER = ['Core', 'Research', 'Web', 'Commerce', 'Infrastructure', 'Communication', 'Security'];

/** Non-department rooms. Always present so the floor reads as an interior
 *  with a lounge and a utility space, not just department boxes. */
const SPECIAL_ROOMS: { dept: string; kind: 'lounge' | 'server'; color: string }[] = [
  { dept: 'Break Lounge', kind: 'lounge', color: '#ff8c00' },
  { dept: 'Server Room', kind: 'server', color: '#00ff88' },
];

type Desk = { agent: Agent; cx: number; deskY: number; w: number; h: number; scale: number; style: number };
type Cell = {
  dept: string; color: string; col: number; row: number;
  left: number; top: number; w: number; h: number; desks: Desk[];
  band: 'top' | 'bottom'; special?: 'lounge' | 'server';
  kit: number; index: number; doorX: number; openLeft: boolean;
};
type Layout = {
  cells: Cell[]; rows: number; cellW: number; cellH: number; scale: number;
  corridorY: number; corridorH: number; spurX: number; spurW: number;
};

// Exact Stonic sprite footprint: 20×28px at scale 1, assembled from a
// distinct pixel head and body with 1px outlines.
const BASE = { deskW: 66, deskH: 18, spriteW: 20, torsoH: 18, headR: 5 };

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// ─────────────────────────────────────────────────────────────
// Pixel-art agent sprites
// Each body part is painted on a tiny offscreen canvas at 1 sprite
// pixel = 1 canvas pixel (3-tone shading: highlight / base / shadow,
// light coming from the monitor side), then wrapped in an automatic
// 1px tinted silhouette outline. Parts are blitted whole-pixel-aligned
// with smoothing off, so every edge snaps to the grid — no arcs, no
// anti-aliasing, no vector-looking blur. Layers stay separate (head /
// torso / sleeve / hand) so the existing head-turn, typing-hand and
// stretch animations keep working in whole-pixel steps.
// ─────────────────────────────────────────────────────────────
const SP = { torsoW: 16, torsoH: 18, armW: 2, sleeveH: 7, handH: 3, headW: 10, headH: 10 };

/** Skin triples: [highlight, base, shadow] — four tones so the floor isn't uniform. */
const SKIN = [
  ['#f2d3ab', '#d6ab7d', '#9d7350'],
  ['#cf9466', '#a76c44', '#7a4b2e'],
  ['#8f5f41', '#6f4630', '#4e3020'],
  ['#f7e0c6', '#e2c09a', '#b28f6a'],
];
/** Hair triples: [highlight, base, shadow] — paired with the style variants below. */
const HAIR = [
  ['#3c4468', '#242a44', '#14172a'],
  ['#7a5636', '#4e3320', '#2d1d12'],
  ['#262b36', '#171a22', '#0c0e14'],
  ['#9a8258', '#6a583c', '#3e3324'],
];

function rgb2hex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
}

/** Mix two #rrggbb colors — m is the weight of color b. */
function mix(a: string, b: string, m: number): string {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  return rgb2hex(
    ((pa >> 16) & 255) + (((pb >> 16) & 255) - ((pa >> 16) & 255)) * m,
    ((pa >> 8) & 255) + (((pb >> 8) & 255) - ((pa >> 8) & 255)) * m,
    (pa & 255) + ((pb & 255) - (pa & 255)) * m,
  );
}

/** Paint a part at native resolution, then wrap its silhouette in a 1px tinted outline.
 *  Returns null when the paint produced zero opaque pixels (failed build, e.g. a
 *  rejected canvas allocation) so callers can fall back instead of blitting an
 *  invisible empty canvas. */
function buildPart(w: number, h: number, ink: string, paint: (g: CanvasRenderingContext2D) => void): HTMLCanvasElement | null {
  const tmp = document.createElement('canvas');
  tmp.width = w; tmp.height = h;
  const g = tmp.getContext('2d');
  if (!g) return null;
  paint(g);

  const out = document.createElement('canvas');
  out.width = w + 2; out.height = h + 2; // +1px outline padding per side
  const og = out.getContext('2d');
  if (!og) return null;
  // Dilate the silhouette into the padding ring…
  const px = g.getImageData(0, 0, w, h).data;
  og.fillStyle = ink;
  let opaque = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (px[(y * w + x) * 4 + 3] === 0) continue;
      opaque++;
      // +1 because the art is laid down at (1,1) — ring must hug THAT,
      // otherwise the outline drifts a pixel up-left (missing right/bottom edge).
      const ox = x + 1, oy = y + 1;
      og.fillRect(ox, oy, 1, 1);
      og.fillRect(ox - 1, oy, 1, 1); og.fillRect(ox + 1, oy, 1, 1);
      og.fillRect(ox, oy - 1, 1, 1); og.fillRect(ox, oy + 1, 1, 1);
      og.fillRect(ox - 1, oy - 1, 1, 1); og.fillRect(ox + 1, oy - 1, 1, 1);
      og.fillRect(ox - 1, oy + 1, 1, 1); og.fillRect(ox + 1, oy + 1, 1, 1);
    }
  }
  // …then lay the art back on top so only the outer edge shows.
  og.drawImage(tmp, 1, 1);
  return opaque > 0 ? out : null;
}

/** Torso: shoulder slope, 3-tone shirt, V collar, button placket, pocket seam, belt. */
function paintTorso(g: CanvasRenderingContext2D, color: string) {
  const w = SP.torsoW, h = SP.torsoH;
  const hi = mix(color, '#ffffff', 0.30);
  const lo = mix(color, '#000000', 0.34);
  const deep = mix(color, '#000000', 0.55);
  for (let y = 0; y < h; y++) {
    let x0 = 0, x1 = w;
    if (y === 0) { x0 = 4; x1 = 10; }
    else if (y === 1) { x0 = 3; x1 = 11; }
    else if (y === 2) { x0 = 1; x1 = 13; }
    for (let x = x0; x < x1; x++) {
      let c = x < 4 ? lo : x < 9 ? color : hi;
      if (y >= 13) c = x < 4 ? mix(deep, '#000000', 0.25) : x < 9 ? deep : mix(deep, hi, 0.30);
      if (y >= 17) c = y === 17 ? '#161b24' : '#0d1017';
      g.fillStyle = c;
      g.fillRect(x, y, 1, 1);
    }
  }
  // Shirt folds & seams: V collar, button placket, chest-pocket line.
  const fold = mix(color, '#000000', 0.44);
  g.fillStyle = fold;
  [[5, 2], [8, 2], [6, 3], [7, 3]].forEach(([x, y]) => g.fillRect(x, y, 1, 1));
  for (let y = 4; y < 13; y++) g.fillRect(6, y, 1, 1);
  g.fillRect(9, 10, 3, 1); g.fillRect(9, 11, 1, 1);
  g.fillStyle = hi;
  g.fillRect(9, 9, 3, 1);
}

/** Upper arm: sleeve with shoulder cap, 3-tone fold shading and a darker cuff. */
function paintSleeve(g: CanvasRenderingContext2D, color: string) {
  const w = SP.armW, h = SP.sleeveH;
  const hi = mix(color, '#ffffff', 0.30);
  const lo = mix(color, '#000000', 0.34);
  const cuff = mix(color, '#000000', 0.52);
  for (let y = 0; y < h; y++) {
    const x0 = y === 0 ? 1 : 0;
    for (let x = x0; x < w; x++) {
      let c = x < 2 ? lo : x < 4 ? color : hi;
      // Cuff sits on the row ABOVE the hand's outline seam so it stays visible.
      if (y === h - 2) c = cuff;
      g.fillStyle = c;
      g.fillRect(x, y, 1, 1);
    }
  }
}

/** Hand: skin tones with a shadow row where it meets the desk. */
function paintHand(g: CanvasRenderingContext2D, skin: string[]) {
  const [hi, base, lo] = skin;
  for (let y = 0; y < SP.handH; y++) {
    for (let x = 0; x < SP.armW; x++) {
      let c = x < 2 ? lo : x < 4 ? base : hi;
      if (y === SP.handH - 1) c = lo; // desk shadow
      g.fillStyle = c;
      g.fillRect(x, y, 1, 1);
    }
  }
}

/**
 * Head: round skull mask, 3-tone skin (rim light on the monitor side), one of
 * four hair silhouettes (short / bob / spiky / tied-bun) with highlight streak,
 * brow + 2px eye gazing right, 1px nose bump past the skull edge, mouth line.
 */
function paintHead(g: CanvasRenderingContext2D, variant: number, skin: string[], hair: string[]) {
  const cx = 4, cy = 4.5, r = 4.5;
  const inside = (x: number, y: number) => {
    const dx = x - cx, dy = y - cy;
    return dx * dx + dy * dy <= r * r;
  };
  const [skinHi, skinBase, skinLo] = skin;

  // Face mass — 3 tones: rim light front-right, cast shadow under the hair, chin shade.
  for (let y = 0; y < SP.headH; y++) {
    for (let x = 0; x < SP.headW; x++) {
      if (!inside(x, y)) continue;
      let c = skinBase;
      if (x >= 9) c = skinHi;
      else if (y >= 10 || x <= 2) c = skinLo;
      g.fillStyle = c;
      g.fillRect(x, y, 1, 1);
    }
  }

  // Hair silhouette per style.
  const isHair = (x: number, y: number): boolean => {
    if (!inside(x, y)) return false;
    if (variant === 2) {
      // Spiky: shorter cap + jagged fringe.
      if (y <= 2) return true;
      if (y === 3 && x <= 7 && x % 2 === 1) return true;
    } else if (y <= 3) return true;
    if (x <= 1) return y <= (variant === 1 ? 8 : 5); // back of head; bob is longer
    if (variant === 1 && x === 2 && y <= 6) return true; // bob volume
    return false;
  };
  const [hairHi, hairBase, hairLo] = hair;
  for (let y = 0; y < SP.headH; y++) {
    for (let x = 0; x < SP.headW; x++) {
      if (!isHair(x, y)) continue;
      let c = hairBase;
      if (y <= 1 && x >= 3) c = hairHi;   // top streak (ceiling light)
      else if (y === 3 || x <= 1) c = hairLo; // underside / back shadow
      g.fillStyle = c;
      g.fillRect(x, y, 1, 1);
    }
  }
  // Tied-bun variant: extra hair blob outside the skull silhouette.
  if (variant === 3) {
    g.fillStyle = hairBase; g.fillRect(0, 2, 1, 1); g.fillRect(1, 1, 1, 1);
    g.fillStyle = hairHi;   g.fillRect(1, 2, 1, 1);
  }

  // Brow + eye (white then pupil, gaze toward the monitor on the right).
  g.fillStyle = hairLo;  g.fillRect(6, 4, 2, 1);
  g.fillStyle = '#f4f7fa'; g.fillRect(6, 5, 1, 1);
  g.fillStyle = '#10141b'; g.fillRect(7, 5, 1, 1);
  // Nose bump past the skull edge + mouth line.
  g.fillStyle = skinHi; g.fillRect(9, 5, 1, 1);
  g.fillStyle = skinLo; g.fillRect(7, 8, 2, 1);
}

/** Per-piece cache — sprites are static art, rebuilt only on first use.
 *  A null entry means "built, but painted empty" — paint is deterministic, so
 *  the failed result is cached too and the caller uses its fallback. (Note the
 *  explicit has() check: a falsy get() alone would rebuild forever.) */
const spriteCache = new Map<string, HTMLCanvasElement | null>();
function cachePart(key: string, make: () => HTMLCanvasElement | null): HTMLCanvasElement | null {
  if (spriteCache.has(key)) return spriteCache.get(key)!;
  const c = make();
  spriteCache.set(key, c);
  return c;
}

function getAgentSprite(agentIdx: number, color: string) {
  const skinIdx = agentIdx % SKIN.length;
  const hairIdx = (agentIdx * 3 + 1) % HAIR.length;
  const variant = agentIdx % 4;
  const skin = SKIN[skinIdx];
  const hair = HAIR[hairIdx];
  const clothInk = mix(color, '#000000', 0.72);
  const skinInk = mix(skin[1], '#000000', 0.66);
  return {
    torso: cachePart(`t|${color}`, () => buildPart(SP.torsoW, SP.torsoH, clothInk, g => paintTorso(g, color))),
    sleeve: cachePart(`s|${color}`, () => buildPart(SP.armW, SP.sleeveH, clothInk, g => paintSleeve(g, color))),
    hand: cachePart(`hd|${skinIdx}`, () => buildPart(SP.armW, SP.handH, skinInk, g => paintHand(g, skin))),
    head: cachePart(`h|${variant}|${skinIdx}|${hairIdx}`, () => buildPart(SP.headW, SP.headH, skinInk, g => paintHead(g, variant, skin, hair))),
  };
}

/** Set once per session the first time the pixel-art path fails, so the
 *  console shows WHY a fallback is in use without spamming per frame. */
let spriteFallbackWarned = false;

/**
 * Last-resort agent drawing — same silhouette as the pixel-art sprite but
 * painted directly with whole-pixel vector fills (3-tone torso, dark belt,
 * outlined head with hair cap and eye, arms + typing hands). Guarantees an
 * agent is ALWAYS visible at their desk if the cache/build/blit path fails.
 */
function drawFallbackAgent(
  ctx: CanvasRenderingContext2D,
  sxI: number, bodyTopI: number, ds: number, color: string,
  typeL: number, typeR: number, headTurn: number,
) {
  const tw = Math.round(BASE.spriteW * ds), th = Math.round(BASE.torsoH * ds);
  const x0 = Math.round(sxI - tw / 2), y0 = Math.round(bodyTopI);
  const hi = mix(color, '#ffffff', 0.30);
  const lo = mix(color, '#000000', 0.34);
  const deep = mix(color, '#000000', 0.55);
  // 1px dark silhouette behind the torso…
  ctx.fillStyle = mix(color, '#000000', 0.72);
  ctx.fillRect(x0 - 1, y0 - 1, tw + 2, th + 2);
  // …then the 3-tone shirt and belt on top.
  const c1 = Math.round(tw * 0.34), c2 = Math.round(tw * 0.68);
  ctx.fillStyle = lo;   ctx.fillRect(x0, y0, c1, th);
  ctx.fillStyle = color; ctx.fillRect(x0 + c1, y0, c2 - c1, th);
  ctx.fillStyle = hi;   ctx.fillRect(x0 + c2, y0, tw - c2, th);
  ctx.fillStyle = deep; ctx.fillRect(x0, y0 + Math.round(th * 0.74), tw, Math.round(th * 0.26));
  // Arms + hands (skin) typing at the desk edge.
  const armW = Math.max(1, Math.round(2 * ds)), armH = Math.round(8 * ds);
  ctx.fillStyle = mix(color, '#000000', 0.18);
  ctx.fillRect(x0 - armW + 1, y0 + Math.round(4 * ds), armW, armH);
  ctx.fillRect(x0 + tw - 1, y0 + Math.round(4 * ds), armW, armH);
  ctx.fillStyle = '#d6ab7d';
  ctx.fillRect(x0 - armW + 1, y0 + Math.round(13 * ds) + typeL, armW, Math.round(4 * ds));
  ctx.fillRect(x0 + tw - 1, y0 + Math.round(13 * ds) + typeR, armW, Math.round(4 * ds));
  // Head: outlined hair cap + face + one visible eye.
  const hw = Math.round(10 * ds), hh = Math.round(10 * ds);
  const hx = Math.round(sxI + headTurn - hw / 2), hy = Math.round(bodyTopI - hh);
  ctx.fillStyle = '#0c0e14';
  ctx.fillRect(hx - 1, hy - 1, hw + 2, hh + 2);
  ctx.fillStyle = '#e2c09a';
  ctx.fillRect(hx, hy + Math.round(hh * 0.34), hw, Math.round(hh * 0.66));
  ctx.fillStyle = '#242a44';
  ctx.fillRect(hx, hy, hw, Math.round(hh * 0.42));
  ctx.fillStyle = '#10141b';
  ctx.fillRect(hx + Math.round(hw * 0.62), hy + Math.round(hh * 0.55), Math.max(1, Math.round(ds)), Math.max(1, Math.round(ds)));
}

function computeLayout(list: Agent[], W: number, H: number): Layout {
  // Group agents by department in fixed zone order (Infrastructure holds 2
  // agents → one room with two desks, not two half rooms).
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

  const rooms: { dept: string; color: string; agents: Agent[]; special?: 'lounge' | 'server' }[] =
    grouped.map(g => ({ dept: g.dept, color: g.agents[0]?.color || '#00f0ff', agents: g.agents }));
  for (const sp of SPECIAL_ROOMS) rooms.push({ dept: sp.dept, color: sp.color, agents: [], special: sp.kind });

  // The plate: a horizontal corridor with rooms above and below it, plus a
  // vertical spur splitting the lower band — a T-shaped plan reads as a
  // building, where an even grid reads as a spreadsheet.
  const n = rooms.length;
  const topCount = Math.max(1, Math.ceil(n / 2));
  const botCount = Math.max(1, n - topCount);

  const corridorH = Math.round(clamp(H * 0.17, 38, 74));
  const corridorY = Math.round(H * 0.52 - corridorH / 2);
  const spurW = W > 560 ? Math.round(W * 0.09) : 0;
  const topH = corridorY;
  const botY = corridorY + corridorH;
  const botH = H - botY;
  const s = clamp(Math.min(topH, botH) / 150, 0.58, 1.05);
  const deskW = BASE.deskW * s;
  const deskH = BASE.deskH * s;

  const topWidth = W / topCount;
  const botWidth = (W - spurW) / botCount;
  const spurAfter = spurW > 0 ? Math.floor(botCount / 2) : -1;

  const cells: Cell[] = rooms.map((room, i) => {
    const isTop = i < topCount;
    const k = isTop ? i : i - topCount;
    const w = isTop ? topWidth : botWidth;
    const left = isTop ? k * w : k * w + (spurAfter >= 0 && k >= spurAfter ? spurW : 0);
    const top = isTop ? 0 : botY;
    const h = isTop ? topH : botH;
    // Usable floor inside the room, between its outer wall and the corridor.
    const floorTop = isTop ? 13 : botY + 6;
    const floorBottom = isTop ? corridorY - 3 : top + h - 4;
    const desks: Desk[] = (() => {
      // Two-desk rooms (Infrastructure) sit side by side when the room is wide
      // enough, and stack front-to-back when it is not — otherwise the outer
      // desks overhang the room walls on narrow viewports.
      const sideBySide = room.agents.length < 2 || w >= deskW * 2 + 8 * s;
      const spreadX = sideBySide
        ? Math.min(w * 0.2, Math.max(0, w / 2 - deskW / 2 - 4 * s))
        : 0;
      const stackY = sideBySide ? 0 : deskH * 1.6 + 4 * s;
      const baseDeskY = clamp(
        floorTop + (floorBottom - floorTop) * 0.68,
        floorTop + 32 * s,
        floorBottom - 3,
      );
      return room.agents.map((agent, j) => {
        const sign = j === 0 ? -1 : 1;
        return {
          agent,
          cx: left + w / 2 + (room.agents.length > 1 ? sign * spreadX : 0),
          deskY: clamp(
            baseDeskY + (room.agents.length > 1 && !sideBySide ? sign * stackY : 0),
            floorTop + 32 * s,
            floorBottom - 3,
          ),
          w: deskW,
          h: deskH,
          scale: s,
          // Four desk builds so neighbouring rooms never look copy-pasted.
          style: (i * 3 + j) % 4,
        };
      });
    })();
    return {
      dept: room.dept,
      color: room.color,
      col: k,
      row: isTop ? 0 : 1,
      left, top, w, h, desks,
      band: isTop ? 'top' : 'bottom',
      special: room.special,
      kit: i % 6,
      index: i,
      // Doors alternate left/right of centre so the corridor wall is not a
      // repeating pattern, and every other room keeps its left wall open so
      // the rooms are connected by passages as well as doors.
      doorX: left + w * (k % 2 === 0 ? 0.34 : 0.66),
      openLeft: k > 0 && k % 2 === 1,
    };
  });

  return {
    cells, rows: 2,
    cellW: Math.max(topWidth, botWidth), cellH: topH,
    scale: s,
    corridorY, corridorH,
    spurX: spurAfter >= 0 ? spurAfter * botWidth : 0,
    spurW: spurAfter >= 0 ? spurW : 0,
  };
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
function drawFloorLayer(g: CanvasRenderingContext2D, W: number, H: number, layout: Layout) {
  // Exact 32×32 floor tiles over the Stonic background, with the reference's
  // low-contrast white grid. Corridors are carved by the wall/door geometry above.
  g.fillStyle = '#0a0e17';
  g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgba(255,255,255,0.02)';
  g.lineWidth = 1;
  g.beginPath();
  for (let x = 0; x <= W; x += TILE) {
    g.moveTo(x + 0.5, 0);
    g.lineTo(x + 0.5, H);
  }
  for (let y = 0; y <= H; y += TILE) {
    g.moveTo(0, y + 0.5);
    g.lineTo(W, y + 0.5);
  }
  g.stroke();

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

  // Ambient ceiling lights: one soft pool per room, so light follows the plan
  // instead of an invisible column grid.
  for (const cell of layout.cells) {
    const cxm = cell.left + cell.w / 2;
    const cym = cell.top + cell.h * 0.58;
    const lr = Math.max(cell.w, cell.h) * 0.62;
    const pool = g.createRadialGradient(cxm, cym, 6, cxm, cym, lr);
    pool.addColorStop(0, 'rgba(120, 195, 225, 0.016)');
    pool.addColorStop(0.55, 'rgba(120, 195, 225, 0.006)');
    pool.addColorStop(1, 'transparent');
    g.fillStyle = pool;
    g.fillRect(cell.left, cell.top, cell.w, cell.h);
  }
}

function AgentOfficeComponent({ agents, onSelectAgent, focusAgent = null }: AgentOfficeProps) {
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

  /** Wall-hung fitting: a lit panel with three text rows. Used by several kits. */
  const drawWallScreen = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, kind: number, t: number, s: number) => {
    ctx.fillStyle = '#0e141c';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(0, 240, 255, .28)';
    ctx.lineWidth = 0.8;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    const flick = 0.5 + 0.2 * Math.sin(t * 1.7 + kind * 1.3);
    const colors = ['rgba(0, 240, 255,', 'rgba(0,255,136,', 'rgba(255, 140, 0,'];
    for (let li = 0; li < 3; li++) {
      ctx.fillStyle = colors[(kind + li) % 3] + (0.22 * flick).toFixed(3) + ')';
      ctx.fillRect(x + 3 * s, y + (4 + li * 5) * s, (w - 8 * s) * (li === 1 ? 0.62 : 0.85), 1.6 * s);
    }
  };

  /** Potted plant — kept as one option among many, not a fixture of every room. */
  const drawPlant = (ctx: CanvasRenderingContext2D, x: number, y: number, s: number) => {
    ctx.fillStyle = '#1d2a20';
    for (let l = 0; l < 5; l++) {
      const ang = -Math.PI / 2 + (l - 2) * 0.42;
      ctx.beginPath();
      ctx.ellipse(x + Math.cos(ang) * 5 * s, y + Math.sin(ang) * 7 * s, 2.6 * s, 5.2 * s, ang + Math.PI / 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(120, 190, 150, .16)';
    ctx.beginPath(); ctx.ellipse(x - 2 * s, y - 5 * s, 1.6 * s, 3.6 * s, 0.4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#3a2a1e';
    ctx.beginPath();
    ctx.moveTo(x - 5 * s, y + 4 * s); ctx.lineTo(x + 5 * s, y + 4 * s);
    ctx.lineTo(x + 3.6 * s, y + 12 * s); ctx.lineTo(x - 3.6 * s, y + 12 * s);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(190, 150, 110, .28)'; ctx.lineWidth = 0.7; ctx.stroke();
  };

  /** Floor-standing shelf with book spines. */
  const drawShelf = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, kind: number, s: number) => {
    ctx.fillStyle = '#1a222c';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(0, 240, 255, .16)';
    ctx.lineWidth = 0.7;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    const spines = ['rgba(0, 240, 255, .4)', 'rgba(255, 140, 0, .38)', 'rgba(0, 255, 136, .34)', 'rgba(224, 230, 237, .26)'];
    for (let shelf = 0; shelf < 3; shelf++) {
      const sy = y + 2 + shelf * ((h - 4) / 3);
      const sh = (h - 4) / 3 - 1.5;
      let cx2 = x + 2;
      let b = (kind + shelf) % 4;
      while (cx2 < x + w - 4) {
        const bw = 1.6 + ((b * 7 + shelf) % 3);
        ctx.fillStyle = spines[b];
        ctx.fillRect(cx2, sy + sh - 5.5, bw, 5.5);
        cx2 += bw + 0.8;
        b = (b + 1) % 4;
      }
      ctx.fillStyle = 'rgba(255,255,255,.06)';
      ctx.fillRect(x + 1, sy + sh, w - 2, 0.8);
    }
  };

  /** Server rack with blinking status LEDs. */
  const drawRack = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, t: number, seed: number) => {
    ctx.fillStyle = '#141a23';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(0, 255, 136, .2)';
    ctx.lineWidth = 0.7;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    const units = Math.max(3, Math.floor(h / 6));
    for (let u = 0; u < units; u++) {
      const uy = y + 2 + u * ((h - 4) / units);
      const uh = (h - 4) / units - 1;
      ctx.fillStyle = '#1b232e';
      ctx.fillRect(x + 1.5, uy, w - 3, uh);
      const lit = 0.35 + 0.45 * (0.5 + 0.5 * Math.sin(t * 3 + u * 1.7 + seed));
      ctx.fillStyle = `rgba(0, 255, 136, ${lit})`;
      ctx.fillRect(x + 2.5, uy + uh * 0.4, 1.2, 1.2);
      ctx.fillStyle = `rgba(0, 240, 255, ${lit * 0.7})`;
      ctx.fillRect(x + w - 4, uy + uh * 0.4, 1.2, 1.2);
    }
  };

  /** Standing lamp — a pool of light with a slim stem. */
  const drawLamp = (ctx: CanvasRenderingContext2D, x: number, y: number, s: number) => {
    const pool = ctx.createRadialGradient(x, y - 12 * s, 2, x, y - 12 * s, 22 * s);
    pool.addColorStop(0, 'rgba(255, 220, 160, .10)');
    pool.addColorStop(1, 'transparent');
    ctx.fillStyle = pool;
    ctx.beginPath(); ctx.arc(x, y - 12 * s, 22 * s, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2a3240';
    ctx.fillRect(x - 0.8 * s, y - 14 * s, 1.6 * s, 14 * s);
    ctx.fillStyle = '#3a4453';
    ctx.beginPath();
    ctx.moveTo(x - 5 * s, y - 18 * s); ctx.lineTo(x + 5 * s, y - 18 * s);
    ctx.lineTo(x + 3 * s, y - 14 * s); ctx.lineTo(x - 3 * s, y - 14 * s);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255, 235, 190, .55)';
    ctx.fillRect(x - 4.4 * s, y - 17.6 * s, 8.8 * s, 1.2 * s);
  };

  /** Small rug — breaks up the bare floor between rooms. */
  const drawRug = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, hue: string, s: number) => {
    ctx.fillStyle = hue;
    if (ctx.roundRect) ctx.beginPath(), ctx.roundRect(x, y, w, h, 3 * s); else ctx.beginPath(), ctx.rect(x, y, w, h);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.05)';
    ctx.lineWidth = 0.6;
    ctx.stroke();
  };

  /**
   * Per-room furniture. Six kits, picked deterministically by room index, so
   * no two neighbouring rooms carry the same plant+screen combination.
   */
  const drawProps = (ctx: CanvasRenderingContext2D, cell: Cell, s: number, t: number) => {
    const { left, top, w, h, kit } = cell;
    const floorBase = top + h - 6 * s;          // where floor furniture stands
    const wallY = top + 6 * s;                  // wall-hung items

    switch (kit) {
      case 0: { // Wall screen + plant
        drawWallScreen(ctx, left + 8 * s, wallY, 30 * s, 21 * s, cell.index, t, s);
        drawPlant(ctx, left + 16 * s, floorBase - 12 * s, s);
        break;
      }
      case 1: { // Bookshelf + filing cabinet
        drawShelf(ctx, left + 8 * s, floorBase - 34 * s, Math.min(34 * s, w * 0.42), 30 * s, cell.index, s);
        ctx.fillStyle = '#1d242e';
        ctx.fillRect(left + w - 20 * s, floorBase - 20 * s, 15 * s, 18 * s);
        ctx.strokeStyle = 'rgba(0, 240, 255, .14)'; ctx.lineWidth = 0.7;
        ctx.strokeRect(left + w - 20 * s + 0.5, floorBase - 20 * s + 0.5, 15 * s - 1, 18 * s - 1);
        ctx.fillStyle = 'rgba(255, 140, 0, .5)';
        ctx.fillRect(left + w - 16 * s, floorBase - 17 * s, 7 * s, 1.4 * s);
        break;
      }
      case 2: { // Whiteboard + standing lamp + rug
        ctx.fillStyle = '#0f151d';
        ctx.fillRect(left + 8 * s, wallY, Math.min(38 * s, w * 0.5), 18 * s);
        ctx.strokeStyle = 'rgba(0, 240, 255, .24)'; ctx.lineWidth = 0.8;
        ctx.strokeRect(left + 8 * s + 0.5, wallY + 0.5, Math.min(38 * s, w * 0.5) - 1, 18 * s - 1);
        ctx.strokeStyle = 'rgba(224, 230, 237, .2)'; ctx.lineWidth = 0.9;
        ctx.beginPath();
        ctx.moveTo(left + 11 * s, wallY + 6 * s); ctx.lineTo(left + 20 * s, wallY + 6 * s);
        ctx.moveTo(left + 11 * s, wallY + 10 * s); ctx.lineTo(left + 26 * s, wallY + 10 * s);
        ctx.stroke();
        drawRug(ctx, left + w * 0.3, floorBase - 12 * s, w * 0.5, 9 * s, 'rgba(28, 40, 48, .5)', s);
        drawLamp(ctx, left + w - 14 * s, floorBase, s);
        break;
      }
      case 3: { // Equipment rack + cable tray
        drawRack(ctx, left + 8 * s, floorBase - 30 * s, 16 * s, 28 * s, t, cell.index);
        ctx.fillStyle = 'rgba(0, 240, 255, .1)';
        ctx.fillRect(left + 26 * s, floorBase - 4 * s, Math.min(30 * s, w - 34 * s), 1.6 * s);
        ctx.fillStyle = 'rgba(0, 240, 255, .16)';
        for (let k = 0; k < 3; k++) {
          ctx.fillRect(left + 28 * s + k * 7 * s, floorBase - 12 * s, 0.9 * s, 8 * s);
        }
        break;
      }
      case 4: { // Printer + notice board
        ctx.fillStyle = '#1b222c';
        ctx.fillRect(left + 8 * s, floorBase - 18 * s, 22 * s, 16 * s);
        ctx.strokeStyle = 'rgba(0, 240, 255, .16)'; ctx.lineWidth = 0.7;
        ctx.strokeRect(left + 8 * s + 0.5, floorBase - 18 * s + 0.5, 22 * s - 1, 16 * s - 1);
        ctx.fillStyle = 'rgba(224, 230, 237, .3)';
        ctx.fillRect(left + 11 * s, floorBase - 20 * s, 12 * s, 3 * s);  // paper out
        ctx.fillStyle = 'rgba(0, 240, 255, .5)';
        ctx.fillRect(left + 11 * s, floorBase - 15 * s, 3 * s, 1.2 * s);
        drawWallScreen(ctx, left + w - 26 * s, wallY, 20 * s, 15 * s, cell.index + 2, t, s);
        break;
      }
      default: { // Water cooler + pinboard
        ctx.fillStyle = '#16202b';
        ctx.fillRect(left + 9 * s, floorBase - 20 * s, 9 * s, 18 * s);
        ctx.fillStyle = 'rgba(0, 240, 255, .35)';
        ctx.fillRect(left + 11 * s, floorBase - 24 * s, 5 * s, 5 * s);
        ctx.fillStyle = 'rgba(0, 255, 136, .3)';
        ctx.fillRect(left + 11 * s, floorBase - 12 * s, 5 * s, 3 * s);
        ctx.fillStyle = '#0f151d';
        ctx.fillRect(left + w - 24 * s, wallY, 17 * s, 13 * s);
        ctx.strokeStyle = 'rgba(255, 140, 0, .22)'; ctx.lineWidth = 0.7;
        ctx.strokeRect(left + w - 24 * s + 0.5, wallY + 0.5, 17 * s - 1, 13 * s - 1);
        ctx.fillStyle = 'rgba(255, 255, 255, .16)';
        ctx.fillRect(left + w - 21 * s, wallY + 3 * s, 4 * s, 5 * s);
        ctx.fillRect(left + w - 15 * s, wallY + 5 * s, 4 * s, 4 * s);
        break;
      }
    }

    // Floor mat per workstation — anchors the desk without walling it in.
    for (const d of cell.desks) {
      const ds = d.scale;
      ctx.fillStyle = 'rgba(22, 29, 37, .32)';
      ctx.fillRect(d.cx - (d.w / 2 + 14 * ds), d.deskY + d.h + 1 * ds, d.w + 28 * ds, 9 * ds);
      ctx.strokeStyle = 'rgba(0, 240, 255, .07)';
      ctx.lineWidth = 0.6;
      ctx.strokeRect(d.cx - (d.w / 2 + 14 * ds) + 0.5, d.deskY + d.h + 1.5 * ds, d.w + 28 * ds - 1, 8 * ds);
    }
  };

  /** Break lounge — a real room: rug, sofa, coffee table, two stools, plants. */
  const drawLounge = (ctx: CanvasRenderingContext2D, cell: Cell, s: number, t: number) => {
    const { left, top, w, h } = cell;
    const bob = 0.5 + 0.5 * Math.sin(t * 0.9 + cell.index);
    const floorBase = top + h - 6 * s;

    // Rug
    const rgx = left + w * 0.1, rgy = floorBase - 26 * s, rgw = w * 0.8, rgh = 24 * s;
    ctx.fillStyle = 'rgba(24, 42, 48, .5)';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(rgx, rgy, rgw, rgh, 5 * s); else ctx.rect(rgx, rgy, rgw, rgh);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0, 240, 255, .12)';
    ctx.lineWidth = 0.8;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(0, 240, 255, .09)';
    ctx.strokeRect(rgx + 4 * s, rgy + 4 * s, rgw - 8 * s, rgh - 8 * s);

    // Sofa against the corridor-facing wall
    const sfW = w * 0.56, sfH = 15 * s;
    const sfX = left + w * 0.5 - sfW / 2, sfY = floorBase - 34 * s;
    ctx.fillStyle = '#1b2430';
    ctx.fillRect(sfX, sfY, sfW, sfH);
    ctx.fillStyle = '#233040';
    for (let k = 0; k < 3; k++) {
      ctx.fillRect(sfX + 2 * s + k * (sfW / 3), sfY + 3 * s, sfW / 3 - 3 * s, sfH - 6 * s);
    }
    ctx.fillStyle = '#2b3949';
    ctx.fillRect(sfX, sfY, sfW, 4 * s);
    ctx.strokeStyle = 'rgba(150, 175, 196, .22)'; ctx.lineWidth = 0.8;
    ctx.strokeRect(sfX + 0.5, sfY + 0.5, sfW - 1, sfH - 1);

    // Coffee table with two mugs
    const tx = left + w * 0.5, ty = floorBase - 14 * s;
    ctx.fillStyle = '#26313d';
    ctx.beginPath(); ctx.ellipse(tx, ty, 15 * s, 6 * s, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(0, 240, 255, .18)'; ctx.lineWidth = 0.8; ctx.stroke();
    ctx.fillStyle = '#1a222c';
    ctx.fillRect(tx - 1.2 * s, ty + 3 * s, 2.4 * s, 7 * s);
    ctx.fillStyle = `rgba(255, 140, 0, ${0.5 + 0.2 * bob})`;
    ctx.fillRect(tx - 6 * s, ty - 3 * s, 2.6 * s, 2.6 * s);
    ctx.fillStyle = 'rgba(0, 240, 255, .55)';
    ctx.fillRect(tx + 4 * s, ty - 2 * s, 2.6 * s, 2.6 * s);

    // Two stools
    for (const sx of [left + w * 0.24, left + w * 0.76]) {
      ctx.fillStyle = '#222c38';
      ctx.beginPath(); ctx.ellipse(sx, floorBase - 10 * s, 4.5 * s, 2.4 * s, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#161d26';
      ctx.fillRect(sx - 1 * s, floorBase - 8 * s, 2 * s, 7 * s);
    }

    drawPlant(ctx, left + 10 * s, floorBase - 12 * s, s);
    drawPlant(ctx, left + w - 10 * s, floorBase - 12 * s, s);
  };

  /** Server room — racks, cable trays, a wall of blinking status LEDs. */
  const drawServerRoom = (ctx: CanvasRenderingContext2D, cell: Cell, s: number, t: number) => {
    const { left, top, w, h } = cell;
    const floorBase = top + h - 6 * s;
    const rackW = Math.min(18 * s, w * 0.2);
    const racks = Math.max(2, Math.min(4, Math.floor((w - 16 * s) / (rackW + 5 * s))));
    for (let k = 0; k < racks; k++) {
      drawRack(ctx, left + 8 * s + k * (rackW + 5 * s), floorBase - 32 * s, rackW, 30 * s, t, cell.index + k);
    }
    // Overhead cable tray
    ctx.fillStyle = 'rgba(0, 240, 255, .12)';
    ctx.fillRect(left + 6 * s, top + 14 * s, w - 12 * s, 2 * s);
    ctx.fillStyle = 'rgba(0, 240, 255, .18)';
    for (let k = 0; k < racks; k++) {
      ctx.fillRect(left + 8 * s + k * (rackW + 5 * s) + rackW / 2 - 0.5 * s, top + 16 * s, 1 * s, 12 * s);
    }
    // Status readout on the wall
    ctx.fillStyle = '#0e141c';
    ctx.fillRect(left + w - 26 * s, top + 6 * s, 19 * s, 12 * s);
    ctx.strokeStyle = 'rgba(0, 255, 136, .26)'; ctx.lineWidth = 0.7;
    ctx.strokeRect(left + w - 26 * s + 0.5, top + 6 * s + 0.5, 19 * s - 1, 12 * s - 1);
    for (let k = 0; k < 3; k++) {
      const lit = 0.3 + 0.5 * (0.5 + 0.5 * Math.sin(t * 2.4 + k * 2 + cell.index));
      ctx.fillStyle = `rgba(0, 255, 136, ${lit})`;
      ctx.fillRect(left + w - 24 * s, top + 8 * s + k * 3.4 * s, (14 * s) * (0.4 + 0.6 * ((k + 1) % 3) / 2), 1.3 * s);
    }
  };

  /** Room label plate. Sits at the room's inner-right corner so it never
   *  collides with the wall fittings that kits place on the left. */
  const drawRoomLabel = (ctx: CanvasRenderingContext2D, cell: Cell, text: string, s: number) => {
    ctx.font = '7px monospace';
    ctx.textAlign = 'left';
    const label = `▸ ${text.toUpperCase()}`;
    const tw = ctx.measureText(label).width;
    const x = cell.left + cell.w - tw - 6;
    const y = cell.band === 'top' ? cell.top + 14 : cell.top + 12;
    ctx.fillStyle = 'rgba(8, 12, 18, .78)';
    ctx.fillRect(x - 2, y - 6, tw + 4, 9);
    ctx.fillStyle = cell.color;
    ctx.globalAlpha = 0.62;
    ctx.fillText(label, x, y);
    ctx.globalAlpha = 1;
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
    const floorKey = `${Math.round(W)}x${Math.round(H)}x${Math.round(layout.corridorY)}x${Math.round(layout.spurX)}x${dpr}`;
    if (!floorRef.current || floorRef.current.key !== floorKey) {
      const off = document.createElement('canvas');
      off.width = Math.max(1, Math.round(W * dpr));
      off.height = Math.max(1, Math.round(H * dpr));
      const octx = off.getContext('2d');
      if (octx) {
        octx.setTransform(dpr, 0, 0, dpr, 0, 0);
        drawFloorLayer(octx, W, H, layout);
      }
      floorRef.current = { key: floorKey, canvas: off };
    }
    ctx.drawImage(floorRef.current.canvas, 0, 0, W, H);

    // ══ HEADER BAND ══ The roster row above acts as the canvas header, so only
    // a thin band is used here.
    ctx.fillStyle = '#141a21';
    ctx.fillRect(0, 0, W, 3);
    ctx.strokeStyle = 'rgba(0, 240, 255, .22)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, 3.5); ctx.lineTo(W, 3.5); ctx.stroke();
    ctx.fillStyle = 'rgba(0, 240, 255, .26)';
    ctx.font = '7px monospace';
    ctx.textAlign = 'right';
    ctx.fillText('AGENT OPERATIONS CENTER', W - 8, 11);

    // ══ CORRIDOR ══ A distinctly different floor treatment: darker plate, a
    // lighter runner, a dashed centre line and pooled lights. This is what
    // separates "walkway" from "office floor" at a glance.
    const { corridorY, corridorH, spurX, spurW } = layout;
    ctx.fillStyle = 'rgba(11, 17, 24, .92)';
    ctx.fillRect(0, corridorY, W, corridorH);
    if (spurW > 0) {
      ctx.fillRect(spurX, corridorY, spurW, H - corridorY);
    }
    ctx.fillStyle = 'rgba(0, 240, 255, .07)';
    ctx.fillRect(0, corridorY + corridorH * 0.26, W, corridorH * 0.48);
    if (spurW > 0) {
      ctx.fillRect(spurX + spurW * 0.26, corridorY, spurW * 0.48, H - corridorY);
    }
    // Runner edge lines — give the walkway a hard boundary distinct from the
    // room floors it separates.
    ctx.strokeStyle = 'rgba(0, 240, 255, .18)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, corridorY + corridorH * 0.26 + 0.5); ctx.lineTo(W, corridorY + corridorH * 0.26 + 0.5);
    ctx.moveTo(0, corridorY + corridorH * 0.74 - 0.5); ctx.lineTo(W, corridorY + corridorH * 0.74 - 0.5);
    if (spurW > 0) {
      ctx.moveTo(spurX + spurW * 0.26 + 0.5, corridorY); ctx.lineTo(spurX + spurW * 0.26 + 0.5, H);
      ctx.moveTo(spurX + spurW * 0.74 - 0.5, corridorY); ctx.lineTo(spurX + spurW * 0.74 - 0.5, H);
    }
    ctx.stroke();
    // Centre line + directional chevrons
    ctx.strokeStyle = 'rgba(0, 240, 255, .16)';
    ctx.lineWidth = 1;
    ctx.setLineDash([7, 9]);
    ctx.beginPath();
    ctx.moveTo(0, corridorY + corridorH / 2 + 0.5);
    ctx.lineTo(W, corridorY + corridorH / 2 + 0.5);
    if (spurW > 0) {
      ctx.moveTo(spurX + spurW / 2 + 0.5, corridorY);
      ctx.lineTo(spurX + spurW / 2 + 0.5, H);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(0, 240, 255, .13)';
    ctx.lineWidth = 1;
    for (let cx = 14; cx < W - 10; cx += 34) {
      const cy = corridorY + corridorH / 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy - 3); ctx.lineTo(cx + 4, cy); ctx.lineTo(cx, cy + 3);
      ctx.stroke();
    }
    // Ceiling light pools along the corridor
    for (let k = 0; k < 4; k++) {
      const lx = (k + 0.5) * (W / 4);
      const pool = ctx.createRadialGradient(lx, corridorY + corridorH / 2, 3, lx, corridorY + corridorH / 2, W / 5);
      pool.addColorStop(0, 'rgba(130, 205, 235, .10)');
      pool.addColorStop(1, 'transparent');
      ctx.fillStyle = pool;
      ctx.fillRect(lx - W / 5, corridorY, (W / 5) * 2, corridorH);
    }

    // ══ WALLS ══ Real segments: rooms are bounded by walls with doorways onto
    // the corridor, every other interior wall is left open as a passage, and
    // the outer shell is closed. Not every room gets four borders.
    const wall = (x1: number, y1: number, x2: number, y2: number) => {
      ctx.strokeStyle = '#161d25'; ctx.lineWidth = 4; ctx.lineCap = 'butt';
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      ctx.strokeStyle = 'rgba(0, 240, 255, .17)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    };
    // Horizontal wall with a doorway gap, plus a lit threshold in the opening.
    const wallDoorH = (x1: number, x2: number, y: number, doorC: number, doorW: number) => {
      const a = Math.max(x1, doorC - doorW / 2);
      const b = Math.min(x2, doorC + doorW / 2);
      if (a > x1) wall(x1, y, a, y);
      if (b < x2) wall(b, y, x2, y);
      if (b > a) {
        ctx.fillStyle = 'rgba(0, 240, 255, .12)';
        ctx.fillRect(a, y - 1.5, b - a, 3);
      }
    };
    // Vertical wall with an opening.
    const wallDoorV = (x: number, y1: number, y2: number, doorC: number, doorW: number) => {
      const a = Math.max(y1, doorC - doorW / 2);
      const b = Math.min(y2, doorC + doorW / 2);
      if (a > y1) wall(x, y1, x, a);
      if (b < y2) wall(x, b, x, y2);
      if (b > a) {
        ctx.fillStyle = 'rgba(0, 240, 255, .12)';
        ctx.fillRect(x - 1.5, a, 3, b - a);
      }
    };

    // Outer shell — the plan is a building, so the perimeter is closed.
    wall(0.5, 3, 0.5, H);                       // left
    wall(W - 0.5, 3, W - 0.5, H);                // right
    wall(0, H - 0.5, W, H - 0.5);                // bottom

    const doorW = Math.min(26, layout.cellW * 0.24);
    for (const cell of layout.cells) {
      const isTop = cell.band === 'top';
      const roomTop = isTop ? 3 : corridorY + corridorH;
      const roomBottom = isTop ? corridorY : H;
      const corridorWallY = isTop ? corridorY : corridorY + corridorH;

      // Wall facing the corridor, with this room's doorway.
      wallDoorH(cell.left, cell.left + cell.w, corridorWallY, cell.doorX, doorW);

      // Side walls. `openLeft` rooms have no left wall — an open passage
      // between neighbours, so the plate is not a row of sealed boxes.
      if (!cell.openLeft) {
        if (cell.col === 0) {
          // first room in the band: the shell already covers its left edge
        } else if (isTop) {
          wallDoorV(cell.left, roomTop, roomBottom, roomTop + (roomBottom - roomTop) * 0.55, 18);
        } else {
          wallDoorV(cell.left, roomTop + 2, roomBottom, roomTop + (roomBottom - roomTop) * 0.45, 18);
        }
      }

      // Right wall for the last room in a band is the shell; interior right
      // walls are drawn by the next room's left wall (or omitted as a passage).
    }

    // Spur walls — the vertical hallway is flanked by real walls.
    if (spurW > 0) {
      wall(spurX + 0.5, corridorY + corridorH, spurX + 0.5, H);
      wall(spurX + spurW - 0.5, corridorY + corridorH, spurX + spurW - 0.5, H);
    }

    // ══ ROOM LABELS ══
    for (const cell of layout.cells) drawRoomLabel(ctx, cell, cell.dept, s);

    // ══ FURNITURE ══ (behind desks/sprites so it reads as fixtures)
    for (const cell of layout.cells) {
      if (cell.special === 'lounge') drawLounge(ctx, cell, s, t);
      else if (cell.special === 'server') drawServerRoom(ctx, cell, s, t);
      else drawProps(ctx, cell, s, t);
    }

    // ══ DESKS + SPRITES + MONITORS ══
    // The reference floor contains eight desks but only five visible staff.
    // Keep focus visible by replacing the fifth roster slot when necessary.
    const visibleAgentNames = new Set(liveList.slice(0, 5).map(a => a.name));
    const focusedName = focusRef.current || orch.agent;
    if (focusedName && liveList.some(a => a.name === focusedName) && !visibleAgentNames.has(focusedName)) {
      const lastVisible = Array.from(visibleAgentNames).at(-1);
      if (lastVisible) visibleAgentNames.delete(lastVisible);
      visibleAgentNames.add(focusedName);
    }
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
        const showAgent = visibleAgentNames.has(d.agent.name);

        if (showAgent) {
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

        // ── Pixel-art agent sprite ── cached, auto-outlined layers blitted at
        // integer positions with smoothing off. All motion (bob, lean, head
        // turn, typing hands, stretch) is quantised to whole pixels so edges
        // stay crisp instead of smearing across sub-pixel boundaries.
        //
        // GUARDED: the shared animLoop swallows frame exceptions silently, so a
        // failure anywhere in the cache-build → blit stage used to end the frame
        // between the chair and the desk with no error surfaced anywhere —
        // agents (and everything drawn after them) simply vanished. Any build or
        // blit failure now falls back to drawFallbackAgent so a character is
        // ALWAYS visible at the desk, and logs the first cause to the console.
        const bodyTopI = Math.round(bodyTop);
        const sxI = Math.round(sx);
        const armLiftQ = Math.round(stretch * 9 * ds);
        const armTop = Math.round(bodyTop + 4) - armLiftQ;
        const typeL = Math.round(typingY);
        const typeR = Math.round(-typingY);
        const torsoL = sxI - SP.torsoW / 2;
        const sleeveL = torsoL - SP.armW + 1;
        const sleeveR = torsoL + SP.torsoW - 1;
        let spriteOK = false;
        try {
          const sprite = getAgentSprite(i, d.agent.color);
          const { torso, sleeve, hand, head } = sprite;
          if (
            torso && sleeve && hand && head &&
            torso.width > 2 && torso.height > 2 &&
            head.width > 2 && head.height > 2 &&
            Number.isFinite(torsoL) && Number.isFinite(bodyTopI)
          ) {
            const blit = (img: HTMLCanvasElement, x: number, y: number) => {
              ctx.drawImage(img, Math.round(x) - 1, Math.round(y) - 1); // −1: outline padding
            };
            ctx.imageSmoothingEnabled = false;
            blit(torso, torsoL, bodyTopI);
            blit(sleeve, sleeveL, armTop);
            blit(sleeve, sleeveR, armTop);
            blit(hand, sleeveL, armTop + SP.sleeveH + typeL);
            blit(hand, sleeveR, armTop + SP.sleeveH + typeR);
            // Head rides the same body transform; shifts in whole pixels on head-turn.
            blit(head, sxI + Math.round(headTurn) - 5, bodyTopI - 10);
            spriteOK = true;
          }
          ctx.imageSmoothingEnabled = true;
        } catch (err) {
          ctx.imageSmoothingEnabled = true;
          if (!spriteFallbackWarned) {
            spriteFallbackWarned = true;
            console.warn('[AgentOffice] pixel-art sprite build failed — using vector fallback:', err);
          }
        }
        if (!spriteOK) {
          if (!spriteFallbackWarned) {
            spriteFallbackWarned = true;
            console.warn('[AgentOffice] pixel-art sprite parts unavailable — using vector fallback.');
          }
          drawFallbackAgent(ctx, sxI, bodyTopI, ds, d.agent.color, typeL, typeR, headTurn);
        }
        }

        // Desk — four builds so neighbouring rooms never look copy-pasted.
        // 0 warm wood · 1 dark steel · 2 pale oak · 3 charcoal composite
        const deskTops = ['#4a3524', '#2b3440', '#6b5136', '#3a3f46'];
        const deskFronts = ['#2e2015', '#1b222b', '#4a3a26', '#25292f'];
        const deskEdges = ['rgba(170, 125, 75, .6)', 'rgba(140, 175, 205, .5)', 'rgba(200, 165, 115, .55)', 'rgba(150, 165, 185, .5)'];
        ctx.fillStyle = deskTops[d.style];
        ctx.fillRect(d.cx - d.w / 2, d.deskY, d.w, d.h);
        ctx.fillStyle = d.style === 2 ? '#4a3a26' : deskFronts[d.style];
        ctx.fillRect(d.cx - d.w / 2, d.deskY + d.h * 0.55, d.w, d.h * 0.45);
        ctx.strokeStyle = deskEdges[d.style];
        ctx.lineWidth = 1;
        ctx.strokeRect(d.cx - d.w / 2 + 0.5, d.deskY + 0.5, d.w - 1, d.h - 1);
        // Floor reflection — a faint mirrored glow beneath the desk, stronger
        // when the agent's monitor is active (the screen "lights" the floor).
        const refl = ctx.createLinearGradient(0, d.deskY + d.h + 9 * ds, 0, d.deskY + d.h + 9 * ds + 12 * ds);
        refl.addColorStop(0, active ? 'rgba(0, 240, 255, .05)' : 'rgba(150, 190, 215, .022)');
        refl.addColorStop(1, 'transparent');
        ctx.fillStyle = refl;
        ctx.fillRect(d.cx - d.w / 2, d.deskY + d.h + 9 * ds, d.w, 12 * ds);
        // Desk clutter varies per build: mug + papers, or keyboard + phone,
        // or a stack of drives, or a headset stand.
        if (d.style === 0) {
          ctx.fillStyle = '#8a6a45';
          ctx.fillRect(d.cx - d.w / 2 + 5 * ds, d.deskY - 4 * ds, 5 * ds, 4 * ds);
          ctx.fillStyle = 'rgba(210, 220, 230, .35)';
          ctx.fillRect(d.cx - d.w / 2 + 14 * ds, d.deskY + 1.5 * ds, 11 * ds, 7 * ds);
        } else if (d.style === 1) {
          ctx.fillStyle = '#20262e';
          ctx.fillRect(d.cx - d.w / 2 + 4 * ds, d.deskY + 1 * ds, 14 * ds, 6 * ds);   // keyboard
          ctx.fillStyle = 'rgba(0, 240, 255, .3)';
          ctx.fillRect(d.cx - d.w / 2 + 5 * ds, d.deskY + 2 * ds, 12 * ds, 1.2 * ds);
          ctx.fillStyle = '#39424e';
          ctx.fillRect(d.cx - d.w / 2 + 3 * ds, d.deskY - 6 * ds, 4 * ds, 6 * ds);    // phone handset
        } else if (d.style === 2) {
          ctx.fillStyle = 'rgba(210, 220, 230, .32)';
          ctx.fillRect(d.cx - d.w / 2 + 5 * ds, d.deskY + 1.5 * ds, 13 * ds, 7 * ds); // open notebook
          ctx.strokeStyle = 'rgba(120, 140, 160, .35)'; ctx.lineWidth = 0.6;
          ctx.beginPath(); ctx.moveTo(d.cx - d.w / 2 + 11.5 * ds, d.deskY + 1.5 * ds);
          ctx.lineTo(d.cx - d.w / 2 + 11.5 * ds, d.deskY + 8.5 * ds); ctx.stroke();
          ctx.fillStyle = '#8a6a45';
          ctx.fillRect(d.cx - d.w / 2 + 3 * ds, d.deskY - 4 * ds, 5 * ds, 4 * ds);
        } else {
          ctx.fillStyle = '#1d232b';                                            // drive stack
          ctx.fillRect(d.cx - d.w / 2 + 4 * ds, d.deskY + 1 * ds, 12 * ds, 3 * ds);
          ctx.fillRect(d.cx - d.w / 2 + 5 * ds, d.deskY + 5 * ds, 10 * ds, 3 * ds);
          ctx.fillStyle = 'rgba(0, 255, 136, .45)';
          ctx.fillRect(d.cx - d.w / 2 + 14 * ds, d.deskY + 1.6 * ds, 1.2 * ds, 1.2 * ds);
          ctx.fillRect(d.cx - d.w / 2 + 13 * ds, d.deskY + 5.6 * ds, 1.2 * ds, 1.2 * ds);
        }

        // Monitor — offset to the character's RIGHT so the outfit, arms and face
        // stay visible instead of the screen covering the whole sprite. Style 2
        // is a laptop instead; style 1 gets a second small screen on the left;
        // style 3 is an ultrawide.
        if (d.style === 2) {
          // Laptop: low screen + keyboard deck, tilted open on the desk.
          const lw = 16 * ds, lh = 9 * ds;
          const lx = d.cx + 4 * ds, ly = d.deskY - lh - 2 * ds;
          ctx.fillStyle = '#171d26';
          ctx.beginPath();
          ctx.moveTo(lx, ly + lh); ctx.lineTo(lx + 2 * ds, ly);
          ctx.lineTo(lx + lw, ly); ctx.lineTo(lx + lw - 1.5 * ds, ly + lh);
          ctx.closePath(); ctx.fill();
          ctx.fillStyle = active ? `rgba(0, 240, 255, ${0.5 + 0.3 * Math.abs(Math.sin(t * 3 + i))})` : '#26313f';
          ctx.fillRect(lx + 1.5 * ds, ly + 1.4 * ds, lw - 4 * ds, lh - 2.6 * ds);
          ctx.fillStyle = '#20262f';
          ctx.fillRect(lx - 1 * ds, ly + lh, lw + 2 * ds, 2.4 * ds);
          ctx.strokeStyle = 'rgba(130, 150, 170, .34)'; ctx.lineWidth = 0.8;
          ctx.strokeRect(lx - 1 * ds, ly + lh, lw + 2 * ds, 2.4 * ds);
        }
        if (d.style === 1) {
          // Secondary screen on the character's left.
          const sW = 12 * ds, sH = 9 * ds;
          const sx2 = d.cx - d.w / 2 + 2 * ds, sy2 = d.deskY - sH - 3 * ds;
          ctx.fillStyle = '#0b111c';
          ctx.fillRect(sx2, sy2, sW, sH);
          ctx.fillStyle = active ? 'rgba(0, 255, 136, .45)' : '#212a35';
          ctx.fillRect(sx2 + 1.5 * ds, sy2 + 1.5 * ds, sW - 3 * ds, sH - 3 * ds);
          ctx.strokeStyle = 'rgba(130, 150, 170, .3)'; ctx.lineWidth = 0.8;
          ctx.strokeRect(sx2 - 0.5, sy2 - 0.5, sW + 1, sH + 1);
          ctx.fillStyle = '#141a22';
          ctx.fillRect(sx2 + sW / 2 - 1.5 * ds, sy2 + sH, 3 * ds, 3 * ds);
        }
        const mW = (d.style === 3 ? 26 : 19) * ds, mH = (d.style === 3 ? 11 : 13) * ds;
        const mx = d.cx + 8 * ds, my = d.deskY - mH - 4 * ds;
        ctx.fillStyle = '#0b111c';
        ctx.fillRect(mx, my, mW, mH);
        const scrX = mx + 2 * ds, scrY = my + 2 * ds, scrW = mW - 4 * ds, scrH = mH - 4 * ds;
        if (active) {
          ctx.shadowColor = '#00f0ff';
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

const AgentOffice = React.memo(AgentOfficeComponent);
export default AgentOffice;
