/* ═══════════════════════════════════════════════════════════════
   NASI — shared animation driver

   Before this, the three canvases (core orb, agent office, sat-link
   radar) each ran their own `requestAnimationFrame` loop at the
   display's full refresh rate. That is three independent full-rate
   repaints, and on a throttled / single-core machine it is the single
   biggest CPU consumer in the dashboard.

   This module drives every canvas from ONE rAF loop with:

     · a per-subscriber frame budget (fps cap, static or dynamic)
     · automatic stop when the tab is hidden
     · automatic stop while a canvas is scrolled out of view
     · a hard cap under `prefers-reduced-motion`

   Subscribers receive `dt` — the elapsed time expressed in reference
   frames (1.0 === one 60fps frame). Multiplying every per-frame
   increment by `dt` keeps animation SPEED identical to the old
   fixed-60fps maths even though fewer frames are now painted.
   ═══════════════════════════════════════════════════════════════ */

/** One reference frame at 60fps. `dt` is normalised against this. */
const FRAME_MS = 1000 / 60;
/** Never advance more than this many reference frames in one step, so a
 *  paused/backgrounded canvas does not jump when it resumes. */
const MAX_DT = 6;
/** Frame budget applied when the OS asks for reduced motion. */
const REDUCED_MOTION_FPS = 8;

export type AnimTick = (dt: number) => void;

interface Subscriber {
  fn: AnimTick;
  fps: number | (() => number);
  last: number;
  visible: boolean;
  observer: IntersectionObserver | null;
}

const subs = new Set<Subscriber>();
let raf = 0;
let bound = false;

function isHidden() {
  return typeof document !== 'undefined' && document.hidden;
}

function prefersReducedMotion() {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/** True when at least one subscriber still needs frames. */
function canRun() {
  if (subs.size === 0) return false;
  if (isHidden()) return false;
  for (const s of subs) if (s.visible) return true;
  return false;
}

function schedule() {
  if (raf !== 0 || !canRun()) return;
  raf = requestAnimationFrame(tick);
}

function tick(now: number) {
  raf = 0;
  const reduced = prefersReducedMotion();
  for (const s of subs) {
    if (!s.visible) continue;
    const wanted = typeof s.fps === 'function' ? s.fps() : s.fps;
    const budget = reduced ? Math.min(wanted, REDUCED_MOTION_FPS) : wanted;
    if (budget <= 0) continue;
    const interval = 1000 / budget;
    const elapsed = now - s.last;
    // First tick (last === 0) paints immediately so a canvas is never blank.
    if (s.last !== 0 && elapsed < interval - 0.5) continue;
    const dt = s.last === 0 ? 0 : Math.min(elapsed, FRAME_MS * MAX_DT) / FRAME_MS;
    s.last = now;
    try {
      s.fn(dt);
    } catch {
      /* one bad frame must never kill the shared loop */
    }
  }
  schedule();
}

/** Global listeners are attached once, on the first subscriber. */
function bind() {
  if (bound || typeof document === 'undefined') return;
  bound = true;
  document.addEventListener('visibilitychange', () => {
    // Reset the clocks so the first frame back paints immediately.
    for (const s of subs) s.last = 0;
    schedule();
  });
  window.addEventListener('focus', schedule);
  window.addEventListener('resize', () => {
    for (const s of subs) s.last = 0;
    schedule();
  });
  window.matchMedia?.('(prefers-reduced-motion: reduce)').addEventListener?.('change', () => {
    for (const s of subs) s.last = 0;
    schedule();
  });
}

export interface SubscribeOptions {
  /** Frames per second budget — a number, or a function for dynamic budgets. */
  fps?: number | (() => number);
  /** When provided, the canvas stops animating while scrolled out of view. */
  element?: HTMLElement | null;
}

/**
 * Register an animation callback on the shared loop.
 * Returns an unsubscribe function.
 */
export function subscribe(fn: AnimTick, options: SubscribeOptions = {}): () => void {
  bind();
  const { fps = 30, element = null } = options;
  const sub: Subscriber = { fn, fps, last: 0, visible: true, observer: null };

  if (element && typeof IntersectionObserver !== 'undefined') {
    sub.observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) sub.visible = entry.isIntersecting;
        if (sub.visible) sub.last = 0; // repaint at once, no dt jump
        schedule();
      },
      // Small margin so a canvas starts again slightly before it scrolls in.
      { rootMargin: '160px' },
    );
    sub.observer.observe(element);
  }

  subs.add(sub);
  schedule();

  return () => {
    subs.delete(sub);
    sub.observer?.disconnect();
    sub.observer = null;
  };
}

/** Number of live subscribers — useful for diagnosis. */
export function activeAnimationCount() {
  return subs.size;
}
