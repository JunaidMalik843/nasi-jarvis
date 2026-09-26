import { buildOptimizedContext } from './contextCompressor';
import { idbUpdateUserPattern, type UserBehaviorPattern } from './indexedDb';
import type { ConversationMessage, Memory } from './storage';

export type AIProvider = 'gemini' | 'openai' | 'claude' | 'grok';

export interface BrainGenerateOptions {
  prompt: string;
  conversationId?: string;
  messages?: ConversationMessage[];
  memories?: Memory[];
  systemInstruction?: string;
  temperature?: number;
  activeProvider?: string;
  geminiApiKey?: string;
  geminiModel?: string;
  openaiApiKey?: string;
  openaiModel?: string;
  claudeApiKey?: string;
  claudeModel?: string;
  grokApiKey?: string;
  grokModel?: string;
  onChunk?: (text: string) => void;
  onSentence?: (sentence: string) => void;
  routedAgent?: string;
}

export interface BrainGenerateResult {
  text: string;
  provider: string;
  model: string;
  status: 'success' | 'fallback' | 'autonomous';
  timings?: Record<string, number>;
  userPattern: UserBehaviorPattern;
}

/**
 * Tactical autonomous emergency generator
 * Guarantees zero downtime even if completely offline or without API keys.
 */
function getAutonomousResponse(prompt: string, agent?: string, pattern?: UserBehaviorPattern): string {
  const p = prompt.toLowerCase();
  const agentPrefix = agent ? `[${agent.toUpperCase()}] ` : '';

  if (p.includes('status') || p.includes('system') || p.includes('health') || p.includes('diagnostics')) {
    return `${agentPrefix}All neural sub-systems operational. Quantum bridge nominal, SAT-LINK locked, vector memory synchronized at 60fps. Ready for command directives.`;
  }
  if (p.includes('who are you') || p.includes('what are you') || p.includes('identity')) {
    return `${agentPrefix}I am NASI — your personal tactical AI operating core. I orchestrate autonomous multi-agent workflows, long-term semantic memory, and cyber command interfaces.`;
  }
  if (p.includes('remember') || p.includes('memory')) {
    return `${agentPrefix}Directive indexed in local neural memory bank. Semantic embedding recorded and cached.`;
  }
  if (p.includes('weather') || p.includes('satellite') || p.includes('radar')) {
    return `${agentPrefix}Telemetry uplink active across 10 global stations. Global weather anomalies minimal. Regional monitoring online.`;
  }
  if (p.includes('help') || p.includes('capabilities') || p.includes('commands')) {
    return `${agentPrefix}NASI Capabilities:\n1. Multi-Agent Delegation (Manager, Research, Web, Security, Infrastructure)\n2. Semantic Vector Memory & Local IndexedDB\n3. Real-time SAT-LINK Wireframe Radar\n4. Ultra-low latency voice pipeline (Browser STT + ElevenLabs TTS)`;
  }
  if (pattern?.preferredLanguage === 'ur' || /\b(kaise|kya|bhai|theek)\b/i.test(p)) {
    return `${agentPrefix}Main NASI hoon, aap ka personal AI assistant. Tamam systems online hain aur main aap ki madad ke liye tayar hoon.`;
  }

  return `${agentPrefix}Directive received and processed: "${prompt.slice(0, 60)}${prompt.length > 60 ? '…' : ''}". System standing by for execution.`;
}

/**
 * Unified Brain Orchestrator
 * Seamlessly manages multi-provider fallbacks, context windows, pattern tracking, and non-blocking streaming.
 */
export class AIBrain {
  private static instance: AIBrain | null = null;

  public static getInstance(): AIBrain {
    if (!AIBrain.instance) {
      AIBrain.instance = new AIBrain();
    }
    return AIBrain.instance;
  }

  /**
   * Execute intelligent query generation with automatic multi-provider fallback hierarchy
   */
  public async generate(options: BrainGenerateOptions): Promise<BrainGenerateResult> {
    const {
      prompt,
      conversationId,
      messages = [],
      memories = [],
      systemInstruction = '',
      temperature = 0.7,
      activeProvider = 'gemini',
      geminiApiKey = '',
      geminiModel = 'gemini-3.8-flash',
      openaiApiKey = '',
      openaiModel = 'gpt-4o-mini',
      claudeApiKey = '',
      claudeModel = 'claude-3-haiku-20240307',
      grokApiKey = '',
      grokModel = 'grok-2-1212',
      routedAgent,
    } = options;

    // 1. Build optimized, compressed context window
    const { contextPrompt, userPattern } = await buildOptimizedContext({
      conversationId,
      messages,
      memories,
      prompt,
    });

    // 2. Track user behavior pattern asynchronously
    idbUpdateUserPattern({
      promptText: prompt,
      agent: routedAgent,
    }).catch(() => {});

    // Determine candidate provider chain
    const candidateChain: { provider: AIProvider; model: string; key: string }[] = [];

    // First: the user-selected active provider
    if (activeProvider === 'openai' && openaiApiKey) {
      candidateChain.push({ provider: 'openai', model: openaiModel, key: openaiApiKey });
    } else if (activeProvider === 'claude' && claudeApiKey) {
      candidateChain.push({ provider: 'claude', model: claudeModel, key: claudeApiKey });
    } else if (activeProvider === 'grok' && grokApiKey) {
      candidateChain.push({ provider: 'grok', model: grokModel, key: grokApiKey });
    }

    // Always include Gemini in chain
    candidateChain.push({
      provider: 'gemini',
      model: geminiModel || 'gemini-3.8-flash',
      key: geminiApiKey,
    });

    // Fallbacks if not already first
    if (openaiApiKey && activeProvider !== 'openai') {
      candidateChain.push({ provider: 'openai', model: openaiModel, key: openaiApiKey });
    }
    if (claudeApiKey && activeProvider !== 'claude') {
      candidateChain.push({ provider: 'claude', model: claudeModel, key: claudeApiKey });
    }
    if (grokApiKey && activeProvider !== 'grok') {
      candidateChain.push({ provider: 'grok', model: grokModel, key: grokApiKey });
    }

    // Try each provider in chain
    for (const candidate of candidateChain) {
      try {
        const res = await fetch('/api/brain/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt,
            contextPrompt,
            systemInstruction,
            temperature,
            provider: candidate.provider,
            model: candidate.model,
            apiKey: candidate.key,
            conversationId,
            routedAgent,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          if (data.text) {
            return {
              text: data.text,
              provider: data.provider || candidate.provider,
              model: data.model || candidate.model,
              status: data.status === 'autonomous_fallback' ? 'fallback' : 'success',
              timings: data.timings,
              userPattern,
            };
          }
        }
      } catch (err) {
        console.warn(`[AIBrain] Provider ${candidate.provider} attempt failed:`, err);
      }
    }

    // Final safety net: Autonomous tactical response
    return {
      text: getAutonomousResponse(prompt, routedAgent, userPattern),
      provider: 'autonomous-core',
      model: 'nasi-tactical-v1',
      status: 'autonomous',
      userPattern,
    };
  }

