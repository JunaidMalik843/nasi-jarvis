import React, { StrictMode, useState, useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import {
  BrainCircuit, Mic, VolumeX, Settings2, Database,
  Send, X, Users, Key,
  Speaker, Save, Plus, Trash2, MessageSquare, Clock,
  ChevronLeft, Zap, Globe2,
  Phone, PhoneOff, AlertTriangle,
  ChevronDown, Wifi, Radio as RadioIcon, Search,
  Palette, Download, Upload,
} from 'lucide-react';
import WorldGlobe from './components/WorldGlobe';
import AgentOffice from './components/AgentOffice';
import { useConversations, useMemories } from './hooks/useStorage';
import { useVoice, type CoreState } from './hooks/useVoice';
import { getPersonalitySystemPrompt, type PersonalityType } from './lib/personality';
import { parseMemoryCommand, getMemoryResponse } from './lib/memoryCommands';
import { routeCommand, isActiveStatus, statusClass, type AgentRoute } from './lib/agentRouter';
import { useOrchestration, setOrchestration, resetOrchestration, applyLiveStatus, orchestrationLabel } from './lib/orchestration';
import NASICore from './components/NASICore';
import './styles.css';
import './mobile-fix.css';
import './polish.css';

// ============================================================
// ERROR BOUNDARY
// ============================================================
type SBProps = { children: ReactNode; fallback?: ReactNode; name?: string };
type SBState = { hasError: boolean; error: string };
class SectionBoundary extends React.Component<SBProps, SBState> {
  constructor(props: SBProps) {
    super(props);
    (this as any).state = { hasError: false, error: '' };
  }
  static getDerivedStateFromError(err: Error) { return { hasError: true, error: err.message }; }
  componentDidCatch(err: Error) { console.error('[NASI]', err); }
  handleRetry = () => { (this as any).setState({ hasError: false, error: '' }); };
  render() {
    if ((this as any).state.hasError) {
      return <div className="nasi-section-fallback" onClick={this.handleRetry}><AlertTriangle size={14} /><span>{(this as any).props.name || 'Component'} failed — tap to retry</span></div>;
    }
    return ((this as any).props as SBProps).children;
  }
}

// ============================================================
// TYPES
// ============================================================
type Agent = { name: string; role: string; color: string; status: string; initials: string; department: string };
type Message = { from: 'user' | 'nasi'; text: string; source?: string; timestamp?: number };
interface NasiSettings {
  assistantName: string; theme: 'cyan' | 'emerald' | 'crimson'; animationIntensity: 'low' | 'medium' | 'high';
  voiceProvider: 'browser' | 'elevenlabs'; voiceLanguage: string; voiceSpeed: number; voicePitch: number; voiceVolume: number;
  autoSpeak: boolean; liveVoice: boolean; memoryEnabled: boolean; contextLength: number; personality: PersonalityType;
  geminiApiKey: string; geminiModel: string; openaiApiKey: string; openaiModel: string;
  claudeApiKey: string; claudeModel: string; grokApiKey: string; grokModel: string; activeProvider: string;
  elevenlabsApiKey: string; elevenlabsVoiceId: string; elevenlabsModel: string; customVoiceId: string;
}
const DEFAULT_SETTINGS: NasiSettings = {
  assistantName: 'NASI', theme: 'cyan', animationIntensity: 'medium',
  voiceProvider: 'browser', voiceLanguage: 'en-US', voiceSpeed: 0.98, voicePitch: 1.0, voiceVolume: 1.0,
  autoSpeak: true, liveVoice: false, memoryEnabled: true, contextLength: 20, personality: 'warm',
  geminiApiKey: '', geminiModel: 'gemini-2.0-flash', openaiApiKey: '', openaiModel: 'gpt-4o-mini',
  claudeApiKey: '', claudeModel: 'claude-3-haiku-20240307', grokApiKey: '', grokModel: 'grok-2-1212', activeProvider: 'gemini',
  elevenlabsApiKey: '', elevenlabsVoiceId: '21m00Tcm4TlvDq8ikWAM', elevenlabsModel: 'eleven_flash_v2_5', customVoiceId: '',
};
function loadSettings(): NasiSettings {
  try {
    const raw = localStorage.getItem('nasi_settings');
    if (raw) {
      const parsed = JSON.parse(raw);
      // Merge saved data ON TOP of defaults — saved values always win
      // Key rule: if a key exists in localStorage (even empty string), use it.
      // Only fall back to defaults for keys that are truly missing (undefined/null).
      const merged = { ...DEFAULT_SETTINGS };
      for (const [key, val] of Object.entries(parsed)) {
        if (val !== undefined && val !== null) {
          (merged as any)[key] = val;
        }
      }
      return merged;
    }
  } catch (err) {
    console.warn('[Settings] Failed to load from localStorage:', err);
  }
  return { ...DEFAULT_SETTINGS };
}
function saveSettings(s: NasiSettings) {
  try {
    localStorage.setItem('nasi_settings', JSON.stringify(s));
  } catch (err) {
    console.warn('[Settings] Failed to save to localStorage:', err);
  }
}

// Baseline agent roster. `status` here is the RESTING state only — the Manager
// and the currently-delegated agent get their live status from orchestration
// state at runtime (see `runtimeAgents` in <App />).
// Compact labels for the Agent Town status bar — keeps all 7 departments on
// one row without scrolling or ellipsis.
const DEPT_SHORT: Record<string, string> = {
  Core: 'CORE', Research: 'RESEARCH', Web: 'WEB', Commerce: 'COMMERCE',
  Infrastructure: 'INFRA', Communication: 'COMMS', Security: 'SECURITY',
};

const AGENTS: Agent[] = [
  { name: 'Manager', role: 'NASI Manager', color: '#2cb8d4', status: 'Idle', initials: 'NM', department: 'Core' },
  { name: 'Research', role: 'Research Agent', color: '#2cb8d4', status: 'Idle', initials: 'RA', department: 'Research' },
  { name: 'Browser', role: 'Web Agent', color: '#2ebc7a', status: 'Idle', initials: 'WA', department: 'Web' },
  { name: 'Shopify', role: 'Shopify Agent', color: '#2ebc7a', status: 'Not Connected', initials: 'SA', department: 'Commerce' },
  { name: 'Computer', role: 'Computer Agent', color: '#c88a38', status: 'Not Connected', initials: 'CA', department: 'Infrastructure' },
  { name: 'Comm', role: 'Communication Agent', color: '#2cb8d4', status: 'Not Connected', initials: 'CO', department: 'Communication' },
  { name: 'File', role: 'File Agent', color: '#c88a38', status: 'Idle', initials: 'FA', department: 'Infrastructure' },
  { name: 'Security', role: 'Security Agent', color: '#c85548', status: 'Idle', initials: 'XA', department: 'Security' },
];
const PROVIDERS = [
  { id: 'gemini', name: 'Google Gemini', keyEnv: 'GEMINI_API_KEY' },
  { id: 'openai', name: 'OpenAI', keyEnv: 'OPENAI_API_KEY' },
  { id: 'claude', name: 'Anthropic Claude', keyEnv: 'CLAUDE_API_KEY' },
  { id: 'grok', name: 'xAI Grok', keyEnv: 'GROK_API_KEY' },
];

// Real ElevenLabs premade voice IDs (verified against the ElevenLabs library).
// Warm, friendly female voices first — NASI's default conversational tone.
const elevenlabsVoices: { id: string; name: string }[] = [
  { id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel' },
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah' },
  { id: 'cgSgspJ2msm6clMCkdW9', name: 'Jessica' },
  { id: 'AZnzlk1XvdvUeBnXmlld', name: 'Domi' },
  { id: 'XB0fDUnXUj1R11ebVAv', name: 'Arnold' },
  { id: 'pNInz6obpgDQGcFmaSg', name: 'Adam' },
];

const elevenlabsModels: { label: string; value: string }[] = [
  { label: 'Flash v2.5', value: 'eleven_flash_v2_5' },
  { label: 'Turbo v2.5', value: 'eleven_multilingual_v2_5' },
  { label: 'Multilingual v2', value: 'eleven_multilingual_v2' },
];

// ============================================================
// SYSTEM FEED — left intelligence panel
// ============================================================
function SystemFeed({ connectionStatus, coreState, memories, orchestrationText }: { connectionStatus: string; coreState: CoreState; memories: any[]; orchestrationText?: string | null }) {
  const [vectorStats, setVectorStats] = useState<any>(null);
  useEffect(() => {
    fetch('/api/vector-memory/stats').then(r => r.json()).then(setVectorStats).catch(() => {});
    const interval = setInterval(() => {
      fetch('/api/vector-memory/stats').then(r => r.json()).then(setVectorStats).catch(() => {});
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  const events = useMemo(() => [
    { time: 'NOW', text: `NASI Core: ${coreState}`, color: coreState === 'IDLE' ? '#1a5a3a' : '#2cb8d4' },
    { time: 'SYS', text: `Backend: ${connectionStatus}`, color: connectionStatus === 'online' ? '#2ebc7a' : '#c85548' },
    { time: 'MEM', text: `${vectorStats?.totalMemories ?? memories.length} memories (${vectorStats?.embeddingType || 'tfidf'})`, color: '#c88a38' },
    orchestrationText
      ? { time: 'Agt', text: orchestrationText, color: '#2ebc7a' }
      : { time: 'Agt', text: `${AGENTS.filter(a => a.status !== 'Not Connected').length} agents standing by`, color: '#2cb8d4' },
    { time: 'NET', text: 'Voice pipeline: Browser STT + ElevenLabs TTS', color: '#5a7a8a' },
    { time: 'SEC', text: 'Security monitoring active', color: '#c85548' },
  ], [connectionStatus, coreState, memories.length, vectorStats, orchestrationText]);

  return (
    <div className="nasi-feed">
      <div className="nasi-feed-section">
        <div className="nasi-feed-header"><Wifi size={9} /><span>META LINK</span><div className={`nasi-feed-status ${connectionStatus}`} /></div>
        <div className={`nasi-feed-card ${connectionStatus === 'online' ? 'online' : 'offline'}`}>
          <div className="nasi-feed-card-title"><span className="nasi-feed-card-dot" />SYSTEM {connectionStatus === 'online' ? 'ONLINE' : 'OFFLINE'}</div>
          <div className="nasi-feed-card-sub">NASI AI v1.0 — {coreState}</div>
        </div>
      </div>
      <div className="nasi-feed-section">
        <div className="nasi-feed-header"><RadioIcon size={9} /><span>SAT-LINK FEED</span></div>
        <div className="nasi-feed-events">
          {events.map((ev, i) => (
            <div key={i} className="nasi-feed-event">
              <span className="nasi-feed-event-time" style={{ color: ev.color }}>{ev.time}</span>
              <span className="nasi-feed-event-text">{ev.text}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="nasi-feed-section">
        <div className="nasi-feed-header"><Globe2 size={9} /><span>GLOBAL NETWORK</span><span className="nasi-feed-badge">BETA</span></div>
      </div>
    </div>
  );
}

// ============================================================
// AGENT TOWN PANEL — large bottom section
// ============================================================
function AgentTownPanel({ agents, onSelectAgent }: { agents: Agent[]; onSelectAgent: (a: Agent) => void }) {
  const [expanded, setExpanded] = useState(true);
  // Live delegation state — drives which agent shows as ACTIVE right now.
  const o = useOrchestration();
  const liveAgents = useMemo(() => applyLiveStatus(agents, o), [agents, o]);
  const livePhase = o.phase;
  const liveAgent = o.agent;
  const liveReason = o.route?.reason ?? null;
  const anyAgentActive = liveAgents.some(a => isActiveStatus(a.status));
  const departments = useMemo(() => {
    const map = new Map<string, Agent[]>();
    liveAgents.forEach(a => { if (!map.has(a.department)) map.set(a.department, []); map.get(a.department)!.push(a); });
    return Array.from(map.entries());
  }, [liveAgents]);

  return (
    <div className="nasi-agent-town">
      <div className="nasi-agent-town-header" onClick={() => setExpanded(!expanded)}>
        <div className="nasi-agent-town-title"><span className={`nasi-agent-town-dot ${anyAgentActive ? 'live' : 'idle'}`} /><Users size={11} /><span>AGENT TOWN</span><span className="nasi-agent-town-count">{liveAgents.filter(a => isActiveStatus(a.status) || a.status === 'Idle').length}/{liveAgents.length}</span></div>
        {livePhase !== 'idle' && (
          <span className={`nasi-agent-town-delegate ${livePhase}`}>
            {livePhase === 'delegating' ? 'MANAGER DELEGATING…' : livePhase === 'working' ? `${(liveAgent || 'AGENT').toUpperCase()} WORKING` : 'TASK COMPLETE'}
            {liveReason ? ` · ${liveReason}` : ''}
          </span>
        )}
        <div className="nasi-agent-town-tabs">
          <button className="nasi-agent-tab active">staff</button>
          <button className="nasi-agent-tab">agents</button>
          <button className="nasi-agent-tab">visual hub</button>
        </div>
        <ChevronDown size={12} className={`nasi-agent-town-chevron ${expanded ? 'expanded' : ''}`} />
      </div>
      {expanded && (
        <div className="nasi-agent-town-body">
          {/* Compact roster: face + name + status dot for every agent */}
          <div className="nasi-roster-row">
            {liveAgents.map(a => (
              <button key={a.name} className={`nasi-roster-pill ${isActiveStatus(a.status) ? 'active' : ''}`}
                style={{ '--agent-color': a.color } as any} onClick={() => onSelectAgent(a)}
                data-tip={`${a.name} — ${a.status}`} aria-label={`${a.name}, ${a.status}`}>
                <span className="nasi-roster-face" style={{ background: a.color }}>{a.initials}</span>
                <span className="nasi-roster-name">{a.name}</span>
                <span className={`nasi-roster-dot ${statusClass(a.status)}`} />
              </button>
            ))}
          </div>
          <div className="nasi-agent-town-office">
            <SectionBoundary name="Agent Office">
              <AgentOffice agents={liveAgents} onSelectAgent={onSelectAgent} focusAgent={liveAgent} />
            </SectionBoundary>
          </div>
          <div className="nasi-agent-town-departments">
            {departments.map(([dept, deptAgents]) => {
              const anyActive = deptAgents.some(a => isActiveStatus(a.status));
              const allIdle = deptAgents.every(a => a.status === 'Idle');
              const state = anyActive ? 'active' : allIdle ? 'idle' : 'offline';
              const lead = deptAgents.find(a => isActiveStatus(a.status)) || deptAgents[0];
              return (
                <button key={dept} className={`nasi-dept-pill ${state}`}
                  style={{ '--agent-color': lead.color } as any}
                  onClick={() => onSelectAgent(lead)}
                  title={`${dept} · ${deptAgents.map(a => `${a.name} (${a.status})`).join(', ')}`}>
                  <span className="nasi-dept-pill-icon" style={{ background: lead.color }} />
                  <span className="nasi-dept-pill-name">{DEPT_SHORT[dept] || dept.toUpperCase().slice(0, 7)}</span>
                  <span className={`nasi-dept-pill-dot ${state}`} />
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// LIVE CONSOLE PANEL — Right tabbed panel (Voice / Agent / Notes)
// ============================================================
function LiveConsolePanel({
  coreState, liveVoiceActive, micStatus, transcript, lastTranscript, voiceLog, errorMessage,
  agents, messages, command, setCommand, handleSend, isSending,
  startListening, stopSpeech, toggleLiveVoice, onSelectAgent,
}: {
  coreState: CoreState; liveVoiceActive: boolean; micStatus: string; transcript: string;
  lastTranscript: string; voiceLog: string[]; errorMessage: string | null;
  agents: Agent[]; messages: Message[]; command: string; setCommand: (s: string) => void;
  handleSend: (s: string) => void; isSending: boolean;
  startListening: () => void; stopSpeech: () => void; toggleLiveVoice: () => void;
  onSelectAgent: (a: Agent) => void;
}) {
  const [tab, setTab] = useState<'voice' | 'agent' | 'notes'>('voice');
  const consoleRef = useRef<HTMLDivElement>(null);
  const [notes, setNotes] = useState('');
  // Same live delegation state as Agent Town — one source of truth.
  const orch = useOrchestration();
  const liveAgents = useMemo(() => applyLiveStatus(agents, orch), [agents, orch]);

  // Auto-scroll console output
  useEffect(() => { if (consoleRef.current) consoleRef.current.scrollTop = consoleRef.current.scrollHeight; }, [voiceLog, tab, messages]);

  const ts = () => new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });

  return (
    <div className="nasi-console-panel">
      <div className="nasi-console-tabs">
        <button className={`nasi-console-tab ${tab === 'voice' ? 'active' : ''}`} onClick={() => setTab('voice')}>
          <Mic size={9} /> VOICE
        </button>
        <button className={`nasi-console-tab ${tab === 'agent' ? 'active' : ''}`} onClick={() => setTab('agent')}>
          <Users size={9} /> AGENT
        </button>
        <button className={`nasi-console-tab ${tab === 'notes' ? 'active' : ''}`} onClick={() => setTab('notes')}>
          <MessageSquare size={9} /> NOTES
        </button>
      </div>

      <div className="nasi-console-body" ref={consoleRef}>
        {/* ═══ VOICE TAB ═══ */}
        {tab === 'voice' && (
          <div className="nasi-voice-section">
            {/* Voice controls */}
            <div className="nasi-voice-controls">
              <button className={`nasi-mic ${coreState === 'LISTENING' ? 'listening' : coreState === 'SPEAKING' ? 'speaking' : ''}`}
                onClick={() => { if (liveVoiceActive) toggleLiveVoice(); else startListening(); }}><Mic size={18} /></button>
              <button className={`nasi-stop-btn ${coreState === 'SPEAKING' ? 'active' : ''}`} onClick={stopSpeech} disabled={coreState !== 'SPEAKING'}><VolumeX size={12} /></button>
              <div className="nasi-voice-sep" />
              <button className={`nasi-live-btn ${liveVoiceActive ? 'active' : ''}`} onClick={toggleLiveVoice}>
                {liveVoiceActive ? <PhoneOff size={9} /> : <Phone size={9} />}
                <span>{liveVoiceActive ? 'LIVE' : 'LIVE'}</span>
              </button>
              <div className="nasi-voice-sep" />
              <span className={`nasi-state-label ${coreState !== 'IDLE' ? 'active' : ''}`}>{coreState === 'IDLE' ? 'READY' : coreState}</span>
            </div>

            {/* Waveform */}
            <div className={`nasi-waveform ${coreState === 'LISTENING' ? 'listening' : coreState === 'SPEAKING' ? 'speaking' : ''}`}>
              {coreState === 'IDLE' ? (
                <div className="nasi-wave-idle">
                  <span className="nasi-wave-idle-dots"><i /><i /><i /></span>
                  <span className="nasi-wave-idle-text">WAITING</span>
                </div>
              ) : (
                Array.from({ length: 40 }).map((_, i) => (<div key={i} className="nasi-wavebar" style={{ animationDelay: `${i * 0.025}s` }} />))
              )}
            </div>

            {errorMessage && <div className="nasi-error-bar"><AlertTriangle size={12} /><span>{errorMessage}</span></div>}

            {/* Voice log */}
            {voiceLog.map((log, i) => (
              <div key={i} className="nasi-console-line">
                <span className="nasi-console-ts">{ts()}</span>
                <span className="nasi-console-badge voice">VOICE</span>
                <span className="nasi-console-text dim">{log}</span>
              </div>
            ))}

            {/* Transcript */}
            {transcript && (
              <div className="nasi-console-line">
                <span className="nasi-console-ts">{ts()}</span>
                <span className="nasi-console-badge user">USER</span>
                <span className="nasi-console-text">{transcript}</span>
              </div>
            )}

            {/* Messages as console output */}
            {messages.map((msg, i) => (
              <div key={i} className="nasi-console-line">
                <span className="nasi-console-ts">{msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }) : ts()}</span>
                <span className={`nasi-console-badge ${msg.from === 'user' ? 'user' : 'nasi'}`}>{msg.from === 'user' ? 'USER' : 'NASI'}</span>
                <span className="nasi-console-text">{msg.text.length > 200 ? msg.text.slice(0, 200) + '...' : msg.text}</span>
              </div>
            ))}

            {isSending && (
              <div className="nasi-console-line">
                <span className="nasi-console-ts">{ts()}</span>
                <span className="nasi-console-badge nasi">NASI</span>
                <span className="nasi-console-text dim">processing...</span>
              </div>
            )}
          </div>
        )}

        {/* ═══ AGENT TAB ═══ */}
        {tab === 'agent' && (
          <div className="nasi-agent-console-list">
            <div className="nasi-console-line" style={{ borderBottom: 'none', paddingBottom: 4 }}>
              <span className="nasi-console-badge system">SYS</span>
              <span className="nasi-console-text dim">Agent Manager online · {liveAgents.filter(a => isActiveStatus(a.status) || a.status === 'Idle').length}/{liveAgents.length} agents ready</span>
            </div>
            {liveAgents.map(a => (
              <div key={a.name} className="nasi-agent-console-item" onClick={() => onSelectAgent(a)}>
                <div className="nasi-agent-console-avatar" style={{ background: a.color }}>{a.initials}</div>
                <div className="nasi-agent-console-info">
                  <div className="nasi-agent-console-name">{a.name}</div>
                  <div className="nasi-agent-console-role">{a.department} · {a.role}</div>
                </div>
                <span className={`nasi-agent-console-status ${statusClass(a.status)}`}>{a.status}</span>
              </div>
            ))}
          </div>
        )}

        {/* ═══ NOTES TAB ═══ */}
        {tab === 'notes' && (
          <div className="nasi-notes-section">
            <div className="nasi-voice-section-label">CONVERSATION</div>
            {messages.map((msg, i) => (
              <div key={i} className="nasi-console-line">
                <span className="nasi-console-ts">{msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' }) : ''}</span>
                <span className={`nasi-console-badge ${msg.from === 'user' ? 'user' : 'nasi'}`}>{msg.from === 'user' ? 'U' : 'N'}</span>
                <span className="nasi-console-text">{msg.text.length > 300 ? msg.text.slice(0, 300) + '...' : msg.text}</span>
              </div>
            ))}
            <div style={{ marginTop: 'auto' }}>
              <div className="nasi-voice-section-label">PERSONAL NOTES</div>
              <textarea className="nasi-notes-input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Type notes here..." />
            </div>
          </div>
        )}
      </div>

      {/* Command input at bottom of console */}
      <div style={{ padding: '8px 10px', borderTop: '1px solid rgba(44,184,212,.05)' }}>
        <div className="nasi-command-input" style={{ maxWidth: '100%' }}>
          <input className="nasi-input" value={command} onChange={e => setCommand(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && command.trim()) handleSend(command); }} placeholder="Talk to NASI..." />
          <button className="nasi-input-mic" onClick={startListening} title="Voice"><Mic size={12} /></button>
          <button className="nasi-input-send" onClick={() => handleSend(command)} disabled={!command.trim() || isSending}><Send size={12} /></button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// MEMORY MODAL — with vector search and stats
// ============================================================
function MemoryModal({ memories, deleteMemory, clearMemories, onClose }: {
  memories: any[]; deleteMemory: (id: string) => void; clearMemories: () => Promise<void>; onClose: () => void;
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [memoryStats, setMemoryStats] = useState<{ totalMemories: number; embeddingType: string } | null>(null);

  useEffect(() => {
    fetch('/api/vector-memory/stats').then(r => r.json()).then(setMemoryStats).catch(() => {});
  }, []);

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) { setSearchResults([]); return; }
    setIsSearching(true);
    try {
      const res = await fetch(`/api/vector-memory/search?q=${encodeURIComponent(searchQuery)}&topK=20`);
      const data = await res.json();
      setSearchResults(data.results || []);
    } catch { setSearchResults([]); }
    finally { setIsSearching(false); }
  }, [searchQuery]);

  const displayList = searchQuery.trim() && searchResults.length > 0
    ? searchResults.map((r: any) => ({ ...r.memory, _score: r.score }))
    : memories;

  return (
    <div className="nasi-modal-bg" onClick={onClose}>
      <div className="nasi-modal nasi-memory-modal" onClick={e => e.stopPropagation()}>
        <button className="nasi-modal-close" onClick={onClose}><X size={14} /></button>
        <div className="nasi-modal-kicker"><Database size={12} /> MEMORY {memoryStats && <span style={{ marginLeft: 8, opacity: 0.6, fontSize: 10 }}>({memoryStats.totalMemories} stored · {memoryStats.embeddingType} embeddings)</span>}</div>

        {/* Search bar */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          <input className="nasi-settings-input" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSearch(); }}
            placeholder="Search memories semantically..." style={{ flex: 1 }} />
          <button className="nasi-modal-btn" onClick={handleSearch} disabled={isSearching} style={{ flexShrink: 0 }}>
            <Search size={10} /> {isSearching ? '...' : 'SEARCH'}
          </button>
        </div>
        {searchQuery.trim() && searchResults.length > 0 && (
          <div style={{ fontSize: 10, opacity: 0.5, marginBottom: 6 }}>
            {searchResults.length} semantic matches found
          </div>
        )}

        {displayList.length === 0 ? (
          <><div className="nasi-empty">{searchQuery.trim() ? 'No matching memories found' : 'No memories stored yet'}</div>
          <div className="nasi-empty-hint">Say "NASI, remember that..." to create a memory.</div></>
        ) : (
          <div className="nasi-memory-list">
            {displayList.map((m: any) => (
              <div key={m.id} className="nasi-memory-item">
                <div className="nasi-memory-item-header">
                  <span className="nasi-memory-category">{m.category}</span>
                  <span className="nasi-memory-importance">★ {m.importance}</span>
                  {m._score != null && <span style={{ fontSize: 9, color: '#00d9ff', opacity: 0.7 }}>({(m._score * 100).toFixed(0)}% match)</span>}
                </div>
                <div className="nasi-memory-key">{m.key}</div>
                <div className="nasi-memory-value">{m.value}</div>
                <button className="nasi-memory-delete" onClick={() => deleteMemory(m.id)}><Trash2 size={10} /></button>
              </div>
            ))}
          </div>
        )}
        <div className="nasi-settings-actions">
          {memories.length > 0 && <button className="nasi-modal-btn danger" onClick={async () => { await clearMemories(); setSearchResults([]); }}><Trash2 size={10} /> CLEAR ALL</button>}
          <button className="nasi-modal-btn" onClick={onClose}>CLOSE</button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// MAIN APP
// ============================================================
function App() {
  const [command, setCommand] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showMemory, setShowMemory] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [showConversations, setShowConversations] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [settings, setSettings] = useState<NasiSettings>(loadSettings);

  // ── Agent orchestration: Core → Manager → department agent ──
  // Shared store so Agent Town, the console and the office canvas all agree.
  const orchestration = useOrchestration();
  const orchestrationText = orchestrationLabel(orchestration);
  const agentTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  // Tracks whether the delegating→working hop has happened yet, so a task that
  // finishes faster than the hop still shows the routed agent working first.
  const delegationRef = useRef({ routed: false, done: false });

// Apply theme CSS variables from settings.theme whenever the theme changes
useEffect(() => {
  const root = document.documentElement;
  const body = document.body;
  const apply = (t: NasiSettings['theme']) => {
    if (t === 'cyan') {
      root.style.setProperty('--cyan', '#12ecff');
      root.style.setProperty('--cyan-dim', '#108fb0');
      root.style.setProperty('--emerald', '#0affa0');
      root.style.setProperty('--amber', '#ffb61f');
      root.style.setProperty('--crimson', '#ff5555');
      root.style.setProperty('--line', 'rgba(0, 245, 255, .18)');
      root.style.setProperty('--line-2', 'rgba(0, 245, 255, .34)');
      root.style.setProperty('--line-3', 'rgba(0, 245, 255, .48)');
      root.style.setProperty('--glow-cyan', 'rgba(0, 245, 255, .62)');
      body.style.background = '#000000';
    } else if (t === 'emerald') {
      root.style.setProperty('--cyan', '#00ff88');
      root.style.setProperty('--cyan-dim', '#109c5a');
      root.style.setProperty('--emerald', '#66ffbb');
      root.style.setProperty('--amber', '#ffd24a');
      root.style.setProperty('--crimson', '#ff5a5a');
      root.style.setProperty('--line', 'rgba(0, 255, 136, .18)');
      root.style.setProperty('--line-2', 'rgba(0, 255, 136, .34)');
      root.style.setProperty('--line-3', 'rgba(0, 255, 136, .48)');
      root.style.setProperty('--glow-cyan', 'rgba(0, 255, 136, .6)');
      body.style.background = '#000c06';
    } else if (t === 'crimson') {
      root.style.setProperty('--cyan', '#ff6644');
      root.style.setProperty('--cyan-dim', '#9f2e16');
      root.style.setProperty('--emerald', '#ff8a6a');
      root.style.setProperty('--amber', '#ffe2a0');
      root.style.setProperty('--crimson', '#ff2222');
      root.style.setProperty('--line', 'rgba(255, 102, 68, .18)');
      root.style.setProperty('--line-2', 'rgba(255, 102, 68, .34)');
      root.style.setProperty('--line-3', 'rgba(255, 102, 68, .48)');
      root.style.setProperty('--glow-cyan', 'rgba(255, 102, 68, .6)');
      body.style.background = '#0c0202';
    }
  };
  apply(settings.theme);
  return () => { root.style.setProperty('--cyan', '#12ecff'); root.style.setProperty('--line', 'rgba(0, 245, 255, .18)'); body.style.background = '#000000'; };
}, [settings.theme]);
  const [settingsDraft, setSettingsDraft] = useState<NasiSettings>(settings);
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [liveVoiceActive, setLiveVoiceActive] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [activeNode, setActiveNode] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const centerRef = useRef<HTMLDivElement>(null);
  const nodesRef = useRef<HTMLDivElement>(null);
  const coreRef = useRef<HTMLDivElement>(null);
  const [routes, setRoutes] = useState<{ id: string; color: string; d: string; tx: number; ty: number }[]>([]);

  // Measure actual DOM positions: trace starts at each node's right edge,
  // converges at the Core's exact center point.
  const measureRoutes = useCallback(() => {
    if (showChat) { setRoutes([]); return; }
    const center = centerRef.current, nodes = nodesRef.current, core = coreRef.current;
    const overlay = center?.querySelector<SVGSVGElement>('.nasi-routing-overlay');
    if (!center || !nodes || !core || !overlay) return;
    const cb = center.getBoundingClientRect();
    // Coordinates are measured against the SVG overlay itself — it is inset in
    // the core card, not the center panel, so using the panel would draw every
    // trace offset by the card's position within the panel.
    const sb = overlay.getBoundingClientRect();
    const coreB = core.getBoundingClientRect();
    const nodeEls = nodes.querySelectorAll<HTMLElement>('.nasi-routing-node');
    const defs = [
      { id: 'MEMORY', color: '#00d9ff' },
      { id: 'SKILLS', color: '#00e88a' },
      { id: 'SOUL', color: '#ffb347' },
      { id: 'SETTING', color: '#8fa3b8' },
    ];
    const next: { id: string; color: string; d: string; tx: number; ty: number }[] = [];
    nodeEls.forEach((el, ni) => {
      const id = el.dataset.nodeId;
      const def = defs.find(d => d.id === id);
      if (!def) return;
      const nb = el.getBoundingClientRect();
      // Guard: core center inside the panel bounds
      if (coreB.left < cb.left || coreB.right > cb.right) return;
      const sx = nb.right - sb.left;
      const sy = nb.top + nb.height / 2 - sb.top;
      const orbCx = coreB.left + coreB.width / 2 - sb.left;
      const cy = coreB.top + coreB.height / 2 - sb.top;
      // Traces run straight right from each node into the orb's LEFT side. Each
      // line lands on its own contact point down the orb's edge, so the four stay
      // parallel-ish instead of all four piling into one spot. The top and bottom
      // lines get a single gentle elbow; the middle two are near-straight.
      const entryX = coreB.left - sb.left - 4;
      // Bail only when the node's right edge actually reaches the orb. A
      // larger threshold silently erased every trace whenever the card's
      // flex layout shifted the nav column a few pixels toward the orb.
      if (entryX <= sx + 2) return;
      const spread = Math.min(15, coreB.height * 0.085);
      const entryY = cy + (ni - 1.5) * spread;
      // Staggered bend points so no two elbows sit on the same vertical line.
      const bendX = sx + (entryX - sx) * (0.46 + ni * 0.05);
      const d =
        `M ${sx.toFixed(1)},${sy.toFixed(1)} H ${bendX.toFixed(1)} ` +
        `Q ${entryX.toFixed(1)},${sy.toFixed(1)} ${entryX.toFixed(1)},${entryY.toFixed(1)}`;
      next.push({ id: def.id, color: def.color, d, tx: orbCx, ty: cy });
    });
    setRoutes(next);
  }, [showChat]);

  useEffect(() => {
    measureRoutes();
    const ro = new ResizeObserver(measureRoutes);
    if (centerRef.current) ro.observe(centerRef.current);
    window.addEventListener('resize', measureRoutes);
    return () => { ro.disconnect(); window.removeEventListener('resize', measureRoutes); };
  }, [measureRoutes, showChat]);

  useEffect(() => {
    if (activeNode) {
      const t = setTimeout(() => setActiveNode(null), 3200);
      return () => clearTimeout(t);
    }
  }, [activeNode]);

  const { conversations, activeConversation, activeConversationId, createConversation, selectConversation, addMessage, deleteConversation, newConversation } = useConversations();
  const { memories, createMemory, deleteMemory, clearMemories } = useMemories();
  const [coreState, setCoreState] = useState<CoreState>('IDLE');
  const sendCommandRef = useRef<(text: string, source: 'text' | 'voice') => Promise<void>>();

  const voiceConfig = useMemo(() => ({
    ttsLocaleHints: [settings.voiceLanguage, 'en-US', 'en-GB'],
    onTranscript: (text: string) => { if (text.trim() && sendCommandRef.current) sendCommandRef.current(text, 'voice'); },
    onStateChange: (state: CoreState) => { setCoreState(state); },
    // Always pass ElevenLabs key if available — useVoice will try it first,
    // falling back to browser TTS if it fails.
    elevenlabsApiKey: settings.elevenlabsApiKey || undefined,
    // Use customVoiceId if set, otherwise fall back to preset voice selection
    elevenlabsVoiceId: settings.customVoiceId || settings.elevenlabsVoiceId || undefined,
    elevenlabsModel: settings.elevenlabsModel || undefined,
  }), [settings]);

  const { micStatus, transcript, lastTranscript, voicesLoaded, voiceLog, errorMessage, startListening, stopAll, stopSpeech, speak, pushLog } = useVoice(voiceConfig);

  const speakWithSettings = useCallback(async (text: string) => {
    if (!settings.autoSpeak) {
      // Reset state so LIVE voice loop can continue
      setCoreState('IDLE');
      return;
    }
    const ttsText = text.length > 500 ? text.slice(0, 500) + '...' : text;
    await speak(ttsText, settings.voiceSpeed, settings.voicePitch, settings.voiceVolume);
  }, [settings.autoSpeak, settings.voiceSpeed, settings.voicePitch, settings.voiceVolume, speak]);

  const testVoice = useCallback(async () => {
    // Use settingsDraft values when inside Settings modal so the test button
    // reflects unsaved changes (API key, voice ID, etc.) instead of the stale saved state.
    const draftActive = showSettings;
    const apiKey = draftActive ? settingsDraft.elevenlabsApiKey : settings.elevenlabsApiKey;
    const voiceId = draftActive ? (settingsDraft.customVoiceId || settingsDraft.elevenlabsVoiceId) : (settings.customVoiceId || settings.elevenlabsVoiceId);
    const model = draftActive ? settingsDraft.elevenlabsModel : settings.elevenlabsModel;
    const speed = draftActive ? settingsDraft.voiceSpeed : settings.voiceSpeed;
    const pitch = draftActive ? settingsDraft.voicePitch : settings.voicePitch;
    const volume = draftActive ? settingsDraft.voiceVolume : settings.voiceVolume;
    // If ElevenLabs API key is available (from draft or saved), call it directly
    // to avoid stale closure issues with the useVoice hook.
    if (apiKey && apiKey.trim()) {
      pushLog(`TTS: TEST — calling ElevenLabs directly (key=${apiKey.slice(0,4)}..., voice=${voiceId})`, true);
      try {
        const res = await fetch('/api/voice/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: 'Hello, I am NASI. I am your personal AI assistant.',
            voiceId,
            model,
            stability: Math.max(0.1, Math.min(1, pitch * 0.7)),
            similarityBoost: Math.max(0.1, pitch),
            style: 0.2,
            apiKey,
          }),
        });
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({})) as any;
          const errMsg = errBody?.error || errBody?.detail || errBody?.message || `HTTP ${res.status}`;
          pushLog(`TTS: TEST ElevenLabs FAILED — ${errMsg}. Falling back to browser.`, true);
          await speak('Hello, I am NASI. I am your personal AI assistant.', speed, pitch, volume);
          return;
        }
        pushLog('TTS: TEST — ElevenLabs responded OK, playing audio...', true);
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.onended = () => URL.revokeObjectURL(url);
        audio.onerror = () => { URL.revokeObjectURL(url); pushLog('TTS: TEST — audio playback error', true); };
        await audio.play();
        pushLog('TTS: TEST — PROVIDER = ElevenLabs ✓', true);
      } catch (err: any) {
        pushLog(`TTS: TEST — ElevenLabs error: ${err?.message}. Falling back to browser.`, true);
        await speak('Hello, I am NASI. I am your personal AI assistant.', speed, pitch, volume);
      }
    } else {
      pushLog('TTS: TEST — no ElevenLabs key, using browser TTS', true);
      await speak('Hello, I am NASI. I am your personal AI assistant.', speed, pitch, volume);
    }
  }, [speak, showSettings, settingsDraft, settings, pushLog]);

  const messages: Message[] = useMemo(() => {
    if (!activeConversation) return [{ from: 'nasi', text: 'NASI online. Ready.' }];
    return activeConversation.messages.map(m => ({ from: m.role === 'user' ? 'user' as const : 'nasi' as const, text: m.text, source: m.source, timestamp: m.timestamp }));
  }, [activeConversation]);

  useEffect(() => { fetch('/api/health').then(r => r.json()).then(d => setConnectionStatus(d.status === 'ok' ? 'online' : 'offline')).catch(() => setConnectionStatus('offline')); }, []);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, showChat]);
  useEffect(() => { if (showSettings) { setSettingsSaved(false); } }, [showSettings]);

  const liveVoiceActiveRef = useRef(false);
  liveVoiceActiveRef.current = liveVoiceActive;
  useEffect(() => {
    if (!liveVoiceActive) return;
    if (coreState === 'IDLE' && !isSending) {
      const timer = setTimeout(() => { if (liveVoiceActiveRef.current) startListening(); }, 300);
      return () => clearTimeout(timer);
    }
  }, [liveVoiceActive, coreState, isSending]); // eslint-disable-line

  const systemInstruction = useMemo(() => getPersonalitySystemPrompt(settings.personality), [settings.personality]);

  // ── Sentence-aware TTS queue: speak the first sentence while the LLM is
  // still generating the rest. Cuts perceived latency massively in voice mode. ──
  const sentenceQueueRef = useRef<string[]>([]);
  const isSpeakingQueueRef = useRef(false);
  const queueDoneRef = useRef(false);

  const pumpSentenceQueue = useCallback(async () => {
    if (isSpeakingQueueRef.current) return;
    isSpeakingQueueRef.current = true;
    try {
      while (sentenceQueueRef.current.length > 0) {
        const sentence = sentenceQueueRef.current.shift()!;
        const ttsText = sentence.length > 500 ? sentence.slice(0, 500) + '...' : sentence;
        await speak(ttsText, settings.voiceSpeed, settings.voicePitch, settings.voiceVolume);
      }
    } finally {
      isSpeakingQueueRef.current = false;
      // Queue fully drained AND stream finished → back to IDLE so LIVE loop resumes
      if (queueDoneRef.current && sentenceQueueRef.current.length === 0) {
        queueDoneRef.current = false;
        setCoreState('IDLE');
      }
    }
  }, [speak, settings.voiceSpeed, settings.voicePitch, settings.voiceVolume]);

  const enqueueSentence = useCallback((text: string) => {
    if (!settings.autoSpeak || !text.trim()) return;
    sentenceQueueRef.current.push(text.trim());
    pumpSentenceQueue();
  }, [settings.autoSpeak, pumpSentenceQueue]);

  // ── Delegation timeline (Core → Manager → agent → idle) ──
  const clearAgentTimers = useCallback(() => {
    agentTimersRef.current.forEach(clearTimeout);
    agentTimersRef.current = [];
  }, []);
  useEffect(() => () => clearAgentTimers(), [clearAgentTimers]);

  // Close the turn out only after the agent has been visibly working for a beat.
  const finishDelegation = useCallback(() => {
    agentTimersRef.current.push(setTimeout(() => {
      setOrchestration({ phase: 'done' });
      agentTimersRef.current.push(setTimeout(() => { resetOrchestration(); }, 1200));
    }, 600));
  }, []);

  const beginDelegation = useCallback((text: string): AgentRoute => {
    clearAgentTimers();
    const route = routeCommand(text);
    delegationRef.current = { routed: false, done: false };
    // 1) Core hands the task to the Manager
    setOrchestration({ phase: 'delegating', agent: null, route });
    // 2) Manager delegates to the routed department agent
    agentTimersRef.current.push(setTimeout(() => {
      delegationRef.current.routed = true;
      setOrchestration({ phase: 'working', agent: route.agent });
      // The turn may already be over — only then close it out, so the working
      // state is always visible even for very fast replies.
      if (delegationRef.current.done) finishDelegation();
    }, 450));
    return route;
  }, [clearAgentTimers, finishDelegation]);

  const endDelegation = useCallback(() => {
    const st = delegationRef.current;
    st.done = true;
    // If the hop hasn't fired yet, let it close the turn out (see above).
    if (!st.routed) return;
    clearAgentTimers();
    finishDelegation();
  }, [clearAgentTimers, finishDelegation]);

  const sendCommand = useCallback(async (text: string, source: 'text' | 'voice' = 'text') => {
    if (!text || isSending) return;
    setIsSending(true);
    const memCmd = parseMemoryCommand(text);
    if (memCmd) {
      try {
        if (memCmd.type === 'remember') {
          await createMemory(memCmd.category, memCmd.key, memCmd.value, 5, activeConversationId || undefined);
          const response = getMemoryResponse(memCmd);
          if (activeConversationId) { await addMessage(activeConversationId, 'user', text, source); await addMessage(activeConversationId, 'assistant', response, 'text'); }
          else { const conv = await createConversation(text); if (conv) await addMessage(conv.id, 'assistant', response, 'text'); }
          setIsSending(false); if (source === 'voice') speakWithSettings(response); return;
        }
        if (memCmd.type === 'forget') {
          const match = memories.find(m => m.key.toLowerCase().includes(memCmd.key.toLowerCase()) || m.value.toLowerCase().includes(memCmd.key.toLowerCase()));
          if (match) await deleteMemory(match.id);
          const response = getMemoryResponse(memCmd);
          if (activeConversationId) { await addMessage(activeConversationId, 'user', text, source); await addMessage(activeConversationId, 'assistant', response, 'text'); }
          setIsSending(false); if (source === 'voice') speakWithSettings(response); return;
        }
        if (memCmd.type === 'forget_all') {
          await clearMemories();
          const response = getMemoryResponse(memCmd);
          if (activeConversationId) { await addMessage(activeConversationId, 'user', text, source); await addMessage(activeConversationId, 'assistant', response, 'text'); }
          setIsSending(false); if (source === 'voice') speakWithSettings(response); return;
        }
        if (memCmd.type === 'recall') {
          const response = getMemoryResponse(memCmd);
          const memoryList = memories.length > 0 ? memories.map(m => `• ${m.key}: ${m.value}`).join('\n') : "I don't have any memories stored yet.";
          const fullResponse = `${response}\n\n${memoryList}`;
          if (activeConversationId) { await addMessage(activeConversationId, 'user', text, source); await addMessage(activeConversationId, 'assistant', fullResponse, 'text'); }
          setIsSending(false); if (source === 'voice') speakWithSettings(fullResponse); return;
        }
      } catch (err) { console.warn('[Memory] Error:', err); }
    }
    let convId = activeConversationId;
    if (!convId) { const conv = await createConversation(text); if (conv) convId = conv.id; else { setIsSending(false); return; }    } else { await addMessage(convId, 'user', text, source); }
    // Route the intent and hand it to the Manager → department agent.
    beginDelegation(text);
    // Voice path uses streaming + sentence-level TTS; text path uses plain JSON.
    const isVoice = source === 'voice';
    sentenceQueueRef.current = [];
    isSpeakingQueueRef.current = false;
    queueDoneRef.current = false;
    const turnStart = performance.now();
    try {
      let responseText = '';
      if (isVoice) {
        pushLog(`⏱ Voice turn started (STT done)`);
        // Streaming SSE — speak each sentence as soon as it completes
        const res = await fetch('/api/gemini/generate-stream', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: text, systemInstruction, conversationId: convId, apiKey: settings.geminiApiKey || undefined }),
        });
        if (!res.ok || !res.body) throw new Error(`Stream HTTP ${res.status}`);
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let sseBuf = '';        // raw SSE text, split on blank lines into events
        let sentenceBuf = '';   // decoded reply text, split into sentences for TTS
        let fullText = '';
        let firstChunkLogged = false;

        const emitSentences = () => {
          // Emit complete sentences (keeping delimiters), leave the tail in buffer
          const m = sentenceBuf.match(/^[\s\S]*?[.!?۔؟]+(?:\s+|$)/);
          if (m) {
            const sentence = m[0].trim();
            sentenceBuf = sentenceBuf.slice(m[0].length);
            if (sentence) enqueueSentence(sentence);
          }
        };

        const handleSseEvent = (raw: string) => {
          let ev = 'chunk';
          let dataStr = '';
          for (const line of raw.split('\n')) {
            if (line.startsWith('event: ')) ev = line.slice(7).trim();
            else if (line.startsWith('data: ')) dataStr += line.slice(6);
          }
          if (!dataStr) return;
          let payload: any;
          try { payload = JSON.parse(dataStr); } catch { return; }
          if (ev === 'chunk' && payload.text) {
            if (!firstChunkLogged) {
              firstChunkLogged = true;
              pushLog(`⏱ LLM first token: ${Math.round(performance.now() - turnStart)}ms`);
            }
            fullText += payload.text;
            sentenceBuf += payload.text;
            emitSentences();
          } else if (ev === 'done') {
            const t = payload.timings || {};
            pushLog(`⏱ Server: mem ${t['Memory retrieval (server)'] ?? '?'}ms · LLM ${payload.totalMs ?? '?'}ms total`);
          }
        };

        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          sseBuf += decoder.decode(value, { stream: true });
          // SSE events are separated by blank lines (\n\n)
          let idx: number;
          while ((idx = sseBuf.indexOf('\n\n')) >= 0) {
            const rawEvent = sseBuf.slice(0, idx);
            sseBuf = sseBuf.slice(idx + 2);
            if (rawEvent.trim()) handleSseEvent(rawEvent);
          }
        }
        // Flush trailing SSE event (if stream ended without a final blank line)
        if (sseBuf.trim()) handleSseEvent(sseBuf);
        // Flush remaining sentence fragment so nothing is dropped
        if (sentenceBuf.trim()) { enqueueSentence(sentenceBuf.trim()); sentenceBuf = ''; }
        responseText = fullText;
      } else {
        const res = await fetch('/api/gemini/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: text, systemInstruction, conversationId: convId, apiKey: settings.geminiApiKey || undefined }) });
        const data = await res.json();
        responseText = data.text || 'Command received.';
        if (data.status === 'simulated' || data.status === 'autonomous_fallback') {
          responseText = `${responseText}\n\n⚠ AI provider offline`;
        }
      }
      await addMessage(convId, 'assistant', responseText || 'Command received.', 'text');
      if (isVoice && responseText) {
        // Flush any remaining sentence fragment from the stream
        if (!settings.autoSpeak) { setCoreState('IDLE'); }
        else {
          queueDoneRef.current = true;
          if (sentenceQueueRef.current.length === 0 && !isSpeakingQueueRef.current) setCoreState('IDLE');
        }
      } else if (isVoice) {
        setCoreState('IDLE');
      }
    } catch (err: any) {
      pushLog(`⏱ Voice turn failed after ${Math.round(performance.now() - turnStart)}ms — ${err?.message || err}`);
      if (convId) await addMessage(convId, 'assistant', 'Channel unavailable. Check API key in Settings.', 'text');
      if (isVoice) setCoreState('IDLE');
    } finally { setIsSending(false); endDelegation(); }
  }, [isSending, activeConversationId, systemInstruction, memories, settings.geminiApiKey, settings.autoSpeak, createConversation, addMessage, createMemory, deleteMemory, clearMemories, speakWithSettings, enqueueSentence, pushLog, setCoreState, beginDelegation, endDelegation]);

  sendCommandRef.current = sendCommand;

  const handleSend = useCallback((text: string) => {
    if (!text.trim() || isSending) return;
    sendCommand(text.trim()); setCommand('');
  }, [isSending, sendCommand]);

  // Auto-save settings to localStorage on every draft change (debounced)
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    // Skip auto-save on initial mount (settingsDraft === settings at startup)
    if (settingsDraft === settings) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      saveSettings(settingsDraft);
      setSettings(settingsDraft);
    }, 400); // 400ms debounce
    return () => { if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current); };
  }, [settingsDraft]); // eslint-disable-line

  const handleSaveSettings = () => {
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    saveSettings(settingsDraft);
    setSettings(settingsDraft);
    setSettingsSaved(true);
    setTimeout(() => setSettingsSaved(false), 2000);
  };
  const exportSettings = useCallback(() => {
    const blob = new Blob([JSON.stringify(settingsDraft, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `nasi-settings-${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }, [settingsDraft]);
  const importSettings = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const text = await file.text();
    if (!text) return;
    try {
      const parsed = JSON.parse(text) as Partial<NasiSettings>;
      const merged = { ...settingsDraft, ...parsed } as NasiSettings;
      setSettingsDraft(merged); setSettings(merged);
      saveSettings(merged);
      setSettingsSaved(true); setTimeout(() => setSettingsSaved(false), 2000);
    } catch (err) { console.warn('[Settings] Import failed:', err); }
    e.target.value = '';
  }, [settingsDraft]);
  const toggleLiveVoice = () => { if (liveVoiceActive) { setLiveVoiceActive(false); stopAll(); } else { setLiveVoiceActive(true); startListening(); } };

  return (
    <div className="nasi-app">
      {/* ═══════ HEADER ═══════ */}
      <header className="nasi-topbar">
        <div className="nasi-brand">
          <button className="nasi-icon-btn" onClick={() => setShowConversations(!showConversations)} title="Conversations">
            {showConversations ? <ChevronLeft size={15} /> : <MessageSquare size={15} />}
          </button>
          <svg className="nasi-logo" viewBox="0 0 32 32">
            <circle cx="16" cy="16" r="14" fill="none" stroke="#122838" strokeWidth="0.7" opacity="0.7" />
            <circle cx="16" cy="16" r="10" fill="none" stroke="#122838" strokeWidth="0.4" strokeDasharray="2 3" opacity="0.6" />
            <circle cx="16" cy="16" r="5" fill="#122838" opacity="0.4" />
            <circle cx="16" cy="16" r="2" fill="#2cb8d4" />
          </svg>
          <span className="nasi-brandname">NASI</span>
        </div>
        <div className="nasi-topbar-center">
          <button className={`nasi-topbar-btn ${!showChat ? 'active' : ''}`} onClick={() => setShowChat(false)}>HOME</button>
          <button className={`nasi-topbar-btn ${showChat ? 'active' : ''}`} onClick={() => setShowChat(true)}>CHAT</button>
        </div>
        <div className="nasi-topbar-actions">
          <div className={`nasi-status-dot ${connectionStatus}`} title={`Backend: ${connectionStatus}`} />
          <button className="nasi-icon-btn" onClick={() => setShowMemory(true)} title="Memory"><Database size={16} /></button>
          <button className="nasi-icon-btn" onClick={() => setShowSettings(true)} title="Settings"><Settings2 size={16} /></button>
        </div>
      </header>

      {/* ═══════ SIDEBAR ═══════ */}
      {showConversations && (
        <div className="nasi-sidebar">
          <div className="nasi-sidebar-header">
            <span className="nasi-sidebar-title">CONVERSATIONS</span>
            <button className="nasi-sidebar-new" onClick={() => { newConversation(); setShowConversations(false); }}><Plus size={14} /></button>
          </div>
          <div className="nasi-sidebar-list">
            {conversations.length === 0 && <div className="nasi-sidebar-empty">No conversations yet</div>}
            {conversations.map(conv => (
              <button key={conv.id} className={`nasi-sidebar-item ${conv.id === activeConversationId ? 'active' : ''}`}
                onClick={() => { selectConversation(conv.id); setShowConversations(false); setShowChat(true); }}>
                <div className="nasi-sidebar-item-text">{conv.title}</div>
                <div className="nasi-sidebar-item-meta"><Clock size={9} /><span>{new Date(conv.updatedAt).toLocaleDateString()}</span></div>
                <button className="nasi-sidebar-item-delete" onClick={(e) => { e.stopPropagation(); deleteConversation(conv.id); }}><Trash2 size={10} /></button>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ═══════ HOME — COMMAND CENTER ═══════ */}
      {!showChat && (
        <div className="nasi-command-center">
          {/* LEFT: Intelligence Panel */}
          <aside className="nasi-left-panel">
            <SectionBoundary name="System Feed">
              <SystemFeed connectionStatus={connectionStatus} coreState={coreState} memories={memories} orchestrationText={orchestrationText} />
            </SectionBoundary>
            <div className="nasi-left-globe">
              <SectionBoundary name="World Globe">
                <WorldGlobe />
              </SectionBoundary>
            </div>
          </aside>

          {/* CENTER: Neural Routing + Core */}
          <div className="nasi-center-panel" ref={centerRef}>
            {/* Neural routing card — nav + routing lines + Core in one bounded panel */}
            <div className="nasi-core-card">
              <div className="nasi-core-card-label">
                <span className="nasi-core-card-dot" />
                NEURAL PIPELINE · {coreState === 'IDLE' ? 'STANDBY' : coreState}
              </div>
            {/* Routing nodes — left column, each line starts at its right edge */}
            <div className="nasi-routing-nodes" ref={nodesRef}>
              {[
                { id: 'MEMORY', color: '#00d9ff', icon: <Database size={11} />, action: () => setShowMemory(true) },
                { id: 'SKILLS', color: '#00e88a', icon: <Zap size={11} />, action: () => setShowChat(true) },
                { id: 'SOUL', color: '#ffb347', icon: <BrainCircuit size={11} />, action: () => setShowSettings(true) },
                { id: 'SETTING', color: '#8fa3b8', icon: <Settings2 size={11} />, action: () => setShowSettings(true) },
              ].map((n, i) => (
                <button key={n.id} data-node-id={n.id}
                  className={`nasi-routing-node ${activeNode === n.id ? 'active' : ''}`}
                  style={{ '--node-color': n.color } as any}
                  onClick={() => { setActiveNode(n.id); n.action(); }}>
                  <div className="nasi-routing-node-icon">{n.icon}</div>
                  <span className="nasi-routing-node-label">{n.id}</span>
                  <div className="nasi-routing-node-dot" />
                </button>
              ))}
            </div>

            {/* Circuit traces — measured from each node's right edge to the Core's exact center */}
            <svg className="nasi-routing-overlay">
              {routes.map((r, i) => (
                <g key={r.id} data-route-id={r.id} className={`nasi-route-group ${activeNode === r.id ? 'active' : ''}`} style={{ color: r.color }}>
                  <path className="nasi-route-glow" d={r.d} stroke={r.color} />
                  <path className="nasi-route-base" d={r.d} stroke={r.color} />
                  <path className="nasi-route-flow" d={r.d} stroke={r.color} style={{ animationDelay: `${i * 0.3}s` }} />
                  <circle className="nasi-route-particle" r="2.4" fill={r.color} style={{ color: r.color }}>
                    <animateMotion dur={`${2.2 + i * 0.25}s`} repeatCount="indefinite" path={r.d} />
                  </circle>
                  <circle className="nasi-route-particle dual" r="1.5" fill={r.color} style={{ color: r.color }}>
                    <animateMotion dur={`${2.2 + i * 0.25}s`} begin={`-${(1.1 + i * 0.12).toFixed(2)}s`} repeatCount="indefinite" path={r.d} />
                  </circle>
                </g>
              ))}
              {routes[0] && (
                <g>
                  <circle className="nasi-route-converge" cx={routes[0].tx} cy={routes[0].ty} r="5" fill="none" stroke="rgba(0,217,255,.3)" strokeWidth="1">
                    <animate attributeName="r" values="4;11;4" dur="2.4s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values=".3;.05;.3" dur="2.4s" repeatCount="indefinite" />
                  </circle>
                </g>
              )}
            </svg>

            {/* Core — right side */}
            <div className="nasi-core-area">
              <SectionBoundary name="NASI Core">
                <div className="nasi-core-wrapper" ref={coreRef}>
                  <NASICore state={coreState} />
                  <div className="nasi-core-label">
                    <span className="nasi-core-name">NASI</span>
                    <span className="nasi-core-subtitle">AI CORE</span>
                    <span className={`nasi-core-state ${coreState !== 'IDLE' ? 'active' : ''}`}>{coreState === 'IDLE' ? 'STANDBY' : coreState}</span>
                  </div>
                </div>
              </SectionBoundary>

              <button className={`nasi-start-btn ${liveVoiceActive ? 'live' : ''}`} onClick={() => { if (liveVoiceActive) toggleLiveVoice(); else startListening(); }}>
                {liveVoiceActive ? <><PhoneOff size={14} /> STOP</> : <><Mic size={14} /> {coreState === 'IDLE' ? 'START NASI' : coreState}</>}
              </button>
            </div>
            </div>

            {/* AGENT TOWN — second stacked card inside the center column */}
            <AgentTownPanel agents={AGENTS} onSelectAgent={(a) => setSelectedAgent(a)} />
          </div>

          {/* RIGHT: Tabbed Console — Voice / Agent / Notes */}
          <LiveConsolePanel
            coreState={coreState}
            liveVoiceActive={liveVoiceActive}
            micStatus={micStatus}
            transcript={transcript}
            lastTranscript={lastTranscript}
            voiceLog={voiceLog}
            errorMessage={errorMessage}
            agents={AGENTS}
            messages={messages}
            command={command}
            setCommand={setCommand}
            handleSend={handleSend}
            isSending={isSending}
            startListening={startListening}
            stopSpeech={stopSpeech}
            toggleLiveVoice={toggleLiveVoice}
            onSelectAgent={setSelectedAgent}
          />
        </div>
      )}

      {/* ═══════ CHAT VIEW ═══════ */}
      {showChat && (
        <div className="nasi-chat-view">
          <div className="nasi-chat-messages">
            {messages.map((msg, i) => (
              <div key={i} className={`nasi-chat-msg ${msg.from}`}>
                <div className="nasi-chat-msg-avatar">{msg.from === 'nasi' ? <BrainCircuit size={14} /> : <span>U</span>}</div>
                <div className="nasi-chat-msg-content">
                  <div className="nasi-chat-msg-header">
                    <span className="nasi-chat-msg-name">{msg.from === 'nasi' ? settings.assistantName : 'You'}</span>
                    {msg.source && <span className="nasi-chat-msg-source">{msg.source}</span>}
                  </div>
                  <div className="nasi-chat-msg-text">{msg.text}</div>
                </div>
              </div>
            ))}
            {isSending && (
              <div className="nasi-chat-msg nasi">
                <div className="nasi-chat-msg-avatar"><BrainCircuit size={14} /></div>
                <div className="nasi-chat-msg-content">
                  <div className="nasi-chat-msg-header"><span className="nasi-chat-msg-name">{settings.assistantName}</span></div>
                  <div className="nasi-chat-typing"><span /><span /><span /></div>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
          <div className="nasi-chat-input-area">
            <div className="nasi-command-input">
              <input className="nasi-input" value={command} onChange={e => setCommand(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && command.trim()) handleSend(command); }} placeholder={`Message ${settings.assistantName}...`} />
              <button className={`nasi-input-mic ${coreState === 'LISTENING' ? 'listening' : ''}`} onClick={startListening}><Mic size={12} /></button>
              <button className="nasi-input-send" onClick={() => handleSend(command)} disabled={!command.trim() || isSending}><Send size={12} /></button>
            </div>
            <div className="nasi-chat-controls">
              <button className={`nasi-live-btn ${liveVoiceActive ? 'active' : ''}`} onClick={toggleLiveVoice}>
                {liveVoiceActive ? <PhoneOff size={9} /> : <Phone size={9} />}<span>{liveVoiceActive ? 'STOP LIVE' : 'LIVE VOICE'}</span>
              </button>
              <span className={`nasi-state-label ${coreState !== 'IDLE' ? 'active' : ''}`}>{coreState === 'IDLE' ? 'READY' : coreState}</span>
            </div>
          </div>
        </div>
      )}

      {/* ═══════ SETTINGS MODAL ═══════ */}
      {showSettings && (
        <div className="nasi-modal-bg" onClick={() => setShowSettings(false)}>
          <div className="nasi-modal nasi-settings-modal" onClick={e => e.stopPropagation()}>
            <button className="nasi-modal-close" onClick={() => setShowSettings(false)}><X size={14} /></button>
            <div className="nasi-modal-kicker"><Settings2 size={10} /> SETTINGS</div>
            <SettingsGroup title="GENERAL" icon={<Settings2 size={9} />}>
              <SettingsInput label="ASSISTANT NAME" value={settingsDraft.assistantName} onChange={v => setSettingsDraft(s => ({ ...s, assistantName: v }))} />
              <SettingsChips label="ANIMATION" options={[{ label: 'Low', value: 'low' }, { label: 'Medium', value: 'medium' }, { label: 'High', value: 'high' }]} selected={settingsDraft.animationIntensity} onChange={v => setSettingsDraft(s => ({ ...s, animationIntensity: v as any }))} />
            </SettingsGroup>
            <SettingsGroup title="VOICE" icon={<Speaker size={9} />}>
              <SettingsChips label="PROVIDER" options={[{ label: 'Browser TTS', value: 'browser' }, { label: 'ElevenLabs', value: 'elevenlabs' }]} selected={settingsDraft.voiceProvider} onChange={v => setSettingsDraft(s => ({ ...s, voiceProvider: v as any }))} />
              <SettingsChips label="LANGUAGE" options={[{ label: 'English', value: 'en-US' }, { label: 'Urdu', value: 'ur-PK' }, { label: 'Auto', value: '' }]} selected={settingsDraft.voiceLanguage} onChange={v => setSettingsDraft(s => ({ ...s, voiceLanguage: v }))} />
              <SettingsRange label={`SPEED: ${settingsDraft.voiceSpeed.toFixed(2)}`} min={0.5} max={1.5} step={0.05} value={settingsDraft.voiceSpeed} onChange={v => setSettingsDraft(s => ({ ...s, voiceSpeed: v }))} />
              <SettingsRange label={`PITCH: ${settingsDraft.voicePitch.toFixed(1)}`} min={0.5} max={2.0} step={0.1} value={settingsDraft.voicePitch} onChange={v => setSettingsDraft(s => ({ ...s, voicePitch: v }))} />
              <SettingsRange label={`VOLUME: ${Math.round(settingsDraft.voiceVolume * 100)}%`} min={0} max={1} step={0.05} value={settingsDraft.voiceVolume} onChange={v => setSettingsDraft(s => ({ ...s, voiceVolume: v }))} />
              {settingsDraft.voiceProvider === 'elevenlabs' && (
                <>
                  <input className="nasi-settings-input" type="password" value={settingsDraft.elevenlabsApiKey} onChange={e => setSettingsDraft(s => ({ ...s, elevenlabsApiKey: e.target.value }))} placeholder="ELEVENLABS_API_KEY" />
                  <div className="nasi-settings-field"><label className="nasi-settings-field-label">VOICE</label><div className="nasi-settings-row-group">{elevenlabsVoices.map(v => <button key={v.id} className={`nasi-settings-chip ${settingsDraft.customVoiceId ? '' : settingsDraft.elevenlabsVoiceId === v.id ? 'active' : ''}`} onClick={() => setSettingsDraft(s => ({ ...s, elevenlabsVoiceId: v.id, customVoiceId: '' }))}>{v.name}</button>)}</div></div>
                  <div className="nasi-settings-field">
                    <label className="nasi-settings-field-label">CUSTOM VOICE ID {settingsDraft.customVoiceId && <span style={{ color: 'var(--emerald)', opacity: 0.7 }}>(overrides preset)</span>}</label>
                    <input className="nasi-settings-input" value={settingsDraft.customVoiceId} onChange={e => setSettingsDraft(s => ({ ...s, customVoiceId: e.target.value.trim() }))} placeholder="Paste your ElevenLabs voice ID..." style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '.05em' }} />
                  </div>
                  <div className="nasi-settings-field"><label className="nasi-settings-field-label">MODEL</label><div className="nasi-settings-row-group">{elevenlabsModels.map(v => <button key={v.value} className={`nasi-settings-chip ${settingsDraft.elevenlabsModel === v.value ? 'active' : ''}`} onClick={() => setSettingsDraft(s => ({ ...s, elevenlabsModel: v.value }))}>{v.label}</button>)}</div></div>
                </>
              )}
              <SettingsToggle label="AUTO SPEAK" checked={settingsDraft.autoSpeak} onChange={v => setSettingsDraft(s => ({ ...s, autoSpeak: v }))} />
              <button className="nasi-test-voice-btn-full" onClick={testVoice}><Speaker size={10} /> TEST VOICE</button>
            </SettingsGroup>
            <SettingsGroup title="THEME" icon={<Palette size={9} />}>
              <div className="nasi-settings-field">
                <label className="nasi-settings-field-label">ACCENT COLOR</label>
                <div className="nasi-settings-row-group">
                  <button className="nasi-theme-chip" onClick={() => setSettingsDraft(s => ({ ...s, theme: 'cyan' }))} style={{ borderColor: 'rgba(0,240,255,.6)', boxShadow: '0 0 10px rgba(0,240,255,.25)' }}><span style={{ background: 'var(--cyan)', width: 14, height: 14, borderRadius: '50%', display: 'inline-block', marginRight: 6, boxShadow: '0 0 8px var(--cyan)' }} />CYAN</button>
                  <button className="nasi-theme-chip" onClick={() => setSettingsDraft(s => ({ ...s, theme: 'emerald' }))} style={{ borderColor: 'rgba(0,255,136,.6)', boxShadow: '0 0 10px rgba(0,255,136,.25)' }}><span style={{ background: 'var(--emerald)', width: 14, height: 14, borderRadius: '50%', display: 'inline-block', marginRight: 6, boxShadow: '0 0 8px var(--emerald)' }} />EMERALD</button>
                  <button className="nasi-theme-chip" onClick={() => setSettingsDraft(s => ({ ...s, theme: 'crimson' }))} style={{ borderColor: 'rgba(255,102,68,.6)', boxShadow: '0 0 10px rgba(255,102,68,.25)' }}><span style={{ background: 'var(--crimson)', width: 14, height: 14, borderRadius: '50%', display: 'inline-block', marginRight: 6, boxShadow: '0 0 8px var(--crimson)' }} />CRIMSON</button>
                </div>
              </div>
            </SettingsGroup>
            <SettingsGroup title="BRAIN" icon={<BrainCircuit size={9} />}>
              <SettingsChips label="PERSONALITY" options={[{ label: 'Warm', value: 'warm' }, { label: 'Professional', value: 'professional' }, { label: 'Playful', value: 'playful' }, { label: 'Stoic', value: 'stoic' }]} selected={settingsDraft.personality} onChange={v => setSettingsDraft(s => ({ ...s, personality: v as PersonalityType }))} />
              <SettingsToggle label="MEMORY" checked={settingsDraft.memoryEnabled} onChange={v => setSettingsDraft(s => ({ ...s, memoryEnabled: v }))} />
            </SettingsGroup>
            <SettingsGroup title="AI PROVIDERS" icon={<Key size={9} />}>
              {PROVIDERS.map(p => (
                <div key={p.id} className="nasi-settings-provider">
                  <button className={`nasi-settings-chip ${settingsDraft.activeProvider === p.id ? 'active' : ''}`} onClick={() => setSettingsDraft(s => ({ ...s, activeProvider: p.id }))}>{p.name}</button>
                  {settingsDraft.activeProvider === p.id && (
                    <div className="nasi-settings-provider-fields">
                      <input className="nasi-settings-input" type="password" value={(settingsDraft as any)[`${p.id}ApiKey`] || ''} onChange={e => setSettingsDraft(s => ({ ...s, [`${p.id}ApiKey`]: e.target.value }))} placeholder={`${p.name} API key`} />
                      <input className="nasi-settings-input" value={(settingsDraft as any)[`${p.id}Model`] || ''} onChange={e => setSettingsDraft(s => ({ ...s, [`${p.id}Model`]: e.target.value }))} placeholder="Model name" />
                    </div>
                  )}
                </div>
              ))}
            </SettingsGroup>
            <div className="nasi-settings-actions">
              <button className="nasi-modal-btn primary" onClick={handleSaveSettings}><Save size={10} /> {settingsSaved ? 'SAVED ✓' : 'SAVE'}</button>
              <button className="nasi-modal-btn" onClick={exportSettings}><Download size={10} /> BACKUP</button>
              <label className="nasi-modal-btn" style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}><Upload size={10} /> RESTORE
                <input type="file" accept=".json" style={{ display: 'none' }} onChange={importSettings} />
              </label>
              <button className="nasi-modal-btn" onClick={() => setShowSettings(false)}>CLOSE</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════ MEMORY MODAL ═══════ */}
      {showMemory && (
        <MemoryModal
          memories={memories}
          deleteMemory={deleteMemory}
          clearMemories={clearMemories}
          onClose={() => setShowMemory(false)}
        />
      )}

      {/* ═══════ AGENT DETAIL MODAL ═══════ */}
      {selectedAgent && (
        <div className="nasi-modal-bg" onClick={() => setSelectedAgent(null)}>
          <div className="nasi-modal nasi-agent-modal" onClick={e => e.stopPropagation()}>
            <button className="nasi-modal-close" onClick={() => setSelectedAgent(null)}><X size={14} /></button>
            <div className="nasi-agent-avatar" style={{ background: selectedAgent.color, color: '#030608' }}>{selectedAgent.initials}</div>
            <div className="nasi-modal-kicker" style={{ color: selectedAgent.color }}><span className="nasi-dot" style={{ background: selectedAgent.color }} /> AGENT</div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{selectedAgent.name}</h3>
            <div className="nasi-agent-role">{selectedAgent.role}</div>
            <div className="nasi-agent-status">{selectedAgent.status}</div>
            <div className="nasi-agent-capabilities">
              <div className="nasi-agent-cap-title">CAPABILITIES</div>
              <div className="nasi-agent-cap-list">
                {selectedAgent.name === 'Manager' && 'Task delegation, agent coordination, response synthesis'}
                {selectedAgent.name === 'Research' && 'Web search, data analysis, source verification'}
                {selectedAgent.name === 'Browser' && 'Page navigation, content extraction, form filling'}
                {selectedAgent.name === 'Computer' && 'File management, code execution, system commands'}
                {selectedAgent.name === 'Shopify' && 'Product management, order processing, analytics'}
                {selectedAgent.name === 'Comm' && 'Email, messaging, notifications, scheduling'}
                {selectedAgent.name === 'File' && 'File organization, document processing, OCR'}
                {selectedAgent.name === 'Security' && 'Access control, threat detection, monitoring'}
              </div>
            </div>
            <div className="nasi-agent-connection-status">
              <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: selectedAgent.status === 'Active' ? '#2ebc7a' : selectedAgent.status === 'Idle' ? '#1a5a3a' : '#c85548', boxShadow: '0 0 6px currentColor' }} />
              <span>{selectedAgent.status === 'Idle' ? 'Standing by' : selectedAgent.status === 'Active' ? 'Active' : 'Not connected'}</span>
            </div>
            <button className="nasi-modal-btn" onClick={() => setSelectedAgent(null)}>CLOSE</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// SETTINGS SUB-COMPONENTS
// ============================================================
function SettingsGroup({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return <div className="nasi-settings-group"><div className="nasi-settings-label">{icon} {title}</div><div className="nasi-settings-content">{children}</div></div>;
}
function SettingsInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return <div className="nasi-settings-field"><label className="nasi-settings-field-label">{label}</label><input className="nasi-settings-input" value={value} onChange={e => onChange(e.target.value)} placeholder={label} /></div>;
}
function SettingsChips({ label, options, selected, onChange }: { label: string; options: { label: string; value: string }[]; selected: string; onChange: (v: string) => void }) {
  return <div className="nasi-settings-field"><label className="nasi-settings-field-label">{label}</label><div className="nasi-settings-row-group">{options.map(o => <button key={o.value} className={`nasi-settings-chip ${selected === o.value ? 'active' : ''}`} onClick={() => onChange(o.value)}>{o.label}</button>)}</div></div>;
}
function SettingsRange({ label, min, max, step, value, onChange }: { label: string; min: number; max: number; step: number; value: number; onChange: (v: number) => void }) {
  return <div className="nasi-settings-field"><label className="nasi-settings-field-label">{label}</label><input className="nasi-settings-range" type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(parseFloat(e.target.value))} /></div>;
}
function SettingsToggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return <div className="nasi-settings-field nasi-settings-toggle-row"><label className="nasi-settings-field-label">{label}</label><button className={`nasi-toggle ${checked ? 'on' : ''}`} onClick={() => onChange(!checked)}><div className="nasi-toggle-thumb" /></button></div>;
}

// ============================================================
// NASI CORE — Canvas Particle Sphere
// ============================================================
function NASICoreCanvas({ state }: { state: CoreState }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animRef = useRef(0);
  const stateRef = useRef(state);
  stateRef.current = state;
  const particlesRef = useRef<{ x: number; y: number; z: number; vx: number; vy: number; vz: number; size: number; hue: number; brightness: number }[]>([]);
  const timeRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const W = 300, H = 300, dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px'; canvas.style.borderRadius = '50%';
    ctx.scale(dpr, dpr);
    const cx = W / 2, cy = H / 2, R = 116;

    if (particlesRef.current.length === 0) {
      // Three shells: dense inner volume, mid shell, outer atmosphere
      const shells = [
        { count: 280, rMin: 0.2, rMax: 0.6 },
        { count: 240, rMin: 0.58, rMax: 0.9 },
        { count: 170, rMin: 0.88, rMax: 1.06 },
      ];
      for (const shell of shells) {
        for (let i = 0; i < shell.count; i++) {
          const theta = Math.random() * Math.PI * 2;
          const phi = Math.acos(2 * Math.random() - 1);
          const r = R * (shell.rMin + Math.random() * (shell.rMax - shell.rMin));
          particlesRef.current.push({
            x: r * Math.sin(phi) * Math.cos(theta), y: r * Math.sin(phi) * Math.sin(theta), z: r * Math.cos(phi),
            vx: (Math.random() - 0.5) * 0.06, vy: (Math.random() - 0.5) * 0.06, vz: (Math.random() - 0.5) * 0.06,
            size: 0.35 + Math.random() * 1.9, hue: 172 + Math.random() * 42, brightness: 0.45 + Math.random() * 0.55,
          });
        }
      }
    }

    let rotY = 0, rotX = 0.28;
    const getStateColor = () => {
      switch (stateRef.current) {
        case 'LISTENING': return { r: 0, g: 217, b: 255, intensity: 1.0, glow: 0.7 };
        case 'THINKING': return { r: 255, g: 179, b: 71, intensity: 0.9, glow: 0.55 };
        case 'SPEAKING': return { r: 0, g: 232, b: 138, intensity: 1.0, glow: 0.7 };
        case 'ERROR': return { r: 255, g: 82, b: 82, intensity: 0.95, glow: 0.6 };
        default: return { r: 0, g: 190, b: 235, intensity: 0.42, glow: 0.2 };
      }
    };

    const animate = () => {
      ctx.clearRect(0, 0, W, H);
      timeRef.current += 0.016;
      const t = timeRef.current;
      const st = stateRef.current;
      const sc = getStateColor();
      const speed = st === 'THINKING' ? 0.02 : st === 'LISTENING' ? 0.024 : st === 'SPEAKING' ? 0.016 : 0.007;
      rotY += speed;
      if (st === 'THINKING') rotX += 0.004;
      if (st === 'LISTENING') rotX = 0.28 + Math.sin(t * 2.2) * 0.12;
      const cosY = Math.cos(rotY), sinY = Math.sin(rotY), cosX = Math.cos(rotX), sinX = Math.sin(rotX);

      // Outer glow
      const outerGlow = ctx.createRadialGradient(cx, cy, R * 0.2, cx, cy, R * 1.6);
      outerGlow.addColorStop(0, `rgba(${sc.r},${sc.g},${sc.b},${0.08 * sc.intensity * sc.glow})`);
      outerGlow.addColorStop(0.5, `rgba(${sc.r},${sc.g},${sc.b},${0.03 * sc.intensity * sc.glow})`);
      outerGlow.addColorStop(1, 'transparent');
      ctx.fillStyle = outerGlow; ctx.beginPath(); ctx.arc(cx, cy, R * 1.6, 0, Math.PI * 2); ctx.fill();

      // Orbital rings
      for (let ring = 0; ring < 3; ring++) {
        const ringR = R + 15 + ring * 18;
        const ringAlpha = (0.08 - ring * 0.02) * sc.intensity;
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(t * (0.3 + ring * 0.15) * (ring % 2 === 0 ? 1 : -1));
        ctx.scale(1, 0.3 + ring * 0.1);
        ctx.strokeStyle = `rgba(${sc.r},${sc.g},${sc.b},${ringAlpha})`; ctx.lineWidth = 0.8; ctx.setLineDash([4, 8]);
        ctx.beginPath(); ctx.arc(0, 0, ringR, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); ctx.restore();
      }

      // Particles
      const projected = particlesRef.current.map(p => {
        let x = p.x * cosY - p.z * sinY, z = p.x * sinY + p.z * cosY, y = p.y * cosX - z * sinX;
        z = p.y * sinX + z * cosX;
        p.x += p.vx * (state === 'THINKING' ? 1.5 : 1); p.y += p.vy * (state === 'THINKING' ? 1.5 : 1);
        p.z += p.vz * (state === 'THINKING' ? 1.5 : 1);
        const dist = Math.sqrt(p.x * p.x + p.y * p.y + p.z * p.z);
        if (dist > R * 1.05) { p.vx *= -0.85; p.vy *= -0.85; p.vz *= -0.85; }
        return { sx: cx + x, sy: cy + y, z, size: p.size, hue: p.hue, brightness: p.brightness };
      });
      projected.sort((a, b) => a.z - b.z);
      projected.forEach(p => {
        const depth = (p.z + R) / (2 * R);
        const alpha = (0.1 + depth * 0.7) * sc.intensity * p.brightness;
        const sz = p.size * (0.4 + depth * 0.9);
        if (sz > 1.2) { ctx.fillStyle = `hsla(${p.hue},80%,70%,${alpha * 0.3})`; ctx.beginPath(); ctx.arc(p.sx, p.sy, sz * 2, 0, Math.PI * 2); ctx.fill(); }
        ctx.fillStyle = `hsla(${p.hue},75%,68%,${alpha})`; ctx.beginPath(); ctx.arc(p.sx, p.sy, sz, 0, Math.PI * 2); ctx.fill();
      });

      // Core energy
      const pulse = state === 'IDLE' ? 1 : 1 + Math.sin(t * 3) * 0.12;
      const corePulse = state === 'THINKING' ? 0.8 : state === 'SPEAKING' ? 1.2 : 1;
      for (let layer = 3; layer >= 0; layer--) {
        const layerR = (20 + layer * 12) * pulse * corePulse;
        const layerAlpha = (0.15 - layer * 0.03) * sc.intensity;
        const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, layerR);
        coreGrad.addColorStop(0, `rgba(${sc.r},${sc.g},${sc.b},${layerAlpha * 1.5})`);
        coreGrad.addColorStop(0.5, `rgba(${sc.r},${sc.g},${sc.b},${layerAlpha * 0.5})`);
        coreGrad.addColorStop(1, 'transparent');
        ctx.fillStyle = coreGrad; ctx.beginPath(); ctx.arc(cx, cy, layerR, 0, Math.PI * 2); ctx.fill();
      }

      // Center point
      const centerGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, 8 * pulse);
      centerGrad.addColorStop(0, `rgba(${Math.min(255, sc.r + 80)},${Math.min(255, sc.g + 60)},${Math.min(255, sc.b + 40)},${0.9 * sc.intensity})`);
      centerGrad.addColorStop(1, 'transparent');
      ctx.fillStyle = centerGrad; ctx.beginPath(); ctx.arc(cx, cy, 8 * pulse, 0, Math.PI * 2); ctx.fill();

      // Rings
      ctx.strokeStyle = `rgba(${sc.r},${sc.g},${sc.b},${0.12 * sc.intensity})`; ctx.lineWidth = 0.6;
      ctx.beginPath(); ctx.arc(cx, cy, R * 0.45, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = `rgba(${sc.r},${sc.g},${sc.b},${0.06 * sc.intensity})`; ctx.lineWidth = 0.4;
      ctx.beginPath(); ctx.arc(cx, cy, R * 0.65, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = `rgba(${sc.r},${sc.g},${sc.b},${0.18 * sc.intensity})`; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(cx, cy, R + 8, 0, Math.PI * 2); ctx.stroke();

      // State effects
      if (state === 'LISTENING') { for (let w = 0; w < 3; w++) { const waveR = R + 30 + w * 15 + Math.sin(t * 4 - w * 0.8) * 8; ctx.strokeStyle = `rgba(44,184,212,${0.12 - w * 0.03})`; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.arc(cx, cy, waveR, 0, Math.PI * 2); ctx.stroke(); } }
      if (state === 'THINKING') { for (let a = 0; a < 3; a++) { const arcStart = t * 2 + a * (Math.PI * 2 / 3); const arcLen = 0.8 + Math.sin(t * 3 + a) * 0.3; ctx.strokeStyle = `rgba(34,150,190,${0.2 - a * 0.05})`; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(cx, cy, R * 0.75, arcStart, arcStart + arcLen); ctx.stroke(); } }
      if (state === 'SPEAKING') { const speakPulse = Math.sin(t * 8) * 0.5 + 0.5; ctx.strokeStyle = `rgba(46,188,122,${0.18 * speakPulse})`; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.arc(cx, cy, R * 0.55, 0, Math.PI * 2); ctx.stroke(); }

      animRef.current = requestAnimationFrame(animate);
    };
    animate();
    return () => cancelAnimationFrame(animRef.current);
  }, [state]); // eslint-disable-line

  return <canvas ref={canvasRef} className="nasi-core-canvas" />;
}

// ============================================================
createRoot(document.getElementById('root')!).render(<StrictMode><SectionBoundary name="NASI"><App /></SectionBoundary></StrictMode>);
