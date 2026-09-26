import { openDB, type IDBPDatabase } from 'idb';
import type { Conversation, Memory } from './storage';

const DB_NAME = 'nasi_cyber_db';
const DB_VERSION = 1;

export interface ContextCacheEntry {
  id: string; // key: conversationId or hash
  conversationId: string;
  compressedContext: string;
  tokenCount: number;
  timestamp: number;
  ttlMs: number;
}

export interface UserBehaviorPattern {
  id: string; // 'user_pattern'
  preferredLanguage: string; // 'en' | 'ur' | 'mixed'
  preferredTone: 'concise' | 'technical' | 'conversational';
  averagePromptLength: number;
  totalPrompts: number;
  frequentAgents: Record<string, number>;
  frequentCategories: Record<string, number>;
  lastActive: number;
}

interface NASISchema {
  conversations: {
    key: string;
    value: Conversation;
    indexes: { 'by-updated': number };
  };
  memories: {
    key: string;
    value: Memory;
    indexes: { 'by-category': string; 'by-importance': number; 'by-updated': number };
  };
  settings: {
    key: string;
    value: Record<string, any>;
  };
  contextCache: {
    key: string;
    value: ContextCacheEntry;
    indexes: { 'by-conversation': string; 'by-timestamp': number };
  };
  behaviorPattern: {
    key: string;
    value: UserBehaviorPattern;
  };
}

let dbPromise: Promise<IDBPDatabase<NASISchema>> | null = null;

export function getDB(): Promise<IDBPDatabase<NASISchema>> {
  if (!dbPromise) {
    dbPromise = openDB<NASISchema>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // Conversations store
        if (!db.objectStoreNames.contains('conversations')) {
          const convStore = db.createObjectStore('conversations', { keyPath: 'id' });
          convStore.createIndex('by-updated', 'updatedAt');
        }

        // Memories store
        if (!db.objectStoreNames.contains('memories')) {
          const memStore = db.createObjectStore('memories', { keyPath: 'id' });
          memStore.createIndex('by-category', 'category');
          memStore.createIndex('by-importance', 'importance');
          memStore.createIndex('by-updated', 'updatedAt');
        }

        // Settings store
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'id' });
        }

        // Context Cache store for compressed context windows
        if (!db.objectStoreNames.contains('contextCache')) {
          const cacheStore = db.createObjectStore('contextCache', { keyPath: 'id' });
          cacheStore.createIndex('by-conversation', 'conversationId');
          cacheStore.createIndex('by-timestamp', 'timestamp');
        }

        // Behavior pattern store
        if (!db.objectStoreNames.contains('behaviorPattern')) {
          db.createObjectStore('behaviorPattern', { keyPath: 'id' });
        }
      },
    });
  }
  return dbPromise;
}

// ─────────────────────────────────────────────────────────────
// CONVERSATIONS IDB API
// ─────────────────────────────────────────────────────────────

export async function idbGetConversations(): Promise<Conversation[]> {
  try {
    const db = await getDB();
    const convs = await db.getAllFromIndex('conversations', 'by-updated');
    return convs.reverse(); // newest first
  } catch (err) {
    console.warn('[IDB] Get conversations failed:', err);
    return [];
  }
}

export async function idbGetConversation(id: string): Promise<Conversation | null> {
  try {
    const db = await getDB();
    const conv = await db.get('conversations', id);
    return conv || null;
  } catch (err) {
    console.warn('[IDB] Get conversation failed:', err);
    return null;
  }
}

export async function idbSaveConversation(conversation: Conversation): Promise<void> {
  try {
    const db = await getDB();
    await db.put('conversations', conversation);
  } catch (err) {
    console.warn('[IDB] Save conversation failed:', err);
  }
}

export async function idbDeleteConversation(id: string): Promise<void> {
  try {
    const db = await getDB();
    await db.delete('conversations', id);
    // Invalidate cached context for this conversation
    await idbInvalidateContextCache(id);
  } catch (err) {
    console.warn('[IDB] Delete conversation failed:', err);
  }
}

export async function idbBulkSaveConversations(conversations: Conversation[]): Promise<void> {
  try {
    const db = await getDB();
    const tx = db.transaction('conversations', 'readwrite');
    for (const c of conversations) {
      await tx.store.put(c);
    }
    await tx.done;
  } catch (err) {
    console.warn('[IDB] Bulk save conversations failed:', err);
  }
}

// ─────────────────────────────────────────────────────────────
// MEMORIES IDB API
// ─────────────────────────────────────────────────────────────

export async function idbGetMemories(): Promise<Memory[]> {
  try {
    const db = await getDB();
    const mems = await db.getAllFromIndex('memories', 'by-updated');
    return mems.reverse();
  } catch (err) {
    console.warn('[IDB] Get memories failed:', err);
    return [];
  }
}

export async function idbSaveMemory(memory: Memory): Promise<void> {
  try {
    const db = await getDB();
    await db.put('memories', memory);
  } catch (err) {
    console.warn('[IDB] Save memory failed:', err);
  }
}

