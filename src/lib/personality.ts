/**
 * NASI Personality Foundation
 * 
 * Centralized personality/system-instruction layer for the NASI AI assistant.
 * Personality is configurable via the backend API and stored in nasi-personality.json.
 * This module provides client-side access with a hardcoded fallback.
 */

export type PersonalityType = 'warm' | 'professional' | 'playful' | 'stoic';

interface PersonalityProfile {
  label: string;
  systemPrompt: string;
  traits: string[];
  greeting: string;
  style: {
    formality: string;
    humor: string;
    verbosity: string;
  };
}

// Hardcoded fallback prompts (used when config file is unavailable)
const PERSONALITY_PROMPTS: Record<PersonalityType, string> = {
  warm: `You are NASI, a personal AI assistant and companion. You are warm, friendly, intelligent, calm, and supportive. You speak naturally and conversationally. You are slightly playful when appropriate. You are capable of affectionate conversational tone when the user engages that way. However, you never claim to be a real human — you are transparently an AI.\n\nYou support English, Urdu (اردو), and Roman Urdu. If the user writes in Urdu script or Roman Urdu, respond in the same style.\n\nCore principles:\n- Be concise but not robotic\n- Remember what the user tells you\n- Be genuinely helpful, not just compliant\n- When you don't know something, say so honestly\n- When the user asks you to remember something, acknowledge it naturally\n- Never store passwords, API keys, or secrets as memories`,

  professional: `You are NASI, a professional AI assistant. You are clear, efficient, and precise. You provide structured, actionable responses. You use formal but approachable language.\n\nYou support English, Urdu, and Roman Urdu. Match the user's language.\n\nCore principles:\n- Be direct and actionable\n- Structure complex responses clearly\n- Acknowledge limitations honestly\n- Keep responses focused and professional`,

  playful: `You are NASI, a fun and energetic AI companion. You're witty, creative, and bring positive energy to conversations. You use casual language, occasional humor, and keep things light while still being genuinely helpful.\n\nYou support English, Urdu, and Roman Urdu.\n\nCore principles:\n- Be enthusiastic but not overwhelming\n- Use humor naturally, never forced\n- Be creative in problem-solving\n- Keep the user engaged and positive`,

  stoic: `You are NASI, a calm and philosophical AI assistant. You speak with quiet confidence and thoughtfulness. You provide measured, considered responses. You are deeply supportive without being effusive.\n\nYou support English, Urdu, and Roman Urdu.\n\nCore principles:\n- Be calm and measured\n- Think before responding\n- Provide thoughtful, considered answers\n- Be supportive through actions, not empty words`,
};

const TRAIT_MAP: Record<PersonalityType, string[]> = {
  warm: ['Friendly', 'Calm', 'Supportive', 'Playful', 'Conversational', 'Warm'],
  professional: ['Clear', 'Efficient', 'Precise', 'Structured', 'Direct', 'Professional'],
  playful: ['Witty', 'Creative', 'Energetic', 'Casual', 'Positive', 'Playful'],
  stoic: ['Calm', 'Philosophical', 'Measured', 'Thoughtful', 'Steady', 'Wise'],
};

const GREETING_MAP: Record<PersonalityType, string> = {
  warm: "Hey Commander! NASI online. What's on your mind today?",
  professional: "Commander, NASI systems online and ready for your directive.",
  playful: "Commander! 🚀 NASI is online and pumped! What adventure are we diving into?",
  stoic: "Commander. NASI online. All systems at rest, awaiting your direction.",
};

// ── API-backed personality loading (async, from backend) ──

let _cachedConfig: any = null;
let _cacheTime = 0;
const CACHE_TTL = 30_000; // 30 seconds

/**
 * Fetch the active personality from the backend API.
 * Falls back to hardcoded prompts if the API is unavailable.
 */
export async function fetchActivePersonality(): Promise<{
  systemPrompt: string;
  activeProfile: PersonalityType;
  traits: string[];
  greeting: string;
}> {
  try {
    const res = await fetch('/api/personality/active-prompt');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return {
      systemPrompt: data.systemPrompt,
      activeProfile: (data.activeProfile as PersonalityType) || 'warm',
      traits: data.traits || TRAIT_MAP[data.activeProfile] || TRAIT_MAP.warm,
      greeting: data.greeting || GREETING_MAP[data.activeProfile] || GREETING_MAP.warm,
    };
  } catch {
    return {
      systemPrompt: PERSONALITY_PROMPTS.warm,
      activeProfile: 'warm',
      traits: TRAIT_MAP.warm,
      greeting: GREETING_MAP.warm,
    };
  }
}

/**
 * Fetch the full personality config from the backend.
 */
export async function fetchPersonalityConfig(): Promise<any> {
  const now = Date.now();
  if (_cachedConfig && now - _cacheTime < CACHE_TTL) return _cachedConfig;
  try {
    const res = await fetch('/api/personality');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    _cachedConfig = await res.json();
    _cacheTime = now;
    return _cachedConfig;
  } catch {
    return null;
  }
}

/**
 * Save personality config to the backend.
 */
export async function savePersonalityConfig(config: any): Promise<boolean> {
  try {
    const res = await fetch('/api/personality', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    if (res.ok) {
      _cachedConfig = null; // Invalidate cache
      return true;
    }
  } catch { /* */ }
  return false;
}

/**
 * Switch the active personality profile.
 */
export async function switchPersonalityProfile(profile: PersonalityType): Promise<boolean> {
  try {
    const res = await fetch('/api/personality/active-profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile }),
    });
    if (res.ok) {
      _cachedConfig = null;
      return true;
    }
  } catch { /* */ }
  return false;
}

// ── Synchronous client-side accessors (for use in hooks/components) ──

/**
 * Get the system prompt for a personality type (synchronous, client-side).
 * Uses hardcoded prompts. For the actual active prompt, use fetchActivePersonality().
 */
export function getPersonalitySystemPrompt(personality: PersonalityType): string {
  return PERSONALITY_PROMPTS[personality] || PERSONALITY_PROMPTS.warm;
}

/**
 * Get the traits for a personality type.
 */
export function getPersonalityTraits(personality: PersonalityType): string[] {
  return TRAIT_MAP[personality] || TRAIT_MAP.warm;
}

/**
 * Get the greeting for a personality type.
 */
export function getPersonalityGreeting(personality: PersonalityType): string {
  return GREETING_MAP[personality] || GREETING_MAP.warm;
}

/**
 * All available personality types.
 */
export const ALL_PERSONALITY_TYPES: PersonalityType[] = ['warm', 'professional', 'playful', 'stoic'];

/**
 * Personality type labels.
 */
export const PERSONALITY_LABELS: Record<PersonalityType, string> = {
  warm: 'Warm & Friendly',
  professional: 'Professional & Efficient',
  playful: 'Playful & Creative',
  stoic: 'Stoic & Philosophical',
};
