import { StrictMode, useEffect, useMemo, useState, type CSSProperties, type ReactNode, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import {
  BrainCircuit,
  CircleHelp,
  Command,
  Cpu,
  Map,
  Maximize2,
  MessageSquare,
  Mic,
  MoreHorizontal,
  Plus,
  Radar,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  Terminal,
  Volume2,
  X,
  Zap,
  RefreshCw,
  Minimize2,
  Bot,
  Search,
  Activity,
  Globe2,
  LayoutGrid,
  Database,
  Trash2,
  Bookmark,
  AlertTriangle,
  Paperclip,
} from 'lucide-react';
import './styles.css';
import './components/VoicePanel.css';

import { VoicePanel } from './components/VoicePanel';
import { SkillsPanel } from './components/SkillsPanel';
import { AISphere } from './components/AISphere';
import { AgentTown } from './components/AgentTown';
import { RightPanel } from './components/RightPanel';
import { ChatPanel } from './components/ChatPanel';
import type { CoreState } from './hooks/useVoice';

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

function App() {
  const [coreState, setCoreState] = useState<CoreState>('IDLE');
  const [isListening, setIsListening] = useState(false);
  const [isVoiceSending, setIsVoiceSending] = useState(false);
  const [command, setCommand] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [showPanel, setShowPanel] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [showMemoryPanel, setShowMemoryPanel] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [activeEnv, setActiveEnv] = useState<'agents' | 'world'>('agents');

  const [messages, setMessages] = useState<Message[]>([
    { from: 'nasi', text: 'NASI online. Ready.' },
  ]);

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

    const userMessage: Message = { from: 'user', text: prompt };
    setMessages((current) => [...current, userMessage]);

    if (isVoice) {
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
          systemInstruction: 'You are NASI, a personal AI assistant. Be concise and helpful. Support English and Urdu.',
        }),
      });
      const data = (await response.json()) as { text?: string; provider?: string; status?: string };
      const responseText = data.text || 'Command received. I am ready for your next directive.';

      const assistantMessage: Message = { from: 'nasi', text: responseText };
      setMessages((current) => [...current, assistantMessage]);

      if (isVoice) {
        speakResponse(responseText);
      }
    } catch {
      const fallback = 'The command channel is temporarily unavailable. Local systems remain active.';
      const fallbackMsg: Message = { from: 'nasi', text: fallback };
      setMessages((current) => [...current, fallbackMsg]);
      if (isVoice) speakResponse(fallback);
    } finally {
      if (isVoice) setIsVoiceSending(false);
      else setIsSending(false);
      setCoreState('IDLE');
    }
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
      {/* Top bar */}
      <header className="topbar">
        <div className="topbar-brand">
          <div className="topbar-logo">
            <svg viewBox="0 0 32 32">
              <defs>
                <radialGradient id="nasi-top-glow" cx="50%" cy="40%" r="50%">
                  <stop offset="0%" stopColor="#3ad6ea" stopOpacity="0.9"/>
                  <stop offset="55%" stopColor="#1a7a85" stopOpacity="0.25"/>
                  <stop offset="100%" stopColor="#0a2528" stopOpacity="0"/>
                </radialGradient>
              </defs>
              <circle cx="16" cy="16" r="14" fill="none" stroke="#1a3a42" strokeWidth="0.7" opacity="0.55"/>
              <circle cx="16" cy="16" r="11" fill="none" stroke="#1a3a42" strokeWidth="0.4" strokeDasharray="2 3" opacity="0.45"/>
              <circle cx="16" cy="16" r="6.2" fill="url(#nasi-top-glow)"/>
              <circle cx="16" cy="16" r="3.2" fill="#0d2428" stroke="#3ad6ea" strokeWidth="0.9"/>
              <circle cx="16" cy="16" r="1.1" fill="#5aecc4"/>
              <circle cx="7.5" cy="9" r="1.1" fill="#3ad6ea" opacity="0.85"/>
              <circle cx="24.5" cy="9" r="1.1" fill="#3ad6ea" opacity="0.85"/>
              <circle cx="7.5" cy="23" r="1.1" fill="#3ad6ea" opacity="0.85"/>
              <circle cx="24.5" cy="23" r="1.1" fill="#3ad6ea" opacity="0.85"/>
            </svg>
          </div>
          <span className="topbar-name">NASI</span>
        </div>
        <div className="topbar-ops">
          <span className="topbar-status">
            <span className="topbar-dot" /> ONLINE
          </span>
          <div className="topbar-actions">
            <button className="topbar-btn" onClick={() => setShowPanel(true)} title="Help"><CircleHelp size={15} /></button>
            <button className="topbar-btn" onClick={() => setShowMemoryPanel(true)} title="Memory"><Database size={15} /></button>
          </div>
          <div className="topbar-win">
            <button title="Minimize"><Minimize2 size={8} /></button>
            <button title="Maximize"><Maximize2 size={8} /></button>
            <button title="Close"><X size={8} /></button>
          </div>
        </div>
      </header>

      {/* Main workspace */}
      <main className="workspace">
        {/* LEFT COLUMN: Hero - Voice/Intelligence Core */}
        <div className="hero-col">
          {/* Core stage - dominant hero */}
          <section className="core-stage">
            <div className="core-scene">
              {/* Orbital rings */}
              <div className={`core-ring r1 ${coreState === 'IDLE' || coreState === 'LISTENING' ? 'active' : ''}`} />
              <div className={`core-ring r2 ${coreState === 'THINKING' ? 'active' : ''}`} />
              <div className={`core-ring r3 ${coreState === 'SPEAKING' ? 'active' : ''}`} />

              {/* Central orb */}
              <div className={`core-orb-wrap`}>
                <div className={`core-orb ${coreState.toLowerCase()}`}>
                  <BrainCircuit />
                  {/* Particles */}
                  <div className="core-particles">
                    <span></span><span></span><span></span><span></span><span></span><span></span>
                  </div>
                </div>
              </div>

              {/* Voice controls */}
              <div className="voice-controls">
                <button
                  className={`voice-btn primary ${isListening ? 'listening' : isVoiceSending ? 'speaking' : ''}`}
                  onClick={() => setIsListening(!isListening)}
                  title={isListening ? 'Stop listening' : 'Start voice'}
                >
                  <Mic size={20} />
                </button>
                <div className="voice-sep" />
                <button
                  className={`voice-btn ghost ${coreState === 'SPEAKING' ? 'speaking' : ''}`}
                  onClick={() => window.speechSynthesis?.cancel()}
                  disabled={coreState !== 'SPEAKING'}
                  title="Stop speech"
                >
                  <Volume2 size={15} />
                </button>
                <div className="voice-sep" />
                <button className="voice-btn ghost" onClick={() => setShowPanel(true)} title="Settings">
                  <Settings2 size={15} />
                </button>
                <span className={`voice-status-text ${isListening || isVoiceSending ? 'active' : ''}`}>
                  {isListening ? 'LISTENING' : isVoiceSending ? 'THINKING' : coreState === 'SPEAKING' ? 'SPEAKING' : 'READY'}
                </span>
              </div>

              {/* Chat input bar */}
              <div className="chat-bar">
                <input
                  className="chat-input"
                  value={command}
                  onChange={(e) => setCommand(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && command.trim()) {
                      void sendCommand(command);
                      setCommand('');
                    }
                  }}
                  placeholder="Talk to NASI..."
                />
                <button className="chat-btn-icon" title="Attach"><Paperclip size={14} /></button>
                <button className="chat-btn-icon" onClick={() => setIsListening(!isListening)} title="Voice">
                  <Mic size={15} />
                </button>
                <button
                  className="chat-btn-send"
                  onClick={() => {
                    if (command.trim()) {
                      void sendCommand(command);
                      setCommand('');
                    }
                  }}
                  disabled={!command.trim() || isSending}
                >
                  <Send size={15} />
                </button>
              </div>

              {/* State label (bottom-left) */}
              <div className={`core-state ${coreState.toLowerCase()}`}>
                <span className="core-state-dot" />
                <span className="core-state-text">
                  {coreState === 'IDLE' ? 'STANDBY' : coreState === 'LISTENING' ? 'LISTENING' : coreState === 'THINKING' ? 'THINKING' : coreState === 'SPEAKING' ? 'SPEAKING' : 'STANDBY'}
                </span>
              </div>
            </div>

            {/* Voice waveform */}
            <div className={`voice-wave ${isListening ? 'listening' : isVoiceSending ? 'thinking' : coreState === 'SPEAKING' ? 'speaking' : 'idle'}`}>
              {Array.from({ length: 28 }).map((_, i) => (
                <div key={i} className="wave-bar" style={{ height: 10 + (i % 7) * 3 }} />
              ))}
            </div>
          </section>

          {/* Agent Town - living AI office */}
          <section className="env-card">
            <div className="env-header">
              <span className="env-title">
                <Bot size={12} /> AGENT TOWN
              </span>
              <span className="env-meta">{agents.length} agents</span>
            </div>
            <div className="env-body">
              <AgentTown
                agents={agents}
                activeEnv={activeEnv}
                onEnvChange={setActiveEnv}
              />
            </div>
          </section>

          {/* World Radar - world monitor */}
          <section className="env-card">
            <div className="env-header">
              <span className="env-title">
                <Radar size={12} /> WORLD
              </span>
              <span className="env-meta">monitor</span>
            </div>
            <div className="env-body">
              <div className="world-scene">
                <div className="world-sphere">
                  <div className="world-grid" />
                  <div className="world-sphere-content">
                    <Activity size={32} />
                  </div>
                  <div className="world-markers">
                    <div className="world-marker m1" />
                    <div className="world-marker m2 emerald" />
                    <div className="world-marker m3 gold" />
                    <div className="world-marker m4 crimson" />
                    <div className="world-marker m5" />
                    <div className="world-marker m6 emerald" />
                    <div className="world-marker m7 gold" />
                    <div className="world-marker m8 off" />
                  </div>
                </div>
                <div className="world-status">
                  <span><span className="world-dot" /> LIVE</span>
                  <span>Earth · real-time</span>
                </div>
              </div>
            </div>
          </section>

          {/* Skills */}
          <SkillsPanel />
        </div>

        {/* RIGHT COLUMN: Chat + quick panels */}
        <div className="env-col">
          {/* Chat panel */}
          <section className="chat-panel">
            <div className="chat-panel-header">
              <span className="chat-panel-title">
                <MessageSquare size={12} /> CHAT
              </span>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <button className="topbar-btn" onClick={() => setChatOpen(!chatOpen)} title="Toggle chat">
                  <Terminal size={13} />
                </button>
                <button className="topbar-btn" onClick={() => setShowMemoryPanel(true)} title="Memory">
                  <Database size={13} />
                </button>
              </div>
            </div>
            <div className="chat-stream">
              {messages.map((message, index) => (
                <div className={`chat-msg ${message.from}`} key={`${message.text}-${index}`}>
                  {message.text}
                </div>
              ))}
              {isSending && (
                <div className="chat-typing">
                  <span></span><span></span><span></span> PROCESSING
                </div>
              )}
            </div>
            <div className="chat-bar" style={{ marginTop: 14 }}>
              <input
                className="chat-input"
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && command.trim()) {
                    void sendCommand(command);
                    setCommand('');
                  }
                }}
                placeholder="Type a message..."
              />
              <button className="chat-btn-icon" title="Attach"><Paperclip size={13} /></button>
              <button className="chat-btn-icon" onClick={() => setIsListening(!isListening)} title="Voice">
                <Mic size={14} />
              </button>
              <button
                className="chat-btn-send"
                onClick={() => {
                  if (command.trim()) {
                    void sendCommand(command);
                    setCommand('');
                  }
                }}
                disabled={!command.trim() || isSending}
              >
                <Send size={14} />
              </button>
            </div>
          </section>

          {/* Right panel - quick tools */}
          <RightPanel />
        </div>
      </main>

      {/* Bottom navigation (mobile) */}
      <nav className="bottom-nav">
        <button className="bottom-nav-item active"><Home size={18} /><span>Home</span></button>
        <button className="bottom-nav-item"><MessageSquare size={18} /><span>Chat</span></button>
        <button className="bottom-nav-item" onClick={() => setIsListening(!isListening)}><Mic size={18} /><span>Voice</span></button>
        <button className="bottom-nav-item"><Bot size={18} /><span>Agents</span></button>
        <button className="bottom-nav-item"><Radar size={18} /><span>World</span></button>
        <button className="bottom-nav-item"><Settings2 size={18} /><span>More</span></button>
      </nav>

      {/* Modals */}
      {showPanel && (
        <div className="modal-backdrop" onClick={() => setShowPanel(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowPanel(false)}><X size={16} /></button>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div className="modal-kicker"><Settings2 size={12} /> PROVIDERS</div>
                <div style={{ fontFamily: 'var(--nasi-mono)', fontSize: 11, letterSpacing: '.06em', color: 'var(--nasi-text-2)', textTransform: 'uppercase' }}>
                  Gemini · OpenAI · Claude · Grok · Ollama
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div className="modal-kicker"><Command size={12} /> NASI CORE</div>
                <div style={{ fontFamily: 'var(--nasi-mono)', fontSize: 11, letterSpacing: '.06em', color: 'var(--nasi-text-2)', textTransform: 'uppercase' }}>
                  Core Intelligence · Memory · Voice · Reasoning · Planning
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                <button className="start-button" onClick={() => setShowPanel(false)}>
                  <MessageSquare size={12} /> Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedAgent && (
        <div className="modal-backdrop" onClick={() => setSelectedAgent(null)}>
          <div className="agent-modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setSelectedAgent(null)}><X size={16} /></button>
            <div className="agent-modal-avatar" style={{ background: selectedAgent.color, color: '#061011', fontWeight: 700 }}>
              {selectedAgent.initials}
            </div>
            <div className="modal-kicker" style={{ color: selectedAgent.color }}>
              <span className="status-dot" /> AGENT
            </div>
            <h2 style={{ margin: '10px 0 4px', fontSize: 20, letterSpacing: '-.02em' }}>{selectedAgent.name}</h2>
            <div style={{ color: 'var(--nasi-text-2)', fontSize: 12, fontFamily: 'var(--nasi-mono)', letterSpacing: '.04em', textTransform: 'uppercase' }}>
              {selectedAgent.role} agent
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
              <button className="delegate-button" onClick={() => setSelectedAgent(null)}>
                <MessageSquare size={12} /> Close
              </button>
            </div>
          </div>
        </div>
      )}

      {showMemoryPanel && (
        <div className="modal-backdrop" onClick={() => setShowMemoryPanel(false)}>
          <div className="memory-modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowMemoryPanel(false)}><X size={16} /></button>
            <div className="modal-kicker"><Database size={14} /> NASI MEMORY</div>
            <MemoryManager />
          </div>
        </div>
      )}
    </div>
  );
}

