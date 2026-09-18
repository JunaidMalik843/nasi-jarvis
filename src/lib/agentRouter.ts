// ============================================================
// AGENT ROUTER — maps a user command to the department agent
// that should handle it.
//
// Deliberately simple + local: keyword/intent matching, ordered so
// the most specific domains win over the general research fallback.
// No network calls, no model needed — routing must never block a turn.
// ============================================================

export type AgentRoute = {
  /** Intent key (used for logging / display). */
  intent: string;
  /** Agent name (must match a name in the AGENTS list). */
  agent: string;
  /** Department zone label. */
  dept: string;
  /** Short human-readable reason shown in the UI. */
  reason: string;
};

type Rule = AgentRoute & { kw: RegExp };

const RULES: Rule[] = [
  {
    intent: 'commerce', agent: 'Shopify', dept: 'Commerce', reason: 'Store & product operations',
    kw: /\b(shop|shopify|store|buy|purchase|order|cart|checkout|product|price|pricing|inventory|stock|discount|coupon|refund|sku|sales|revenue)\b/i,
  },
  {
    intent: 'browse', agent: 'Browser', dept: 'Web', reason: 'Web navigation & lookup',
    kw: /\b(browse|browser|search|google|website|site|url|link|open the|scrape|look ?up|web|news|download|navigate|page)\b/i,
  },
  {
    intent: 'comms', agent: 'Comm', dept: 'Communication', reason: 'Messaging & notifications',
    kw: /\b(email|e-mail|mail|message|whatsapp|sms|text him|text her|send (a )?(message|email|note)|notify|notification|call|reply|dm)\b/i,
  },
  // NOTE: `file` is checked before `system` on purpose — "save this to a file on
  // my computer" is a file task even though it mentions "computer".
  {
    intent: 'file', agent: 'File', dept: 'Infrastructure', reason: 'Local file operations',
    kw: /\b(file|files|save|folder|directory|document|write|rename|copy|move|delete file|pdf|docx|csv|spreadsheet|attachment)\b/i,
  },
  {
    intent: 'system', agent: 'Computer', dept: 'Infrastructure', reason: 'Local PC control',
    kw: /\b(pc|computer|laptop|windows|screenshot|launch|app|application|process|terminal|cmd|powershell|shutdown|restart|volume|brightness|clipboard)\b/i,
  },
  {
    intent: 'security', agent: 'Security', dept: 'Security', reason: 'Security & permission check',
    kw: /\b(secure|security|password|passcode|scan|threat|permission|encrypt|vulnerab|authenticate|credential|risk|firewall|breach)\b/i,
  },
  {
    intent: 'research', agent: 'Research', dept: 'Research', reason: 'Analysis & synthesis',
    kw: /\b(research|find|analy[sz]e|study|summari[sz]e|compare|explain|investigate|report|insight|plan|strategy|how|why|what is|who is|tell me about)\b/i,
  },
];

const DEFAULT_ROUTE: AgentRoute = {
  intent: 'general', agent: 'Research', dept: 'Research', reason: 'General reasoning & answer synthesis',
};

/** Route a raw command string to the agent that should handle it. */
export function routeCommand(text: string): AgentRoute {
  const t = (text || '').toLowerCase();
  for (const r of RULES) {
    if (r.kw.test(t)) {
      return { intent: r.intent, agent: r.agent, dept: r.dept, reason: r.reason };
    }
  }
  return { ...DEFAULT_ROUTE };
}

/** Statuses that mean "an agent is actively working right now". */
export const ACTIVE_STATUSES = ['Active', 'Delegating', 'Working'] as const;

export function isActiveStatus(status: string): boolean {
  return (ACTIVE_STATUSES as readonly string[]).includes(status);
}

/** Map a status string to a UI class suffix. */
export function statusClass(status: string): 'active' | 'idle' | 'offline' {
  if (isActiveStatus(status)) return 'active';
  return status === 'Idle' ? 'idle' : 'offline';
}
