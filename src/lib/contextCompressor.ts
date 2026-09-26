import type { ConversationMessage, Memory } from './storage';
import {
  idbGetContextCache,
  idbSetContextCache,
  idbInvalidateContextCache,
  idbGetUserPattern,
  type UserBehaviorPattern,
} from './indexedDb';

/**
 * Intelligent Context Window Compressor & Token Estimator
 * Prevents bloating in long-running conversations while preserving vital directives and context.
 */

export interface CompressedContextResult {
  contextPrompt: string;
  tokenEstimate: number;
  isCached: boolean;
  userPattern: UserBehaviorPattern;
}

/** Approximate token count (roughly 3.8 chars per token) */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 3.8);
}

/**
 * Compress an array of conversation messages into a clean, compacted window.
 * Keeps recent messages intact, while condensing older message history.
 */
export function compressMessageHistory(
  messages: ConversationMessage[],
  maxTokens: number = 2200,
): { condensedText: string; tokens: number } {
  if (messages.length === 0) return { condensedText: '', tokens: 0 };

  // Always keep the last 6 turns (12 messages) intact
  const recentWindow = messages.slice(-12);
  const olderMessages = messages.slice(0, -12);

  let olderSummary = '';
  if (olderMessages.length > 0) {
    const keyUserQueries = olderMessages
      .filter((m) => m.role === 'user')
      .map((m) => m.text.slice(0, 80).trim())
      .filter(Boolean);

    if (keyUserQueries.length > 0) {
      olderSummary = `[Earlier Topics Discussed: ${keyUserQueries.slice(-5).join(' · ')}]\n\n`;
    }
  }

  const recentLines = recentWindow.map((m) => {
    const roleTag = m.role === 'user' ? 'User' : 'NASI';
    // Trim extra whitespace
    const text = m.text.replace(/\s+/g, ' ').trim();
    return `${roleTag}: ${text}`;
  });

  let fullCondensed = olderSummary + recentLines.join('\n');
  let tokens = estimateTokens(fullCondensed);

  // If still above maxTokens, slide window from the top
  while (tokens > maxTokens && recentLines.length > 4) {
    recentLines.shift();
    fullCondensed = olderSummary + recentLines.join('\n');
    tokens = estimateTokens(fullCondensed);
  }

  return { condensedText: fullCondensed, tokens };
}

/**
 * Deduplicate and prioritize memories by importance & relevance
 */
export function compressMemories(memories: Memory[], maxTokens: number = 800): string {
  if (!memories || memories.length === 0) return '';

  // Sort by importance descending
  const sorted = [...memories].sort((a, b) => (b.importance || 5) - (a.importance || 5));

  // Deduplicate by key
  const seenKeys = new Set<string>();
  const uniqueMems: Memory[] = [];

  for (const m of sorted) {
    const normKey = m.key.toLowerCase().trim();
    if (!seenKeys.has(normKey)) {
      seenKeys.add(normKey);
      uniqueMems.push(m);
    }
  }

  const lines: string[] = [];
  let currentTokens = 0;

  for (const m of uniqueMems) {
    const line = `• [${m.category.toUpperCase()}] ${m.key}: ${m.value}`;
    const lineTokens = estimateTokens(line);
    if (currentTokens + lineTokens > maxTokens) break;
    lines.push(line);
    currentTokens += lineTokens;
  }

  if (lines.length === 0) return '';
  return 'Active Long-Term Knowledge:\n' + lines.join('\n');
}

/**
 * Builds a compressed, memory-aware context prompt with caching & behavior pattern adaptation
 */
export async function buildOptimizedContext(options: {
  conversationId?: string;
  messages: ConversationMessage[];
  memories: Memory[];
  prompt: string;
  forceFresh?: boolean;
}): Promise<CompressedContextResult> {
  const { conversationId, messages, memories, prompt, forceFresh } = options;

  const userPattern = await idbGetUserPattern();

  // Check cache if conversationId is provided
  if (conversationId && !forceFresh) {
    const cached = await idbGetContextCache(conversationId);
    if (cached) {
      return {
        contextPrompt: cached.compressedContext,
        tokenEstimate: cached.tokenCount,
        isCached: true,
        userPattern,
      };
    }
  }

  const { condensedText: historyText, tokens: histTokens } = compressMessageHistory(messages, 2000);
  const memoryText = compressMemories(memories, 800);

  const sections: string[] = [];

  // Behavioral adaptation directive
  let toneGuidance = '';
  if (userPattern.preferredTone === 'concise') {
    toneGuidance = 'Note: The user prefers swift, direct, concise responses without redundant preambles.';
  } else if (userPattern.preferredTone === 'technical') {
    toneGuidance = 'Note: Provide precise architectural, technical precision with terminal-grade clarity.';
  }

  if (toneGuidance) sections.push(toneGuidance);
  if (memoryText) sections.push(memoryText);
  if (historyText) sections.push(`Conversation History:\n${historyText}`);

  const combined = sections.join('\n\n');
  const tokenEstimate = estimateTokens(combined) + estimateTokens(prompt);

  // Cache compiled context (10 minutes TTL)
  if (conversationId) {
    await idbSetContextCache({
      id: conversationId,
      conversationId,
      compressedContext: combined,
      tokenCount: tokenEstimate,
      timestamp: Date.now(),
      ttlMs: 10 * 60 * 1000,
    });
  }

  return {
    contextPrompt: combined,
    tokenEstimate,
    isCached: false,
    userPattern,
  };
}

export { idbInvalidateContextCache };
