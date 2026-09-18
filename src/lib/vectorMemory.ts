/**
 * NASI Vector Memory Store
 *
 * Persistent semantic memory with:
 * - Local TF-IDF based text embedding (always works, no API needed)
 * - Optional Gemini text-embedding for higher quality (when GEMINI_API_KEY is set)
 * - Cosine similarity search
 * - Persistent JSON file storage (survives restarts)
 * - CRUD operations: store, search, delete, clear
 */

import fs from 'fs/promises';
import path from 'path';

// ─── Types ───────────────────────────────────────────────────────
export interface VectorMemory {
  id: string;
  text: string;
  category: string;
  importance: number;
  embedding: number[];      // TF-IDF or Gemini embedding vector
  embeddingType: 'tfidf' | 'gemini';
  createdAt: number;
  updatedAt: number;
  sourceConversationId?: string;
  metadata?: Record<string, unknown>;
}

export interface SearchResult {
  memory: VectorMemory;
  score: number;           // cosine similarity score (0-1)
}

export interface VectorStoreStats {
  totalMemories: number;
  embeddingType: 'tfidf' | 'gemini' | 'mixed';
  vocabularySize: number;
  lastUpdated: number;
}

// ─── TF-IDF Text Embedding (local, no API) ──────────────────────

/**
 * Simple but effective tokenizer for English + Urdu/Roman Urdu
 */
function tokenize(text: string): string[] {
  const lower = text.toLowerCase();
  // Split on whitespace, punctuation, and Arabic/Urdu word boundaries
  const tokens = lower
    .replace(/[\u0600-\u06FF]+/g, ' ') // Remove Urdu script (keep Roman Urdu)
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 2); // Skip very short tokens
  return tokens;
}

/**
 * Build a TF-IDF vocabulary from a corpus of texts
 */
function buildVocabulary(texts: string[]): Map<string, number> {
  const docFreq = new Map<string, number>();
  const totalDocs = texts.length;

  for (const text of texts) {
    const uniqueTokens = new Set(tokenize(text));
    for (const token of uniqueTokens) {
      docFreq.set(token, (docFreq.get(token) || 0) + 1);
    }
  }

  // Filter tokens that appear in at least 1 document but not all
  const vocab = new Map<string, number>();
  let idx = 0;
  for (const [token, freq] of docFreq) {
    if (freq >= 1 && freq < totalDocs * 0.95) {
      vocab.set(token, idx++);
    }
  }
  return vocab;
}

/**
 * Compute TF-IDF vector for a single text
 */
function computeTFIDF(text: string, vocab: Map<string, number>): number[] {
  const vector = new Array(vocab.size).fill(0);
  const tokens = tokenize(text);
  const termFreq = new Map<string, number>();

  for (const token of tokens) {
    termFreq.set(token, (termFreq.get(token) || 0) + 1);
  }

  const maxFreq = Math.max(...Array.from(termFreq.values()), 1);

  for (const [term, freq] of termFreq) {
    const idx = vocab.get(term);
    if (idx !== undefined) {
      // TF: normalized term frequency
      const tf = freq / maxFreq;
      // IDF: log smoothing
      const idf = Math.log(2 + 1); // Simplified since we rebuild per batch
      vector[idx] = tf * idf;
    }
  }

  // L2 normalize
  const norm = Math.sqrt(vector.reduce((s, v) => s + v * v, 0));
  if (norm > 0) {
    for (let i = 0; i < vector.length; i++) {
      vector[i] /= norm;
    }
  }

  return vector;
}

