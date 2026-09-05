import { useState, useCallback, useEffect } from 'react';
import type { Conversation, ConversationMessage, Memory } from '../lib/storage';
import { generateId } from '../lib/storage';

// Conversation hooks
export function useConversations() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);

  const loadConversations = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/conversations');
      const data = await res.json();
      if (data.conversations) {
        setConversations(data.conversations);
      }
    } catch (err) {
      console.warn('[Conversations] Failed to load:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const createConversation = useCallback(
    async (initialMessage: string, title?: string) => {
      try {
        const res = await fetch('/api/conversations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ initialMessage, title }),
        });
        const data = await res.json();
        if (data.conversation) {
          setConversations((prev) => [data.conversation, ...prev]);
          setActiveConversationId(data.conversation.id);
          setActiveConversation(data.conversation);
          return data.conversation;
        }
      } catch (err) {
        console.warn('[Conversations] Failed to create:', err);
      }
    },
    [],
  );

  const selectConversation = useCallback(
    async (id: string) => {
      setLoading(true);
      try {
        const res = await fetch(`/api/conversations/${id}`);
        const data = await res.json();
        if (data.conversation) {
          setActiveConversationId(id);
          setActiveConversation(data.conversation);
          return data.conversation;
        }
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const addMessage = useCallback(
    async (conversationId: string, role: 'user' | 'assistant', text: string, source?: 'voice' | 'text') => {
      try {
        const res = await fetch(`/api/conversations/${conversationId}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role, text, source }),
        });
        const data = await res.json();
        if (data.conversation) {
          setActiveConversation(data.conversation);
          setConversations((prev) => {
            const updated = prev.map((c) => (c.id === conversationId ? data.conversation : c));
            return updated;
          });
          return data.conversation;
        }
      } catch (err) {
        console.warn('[Conversations] Failed to add message:', err);
      }
    },
    [],
  );

  const deleteConversation = useCallback(
    async (id: string) => {
      try {
        await fetch(`/api/conversations/${id}`, { method: 'DELETE' });
        setConversations((prev) => prev.filter((c) => c.id !== id));
        if (activeConversationId === id) {
          setActiveConversationId(null);
          setActiveConversation(null);
        }
      } catch (err) {
        console.warn('[Conversations] Failed to delete:', err);
      }
    },
    [activeConversationId],
  );

  const updateConversationTitle = useCallback(
    async (id: string, title: string) => {
      try {
        const conversation = await loadConversation(id);
        if (conversation) {
          conversation.title = title;
          conversation.updatedAt = Date.now();
          await fetch(`/api/conversations/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(conversation),
          }).then((res) => res.json());
          setConversations((prev) => prev.map((c) => (c.id === id ? conversation : c)));
        }
      } catch (err) {
        console.warn('[Conversations] Failed to update title:', err);
      }
    },
    [],
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

// Individual conversation loading (used internally)
async function loadConversation(id: string): Promise<Conversation | null> {
  try {
    const res = await fetch(`/api/conversations/${id}`);
    const data = await res.json();
    return data.conversation ?? null;
  } catch {
    return null;
  }
}

// Memory hooks
export function useMemories() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(false);

  const loadMemories = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/memories');
      const data = await res.json();
      if (data.memories) {
        setMemories(data.memories);
      }
    } catch (err) {
      console.warn('[Memories] Failed to load:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const createMemory = useCallback(
    async (
      category: string,
      key: string,
      value: string,
      importance?: number,
      sourceConversationId?: string,
    ) => {
      try {
        const res = await fetch('/api/memories', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ category, key, value, importance, sourceConversationId }),
        });
        const data = await res.json();
        if (data.memory) {
          setMemories((prev) => [data.memory, ...prev]);
          return data.memory;
        }
      } catch (err) {
        console.warn('[Memories] Failed to create:', err);
      }
    },
    [],
  );

  const deleteMemory = useCallback(async (id: string) => {
    try {
      await fetch(`/api/memories/${id}`, { method: 'DELETE' });
      setMemories((prev) => prev.filter((m) => m.id !== id));
    } catch (err) {
      console.warn('[Memories] Failed to delete:', err);
    }
  }, []);

  const clearMemories = useCallback(async () => {
    try {
      await fetch('/api/memories/clear', { method: 'POST' });
      setMemories([]);
    } catch (err) {
      console.warn('[Memories] Failed to clear:', err);
    }
  }, []);

  const updateMemory = useCallback(
    async (id: string, updates: Partial<Memory>) => {
      try {
        const memory = memories.find((m) => m.id === id);
        if (memory) {
          const updated = { ...memory, ...updates, updatedAt: Date.now() };
          await fetch(`/api/memories/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updated),
          }).then((res) => res.json());
          setMemories((prev) => prev.map((m) => (m.id === id ? updated : m)));
          return updated;
        }
      } catch (err) {
        console.warn('[Memories] Failed to update:', err);
      }
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
