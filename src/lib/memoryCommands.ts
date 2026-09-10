/**
 * NASI Memory Command Parser
 * 
 * Detects natural memory commands from both text and voice input.
 * Returns structured commands that the app can execute against the memory API.
 */

export type MemoryCommand =
  | { type: 'remember'; key: string; value: string; category: string }
  | { type: 'forget'; key: string }
  | { type: 'forget_all' }
  | { type: 'recall' }
  | null;

const REMEMBER_PATTERNS = [
  /(?:remember|yaad rakh(?:o|na)?|yaad rakhen)\s+(?:that\s+)?(.+)/i,
  /(?:remember|yaad rakhna)\s+(?:k(?:i|e|ya)\s+)?(.+)/i,
  /(?:NASI|nasi),?\s+(?:remember|yaad rakh)\s+(?:that\s+)?(.+)/i,
  /(?:NASI|nasi),?\s+(?:please\s+)?remember\s+(.+)/i,
];

const FORGET_PATTERNS = [
  /(?:forget|bhool(?:o|jao|na)?|bhool jana)\s+(?:that\s+|about\s+)?(.+)/i,
  /(?:forget|bhoolna)\s+(?:k(?:i|e|ya)\s+)?(.+)/i,
  /(?:NASI|nasi),?\s+(?:forget|bhool jao)\s+(.+)/i,
];

const FORGET_ALL_PATTERNS = [
  /(?:forget|clear|delete)\s+(?:all|everything|sab|tamam)\s+(?:memories|yaadein|memory)/i,
  /(?:clear|saf)\s+(?:karo|karna)?\s+(?:sab|tamam|all)\s+(?:memories|yaadein)/i,
];

const RECALL_PATTERNS = [
  /(?:what|kya|kya baat)\s+(?:do you|tum|aap)\s+remember\s+(?:about|of)?\s*(?:me)?/i,
  /(?:what have you|tumne kya)\s+remembered/i,
  /(?:yaadein|memories)\s+(?:kya hain|batao|show|dikhao)/i,
  /(?:show|dikhao|list)\s+(?:my|meri)\s+(?:memories|yaadein)/i,
];

function inferCategory(text: string): string {
  const lower = text.toLowerCase();
  if (/\b(prefer|pasand|like|chah|chahti|want)\b/.test(lower)) return 'preference';
  if (/\b(project|kaam|work|task)\b/.test(lower)) return 'project';
  if (/\b(name|naam|call|bula)\b/.test(lower)) return 'identity';
  if (/\b(schedule|time|waqt|appointment)\b/.test(lower)) return 'schedule';
  if (/\b(note|note|important|zaruri|yaad)\b/.test(lower)) return 'note';
  return 'general';
}

/**
 * Parse a text input for memory commands.
 * Returns a MemoryCommand if detected, null otherwise.
 */
export function parseMemoryCommand(text: string): MemoryCommand {
  const trimmed = text.trim();

  // Check recall
  for (const pattern of RECALL_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { type: 'recall' };
    }
  }

  // Check forget all
  for (const pattern of FORGET_ALL_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { type: 'forget_all' };
    }
  }

  // Check forget
  for (const pattern of FORGET_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match && match[1]) {
      return { type: 'forget', key: match[1].trim().replace(/\.$/, '') };
    }
  }

  // Check remember
  for (const pattern of REMEMBER_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match && match[1]) {
      const content = match[1].trim().replace(/\.$/, '');
      // Try to split into key/value if possible: "that I prefer X" → key="preference", value="I prefer X"
      const category = inferCategory(content);
      return {
        type: 'remember',
        key: content.slice(0, 80),
        value: content,
        category,
      };
    }
  }

  return null;
}

/**
 * Generate a natural response to a memory command.
 */
export function getMemoryResponse(command: MemoryCommand): string {
  if (!command) return '';

  switch (command.type) {
    case 'remember':
      return `Got it! I'll remember: "${command.value}"`;
    case 'forget':
      return `Done — I've forgotten about "${command.key}".`;
    case 'forget_all':
      return 'All memories have been cleared.';
    case 'recall':
      return 'Here\'s what I remember about you:';
    default:
      return '';
  }
}