export async function idbDeleteMemory(id: string): Promise<void> {
  try {
    const db = await getDB();
    await db.delete('memories', id);
  } catch (err) {
    console.warn('[IDB] Delete memory failed:', err);
  }
}

export async function idbClearMemories(): Promise<void> {
  try {
    const db = await getDB();
    await db.clear('memories');
  } catch (err) {
    console.warn('[IDB] Clear memories failed:', err);
  }
}

export async function idbBulkSaveMemories(memories: Memory[]): Promise<void> {
  try {
    const db = await getDB();
    const tx = db.transaction('memories', 'readwrite');
    for (const m of memories) {
      await tx.store.put(m);
    }
    await tx.done;
  } catch (err) {
    console.warn('[IDB] Bulk save memories failed:', err);
  }
}

// ─────────────────────────────────────────────────────────────
// SETTINGS IDB API
// ─────────────────────────────────────────────────────────────

export async function idbGetSettings<T = any>(): Promise<T | null> {
  try {
    const db = await getDB();
    const doc = await db.get('settings', 'active');
    return doc ? (doc.settings as T) : null;
  } catch {
    return null;
  }
}

export async function idbSaveSettings(settings: any): Promise<void> {
  try {
    const db = await getDB();
    await db.put('settings', { id: 'active', settings, updatedAt: Date.now() });
  } catch (err) {
    console.warn('[IDB] Save settings failed:', err);
  }
}

// ─────────────────────────────────────────────────────────────
// CONTEXT CACHE & CACHE INVALIDATION
// ─────────────────────────────────────────────────────────────

export async function idbGetContextCache(conversationId: string): Promise<ContextCacheEntry | null> {
  try {
    const db = await getDB();
    const entry = await db.get('contextCache', conversationId);
    if (!entry) return null;
    // Check TTL (default 15 minutes)
    if (Date.now() - entry.timestamp > entry.ttlMs) {
      await db.delete('contextCache', conversationId);
      return null;
    }
    return entry;
  } catch {
    return null;
  }
}

export async function idbSetContextCache(entry: ContextCacheEntry): Promise<void> {
  try {
    const db = await getDB();
    await db.put('contextCache', entry);
  } catch (err) {
    console.warn('[IDB] Set context cache failed:', err);
  }
}

export async function idbInvalidateContextCache(conversationId?: string): Promise<void> {
  try {
    const db = await getDB();
    if (conversationId) {
      await db.delete('contextCache', conversationId);
    } else {
      await db.clear('contextCache');
    }
  } catch (err) {
    console.warn('[IDB] Invalidate context cache failed:', err);
  }
}

// ─────────────────────────────────────────────────────────────
// USER BEHAVIOR PATTERN TRACKING
// ─────────────────────────────────────────────────────────────

const DEFAULT_PATTERN: UserBehaviorPattern = {
  id: 'user_pattern',
  preferredLanguage: 'en',
  preferredTone: 'technical',
  averagePromptLength: 40,
  totalPrompts: 0,
  frequentAgents: {},
  frequentCategories: {},
  lastActive: Date.now(),
};

export async function idbGetUserPattern(): Promise<UserBehaviorPattern> {
  try {
    const db = await getDB();
    const p = await db.get('behaviorPattern', 'user_pattern');
    return p ? { ...DEFAULT_PATTERN, ...p } : { ...DEFAULT_PATTERN };
  } catch {
    return { ...DEFAULT_PATTERN };
  }
}

export async function idbUpdateUserPattern(input: {
  promptText?: string;
  agent?: string;
  category?: string;
}): Promise<UserBehaviorPattern> {
  try {
    const current = await idbGetUserPattern();
    const now = Date.now();

    if (input.promptText) {
      const text = input.promptText.trim();
      current.totalPrompts += 1;
      const len = text.length;
      current.averagePromptLength = Math.round(
        (current.averagePromptLength * (current.totalPrompts - 1) + len) / current.totalPrompts,
      );

      // Detect language patterns (English vs Urdu/Roman Urdu)
      const urduIndicators = /\b(kya|hai|hein|bhai|kaise|shukriya|mujhe|aap|batao|karo|theek)\b/i;
      if (urduIndicators.test(text)) {
        current.preferredLanguage = 'ur';
      }

      // Detect tone preference
      if (text.length < 25) {
        current.preferredTone = 'concise';
      } else if (/\b(explain|architecture|protocol|code|system|vector|latency)\b/i.test(text)) {
        current.preferredTone = 'technical';
      }
    }

    if (input.agent) {
      current.frequentAgents[input.agent] = (current.frequentAgents[input.agent] || 0) + 1;
    }

    if (input.category) {
      current.frequentCategories[input.category] = (current.frequentCategories[input.category] || 0) + 1;
    }

    current.lastActive = now;
    const db = await getDB();
    await db.put('behaviorPattern', current);
    return current;
  } catch {
    return { ...DEFAULT_PATTERN };
  }
}