/**
 * Cosine similarity between two vectors
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom > 0 ? dot / denom : 0;
}

// ─── Vector Memory Store ─────────────────────────────────────────

export class VectorMemoryStore {
  private memories: VectorMemory[] = [];
  private vocab: Map<string, number> = new Map();
  private vocabDirty = true;
  private storePath: string;
  private geminiApiKey: string | undefined;
  private embeddingDim = 100; // TF-IDF vector dimension (dynamic based on vocab)

  constructor(dataDir: string, geminiApiKey?: string) {
    this.storePath = path.join(dataDir, 'vector-memory.json');
    this.geminiApiKey = geminiApiKey;
  }

  /**
   * Initialize the store from disk
   */
  async init(): Promise<void> {
    try {
      const raw = await fs.readFile(this.storePath, 'utf-8');
      const data = JSON.parse(raw);
      this.memories = data.memories || [];
      this.vocabDirty = true; // Rebuild vocab from loaded memories
      console.log(`[VectorMemory] Loaded ${this.memories.length} memories from disk`);
    } catch {
      this.memories = [];
      console.log('[VectorMemory] Starting with empty memory store');
    }
  }

  /**
   * Persist to disk
   */
  private async save(): Promise<void> {
    const dir = path.dirname(this.storePath);
    try { await fs.mkdir(dir, { recursive: true }); } catch { /* */ }
    await fs.writeFile(this.storePath, JSON.stringify({
      memories: this.memories,
      savedAt: Date.now(),
      version: 1,
    }, null, 2));
  }

  /**
   * Rebuild the TF-IDF vocabulary from all stored memories
   */
  private rebuildVocab(): void {
    if (!this.vocabDirty) return;
    const texts = this.memories.map(m => m.text + ' ' + m.category);
    this.vocab = buildVocabulary(texts);
    this.embeddingDim = Math.max(this.vocab.size, 50);
    this.vocabDirty = false;
  }

  /**
   * Generate a TF-IDF embedding for text using the current vocabulary
   */
  private embedTFIDF(text: string): number[] {
    this.rebuildVocab();
    return computeTFIDF(text, this.vocab);
  }

  /**
   * Store a new memory with embedding
   */
  async store(params: {
    text: string;
    category?: string;
    importance?: number;
    sourceConversationId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<VectorMemory> {
    const id = `vm-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const now = Date.now();

    // Generate embedding
    let embedding: number[];
    let embeddingType: 'tfidf' | 'gemini' = 'tfidf';

    // Try Gemini embedding if key is available
    if (this.geminiApiKey) {
      try {
        embedding = await this.embedWithGemini(params.text);
        embeddingType = 'gemini';
      } catch {
        // Fall back to TF-IDF
        this.vocabDirty = true;
        embedding = this.embedTFIDF(params.text);
      }
    } else {
      this.vocabDirty = true;
      embedding = this.embedTFIDF(params.text);
    }

    const memory: VectorMemory = {
      id,
      text: params.text,
      category: params.category || 'general',
      importance: params.importance ?? 5,
      embedding,
      embeddingType,
      createdAt: now,
      updatedAt: now,
      sourceConversationId: params.sourceConversationId,
      metadata: params.metadata,
    };

    this.memories.unshift(memory);
    await this.save();

    console.log(`[VectorMemory] Stored memory ${id} (${embeddingType}, dim=${embedding.length})`);
    return memory;
  }

  /**
   * Semantic search — find the most relevant memories for a query
   */
  async search(query: string, topK: number = 10, minScore: number = 0.1): Promise<SearchResult[]> {
    if (this.memories.length === 0) return [];

    let queryEmbedding: number[];

    // Use the same embedding method as the stored memories
    const hasGemini = this.memories.some(m => m.embeddingType === 'gemini');
    if (hasGemini && this.geminiApiKey) {
      try {
        queryEmbedding = await this.embedWithGemini(query);
      } catch {
        this.vocabDirty = true;
        queryEmbedding = this.embedTFIDF(query);
      }
    } else {
      this.vocabDirty = true;
      queryEmbedding = this.embedTFIDF(query);
    }

    // Score all memories
    const results: SearchResult[] = [];
    for (const memory of this.memories) {
      // Ensure embedding dimensions match
      let score: number;
      if (memory.embedding.length === queryEmbedding.length) {
        score = cosineSimilarity(queryEmbedding, memory.embedding);
      } else {
        // Dimensions don't match (vocab changed) — recompute
        this.vocabDirty = true;
        const newQuery = this.embedTFIDF(query);
        const newMemEmb = this.embedTFIDF(memory.text);
        score = cosineSimilarity(newQuery, newMemEmb);
        // Update the stored embedding
        memory.embedding = newMemEmb;
        memory.embeddingType = 'tfidf';
      }

      // Boost score by importance
      const importanceBoost = (memory.importance / 10) * 0.1;
      score = Math.min(1, score + importanceBoost);

      // Recency boost (memories from last 24h get a slight boost)
      const age = Date.now() - memory.createdAt;
      const recencyBoost = age < 86400000 ? 0.05 : age < 604800000 ? 0.02 : 0;
      score = Math.min(1, score + recencyBoost);

      if (score >= minScore) {
        results.push({ memory, score });
      }
    }

    // Sort by score descending
    results.sort((a, b) => b.score - a.score);

    return results.slice(0, topK);
  }

  /**
   * Search with text matching fallback (for when embeddings don't find enough)
   */
  async searchHybrid(query: string, topK: number = 10): Promise<SearchResult[]> {
    const semantic = await this.search(query, topK, 0.15);

    if (semantic.length >= topK) return semantic;

    // Supplement with keyword matching
    const queryLower = query.toLowerCase();
    const queryTokens = new Set(tokenize(query));

    const keywordResults: SearchResult[] = [];
    for (const memory of this.memories) {
      if (semantic.some(s => s.memory.id === memory.id)) continue;
      const textLower = memory.text.toLowerCase();
      const memTokens = new Set(tokenize(memory.text));

      // Check for exact substring or token overlap
      const hasSubstring = textLower.includes(queryLower);
      const overlap = [...queryTokens].filter(t => memTokens.has(t)).length;
      const overlapScore = queryTokens.size > 0 ? overlap / queryTokens.size : 0;

      const score = hasSubstring ? 0.6 : overlapScore * 0.4;
      if (score > 0.1) {
        keywordResults.push({ memory, score });
      }
    }

    keywordResults.sort((a, b) => b.score - a.score);
    const combined = [...semantic, ...keywordResults.slice(0, topK - semantic.length)];

    return combined.slice(0, topK);
  }

  /**
   * Get a memory by ID
   */
  getById(id: string): VectorMemory | undefined {
    return this.memories.find(m => m.id === id);
  }

  /**
   * Delete a memory by ID
   */
  async delete(id: string): Promise<boolean> {
    const idx = this.memories.findIndex(m => m.id === id);
    if (idx === -1) return false;
    this.memories.splice(idx, 1);
    this.vocabDirty = true;
    await this.save();
    return true;
  }

  /**
   * Clear all memories
   */
  async clear(): Promise<void> {
    this.memories = [];
    this.vocab = new Map();
    this.vocabDirty = true;
    await this.save();
  }

  /**
   * List all memories (without embeddings, for display)
   */
  listAll(): Omit<VectorMemory, 'embedding'>[] {
    return this.memories.map(m => ({
      id: m.id,
      text: m.text,
      category: m.category,
      importance: m.importance,
      embeddingType: m.embeddingType,
      createdAt: m.createdAt,
      updatedAt: m.updatedAt,
      sourceConversationId: m.sourceConversationId,
      metadata: m.metadata,
    }));
  }

  /**
   * Get store statistics
   */
  getStats(): VectorStoreStats {
    const types = new Set(this.memories.map(m => m.embeddingType));
    return {
      totalMemories: this.memories.length,
      embeddingType: types.size > 1 ? 'mixed' : (types.has('gemini') ? 'gemini' : 'tfidf'),
      vocabularySize: this.vocab.size,
      lastUpdated: this.memories.length > 0 ? this.memories[0].updatedAt : 0,
    };
  }

  /**
   * Build context string from search results for injection into LLM prompts
   */
  buildContext(results: SearchResult[]): string {
    if (results.length === 0) return '';

    const lines = results.map(r => {
      const category = r.memory.category.toLowerCase();
      const label = category === 'task' ? 'Task'
        : category === 'preference' ? 'Preference'
        : category === 'project' ? 'Project'
        : category === 'fact' ? 'Fact'
        : category === 'identity' ? 'Identity'
        : category === 'schedule' ? 'Schedule'
        : category === 'note' ? 'Note'
        : 'Information';
      return `[${label}] ${r.memory.text} (relevance: ${(r.score * 100).toFixed(0)}%)`;
    });

    return 'Relevant memories from past conversations:\n' + lines.join('\n');
  }

  /**
   * Gemini text-embedding API call
   */
  private async embedWithGemini(text: string): Promise<number[]> {
    if (!this.geminiApiKey) throw new Error('No Gemini API key');

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-exp-03-07:embedContent?key=${this.geminiApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'models/gemini-embedding-exp-03-07',
          content: { parts: [{ text }] },
          taskType: 'SEMANTIC_SIMILARITY',
        }),
      }
    );

    if (!res.ok) throw new Error(`Gemini embedding HTTP ${res.status}`);
    const data = await res.json();
    const values = data?.embedding?.values;
    if (!Array.isArray(values) || values.length === 0) throw new Error('No embedding values');
    return values;
  }

  /**
   * Update the Gemini API key (e.g., when user changes settings)
   */
  setGeminiApiKey(key: string | undefined): void {
    this.geminiApiKey = key;
  }
}

// ─── Singleton ───────────────────────────────────────────────────
let _store: VectorMemoryStore | null = null;

export function getVectorMemoryStore(dataDir: string, geminiApiKey?: string): VectorMemoryStore {
  if (!_store) {
    _store = new VectorMemoryStore(dataDir, geminiApiKey);
  }
  if (geminiApiKey !== undefined) {
    _store.setGeminiApiKey(geminiApiKey);
  }
  return _store;
}
