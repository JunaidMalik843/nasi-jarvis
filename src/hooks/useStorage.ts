import { useState, useCallback, useEffect } from 'react';
import type { Conversation, Memory } from '../lib/storage';
import { generateId, extractTitleFromMessages } from '../lib/storage';
import {
  idbGetConversations,
  idbSaveConversation,
  idbDeleteConversation as idbRemoveConversation,
  idbBulkSaveConversations,
  idbGetMemories,
  idbSaveMemory,
  idbDeleteMemory as idbRemoveMemory,
  idbClearMemories as idbPurgeMemories,
  idbBulkSaveMemories,
  idbInvalidateContextCache,
} from '../lib/indexedDb';

// ─────────────────────────────────────────────────────────────
// USE CONVERSATIONS (IndexedDB + Server Dual-Engine)
// ─────────────────────────────────────────────────────────────

export function useConversations() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);

  // Load from IndexedDB immediately, then sync with server
  const loadConversations = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Instant local read from IndexedDB
      const localConvs = await idbGetConversations();
      if (localConvs.length > 0) {
        setConversations(localConvs);
      }

      // 2. Fetch fresh data from server
      const res = await fetch('/api/conversations');
      if (res.ok) {
        const data = await res.json();
        if (data.conversations && Array.isArray(data.conversations)) {
          setConversations(data.conversations);
          // Sync server data into IndexedDB
          await idbBulkSaveConversations(data.conversations);
        }
      }
    } catch (err) {
      console.warn('[Conversations] Sync warning:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const createConversation = useCallback(
    async (initialMessage: string, title?: string): Promise<Conversation | null> => {
      const now = Date.now();
      const id = generateId();
      const autoTitle = title || (initialMessage.length > 35 ? initialMessage.slice(0, 35) + '…' : initialMessage);

      const newConv: Conversation = {
        id,
        title: autoTitle,
        createdAt: now,
        updatedAt: now,
        messages: [
          {
            id: generateId(),
            role: 'user',
            text: initialMessage,
            timestamp: now,
            source: 'text',
          },
        ],
      };

      // Optimistic update to UI + IndexedDB
      setConversations((prev) => [newConv, ...prev]);
      setActiveConversationId(id);
      setActiveConversation(newConv);
      await idbSaveConversation(newConv);

      // Async server sync
      fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initialMessage, title }),
      })
        .then((r) => r.json())
        .then((data) => {
          if (data.conversation) {
            idbSaveConversation(data.conversation);
          }
        })
        .catch((err) => console.warn('[Conversations] Server create failed:', err));

      return newConv;
    },
    [],
  );

  const selectConversation = useCallback(
    async (id: string) => {
      // Find in current state or local IndexedDB
      const found = conversations.find((c) => c.id === id);
      if (found) {
        setActiveConversationId(id);
        setActiveConversation(found);
        return found;
      }

      setLoading(true);
      try {
        const res = await fetch(`/api/conversations/${id}`);
        const data = await res.json();
        if (data.conversation) {
          setActiveConversationId(id);
          setActiveConversation(data.conversation);
          await idbSaveConversation(data.conversation);
          return data.conversation;
        }
      } finally {
        setLoading(false);
      }
    },
    [conversations],
  );

  const addMessage = useCallback(
    async (conversationId: string, role: 'user' | 'assistant', text: string, source?: 'voice' | 'text') => {
      const now = Date.now();
      const newMsg = {
        id: generateId(),
        role,
        text,
        timestamp: now,
        source: source || 'text',
      };

      // Optimistic local update
      setConversations((prev) => {
        return prev.map((c) => {
          if (c.id === conversationId) {
            const updated = {
              ...c,
              updatedAt: now,
              messages: [...c.messages, newMsg],
            };
            if (role === 'user' && c.messages.length === 0) {
              updated.title = extractTitleFromMessages([newMsg]);
            }
            idbSaveConversation(updated);
            if (activeConversationId === conversationId) {
              setActiveConversation(updated);
            }
            return updated;
          }
          return c;
        });
      });

      // Invalidate context cache for this conversation
      await idbInvalidateContextCache(conversationId);

      // Background sync to server
      try {
        const res = await fetch(`/api/conversations/${conversationId}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role, text, source }),
        });
        const data = await res.json();
        if (data.conversation) {
          await idbSaveConversation(data.conversation);
        }
      } catch (err) {
        console.warn('[Conversations] Add message server sync failed:', err);
      }
    },
    [activeConversationId],
  );

  const deleteConversation = useCallback(
    async (id: string) => {
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (activeConversationId === id) {
        setActiveConversationId(null);
        setActiveConversation(null);
      }
      await idbRemoveConversation(id);

      fetch(`/api/conversations/${id}`, { method: 'DELETE' }).catch((err) =>
        console.warn('[Conversations] Server delete failed:', err),
      );
    },
    [activeConversationId],
  );

  const updateConversationTitle = useCallback(
    async (id: string, title: string) => {
      setConversations((prev) =>
        prev.map((c) => {
          if (c.id === id) {
            const updated = { ...c, title, updatedAt: Date.now() };
            idbSaveConversation(updated);
            if (activeConversationId === id) setActiveConversation(updated);
            return updated;
          }
          return c;
        }),
      );

      fetch(`/api/conversations/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      }).catch((err) => console.warn('[Conversations] Server title update failed:', err));
    },
    [activeConversationId],
  );

  const newConversation = useCallback(() => {
    setActiveConversationId(null);
    setActiveConversation(null);
  }, []);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  return {
    conversations,
    activeConversation,
    activeConversationId,
    loading,
    createConversation,
    selectConversation,
    addMessage,
    deleteConversation,
    updateConversationTitle,
    newConversation,
    refreshConversations: loadConversations,
  };
}

