export interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: number;
  source?: 'voice' | 'text' | 'system';
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ConversationMessage[];
  metadata?: {
    source?: string;
    context?: string;
  };
}

export interface Memory {
  id: string;
  category: string;
  key: string;
  value: string;
  importance: number; // 1-10
  createdAt: number;
  updatedAt: number;
  sourceConversationId?: string;
}

export interface MemoryContext {
  memories: Memory[];
  contextText: string;
}

export async function loadConversations(): Promise<Conversation[]> {
  try {
    const fs = await import('fs/promises');
    const data = await fs.readFile('data/conversations.json', 'utf-8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

export async function saveConversations(conversations: Conversation[]): Promise<void> {
  const fs = await import('fs/promises');
  await fs.writeFile('data/conversations.json', JSON.stringify(conversations, null, 2));
}

export async function loadConversation(id: string): Promise<Conversation | null> {
  const conversations = await loadConversations();
  return conversations.find((c) => c.id === id) ?? null;
}

export async function createConversation(conversation: Conversation): Promise<void> {
  const conversations = await loadConversations();
  conversations.unshift(conversation);
  await saveConversations(conversations);
}

export async function updateConversation(conversation: Conversation): Promise<void> {
  const conversations = await loadConversations();
  const index = conversations.findIndex((c) => c.id === conversation.id);
  if (index >= 0) {
    conversations[index] = conversation;
    await saveConversations(conversations);
  }
}

export async function deleteConversation(id: string): Promise<void> {
  const conversations = await loadConversations();
  const filtered = conversations.filter((c) => c.id !== id);
  await saveConversations(filtered);
}

export async function loadMemories(): Promise<Memory[]> {
  try {
    const fs = await import('fs/promises');
    const data = await fs.readFile('data/memories.json', 'utf-8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

export async function saveMemories(memories: Memory[]): Promise<void> {
  const fs = await import('fs/promises');
  await fs.writeFile('data/memories.json', JSON.stringify(memories, null, 2));
}

export async function createMemory(memory: Memory): Promise<void> {
  const memories = await loadMemories();
  memories.unshift(memory);
  await saveMemories(memories);
}

export async function updateMemory(memory: Memory): Promise<void> {
  const memories = await loadMemories();
  const index = memories.findIndex((m) => m.id === memory.id);
  if (index >= 0) {
    memories[index] = memory;
    await saveMemories(memories);
  }
}

export async function deleteMemory(id: string): Promise<void> {
  const memories = await loadMemories();
  const filtered = memories.filter((m) => m.id !== id);
  await saveMemories(filtered);
}

export async function clearMemories(): Promise<void> {
  const fs = await import('fs/promises');
  await fs.writeFile('data/memories.json', JSON.stringify([], null, 2));
}

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function extractTitleFromMessages(messages: ConversationMessage[]): string {
  if (messages.length === 0) return 'New conversation';
  const firstUser = messages.find((m) => m.role === 'user');
  if (!firstUser) return 'New conversation';
  const text = firstUser.text.trim();
  if (text.length <= 40) return text;
  return text.slice(0, 40).replace(/\s+\S*$/, '') + '…';
}

export function buildMemoryContext(memories: Memory[]): string {
  const top = memories
    .filter((m) => m.importance >= 5)
    .slice(0, 20)
    .map((m) => {
      const category = m.category.toLowerCase();
      const key = m.key;
      const value = m.value;
      return `${category === 'task' ? 'Task' : category === 'preference' ? 'Preference' : category === 'project' ? 'Project' : category === 'fact' ? 'Fact' : 'Information'}: ${key} — ${value}`;
    });
  if (top.length === 0) return '';
  return 'Your relevant personal context:\n' + top.join('\n');
}
