import express from 'express';
import path from 'path';
import fs from 'fs/promises';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import 'dotenv/config';
import {
  loadConversations,
  saveConversations,
  loadConversation,
  createConversation as dbCreateConversation,
  updateConversation as dbUpdateConversation,
  deleteConversation as dbDeleteConversation,
  loadMemories,
  saveMemories,
  createMemory as dbCreateMemory,
  updateMemory as dbUpdateMemory,
  deleteMemory as dbDeleteMemory,
  clearMemories as dbClearMemories,
  generateId,
  Conversation,
  ConversationMessage,
  Memory,
  buildMemoryContext,
  extractTitleFromMessages,
} from './src/lib/storage';
import { getVectorMemoryStore } from './src/lib/vectorMemory';
import type { VectorMemoryStore } from './src/lib/vectorMemory';

// Works in tsx (ESM) dev and in esbuild CJS production output
const __dirname = path.resolve();
const DATA_DIR = path.join(__dirname, 'data');

async function startServer() {
  const app = express();
  const PORT = parseInt(process.env.PORT || '3000', 10);

  app.use(express.json({ limit: '25mb' }));

  // Lazy Gemini Client
  let aiClient: GoogleGenAI | null = null;
  function getAI() {
    if (!aiClient && process.env.GEMINI_API_KEY) {
      aiClient = new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });
    }
    return aiClient;
  }

  // ── Vector Memory Store ──
  const vectorMem: VectorMemoryStore = getVectorMemoryStore(DATA_DIR, process.env.GEMINI_API_KEY);
  await vectorMem.init();

  // ── Personality Config ──
  async function loadPersonalityConfig(): Promise<any> {
    try {
      const raw = await fs.readFile(path.join(__dirname, 'src', 'nasi-personality.json'), 'utf-8');
      return JSON.parse(raw);
    } catch {
      return { name: 'NASI', activeProfile: 'warm', profiles: {}, rules: {} };
    }
  }

  async function getActiveSystemPrompt(): Promise<string> {
    const config = await loadPersonalityConfig();
    const profile = config.profiles?.[config.activeProfile];
    return profile?.systemPrompt || 'You are NASI, a helpful AI assistant. Be concise, friendly, and support English and Urdu.';
  }

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      hasApiKey: !!process.env.GEMINI_API_KEY,
      hasElevenLabsKey: !!process.env.ELEVENLABS_API_KEY,
      uptime: process.uptime(),
    });
  });

  // Conversational brevity — injected into every LLM call so replies match the
  // user's message length (short question → short natural reply).
  const BREVITY_SUFFIX = '\n\nRESPONSE LENGTH RULES (critical):\n- Voice conversation replies must be SHORT and natural — 1 to 3 sentences for simple questions or small talk.\n- Match the length of the user\'s message: a greeting gets a warm one-liner, a simple factual question gets 1-2 sentences.\n- Only give longer, structured answers when the user explicitly asks for detail, explanations, or lists.\n- Never pad replies with filler, disclaimers, or "Is there anything else..." unless it fits naturally.\n- This is a spoken conversation — write replies that sound natural when spoken aloud.';

  function withBrevity(systemInstruction?: string): string {
    const base = systemInstruction || '';
    return base ? `${base}${BREVITY_SUFFIX}` : `You are NASI.${BREVITY_SUFFIX}`;
  }

  // Server-side latency instrumentation helper
  let pipelineTimings: Record<string, number> = {};
  function markTiming(stage: string, since: number): number {
    const ms = Date.now() - since;
    pipelineTimings[stage] = ms;
    console.log(`[LATENCY] ${stage}: ${ms}ms`);
    return ms;
  }

  // Tactical autonomous fallback generator for seamless offline / rate-limited operation
  function getTacticalResponse(prompt: string): string {
    const isUrdu = /[\u0600-\u06FF]/.test(prompt || '');
    const p = (prompt || '').toLowerCase();

    if (isUrdu) {
      if (p.includes('راڈار') || p.includes('سیٹلائٹ') || p.includes('دنیا') || p.includes('زمین')) {
        return 'حکم کریں، کمانڈر۔ پلانیٹری سیٹ-لنک راڈار لائیو سرگرم ہے۔ ہم اس وقت تمام عالمی ہاٹ سپاٹس اور سیٹلائٹ ٹیلی میٹری کی مکمل نگرانی کر رہے ہیں۔';
      }
      if (p.includes('ایجنٹ') || p.includes('ٹاؤن') || p.includes('ایلس') || p.includes('باب')) {
        return 'ایجینٹ ٹاؤن میں ایلس، باب، کیرول، ڈیو اور دونوں روبوٹس (سپارکی اور یونٹ-7) مکمل طور پر متحرک ہیں اور اپنے فرائض پر مامور ہیں۔';
      }
      if (p.includes('میموری') || p.includes('یاد') || p.includes('پرانی')) {
        return 'کمانڈر، آپ کا طویل مدتی میموری والٹ 30 دن کا مکمل ریکارڈ محفوظ رکھے ہوئے ہے۔ میں آپ کی تمام ترجیحات اور تاریخی پروجیکٹس کو بخوبی یاد رکھتا ہوں۔';
      }
      return 'جی کمانڈر، ناسائی (NASI) کا نیورل کور آن لائن ہے اور تمام ملٹی ایجنٹ ماڈیولز آپ کے احکامات کے منتظر ہیں۔ بتائیے کیا خدمت انجام دوں؟';
    }

    if (p.includes('sat') || p.includes('radar') || p.includes('globe') || p.includes('world') || p.includes('event')) {
      return 'Planetary Sat-Link Radar is actively tracking global hotspots: Persian Gulf maritime transit, Eastern Europe surveillance corridor, Asia-Pacific semiconductor supply lines, and commercial aerospace launches in real time.';
    }
    if (p.includes('agent') || p.includes('town') || p.includes('robot') || p.includes('bob') || p.includes('alice')) {
      return 'Agent Town office is active. Alice is compiling planetary intelligence, Bob is building code modules, Carol is synchronizing memory vectors, Dave is tuning system telemetry, and maintenance droids Sparky and Unit-7 are in motion across the office floors.';
    }
    if (p.includes('memory') || p.includes('remember') || p.includes('carol') || p.includes('month') || p.includes('past')) {
      return 'Long-Term Brain Memory is locked in cache. I retain your operator identity (Commander), your preference for a high-end Stonic cybernetic cockpit, and past project directives spanning over a month ago.';
    }
    if (p.includes('voice') || p.includes('human') || p.includes('speak') || p.includes('audio')) {
      return 'Voice engine is active with human-like speech synthesis and real-time barge-in capability. You can speak naturally in English or Urdu at any time.';
    }

    return `NASI Core online, Commander. All multi-agent modules in Agent Town and planetary radar telemetry are synchronized for your directive: "${prompt}".`;
  }

  // Server-side STT proxy using Gemini multimodal audio
  app.post('/api/voice/stt', async (req, res) => {
    try {
      const { audioBase64, mimeType } = req.body || {};
      if (!audioBase64) {
        return res.status(400).json({ error: 'No audio data provided' });
      }

      const ai = getAI();
      if (!ai) {
        return res.json({
          text: '',
          provider: 'fallback',
          status: 'no_api_key',
        });
      }

      const candidateModels = ['gemini-3.5-transcribe', 'gemini-3.8-flash', 'gemini-flash-latest'];
      for (const candidate of candidateModels) {
        try {
          const response = await ai.models.generateContent({
            model: candidate,
            contents: [
              {
                inlineData: {
                  mimeType: mimeType || 'audio/webm',
                  data: audioBase64,
                },
              },
              {
                text: 'Transcribe this spoken audio verbatim. The speaker may be speaking in English, Urdu, or mixed English and Urdu. Return ONLY the transcribed text without any timestamps, speaker labels, or conversational responses.',
              },
            ],
          });
          const transcript = (response.text || '').trim();
          return res.json({
            text: transcript,
            provider: 'gemini',
            model: candidate,
            status: 'success',
          });
        } catch (err: any) {
          console.warn(`[STT] Model ${candidate} notice:`, err?.message || err);
          continue;
        }
      }

      return res.json({ text: '', provider: 'fallback', status: 'stt_failed' });
    } catch (err: any) {
      console.warn('[STT] Exception:', err?.message || err);
      return res.json({ text: '', provider: 'fallback', error: 'processing_error' });
    }
  });

  // ============================================================================
  // CONVERSATION APIs
  // ============================================================================

  app.get('/api/conversations', async (req, res) => {
    try {
      const conversations = await loadConversations();
      res.json({ conversations, count: conversations.length });
    } catch (err: any) {
      console.warn('[Conversations] List error:', err?.message);
      res.status(500).json({ error: 'Failed to load conversations' });
    }
  });

  app.get('/api/conversations/:id', async (req, res) => {
    try {
      const conversation = await loadConversation(req.params.id);
      if (!conversation) {
        return res.status(404).json({ error: 'Conversation not found' });
      }
      res.json({ conversation });
    } catch (err: any) {
      console.warn('[Conversations] Load error:', err?.message);
      res.status(500).json({ error: 'Failed to load conversation' });
    }
  });

  app.post('/api/conversations', async (req, res) => {
    try {
      const { initialMessage, title } = req.body || {};
      if (!initialMessage) {
        return res.status(400).json({ error: 'Initial message required' });
      }
      const id = generateId();
      const now = Date.now();
      const conversation: Conversation = {
        id,
        title: title || extractTitleFromMessages([
          { id: 'm1', role: 'user' as const, text: initialMessage, timestamp: now },
        ]),
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
      await dbCreateConversation(conversation);
      res.status(201).json({ conversation, created: true });
    } catch (err: any) {
      console.warn('[Conversations] Create error:', err?.message);
      res.status(500).json({ error: 'Failed to create conversation' });
    }
  });

  app.post('/api/conversations/:id/messages', async (req, res) => {
    try {
      const { role, text, source } = req.body || {};
      if (!req.params.id || !role || !text) {
        return res.status(400).json({ error: 'Conversation ID, role, and text required' });
      }
      const conversation = await loadConversation(req.params.id);
      if (!conversation) {
        return res.status(404).json({ error: 'Conversation not found' });
      }
      const now = Date.now();
      const message: ConversationMessage = {
        id: generateId(),
        role: role as 'user' | 'assistant',
        text,
        timestamp: now,
        source: source as 'voice' | 'text' | 'system' | undefined,
      };
      conversation.messages.push(message);
      conversation.updatedAt = now;
      if (role === 'user' && conversation.messages.filter((m) => m.role === 'user').length === 1) {
        conversation.title = extractTitleFromMessages(conversation.messages);
      }
      await dbUpdateConversation(conversation);
      res.json({ conversation, messageAdded: true });
    } catch (err: any) {
      console.warn('[Conversations] Add message error:', err?.message);
      res.status(500).json({ error: 'Failed to add message' });
    }
  });

  app.put('/api/conversations/:id', async (req, res) => {
    try {
      const conversation = await loadConversation(req.params.id);
      if (!conversation) {
        return res.status(404).json({ error: 'Conversation not found' });
      }
      const updates = req.body || {};
      if (updates.title !== undefined) conversation.title = updates.title;
      if (updates.messages !== undefined) conversation.messages = updates.messages;
      conversation.updatedAt = Date.now();
      await dbUpdateConversation(conversation);
      res.json({ conversation });
    } catch (err: any) {
      console.warn('[Conversations] Update error:', err?.message);
      res.status(500).json({ error: 'Failed to update conversation' });
    }
  });

  app.delete('/api/conversations/:id', async (req, res) => {
    try {
      await dbDeleteConversation(req.params.id);
      res.json({ deleted: true });
    } catch (err: any) {
      console.warn('[Conversations] Delete error:', err?.message);
      res.status(500).json({ error: 'Failed to delete conversation' });
    }
  });

  // ============================================================================
  // MEMORY APIs
  // ============================================================================

  app.get('/api/memories', async (req, res) => {
    try {
      const memories = await loadMemories();
      res.json({ memories, count: memories.length });
    } catch (err: any) {
      console.warn('[Memory] List error:', err?.message);
      res.status(500).json({ error: 'Failed to load memories' });
    }
  });

  app.post('/api/memories', async (req, res) => {
    try {
      const { category, key, value, importance, sourceConversationId } = req.body || {};
      if (!category || !key || !value) {
        return res.status(400).json({ error: 'Category, key, and value required' });
      }
      if (importance !== undefined && (importance < 1 || importance > 10)) {
        return res.status(400).json({ error: 'Importance must be between 1 and 10' });
      }
      const id = generateId();
      const now = Date.now();
      const memory: Memory = {
        id,
        category: category as string,
        key: key.trim(),
        value: value.trim(),
        importance: (importance ?? 5) as number,
        createdAt: now,
        updatedAt: now,
        sourceConversationId: sourceConversationId as string | undefined,
      };
      await dbCreateMemory(memory);
      res.status(201).json({ memory, created: true });
    } catch (err: any) {
      console.warn('[Memory] Create error:', err?.message);
      res.status(500).json({ error: 'Failed to create memory' });
    }
  });

  app.put('/api/memories/:id', async (req, res) => {
    try {
      const memories = await loadMemories();
      const index = memories.findIndex((m) => m.id === req.params.id);
      if (index < 0) {
        return res.status(404).json({ error: 'Memory not found' });
      }
      const updates = req.body || {};
      memories[index] = { ...memories[index], ...updates, updatedAt: Date.now() };
      await saveMemories(memories);
      res.json({ memory: memories[index] });
    } catch (err: any) {
      console.warn('[Memory] Update error:', err?.message);
      res.status(500).json({ error: 'Failed to update memory' });
    }
  });

  app.delete('/api/memories/:id', async (req, res) => {
    try {
      await dbDeleteMemory(req.params.id);
      res.json({ deleted: true });
    } catch (err: any) {
      console.warn('[Memory] Delete error:', err?.message);
      res.status(500).json({ error: 'Failed to delete memory' });
    }
  });

  app.post('/api/memories/clear', async (req, res) => {
    try {
      await dbClearMemories();
      res.json({ cleared: true });
    } catch (err: any) {
      console.warn('[Memory] Clear error:', err?.message);
      res.status(500).json({ error: 'Failed to clear memories' });
    }
  });

  // ============================================================================
  // VECTOR MEMORY — Semantic search + CRUD
  // ============================================================================

  // Store a new memory in the vector store
  app.post('/api/vector-memory', async (req, res) => {
    try {
      const { text, category, importance, sourceConversationId } = req.body || {};
      if (!text || !text.trim()) {
        return res.status(400).json({ error: 'Text required' });
      }
      const memory = await vectorMem.store({
        text: text.trim(),
        category: category || 'general',
        importance: importance ?? 5,
        sourceConversationId,
      });
      // Also store in legacy JSON memory for backward compatibility
      const legacyMemory: Memory = {
        id: memory.id,
        category: memory.category,
        key: text.trim().slice(0, 80),
        value: text.trim(),
        importance: memory.importance,
        createdAt: memory.createdAt,
        updatedAt: memory.updatedAt,
        sourceConversationId: memory.sourceConversationId,
      };
      await dbCreateMemory(legacyMemory);
      res.status(201).json({ memory, created: true });
    } catch (err: any) {
      console.warn('[VectorMemory] Store error:', err?.message);
      res.status(500).json({ error: 'Failed to store memory' });
    }
  });

  // Semantic search across vector memories
  app.get('/api/vector-memory/search', async (req, res) => {
    try {
      const query = (req.query.q as string) || '';
      const topK = parseInt((req.query.topK as string) || '10', 10);
      if (!query.trim()) {
        return res.status(400).json({ error: 'Query required (?q=...)' });
      }
      const results = await vectorMem.searchHybrid(query, topK);
      res.json({ results, count: results.length });
    } catch (err: any) {
      console.warn('[VectorMemory] Search error:', err?.message);
      res.status(500).json({ error: 'Search failed' });
    }
  });

  // Get vector memory stats
  app.get('/api/vector-memory/stats', async (req, res) => {
    try {
      const stats = vectorMem.getStats();
      res.json(stats);
    } catch (err: any) {
      res.status(500).json({ error: 'Stats unavailable' });
    }
  });

  // List all vector memories (without embedding vectors)
  app.get('/api/vector-memory', async (req, res) => {
    try {
      const memories = vectorMem.listAll();
      res.json({ memories, count: memories.length });
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to list memories' });
    }
  });

  // Delete a vector memory
  app.delete('/api/vector-memory/:id', async (req, res) => {
    try {
      const deleted = await vectorMem.delete(req.params.id);
      if (!deleted) return res.status(404).json({ error: 'Not found' });
      // Also delete from legacy store
      await dbDeleteMemory(req.params.id);
      res.json({ deleted: true });
    } catch (err: any) {
      res.status(500).json({ error: 'Delete failed' });
    }
  });

  // Clear all vector memories
  app.post('/api/vector-memory/clear', async (req, res) => {
    try {
      await vectorMem.clear();
      await dbClearMemories();
      res.json({ cleared: true });
    } catch (err: any) {
      res.status(500).json({ error: 'Clear failed' });
    }
  });

  // ============================================================================
  // PERSONALITY — Load/save NASI personality config
  // ============================================================================

  app.get('/api/personality', async (req, res) => {
    try {
      const config = await loadPersonalityConfig();
      res.json(config);
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to load personality' });
    }
  });

  app.put('/api/personality', async (req, res) => {
    try {
      const updates = req.body || {};
      const configPath = path.join(__dirname, 'src', 'nasi-personality.json');
      const existing = await loadPersonalityConfig();
      const merged = { ...existing, ...updates };
      await fs.writeFile(configPath, JSON.stringify(merged, null, 2));
      res.json({ config: merged, saved: true });
    } catch (err: any) {
      console.warn('[Personality] Save error:', err?.message);
      res.status(500).json({ error: 'Failed to save personality' });
    }
  });

  app.put('/api/personality/active-profile', async (req, res) => {
    try {
      const { profile } = req.body || {};
      if (!profile) return res.status(400).json({ error: 'Profile name required' });
      const configPath = path.join(__dirname, 'src', 'nasi-personality.json');
      const config = await loadPersonalityConfig();
      if (!config.profiles?.[profile]) {
        return res.status(400).json({ error: `Profile '${profile}' not found` });
      }
      config.activeProfile = profile;
      await fs.writeFile(configPath, JSON.stringify(config, null, 2));
      res.json({ activeProfile: profile, saved: true });
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to update profile' });
    }
  });

  app.get('/api/personality/active-prompt', async (req, res) => {
    try {
      const prompt = await getActiveSystemPrompt();
      const config = await loadPersonalityConfig();
      const profile = config.profiles?.[config.activeProfile];
      res.json({
        systemPrompt: prompt,
        activeProfile: config.activeProfile,
        traits: profile?.traits || [],
        greeting: profile?.greeting || '',
      });
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to get prompt' });
    }
  });

  // ============================================================================
  // SETTINGS APIs
  // ============================================================================
  const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

  app.get('/api/settings', async (req, res) => {
    try {
      const raw = await fs.readFile(SETTINGS_FILE, 'utf-8');
      res.json({ settings: JSON.parse(raw) });
    } catch {
      res.json({ settings: null });
    }
  });

  app.put('/api/settings', async (req, res) => {
    try {
      const { settings } = req.body || {};
      if (settings && typeof settings === 'object') {
        await fs.writeFile(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf-8');
        return res.json({ success: true, settings });
      }
      res.status(400).json({ error: 'Settings object required' });
    } catch (err: any) {
      console.warn('[Settings] Save error:', err?.message);
      res.status(500).json({ error: 'Failed to save settings' });
    }
  });

  // ============================================================================
  // ELEVENLABS PROXY — Server-side TTS to protect API key
  // ============================================================================

  app.post('/api/voice/tts', async (req, res) => {
    try {
      const { text, voiceId, model, stability, similarityBoost, style, apiKey: clientApiKey } = req.body || {};
      if (!text || !text.trim()) {
        return res.status(400).json({ error: 'Text required' });
      }
      const apiKey = process.env.ELEVENLABS_API_KEY || (clientApiKey && clientApiKey.trim());
      if (!apiKey) {
        return res.status(400).json({ error: 'No ElevenLabs API key configured', status: 'no_api_key' });
      }
      const ttsStart = Date.now();
      const vid = voiceId || '21m00Tcm4TlvDq8ikWAM';
      const modelId = model || 'eleven_flash_v2_5';
      const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${vid}/stream`, {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model_id: modelId,
          // ElevenLabs' TTS API expects the payload field to be `text`
          // (`input` is rejected with 422 "body.text: Field required").
          text: text.trim(),
          voice_settings: {
            stability: stability ?? 0.7,
            similarity_boost: similarityBoost ?? 0.8,
            style: style ?? 0.2,
          },
        }),
      });
      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        return res.status(response.status).json({ error: `ElevenLabs HTTP ${response.status}`, detail: errText });
      }
      markTiming('TTS server (ElevenLabs headers)', ttsStart);
      // Stream the audio response directly to the client
      res.setHeader('Content-Type', response.headers.get('Content-Type') || 'audio/mpeg');
      res.setHeader('Transfer-Encoding', 'chunked');
      if (response.body) {
        const reader = response.body.getReader();
        const pump = async (): Promise<void> => {
          const { done, value } = await reader.read();
          if (done) { res.end(); return; }
          res.write(value);
          return pump();
        };
        await pump();
      } else {
        res.end();
      }
    } catch (err: any) {
      console.warn('[ElevenLabs Proxy] Error:', err?.message);
      res.status(500).json({ error: 'TTS proxy failed' });
    }
  });

  // ============================================================================
  // MEMORY-AWARE GEMINI GENERATION
  // ============================================================================

  // ============================================================================
  // MEMORY-AWARE GEMINI GENERATION (non-streaming — kept for text mode)
  // ============================================================================

  app.post('/api/gemini/generate', async (req, res) => {
    const genStart = Date.now();
    pipelineTimings = {};
    const { prompt, systemInstruction, temperature, model, conversationId, apiKey: clientApiKey } = req.body || {};
    const modelName = model || 'gemini-3.8-flash';
    let ai = getAI();

    // Build memory context — use vector semantic search for relevant memories
    let memoryContext = '';
    let conversation = null;
    if (conversationId) {
      try {
        conversation = await loadConversation(conversationId);
        if (conversation) {
          // Add previous messages as context
          const recentMessages = conversation.messages.slice(-20);
          const historyText = recentMessages
            .filter((m) => m.role === 'user')
            .map((m) => m.text)
            .join('\n');
          if (historyText) {
            memoryContext += `Recent conversation context:\n${historyText}\n\n`;
          }
        }
      } catch {
        // Ignore load errors
      }
    }

    // Use vector memory for semantic search of relevant memories
    try {
      const memStart = Date.now();
      const searchResults = await vectorMem.searchHybrid(prompt, 10);
      const vectorContext = vectorMem.buildContext(searchResults);
      if (vectorContext) {
        memoryContext += vectorContext;
      }
      markTiming('Memory retrieval (server)', memStart);
    } catch {
      // Fallback to legacy flat memory search
      try {
        const memories = await loadMemories();
        const context = buildMemoryContext(memories);
        if (context) {
          memoryContext += context;
        }
      } catch {
        // Ignore memory load errors
      }
    }

    // If server env var is missing but client provided an API key, create a per-request client
    let clientProvidedAi: GoogleGenAI | null = null;
    if (!ai && clientApiKey && clientApiKey.trim()) {
      try {
        clientProvidedAi = new GoogleGenAI({
          apiKey: clientApiKey.trim(),
          httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
        });
        ai = clientProvidedAi;
      } catch (err: any) {
        console.warn('[Gemini] Failed to create client with provided key:', err?.message);
      }
    }

    if (!ai) {
      const tacticalPrompt = memoryContext ? `${memoryContext}\n\n${prompt}` : prompt;
      const personalityPrompt = await getActiveSystemPrompt();
      return res.json({
        text: getTacticalResponse(tacticalPrompt),
        provider: 'gemini',
        model: modelName,
        status: 'simulated',
        personality: personalityPrompt.slice(0, 50) + '...',
      });
    }

    const candidateModels = [modelName];
    if (modelName === 'gemini-3.8-flash') {
      candidateModels.push('gemini-flash-latest');
    }

    for (const candidate of candidateModels) {
      try {
        const fullPrompt = memoryContext ? `${memoryContext}\n\n${prompt}` : prompt;

        const llmStart = Date.now();
        const response = await ai.models.generateContent({
          model: candidate,
          contents: fullPrompt || '',
          config: {
            systemInstruction: withBrevity(systemInstruction || (await getActiveSystemPrompt())),
            temperature: typeof temperature === 'number' ? temperature : 0.7,
          },
        });

        if (response.text) {
          markTiming('LLM generation (server)', llmStart);
          markTiming('TOTAL server turn', genStart);
          return res.json({
            text: response.text,
            provider: 'gemini',
            model: candidate,
            status: 'success',
            timings: { ...pipelineTimings },
          });
        }
      } catch (err: any) {
        const status = err?.status || err?.code;
        const msg = String(err?.message || '');
        const isQuotaOrSpike =
          status === 429 ||
          status === 503 ||
          msg.includes('quota') ||
          msg.includes('429') ||
          msg.includes('503') ||
          msg.includes('high demand') ||
          msg.includes('RESOURCE_EXHAUSTED');

        if (isQuotaOrSpike) {
          console.warn(`[Gemini Proxy] Rate limit or high demand on ${candidate}. Trying backup channel.`);
          continue;
        } else {
          console.warn('[Gemini Proxy] Generation request notice:', msg);
          break;
        }
      }
    }

    // Autonomous tactical fallback response when API quota or high demand occurs
    return res.json({
      text: getTacticalResponse(prompt),
      provider: 'gemini',
      model: modelName,
      status: 'autonomous_fallback',
    });
  });

  // ============================================================================
  // STREAMING GEMINI GENERATION — SSE stream of text chunks for voice pipeline
  // Client starts TTS on the first sentence while the rest is still generating.
  // ============================================================================

  app.post('/api/gemini/generate-stream', async (req, res) => {
    const genStart = Date.now();
    pipelineTimings = {};
    const { prompt, systemInstruction, temperature, model, conversationId, apiKey: clientApiKey } = req.body || {};
    const modelName = model || 'gemini-3.8-flash';
    let ai = getAI();

    // SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    const sendEvent = (event: string, data: any) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    // Build memory context (same as non-streaming path)
    let memoryContext = '';
    let conversation = null;
    const memStartTotal = Date.now();
    if (conversationId) {
      try {
        conversation = await loadConversation(conversationId);
        if (conversation) {
          const recentMessages = conversation.messages.slice(-20);
          const historyText = recentMessages
            .filter((m) => m.role === 'user')
            .map((m) => m.text)
            .join('\n');
          if (historyText) {
            memoryContext += `Recent conversation context:\n${historyText}\n\n`;
          }
        }
      } catch {
        // Ignore load errors
      }
    }
    try {
      const searchResults = await vectorMem.searchHybrid(prompt, 10);
      const vectorContext = vectorMem.buildContext(searchResults);
      if (vectorContext) {
        memoryContext += vectorContext;
      }
    } catch {
      try {
        const memories = await loadMemories();
        const context = buildMemoryContext(memories);
        if (context) memoryContext += context;
      } catch { /* ignore */ }
    }
    markTiming('Memory retrieval (server)', memStartTotal);

    // Per-request client when server env key is missing but client supplied one
    let clientProvidedAi: GoogleGenAI | null = null;
    if (!ai && clientApiKey && clientApiKey.trim()) {
      try {
        clientProvidedAi = new GoogleGenAI({
          apiKey: clientApiKey.trim(),
          httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
        });
        ai = clientProvidedAi;
      } catch (err: any) {
        console.warn('[Gemini Stream] Failed to create client with provided key:', err?.message);
      }
    }

    if (!ai) {
      const tacticalPrompt = memoryContext ? `${memoryContext}\n\n${prompt}` : prompt;
      sendEvent('chunk', { text: getTacticalResponse(tacticalPrompt) });
      sendEvent('done', { status: 'simulated', model: modelName, timings: { ...pipelineTimings } });
      res.end();
      return;
    }

    const candidateModels = [modelName];
    if (modelName === 'gemini-3.8-flash') {
      candidateModels.push('gemini-flash-latest');
    }

    const fullPrompt = memoryContext ? `${memoryContext}\n\n${prompt}` : prompt;
    const systemInstr = withBrevity(systemInstruction || (await getActiveSystemPrompt()));

    for (const candidate of candidateModels) {
      try {
        const llmStart = Date.now();
        let firstChunkAt = 0;
        let anyChunk = false;

        const stream = await ai.models.generateContentStream({
          model: candidate,
          contents: fullPrompt || '',
          config: {
            systemInstruction: systemInstr,
            temperature: typeof temperature === 'number' ? temperature : 0.7,
          },
        });

        for await (const chunk of stream) {
          const t = chunk.text;
          if (!t) continue;
          if (!anyChunk) {
            anyChunk = true;
            firstChunkAt = Date.now();
            markTiming(`LLM first token (${candidate})`, llmStart);
          }
          sendEvent('chunk', { text: t });
        }

        if (!anyChunk) {
          throw new Error('Empty stream from model');
        }

        markTiming(`LLM full generation (${candidate})`, llmStart);
        markTiming('TOTAL server turn', genStart);
        sendEvent('done', {
          status: 'success',
          model: candidate,
          firstTokenMs: firstChunkAt - llmStart,
          totalMs: Date.now() - genStart,
          timings: { ...pipelineTimings },
        });
        res.end();
        return;
      } catch (err: any) {
        const status = err?.status || err?.code;
        const msg = String(err?.message || '');
        const isQuotaOrSpike =
          status === 429 || status === 503 ||
          msg.includes('quota') || msg.includes('429') || msg.includes('503') ||
          msg.includes('high demand') || msg.includes('RESOURCE_EXHAUSTED');

        if (isQuotaOrSpike && candidate !== candidateModels[candidateModels.length - 1]) {
          console.warn(`[Gemini Stream] Rate limit on ${candidate}. Trying backup channel.`);
          continue;
        }
        console.warn('[Gemini Stream] Generation notice:', msg);
        break;
      }
    }

    // Autonomous tactical fallback when the stream fails entirely
    sendEvent('chunk', { text: getTacticalResponse(prompt) });
    sendEvent('done', { status: 'autonomous_fallback', model: modelName, timings: { ...pipelineTimings } });
    res.end();
  });

  // ============================================================================
  // UNIFIED AI BRAIN ORCHESTRATION APIs (Multi-Provider Fallback Hierarchy)
  // Gemini -> OpenAI -> Claude -> Grok -> Autonomous Tactical Engine
  // ============================================================================

  app.post('/api/brain/generate', async (req, res) => {
    const {
      prompt,
      contextPrompt,
      systemInstruction,
      temperature = 0.7,
      provider = 'gemini',
      model,
      apiKey: clientApiKey,
      conversationId,
      routedAgent,
    } = req.body || {};

    const fullSystem = withBrevity(
      systemInstruction || (await getActiveSystemPrompt()) + (routedAgent ? `\nOperating as: ${routedAgent} Agent.` : ''),
    );
    const combinedContent = contextPrompt ? `${contextPrompt}\n\nUser: ${prompt}` : prompt;

    // 1. Try OpenAI if requested
    const openAiKey = clientApiKey || process.env.OPENAI_API_KEY;
    if (provider === 'openai' && openAiKey) {
      try {
        const oRes = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${openAiKey}`,
          },
          body: JSON.stringify({
            model: model || 'gpt-4o-mini',
            messages: [
              { role: 'system', content: fullSystem },
              { role: 'user', content: combinedContent },
            ],
            temperature,
          }),
        });
        if (oRes.ok) {
          const oData: any = await oRes.json();
          const reply = oData.choices?.[0]?.message?.content;
          if (reply) {
            return res.json({
              text: reply,
              provider: 'openai',
              model: model || 'gpt-4o-mini',
              status: 'success',
            });
          }
        }
      } catch (err: any) {
        console.warn('[Brain] OpenAI error, falling back:', err?.message);
      }
    }

    // 2. Try Claude if requested
    const claudeKey = clientApiKey || process.env.CLAUDE_API_KEY;
    if (provider === 'claude' && claudeKey) {
      try {
        const cRes = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': claudeKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: model || 'claude-3-haiku-20240307',
            max_tokens: 1024,
            system: fullSystem,
            messages: [{ role: 'user', content: combinedContent }],
            temperature,
          }),
        });
        if (cRes.ok) {
          const cData: any = await cRes.json();
          const reply = cData.content?.[0]?.text;
          if (reply) {
            return res.json({
              text: reply,
              provider: 'claude',
              model: model || 'claude-3-haiku-20240307',
              status: 'success',
            });
          }
        }
      } catch (err: any) {
        console.warn('[Brain] Claude error, falling back:', err?.message);
      }
    }

    // 3. Try Grok (xAI) if requested
    const grokKey = clientApiKey || process.env.GROK_API_KEY;
    if (provider === 'grok' && grokKey) {
      try {
        const gRes = await fetch('https://api.x.ai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${grokKey}`,
          },
          body: JSON.stringify({
            model: model || 'grok-2-1212',
            messages: [
              { role: 'system', content: fullSystem },
              { role: 'user', content: combinedContent },
            ],
            temperature,
          }),
        });
        if (gRes.ok) {
          const gData: any = await gRes.json();
          const reply = gData.choices?.[0]?.message?.content;
          if (reply) {
            return res.json({
              text: reply,
              provider: 'grok',
              model: model || 'grok-2-1212',
              status: 'success',
            });
          }
        }
      } catch (err: any) {
        console.warn('[Brain] Grok error, falling back:', err?.message);
      }
    }

    // 4. Primary/Fallback: Gemini
    let ai = getAI();
    if (!ai && clientApiKey && provider === 'gemini') {
      try {
        ai = new GoogleGenAI({
          apiKey: clientApiKey.trim(),
          httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
        });
      } catch (err: any) {
        console.warn('[Brain] Gemini client init error:', err?.message);
      }
    }

    if (ai) {
      const candidateModels = [model || 'gemini-3.8-flash', 'gemini-flash-latest'];
      for (const candidate of candidateModels) {
        try {
          const response = await ai.models.generateContent({
            model: candidate,
            contents: combinedContent,
            config: {
              systemInstruction: fullSystem,
              temperature,
            },
          });
          if (response.text) {
            return res.json({
              text: response.text,
              provider: 'gemini',
              model: candidate,
              status: 'success',
            });
          }
        } catch (err: any) {
          console.warn(`[Brain] Gemini candidate ${candidate} failed:`, err?.message);
        }
      }
    }

    // 5. Ultimate Autonomous Fallback
    return res.json({
      text: getTacticalResponse(prompt),
      provider: 'autonomous-core',
      model: 'tactical-v1',
      status: 'autonomous_fallback',
    });
  });

  app.post('/api/brain/generate-stream', async (req, res) => {
    const {
      prompt,
      contextPrompt,
      systemInstruction,
      temperature = 0.7,
      provider = 'gemini',
      model,
      apiKey: clientApiKey,
      routedAgent,
    } = req.body || {};

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    const sendEvent = (event: string, data: any) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    const fullSystem = withBrevity(
      systemInstruction || (await getActiveSystemPrompt()) + (routedAgent ? `\nOperating as: ${routedAgent} Agent.` : ''),
    );
    const combinedContent = contextPrompt ? `${contextPrompt}\n\nUser: ${prompt}` : prompt;

    // Use Gemini stream as primary/standard streaming engine
    let ai = getAI();
    if (!ai && clientApiKey && provider === 'gemini') {
      try {
        ai = new GoogleGenAI({
          apiKey: clientApiKey.trim(),
          httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
        });
      } catch {
        // pass
      }
    }

    if (ai) {
      const candidateModels = [model || 'gemini-3.8-flash', 'gemini-flash-latest'];
      for (const candidate of candidateModels) {
        try {
          const stream = await ai.models.generateContentStream({
            model: candidate,
            contents: combinedContent,
            config: {
              systemInstruction: fullSystem,
              temperature,
            },
          });

          let anyChunk = false;
          for await (const chunk of stream) {
            const t = chunk.text;
            if (t) {
              anyChunk = true;
              sendEvent('chunk', { text: t });
            }
          }

          if (anyChunk) {
            sendEvent('done', { status: 'success', provider: 'gemini', model: candidate });
            res.end();
            return;
          }
        } catch (err: any) {
          console.warn(`[Brain Stream] Candidate ${candidate} failed:`, err?.message);
        }
      }
    }

    // Fallback: non-streaming chunk delivery
    sendEvent('chunk', { text: getTacticalResponse(prompt) });
    sendEvent('done', { status: 'autonomous_fallback', provider: 'autonomous-core', model: 'tactical-v1' });
    res.end();
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`NASI Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
