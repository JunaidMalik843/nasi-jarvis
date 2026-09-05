import { StrictMode, useEffect, useMemo, useState, type CSSProperties, type ReactNode, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Activity,
  Bot,
  BrainCircuit,
  CircleHelp,
  Command,
  Cpu,
  Crosshair,
  Database,
  Globe2,
  LayoutGrid,
  Map,
  Maximize2,
  MessageSquare,
  Mic,
  MoreHorizontal,
  Paperclip,
  Plus,
  Radar,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  Terminal,
  Trash2,
  Volume2,
  X,
  Zap,
  Bookmark,
  RefreshCw,
  Minimize2,
  AlertTriangle,
} from 'lucide-react';
import './styles.css';
import './components/VoicePanel.css';
import './components/StorageComponents.css';
import './components/StonicStyles.css';
import { VoicePanel } from './components/VoicePanel';
import { ConversationManager } from './components/ConversationManager';
import { MemoryManager } from './components/MemoryManager';
import { useConversations, useMemories } from './hooks/useStorage';
import type { CoreState } from './hooks/useVoice';
import type { Conversation, ConversationMessage, Memory } from './lib/storage';
import { generateId } from './lib/storage';
import { TopBar } from './components/TopBar';
import { StonicBottomBar } from './components/StonicBottomBar';
import { SatLinkFeed } from './components/SatLinkFeed';
import { HeadlinesPanel } from './components/HeadlinesPanel';
import { SkillsPanel } from './components/SkillsPanel';
import { AISphere } from './components/AISphere';
import { AgentTown } from './components/AgentTown';
import { RightPanel } from './components/RightPanel';
import { ChatPanel } from './components/ChatPanel';

type Agent = {
  name: string;
  role: string;
  color: string;
  status: string;
  initials: string;
};

type Message = {
  from: 'user' | 'nasi';
  text: string;
  timestamp?: number;
};

const agents: Agent[] = [
  { name: 'Alice', role: 'Intelligence', color: '#30d6ee', status: 'Scanning', initials: 'A' },
  { name: 'Bob', role: 'Engineering', color: '#ff9c3c', status: 'Building', initials: 'B' },
  { name: 'Carol', role: 'Memory', color: '#45df9b', status: 'Indexing', initials: 'C' },
  { name: 'Dave', role: 'Telemetry', color: '#a9b5c4', status: 'Monitoring', initials: 'D' },
];

const headlines = [
  'SpaceX IPO raises $35.7B, valuation surpasses $2T.',
  'Apple CEO announces price hikes due to memory costs.',
  'Fox Corporation to acquire Roku for $2.8B.',
  'New satellite array expands Pacific coverage window.',
];