// ─────────────────────────────────────────────────────────────
// USE MEMORIES (IndexedDB + Server Dual-Engine)
// ─────────────────────────────────────────────────────────────

export function useMemories() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(false);

  const loadMemories = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Instant local read
      const localMems = await idbGetMemories();
      if (localMems.length > 0) {
        setMemories(localMems);
      }

      // 2. Fresh read from server
      const res = await fetch('/api/memories');
      if (res.ok) {
        const data = await res.json();
        if (data.memories && Array.isArray(data.memories)) {
          setMemories(data.memories);
          await idbBulkSaveMemories(data.memories);
        }
      }
    } catch (err) {
      console.warn('[Memories] Load sync warning:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const createMemory = useCallback(
    async (
      category: string,
      key: string,
      value: string,
      importance: number = 5,
      sourceConversationId?: string,
      geminiApiKey?: string,
    ) => {
      const now = Date.now();
      const id = generateId();
      const newMem: Memory = {
        id,
        category: category || 'general',
        key: key.trim(),
        value: value.trim(),
        importance: Math.max(1, Math.min(10, importance)),
        createdAt: now,
        updatedAt: now,
        sourceConversationId,
      };

      // Optimistic local save
      setMemories((prev) => [newMem, ...prev]);
      await idbSaveMemory(newMem);
      await idbInvalidateContextCache();

      // Post to vector-memory endpoint for semantic indexing
      try {
        const res = await fetch('/api/vector-memory', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: `${newMem.key}: ${newMem.value}`,
            category: newMem.category,
            importance: newMem.importance,
            sourceConversationId,
            apiKey: geminiApiKey,
          }),
        });
        const data = await res.json();
        if (data.memory) {
          const finalMem: Memory = {
            ...newMem,
            id: data.memory.id || newMem.id,
          };
          await idbSaveMemory(finalMem);
          return finalMem;
        }
      } catch (err) {
        console.warn('[Memories] Vector storage fallback:', err);
      }
      return newMem;
    },
    [],
  );

  const deleteMemory = useCallback(async (id: string) => {
    setMemories((prev) => prev.filter((m) => m.id !== id));
    await idbRemoveMemory(id);
    await idbInvalidateContextCache();

    fetch(`/api/vector-memory/${id}`, { method: 'DELETE' }).catch(() => {
      fetch(`/api/memories/${id}`, { method: 'DELETE' }).catch(() => {});
    });
  }, []);

  const clearMemories = useCallback(async () => {
    setMemories([]);
    await idbPurgeMemories();
    await idbInvalidateContextCache();

    fetch('/api/vector-memory/clear', { method: 'POST' }).catch(() => {
      fetch('/api/memories/clear', { method: 'POST' }).catch(() => {});
    });
  }, []);

  const updateMemory = useCallback(
    async (id: string, updates: Partial<Memory>) => {
      const current = memories.find((m) => m.id === id);
      if (!current) return;
      const updated: Memory = { ...current, ...updates, updatedAt: Date.now() };

      setMemories((prev) => prev.map((m) => (m.id === id ? updated : m)));
      await idbSaveMemory(updated);
      await idbInvalidateContextCache();

      fetch(`/api/memories/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      }).catch((err) => console.warn('[Memories] Server update failed:', err));

      return updated;
    },
    [memories],
  );

  useEffect(() => {
    loadMemories();
  }, [loadMemories]);

  return {
    memories,
    loading,
    createMemory,
    deleteMemory,
    clearMemories,
    updateMemory,
    refreshMemories: loadMemories,
  };
}