// Bottom nav icons
function Home({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
      <polyline points="9 22 9 12 15 12 15 22"/>
    </svg>
  );
}

// Minimal MemoryManager for modal
function MemoryManager() {
  const [memories, setMemories] = useState<{ id: string; key: string; value: string }[]>([]);
  const add = () => {
    const key = prompt('Memory key:');
    if (!key) return;
    const value = prompt('Memory value:');
    if (!value) return;
    setMemories((prev) => [...prev, { id: crypto.randomUUID(), key, value }]);
  };
  const remove = (id: string) => setMemories((prev) => prev.filter((m) => m.id !== id));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 10 }}>
      {memories.length === 0 ? (
        <div style={{ color: 'var(--nasi-text-3)', fontFamily: 'var(--nasi-mono)', fontSize: 11, letterSpacing: '.06em', textTransform: 'uppercase', textAlign: 'center', padding: '20px 0' }}>
          No memories yet
        </div>
      ) : (
        memories.map((m) => (
          <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 4px', borderBottom: '1px solid var(--nasi-border)' }}>
            <div>
              <div style={{ color: 'var(--nasi-cyan)', fontFamily: 'var(--nasi-mono)', fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase' }}>{m.key}</div>
              <div style={{ color: 'var(--nasi-text-2)', fontSize: 12, marginTop: 2 }}>{m.value}</div>
            </div>
            <button className="topbar-btn" onClick={() => remove(m.id)} title="Delete"><Trash2 size={12} /></button>
          </div>
        ))
      )}
      <button className="start-button" style={{ marginTop: 10, alignSelf: 'flex-start' }} onClick={add}>
        <Plus size={12} /> Add memory
      </button>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