function App() {
  const [coreState, setCoreState] = useState<CoreState>('IDLE');
  const [isListening, setIsListening] = useState(false);
  const [isVoiceSending, setIsVoiceSending] = useState(false);
  const [command, setCommand] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [showPanel, setShowPanel] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [showMemoryPanel, setShowMemoryPanel] = useState(false);
  const [newConversationDialog, setNewConversationDialog] = useState(false);
  const [newConversationTitle, setNewConversationTitle] = useState('');
  const [chatOpen, setChatOpen] = useState(false);

  const {
    conversations,
    activeConversation,
    activeConversationId,
    createConversation,
    selectConversation,
    addMessage,
    deleteConversation,
    newConversation: clearConversationSelection,
  } = useConversations();

  const { memories, createMemory, deleteMemory, clearMemories } = useMemories();

  const [messages, setMessages] = useState<Message[]>([
    { from: 'nasi', text: 'NASI core online. Awaiting your directive, Commander.' },
  ]);

  // Convert messages to conversation format when saving
  const convertToConversationMessages = useCallback((msgs: Message[]): ConversationMessage[] => {
    return msgs.map((m, i) => ({
      id: generateId(),
      role: m.from === 'user' ? 'user' : 'assistant',
      text: m.text,
      timestamp: m.timestamp ?? Date.now() - i * 1000,
      source: m.from === 'nasi' ? undefined : 'text',
    }));
  }, []);

  const convertToMessage = useCallback((msg: ConversationMessage): Message => {
    return {
      from: msg.role === 'user' ? 'user' : 'nasi',
      text: msg.text,
      timestamp: msg.timestamp,
    };
  }, []);

  const localTime = useMemo(() => new Intl.DateTimeFormat('en', { hour: '2-digit', minute: '2-digit' }).format(new Date()), []);

  // Keep the legacy demo timer for the old listening toggle behavior.
  // Real voice uses the VoicePanel + useVoice hook.
  useEffect(() => {
    if (!isListening) return;
    const timer = window.setTimeout(() => setIsListening(false), 5000);
    return () => window.clearTimeout(timer);
  }, [isListening]);

  function setCoreIdle() {
    setCoreState('IDLE');
  }

  async function sendCommand(prompt: string, isVoice = false) {
    if (!prompt || isSending) return;

    let conversationId = activeConversationId;
    if (!conversationId) {
      const conv = await createConversation(prompt);
      if (conv) {
        conversationId = conv.id;
      }
    }

    const userMessage: Message = { from: 'user', text: prompt };
    const prevMessages = activeConversation ? activeConversation.messages.map(convertToMessage) : [
      { from: 'nasi', text: 'NASI core online. Awaiting your directive, Commander.' },
    ];
    setMessages([...prevMessages, userMessage]);      if (isVoice) {
        setIsVoiceSending(true);
        setCoreState('THINKING');
      }
      setIsSending(true);
      setCoreState('THINKING');

    try {
      const response = await fetch('/api/gemini/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          systemInstruction: 'You are NASI, an advanced autonomous cybernetic AI personal operating system and multi-agent orchestrator. Provide concise, tactical, and informative responses. You speak naturally and support English and Urdu (Urdu script and Roman Urdu).',
          conversationId,
        }),
      });
      const data = (await response.json()) as { text?: string; provider?: string; status?: string };
      const responseText = data.text || 'Command received. I am ready for your next directive.';

      const assistantMessage: Message = { from: 'nasi', text: responseText };
      setMessages((current) => [...current, assistantMessage]);

      // Save to conversation
      if (conversationId) {
        await addMessage(conversationId, 'user', prompt, isVoice ? 'voice' : 'text');
        await addMessage(conversationId, 'assistant', responseText, undefined);
      }

      // Check for memory commands
      await handleMemoryCommands(prompt, responseText, conversationId);

      if (isVoice) {
        speakResponse(responseText);
      }
    } catch {
      const fallback = 'The command channel is temporarily unavailable. Local systems remain active.';
      const fallbackMsg: Message = { from: 'nasi', text: fallback };
      setMessages((current) => [...current, fallbackMsg]);
      if (conversationId) {
        await addMessage(conversationId, 'user', prompt, isVoice ? 'voice' : 'text');
        await addMessage(conversationId, 'assistant', fallback, undefined);
      }
      if (isVoice) speakResponse(fallback);
    } finally {
      if (isVoice) setIsVoiceSending(false);
      else setIsSending(false);
      setCoreState('IDLE');
    }
  }

  async function handleMemoryCommands(userPrompt: string, responseText: string, conversationId?: string) {
    const lower = userPrompt.toLowerCase();
    const convId = conversationId;

    // "Remember that..." commands
    if (/(remember|save|keep|store)\s+(that\s+)?/i.test(lower)) {
      const match = lower.match(/^(?:remember|save|keep|store)(?:\s+that\s+)?(.+)$/i);
      if (match) {
        const value = match[1].trim();
        if (value) {
          const category = determineMemoryCategory(value);
          await createMemory(category, extractMemoryKey(value), value, 7, convId);
          const confirmation = `I'll remember that, Commander. Added to long-term memory.`;
          setMessages((current) => {
            const msgs = [...current];
            msgs[msgs.length - 1] = { from: 'nasi', text: confirmation };
            return msgs;
          });
          if (convId) await addMessage(convId, 'assistant', confirmation);
        }
      }
    }

    // "Forget that..." or "Delete..." commands
    if (/\b(forget|delete|remove)\b/i.test(lower)) {
      const searchMatch = lower.match(/\b(forget|delete|remove)\s+(?:that|this|[\s\S]+)$/i);
      if (searchMatch) {
        const searchTerm = searchMatch[2]?.trim() ?? '';
        if (searchTerm) {
          const matchingMemories = memories.filter(
            (m) => m.key.toLowerCase().includes(searchTerm.toLowerCase()) ||
                   m.value.toLowerCase().includes(searchTerm.toLowerCase())
          );
          if (matchingMemories.length > 0) {
            for (const m of matchingMemories) {
              await deleteMemory(m.id);
            }
            const confirmation = `I've forgotten that, Commander. Removed from memory.`;
            setMessages((current) => {
              const msgs = [...current];
              msgs[msgs.length - 1] = { from: 'nasi', text: confirmation };
              return msgs;
            });
            if (convId) await addMessage(convId, 'assistant', confirmation);
            return;
          }
        }
      }
    }

    // "What do you remember about me?"
    if (/(?:what\s+(?:do|does|are)\s+)?(?:you\s+)?(?:remember|know|k) (?:about|of|regarding)?\s+(?:me|my|commander|myself)/i.test(lower)) {
      if (memories.length > 0) {
        const memorySummary = memories
          .slice(0, 10)
          .map((m) => `  - ${m.key}: ${m.value}`)
          .join('\n');
        const memoryResponse = `Here's what I remember about you, Commander:\n\n${memorySummary}\n\nI retain ${memories.length} personal memories. Say "Forget that..." to remove any of them.`;
        setMessages((current) => {
          const msgs = [...current];
          msgs[msgs.length - 1] = { from: 'nasi', text: memoryResponse };
          return msgs;
        });
        if (convId) await addMessage(convId, 'assistant', memoryResponse);
      } else {
        const noMemoryResponse = `I don't have any specific memories about you yet, Commander. Say "Remember that..." to save something important.`;
        setMessages((current) => {
          const msgs = [...current];
          msgs[msgs.length - 1] = { from: 'nasi', text: noMemoryResponse };
          return msgs;
        });
        if (convId) await addMessage(convId, 'assistant', noMemoryResponse);
      }
    }
  }

  function determineMemoryCategory(text: string): string {
    const lower = text.toLowerCase();
    if (/(\bprefer(?:ence)?(?:s)?\b|\balways(?:\s+answer)?\b|\bshort(?:\s+answer)?\b|\bformal(?:\s+language)?\b|\bcasual(?:\s+language)?\b|\bstyle\b)/i.test(lower)) {
      return 'preference';
    }
    if (/\b(todo|task|remember to|need to|scheduled|appointment|deadline|meeting)\b/i.test(lower)) {
      return 'task';
    }
    if (/(\bproject(?:s)?\b|working on|developing|building|creating)\b/i.test(lower)) {
      return 'project';
    }
    return 'fact';
  }

  function extractMemoryKey(text: string): string {
    const firstSentence = text.split(/[.!?]+/)[0]?.trim() ?? text;
    return firstSentence.slice(0, 50);
  }

  function speakResponse(text: string) {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.98;
      utterance.pitch = 1.0;
      const voices = window.speechSynthesis.getVoices();
      const preferFemale = voices.find((v) => /female/i.test(v.name) && v.lang.startsWith('en'));
      const preferEnglish = voices.find((v) => v.lang.startsWith('en'));
      utterance.voice = preferFemale || preferEnglish || voices[0] || null;
      utterance.onstart = () => setCoreState('SPEAKING');
      utterance.onend = () => setCoreState('IDLE');
      utterance.onerror = () => setCoreState('IDLE');
      window.speechSynthesis.speak(utterance);
    }
  }

  return (
    <div className="app-shell">
      <header className="stonic-topbar">
        <div className="stonic-brand-lockup">
          <div className="stonic-logo">
            <svg viewBox="0 0 32 32" className="stonic-logo-svg">
              <defs>
                <radialGradient id="stonic-glow" cx="50%" cy="40%" r="50%">
                  <stop offset="0%" stopColor="#3ad5e3" stopOpacity="0.9"/>
                  <stop offset="55%" stopColor="#1a7a85" stopOpacity="0.3"/>
                  <stop offset="100%" stopColor="#0a2528" stopOpacity="0"/>
                </radialGradient>
              </defs>
              <circle cx="16" cy="16" r="14" fill="none" stroke="#1a3a42" strokeWidth="0.8" opacity="0.6"/>
              <circle cx="16" cy="16" r="11" fill="none" stroke="#1a3a42" strokeWidth="0.5" strokeDasharray="2 3" opacity="0.5"/>
              <circle cx="16" cy="16" r="6.5" fill="url(#stonic-glow)"/>
              <circle cx="16" cy="16" r="3.5" fill="#0d2428" stroke="#3ad5e3" strokeWidth="1"/>
              <circle cx="16" cy="16" r="1.2" fill="#5aecc4"/>
              <circle cx="8" cy="9" r="1.2" fill="#3ad5e3" opacity="0.9"/>
              <circle cx="24" cy="9" r="1.2" fill="#3ad5e3" opacity="0.9"/>
              <circle cx="8" cy="23" r="1.2" fill="#3ad5e3" opacity="0.9"/>
              <circle cx="24" cy="23" r="1.2" fill="#3ad5e3" opacity="0.9"/>
            </svg>
          </div>
          <span className="stonic-brand-name">Stonic AI</span>
        </div>
        <div className="stonic-topbar-actions">
          <span className="stonic-system-status"><span className="stonic-status-dot" /> NOMINAL</span>
          <button className="stonic-top-btn" onClick={() => setShowPanel(true)}><CircleHelp size={12} /> Demo Video</button>
          <button className="stonic-top-btn" onClick={() => setShowPanel(true)}><Settings2 size={12} /> Feedback</button>
          <div className="stonic-window-controls">
            <button className="stonic-window-btn" title="Minimize"><Minimize2 size={10}/></button>
            <button className="stonic-window-btn" title="Maximize"><Maximize2 size={10}/></button>
            <button className="stonic-window-btn" title="Close"><X size={10}/></button>
          </div>
        </div>
      </header>

      <main className="stonic-workspace">
        <aside className="stonic-left-column">
          <section className="stonic-media-panel">
            <div className="stonic-panel-header">
              <div className="stonic-panel-label">
                <Activity size={12} />
                <span>MEDIA LINK</span>
              </div>
              <div className="stonic-panel-actions">
                <button className="stonic-icon-btn"><MoreHorizontal size={11} /></button>
              </div>
            </div>
            <div className="stonic-media-content">
              <span className="stonic-offline-pill"><span className="stonic-mini-dot" /> SYSTEM OFFLINE</span>
              <div className="stonic-media-visual">
                <div className="stonic-media-orbit">
                  <div className="stonic-orbit-core" />
                </div>
              </div>
              <div className="stonic-media-controls">
                <button><Volume2 size={12} /></button>
                <button><Maximize2 size={12} /></button>
              </div>
            </div>
          </section>

          <section className="stonic-satlink-panel">
            <div className="stonic-panel-header">
              <div className="stonic-panel-label">
                <Radar size={12} />
                <span>SAT-LINK FEED</span>
                <span className="stonic-sub-label">SATELLITE STREAM</span>
              </div>
              <div className="stonic-panel-actions">
                <button className="stonic-version-badge">v1.0.52</button>
                <button className="stonic-icon-btn"><MoreHorizontal size={11} /></button>
              </div>
            </div>
            <div className="stonic-update-banner">
              <span className="stonic-update-title">Update Available</span>
              <span className="strionic-update-text">A new version is ready.</span>
              <button className="stonic-banner-btn">Reload</button>
              <button className="stonic-banner-close">×</button>
            </div>
            <div className="stonic-map-container">
              <div className="stonic-map-controls">
                <button className="stonic-map-btn active">▼ Hide Map</button>
                <button className="stonic-map-btn">2D</button>
                <button className="stonic-map-btn">3D</button>
              </div>
              <div className="stonic-map-viewport">
                <img src="/assets/themes/nasi-radar-cyan.svg" alt="Satellite map" className="stonic-map-image" />
                <div className="stonic-map-overlay" />
                <div className="stonic-betabadge">BETA</div>
                <div className="stonic-map-zoom">
                  <button className="stonic-zoom-btn">+</button>
                  <button className="stonic-zoom-btn">−</button>
                  <button className="stonic-zoom-btn target">⌖</button>
                </div>
              </div>
              <div className="stonic-map-labels">
                <div className="stonic-map-label label-one">NORTH ATLANTIC <span>●</span></div>
                <div className="stonic-map-label label-two">PACIFIC ARRAY <span>●</span></div>
                <div className="stonic-map-label label-three">ACTIVE <span>●</span></div>
              </div>
            </div>
            <div className="stonic-map-tabs">
              <button className="active">Today</button>
              <button><Map size={11} /> Map</button>
              <button><Search size={11} /> Search</button>
              <button><AlertTriangle size={11} /> Alerts <span className="stonic-alert-count">3</span></button>
            </div>
            <div className="stonic-feed-time">
              <span className="stonic-live-dot" /> SATELLITE STREAM · UTC 04:03
            </div>
          </section>

          <section className="stonic-headlines-panel">
            <div className="stonic-panel-header">
              <div className="stonic-panel-label">
                <Globe2 size={12} />
                <span>TODAY HEADLINES</span>
              </div>
              <div className="stonic-panel-actions">
                <button className="stonic-icon-btn"><RefreshCw size={11} /></button>
                <button className="stonic-icon-btn"><Bookmark size={11} /></button>
              </div>
            </div>
            <div className="stonic-headlines-list">
              {headlines.map((headline, index) => (
                <div className="stonic-headline" key={headline}>
                  <span className="stonic-headline-index">{String(index + 1).padStart(2, '0')}</span>
                  <span>{headline}</span>
                </div>
              ))}
            </div>
          </section>
        </aside>

        <section className="stonic-center-column">
          <section className="stonic-aisphere-panel">
            <div className="stonic-aisphere-header">
              <span className="stonic-aisphere-title">NEURAL CORE</span>
              <div className="stonic-aisphere-status">
                <span className={`stonic-thinking-dot ${coreState !== 'IDLE' ? 'active' : ''}`} />
                {coreState === 'IDLE' ? 'STANDBY' : coreState === 'LISTENING' ? 'LISTENING' : coreState === 'THINKING' ? 'THINKING' : coreState === 'SPEAKING' ? 'SPEAKING' : 'STANDBY'}
              </div>
            </div>
            <div className="stonic-aisphere-visual">
              <div className="stonic-core-ring ring-one" />
              <div className="stonic-core-ring ring-two" />
              <div className="stonic-core-ring ring-three" />
              <div className="stonic-core-glow">
                <BrainCircuit size={32} />
              </div>
              <div className="stonic-core-particles">
                {Array.from({ length: 14 }, (_, i) => (
                  <span key={i} className="stonic-particle" style={{ '--i': i } as CSSProperties} />
                ))}
              </div>
            </div>
            <VoicePanel
              onVoiceInput={(transcript) => { if (transcript.trim()) void sendCommand(transcript, true); }}
              isThinking={isVoiceSending}
              compact
            />
            <div className="stonic-aisphere-caption">Your living AI core</div>
          </section>

          <div className="stonic-skills-stack">
            <div className="stonic-skill-card cyan">
              <div className="stonic-skill-icon"><Database size={14} /></div>
              <div><strong>Memory</strong></div>
              <div className="stonic-skill-connector" />
            </div>
            <div className="stonic-skill-card orange">
              <div className="stonic-skill-icon"><Zap size={14} /></div>
              <div><strong>Skills</strong></div>
              <div className="stonic-skill-connector" />
            </div>
            <div className="stonic-skill-card green">
              <div className="stonic-skill-icon"><ShieldCheck size={14} /></div>
              <div><strong>Soul</strong></div>
              <div className="stonic-skill-connector" />
            </div>
            <div className="stonic-skill-card white">
              <div className="stonic-skill-icon"><Settings2 size={14} /></div>
              <div><strong>Settings</strong></div>
            </div>
          </div>

          <section className="stonic-agenttown-panel">
            <div className="stonic-panel-header">
              <div className="stonic-panel-label">
                <Bot size={12} />
                <span>AGENT TOWN</span>
              </div>
              <div className="stonic-segmented-control">
                <button className="active">Agents</button>
                <button>Visual hub</button>
                <button>Gesture</button>
              </div>
              <div className="stonic-panel-actions-right">
                <button className="stonic-icon-btn"><RefreshCw size={11} /></button>
              </div>
            </div>
            <div className="stonic-agent-avatars">
              {agents.map((agent) => (
                <button key={agent.name} className="stonic-agent-avatar" style={{ '--agent-color': agent.color } as CSSProperties}>
                  {agent.name[0]}
                </button>
              ))}
              <button className="stonic-agent-avatar sparky" style={{ '--agent-color': '#e9954c' }}>
                SP
              </button>
              <button className="stonic-agent-avatar unit7" style={{ '--agent-color': '#43dcaa' }}>
                U7
              </button>
            </div>
            <div className="stonic-pixel-scene">
              <div className="stonic-scene-grid" />
              <div className="stonic-scene-wall" />
              <div className="stonic-scene-doors">
                <div className="stonic-door door-left" />
                <div className="stonic-door door-right" />
              </div>
              <div className="stonic-desks-container">
                <div className="stonic-desk">
                  <div className="stonic-monitor" />
                  <div className="stonic-chair" />
                  <div className="stonic-computer" />
                </div>
                <div className="stonic-desk">
                  <div className="stonic-monitor" />
                  <div className="stonic-chair" />
                  <div className="stonic-filing-cabinet" />
                </div>
                <div className="stonic-desk">
                  <div className="stonic-monitor" />
                  <div className="stonic-chair" />
                  <div className="stonic-plant" />
                </div>
                <div className="stonic-desk">
                  <div className="stonic-chair" />
                  <div className="stonic-computer" />
                </div>
              </div>
              <div className="stonic-pixel-characters">
                <div className="stonic-pixel-char" data-name="Alice" style={{ '--char-color': '#3ad5e3' } as CSSProperties}><div className="stonic-pixel-char-head">A</div></div>
                <div className="stonic-pixel-char" data-name="Bob" style={{ '--char-color': '#f09b47' } as CSSProperties}><div className="stonic-pixel-char-head">B</div></div>
                <div className="stonic-pixel-char" data-name="Carol" style={{ '--char-color': '#43dcaa' } as CSSProperties}><div className="stonic-pixel-char-head">C</div></div>
                <div className="stonic-pixel-char active" data-name="Dave" style={{ '--char-color': '#a9b5c4' } as CSSProperties}><div className="stonic-pixel-char-head">D</div><div className="stonic-char-label">Press E</div></div>
                <div className="stonic-pixel-char" data-name="Sparky" style={{ '--char-color': '#e9954c' } as CSSProperties}><div className="stonic-pixel-char-head">SP</div></div>
                <div className="stonic-pixel-char" data-name="Unit-7" style={{ '--char-color': '#43dcaa' } as CSSProperties}><div className="stonic-pixel-char-head">U7</div></div>
              </div>
              <div className="stonic-scene-floor" />
            </div>
            <div className="stonic-scene-status">
              <span className="stonic-status-dot" /> 6/6 active
              <span className="stonic-scene-divider" />
              04 busy
            </div>
          </section>
        </section>

        <aside className="right-column">
          <section className="panel chat-panel">
            <div className="chat-tabs">
              <button className={activeConversationId ? '' : 'active'} onClick={() => clearConversationSelection()}><MessageSquare size={11} /> All</button>
              {conversations.slice(0, 4).map((conv) => (
                <button
                  key={conv.id}
                  className={activeConversationId === conv.id ? 'active' : ''}
                  onClick={() => selectConversation(conv.id)}
                  title={conv.title}
                >
                  <span className="conv-title">{conv.title}</span>
                </button>
              ))}
              <button className="chat-plus" onClick={() => setNewConversationDialog(true)}><Plus size={12} /> New</button>
            </div>
            <div className="chat-tabs">
              <button className="active"><Mic size={11} /> Voice</button>
              <button><Terminal size={11} /> Agent</button>
              <button><MessageSquare size={11} /> Notes</button>
              <button className="chat-plus"><Plus size={12} /></button>
            </div>
            <div className="chat-stream">
              {messages.map((message, index) => <div className={`message ${message.from}`} key={`${message.text}-${index}`}><div className="message-label">{message.from === 'nasi' ? 'NASI CORE' : 'COMMANDER'} <span>· now</span></div><div className="message-text">{message.text}</div></div>)}
              {isSending && <div className="typing"><span /><span /><span /> NASI is thinking</div>}
              {isVoiceSending && <div className="typing"><span /><span /><span /> NASI is processing your voice</div>}
            </div>
            <div className="command-bar">
              <input value={command} onChange={(event) => setCommand(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && command.trim()) void sendCommand(command); }} placeholder="Type instruction or / command for Hermes..." />
              <button className="command-btn"><Paperclip size={12} /></button>
              <button className="command-btn"><Mic size={13} /></button>
              <button className="send-button" onClick={() => { if (command.trim()) void sendCommand(command); }}><Send size={13} /></button>
            </div>
          </section>
          <section className="panel telemetry-panel"><PanelHeader label="System telemetry" icon={<Cpu size={13} />} /><div className="telemetry-row"><span>Neural load</span><strong>34%</strong><div className="meter"><i style={{ width: '34%' }} /></div></div><div className="telemetry-row"><span>Memory cache</span><strong>78%</strong><div className="meter orange-meter"><i style={{ width: '78%' }} /></div></div><div className="telemetry-row"><span>Agent network</span><strong className="green-text">Stable</strong><div className="pulse-line"><i /><i /><i /><i /><i /><i /><i /></div></div><div className="telemetry-footer"><span><span className="status-dot" /> Encrypted</span><span>v1.0.52</span></div></section>
        </aside>
      </main>

      <div className="stonic-bottombar">
        <div className="stonic-bottom-left">
          <div className="stonic-status-item"><div className="stonic-profile">N</div></div>
          <div className="stonic-status-item"><span className="stonic-online-dot" /> Online</div>
          <div className="stonic-status-item"><span className="stonic-model-text">No model yet</span></div>
          <div className="stonic-ctx-slider"><span className="stonic-ctx-label">CTX</span><div className="stonic-ctx-track"><div className="stonic-ctx-fill" style={{ width: '85%' }} /></div><span className="stonic-ctx-value">85%</span></div>
          <div className="stonic-status-item"><span className="stonic-seat-badge">4/7</span></div>
          <div className="stonic-status-item"><span className="stonic-busy-badge">0/4</span></div>
        </div>
        <div className="stonic-bottom-right">
          <button className="stonic-chat-toggle" onClick={() => setChatOpen(!chatOpen)}><MessageSquare size={11} /><span>CHAT</span></button>
        </div>
      </div>

      {showPanel && <div className="modal-backdrop" onClick={() => setShowPanel(false)}><div className="modal-card" onClick={(event) => event.stopPropagation()}><button className="modal-close" onClick={() => setShowPanel(false)}><X size={16} /></button><div className="modal-kicker"><Command size={12} /> NASI CONTROL</div><h2>Your AI command center</h2><div className="modal-stats"><div><strong>04</strong><span>agents</span></div><div><strong>24</strong><span>skills</span></div><div><strong>30d</strong><span>memory</span></div></div></div></div>}
      {selectedAgent && <div className="modal-backdrop" onClick={() => setSelectedAgent(null)}><div className="agent-modal" onClick={(event) => event.stopPropagation()}><button className="modal-close" onClick={() => setSelectedAgent(null)}><X size={16} /></button><div className="agent-modal-avatar" style={{ background: selectedAgent.color }}>{selectedAgent.initials}</div><div className="modal-kicker" style={{ color: selectedAgent.color }}><span className="status-dot" /> {selectedAgent.status.toUpperCase()}</div><h2>{selectedAgent.name}</h2><p>{selectedAgent.role} agent · Agent Town</p><button className="delegate-button" onClick={() => setSelectedAgent(null)}><MessageSquare size={12} /> Delegate</button></div></div>}
      {showMemoryPanel && <div className="modal-backdrop" onClick={() => setShowMemoryPanel(false)}><div className="memory-modal" onClick={(event) => event.stopPropagation()}><button className="modal-close" onClick={() => setShowMemoryPanel(false)}><X size={16} /></button><div className="modal-kicker"><Database size={14} /> NASI MEMORY</div><MemoryManager memories={memories} onDelete={deleteMemory} onClear={clearMemories} /></div></div>}
      {newConversationDialog && (
        <div className="modal-backdrop" onClick={() => setNewConversationDialog(false)}>
          <div className="new-conv-modal" onClick={(event) => event.stopPropagation()}>
            <button className="modal-close" onClick={() => setNewConversationDialog(false)}><X size={16} /></button>
            <div className="modal-kicker"><Plus size={14} /> NEW CONVERSATION</div>
            <h2>Start a new conversation</h2>
            <p>Begin a fresh conversation thread with NASI. Previous conversations will be preserved.</p>
            <div className="new-conv-form">
              <input value={newConversationTitle} onChange={(e) => setNewConversationTitle(e.target.value)} placeholder="Conversation title (optional)" className="new-conv-input" />
            </div>
            <div className="new-conv-actions">
              <button className="new-conv-cancel" onClick={() => setNewConversationDialog(false)}>Cancel</button>
              <button className="new-conv-start" onClick={() => { setNewConversationDialog(false); setNewConversationTitle(''); }}><Plus size={12} /> Start new</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PanelHeader({ label, icon, action, actionRight }: { label: string; icon: ReactNode; action?: ReactNode; actionRight?: ReactNode }) {
  return <div className="panel-header"><div className="panel-label">{icon}<span>{label}</span></div><div>{action}{actionRight}</div></div>;
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