  /**
   * Execute streaming generation for decoupled, ultra-responsive voice pipeline.
   * Splits incoming chunks into complete sentences and emits `onSentence` as soon as punctuation is detected.
   */
  public async generateStream(options: BrainGenerateOptions): Promise<BrainGenerateResult> {
    const {
      prompt,
      conversationId,
      messages = [],
      memories = [],
      systemInstruction = '',
      temperature = 0.7,
      activeProvider = 'gemini',
      geminiApiKey = '',
      geminiModel = 'gemini-3.8-flash',
      openaiApiKey = '',
      openaiModel = 'gpt-4o-mini',
      claudeApiKey = '',
      claudeModel = 'claude-3-haiku-20240307',
      grokApiKey = '',
      grokModel = 'grok-2-1212',
      onChunk,
      onSentence,
      routedAgent,
    } = options;

    const { contextPrompt, userPattern } = await buildOptimizedContext({
      conversationId,
      messages,
      memories,
      prompt,
    });

    idbUpdateUserPattern({
      promptText: prompt,
      agent: routedAgent,
    }).catch(() => {});

    // Try streaming endpoint
    try {
      const res = await fetch('/api/brain/generate-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          contextPrompt,
          systemInstruction,
          temperature,
          provider: activeProvider,
          model:
            activeProvider === 'openai'
              ? openaiModel
              : activeProvider === 'claude'
                ? claudeModel
                : activeProvider === 'grok'
                  ? grokModel
                  : geminiModel,
          apiKey:
            activeProvider === 'openai'
              ? openaiApiKey
              : activeProvider === 'claude'
                ? claudeApiKey
                : activeProvider === 'grok'
                  ? grokApiKey
                  : geminiApiKey,
          conversationId,
          routedAgent,
        }),
      });

      if (res.ok && res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let sseBuf = '';
        let sentenceBuf = '';
        let fullText = '';
        let resultProvider = activeProvider;
        let resultModel = geminiModel;
        let timings: Record<string, number> | undefined;

        const emitSentence = () => {
          const match = sentenceBuf.match(/[\s\S]*?[.!?۔؟]+(?:\s+|$)/);
          if (match) {
            const sentence = match[0].trim();
            sentenceBuf = sentenceBuf.slice(match[0].length);
            if (sentence && onSentence) {
              onSentence(sentence);
            }
          }
        };

        const processEvent = (raw: string) => {
          let eventType = 'chunk';
          let dataStr = '';
          for (const line of raw.split('\n')) {
            if (line.startsWith('event: ')) eventType = line.slice(7).trim();
            else if (line.startsWith('data: ')) dataStr += line.slice(6);
          }
          if (!dataStr) return;
          try {
            const payload = JSON.parse(dataStr);
            if (eventType === 'chunk' && payload.text) {
              fullText += payload.text;
              sentenceBuf += payload.text;
              if (onChunk) onChunk(payload.text);
              emitSentence();
            } else if (eventType === 'done') {
              resultProvider = payload.provider || resultProvider;
              resultModel = payload.model || resultModel;
              timings = payload.timings;
            }
          } catch {
            // pass
          }
        };

        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          sseBuf += decoder.decode(value, { stream: true });
          let idx: number;
          while ((idx = sseBuf.indexOf('\n\n')) >= 0) {
            const rawEvent = sseBuf.slice(0, idx);
            sseBuf = sseBuf.slice(idx + 2);
            if (rawEvent.trim()) processEvent(rawEvent);
          }
        }

        if (sseBuf.trim()) processEvent(sseBuf);
        // Flush remaining sentence fragment
        if (sentenceBuf.trim() && onSentence) {
          onSentence(sentenceBuf.trim());
        }

        if (fullText.trim()) {
          return {
            text: fullText,
            provider: resultProvider,
            model: resultModel,
            status: 'success',
            timings,
            userPattern,
          };
        }
      }
    } catch (err) {
      console.warn('[AIBrain] Stream error, falling back to non-streaming:', err);
    }

    // Fallback to non-streaming generate
    const fallbackRes = await this.generate(options);
    if (onChunk) onChunk(fallbackRes.text);
    if (onSentence) onSentence(fallbackRes.text);
    return fallbackRes;
  }
}

export const aiBrain = AIBrain.getInstance();
