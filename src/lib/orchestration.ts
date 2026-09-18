// ============================================================
// ORCHESTRATION STORE — Core → Manager → department agent
//
// A tiny external store so Agent Town, the console and the office
// canvas can all reflect the *same* live delegation state without
// prop-drilling through every panel.
// ============================================================
import { useSyncExternalStore } from 'react';
import { isActiveStatus } from './agentRouter';
import type { AgentRoute } from './agentRouter';

export type OrchestrationPhase = 'idle' | 'delegating' | 'working' | 'done';

export type OrchestrationState = {
  phase: OrchestrationPhase;
  /** Department agent currently holding the task (null while the Manager delegates). */
  agent: string | null;
  route: AgentRoute | null;
};

const IDLE_STATE: OrchestrationState = { phase: 'idle', agent: null, route: null };

let state: OrchestrationState = IDLE_STATE;
const listeners = new Set<() => void>();

function emit() { listeners.forEach(l => l()); }

export function setOrchestration(next: Partial<OrchestrationState>) {
  state = { ...state, ...next };
  emit();
}

export function resetOrchestration() {
  state = IDLE_STATE;
  emit();
}

export function getOrchestration(): OrchestrationState {
  return state;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Subscribe a component to live orchestration state. */
export function useOrchestration(): OrchestrationState {
  return useSyncExternalStore(subscribe, getOrchestration, getOrchestration);
}

export type StatusCarrier = { name: string; status: string };

/**
 * Overlay live orchestration status onto a resting agent roster.
 * Resting statuses are normalised to Idle / Not Connected so the
 * Manager is no longer permanently "Active".
 */
function liveStatusFor(a: StatusCarrier, o: OrchestrationState): string {
  const resting = a.status === 'Not Connected' ? 'Not Connected' : 'Idle';
  if (a.name === 'Manager') {
    return o.phase === 'delegating' || o.phase === 'working' ? 'Delegating' : resting;
  }
  if (o.agent === a.name && (o.phase === 'working' || o.phase === 'done')) {
    return 'Working';
  }
  return resting;
}

export function applyLiveStatus<T extends StatusCarrier>(agents: T[], o: OrchestrationState): T[] {
  // The cast keeps the caller's concrete agent type (name/colour/initials/…)
  // instead of widening to the minimal `StatusCarrier` shape.
  return agents.map(a => ({ ...a, status: liveStatusFor(a, o) }) as unknown as T);
}

/** Human-readable one-line status for the feed / console, or null when idle. */
export function orchestrationLabel(o: OrchestrationState): string | null {
  if (o.phase === 'delegating') return `Manager · delegating → ${o.route?.agent ?? 'agent'}`;
  if (o.phase === 'working') return `Manager → ${o.agent} · ${o.route?.reason ?? 'working'}`;
  if (o.phase === 'done') return `${o.agent} · task complete`;
  return null;
}

export { isActiveStatus };
