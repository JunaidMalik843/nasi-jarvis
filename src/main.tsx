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
} from 'lucide-react';
import './styles.css';
import './components/VoicePanel.css';
import './components/StorageComponents.css';
import { VoicePanel } from './components/VoicePanel';
import { ConversationManager } from './components/ConversationManager';
import { MemoryManager } from './components/MemoryManager';
import { useConversations, useMemories } from './hooks/useStorage';
import type { CoreState } from './hooks/useVoice';
import type { Conversation, ConversationMessage, Memory } from './lib/storage';
import { generateId } from './lib/storage';

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
  const [activeNav, setActiveNav] = useState('Today');
  const [coreState, setCoreState] = useState<CoreState>('IDLE');
  const [isListening, setIsListening] = useState(false);
  const [isCoreActive, setIsCoreActive] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const [isVoiceSending, setIsVoiceSending] = useState(false);
  const [command, setCommand] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [showPanel, setShowPanel] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [showMemoryPanel, setShowMemoryPanel] = useState(false);
  const [newConversationDialog, setNewConversationDialog] = useState(false);
  const [newConversationTitle, setNewConversationTitle] = useState('');

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

  const { memories, createMemory, deleteMemory, clearMemories, updateMemory } = useMemories();

  const [messages, setMessages] = useState<Message[]>([
    { from: 'nasi', text: 'NASI core online. Your command center is synchronized.' },
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

    // Create or get conversation if none active
    let conversationId = activeConversationId;
    if (!conversationId) {
      const conv = await createConversation(prompt);
      if (conv) {
        conversationId = conv.id;
      }
    }

    const userMessage: Message = { from: 'user', text: prompt };
    const prevMessages = activeConversation ? activeConversation.messages.map(convertToMessage) : [
      { from: 'nasi', text: 'NASI core online. Your command center is synchronized.' },
    ];
    const currentMessages = [...prevMessages, userMessage];
    setMessages(currentMessages);

    if (isVoice) {
      setIsVoiceSending(true);
      setCoreState('THINKING');
    } else {
      setIsSending(true);
      setCoreState('THINKING');
    }

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
      const updatedMessages = [...currentMessages, assistantMessage];
      setMessages(updatedMessages);

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
      const updatedMessages = [...currentMessages, fallbackMsg];
      setMessages(updatedMessages);
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
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark"><span /></div>
          <span className="brand-name">NASI</span>
          <span className="brand-divider" />
          <span className="brand-context">Personal AI OS</span>
        </div>
        <div className="topbar-actions">
          <span className="system-status"><span className="status-dot" /> All systems nominal</span>
          <button className="top-action" onClick={() => setShowPanel(true)}><CircleHelp size={14} /> Help</button>
          <button className="top-action" onClick={() => setShowPanel(true)}><Settings2 size={14} /> Settings</button>
          <div className="avatar">N</div>
        </div>
      </header>

      <main className="workspace">
        <aside className="left-column">
          <section className="panel media-panel">
            <PanelHeader label="Neural link" icon={<Activity size={13} />} />
            <div className="media-blackout">
              <span className="offline-pill"><span className="mini-dot" /> SYSTEM ONLINE</span>
              <div className="media-orbit"><div className="orbit-core" /></div>
              <div className="media-controls"><button><Volume2 size={14} /></button><button><Maximize2 size={14} /></button></div>
            </div>
          </section>

          <section className="panel conversations-panel">
            <ConversationManager
              conversations={conversations}
              activeConversationId={activeConversationId}
              onSelect={selectConversation}
              onCreate={() => setNewConversationDialog(true)}
              onDelete={deleteConversation}
              onNewConversation={() => { clearConversationSelection(); setNewConversationDialog(true); }}
            />
          </section>

          <section className="panel radar-panel">
            <PanelHeader label="Sat-link feed" icon={<Radar size={13} />} action={<button className="icon-button"><MoreHorizontal size={14} /></button>} />
            <div className="feed-title"><span className="live-dot" /> Satellite stream <span className="feed-time">UTC {localTime}</span></div>
            <div className="map-preview">
              <img src="/assets/themes/nasi-radar-cyan.svg" alt="NASI satellite command map" />
              <div className="map-overlay" />
              <div className="map-label label-one">NORTH ATLANTIC <span>●</span></div>
              <div className="map-label label-two">PACIFIC ARRAY <span>●</span></div>
              <div className="map-label label-three">ACTIVE <span>●</span></div>
              <div className="map-crosshair"><Crosshair size={20} /></div>
            </div>
            <div className="map-tabs"><button className="active">Today</button><button><Map size={12} /> Map</button><button><Search size={12} /> Search</button><button>Alerts <span className="alert-count">3</span></button></div>
          </section>

          <section className="panel headlines-panel">
            <PanelHeader label="Today headlines" icon={<Globe2 size={13} />} action={<span className="live-tag">LIVE</span>} />
            <div className="headlines-list">{headlines.map((headline, index) => <div className="headline" key={headline}><span className="headline-index">0{index + 1}</span><span>{headline}</span></div>)}</div>
          </section>
        </aside>

        <section className="center-column">
          <section className={`panel core-panel ${coreState !== 'IDLE' ? 'core-active' : ''}`}>
            <div className="core-status">
              <span className={`thinking-dot ${coreState === 'LISTENING' ? 'listening-dot' : coreState === 'THINKING' ? 'thinking-dot' : coreState === 'SPEAKING' ? 'speaking-dot' : coreState === 'ERROR' ? 'error-dot' : ''}`} />
              {coreState === 'IDLE' ? 'STANDBY' : coreState === 'LISTENING' ? 'LISTENING' : coreState === 'THINKING' ? 'THINKING' : coreState === 'SPEAKING' ? 'SPEAKING' : coreState === 'ERROR' ? 'ERROR' : 'STANDBY'}
              <span className="status-toggle" />
            </div>
            <div className="core-visual">
              <div className="core-ring ring-one" /><div className="core-ring ring-two" /><div className="core-ring ring-three" />
              <div className="core-glow"><BrainCircuit size={40} /></div>
              <div className="core-particles">{Array.from({ length: 18 }, (_, i) => <span key={i} style={{ '--i': i } as CSSProperties} />)}</div>
            </div>
            <VoicePanel
              onVoiceInput={(transcript) => { if (transcript.trim()) void sendCommand(transcript, true); }}
              isThinking={isVoiceSending}
              command={command}
            />
            <div className="core-caption"><Sparkles size={12} /> Your living AI core <span>·</span> Speak naturally in English or Urdu</div>
          </section>

          <section className="panel circuits-panel">
            <div className="circuit-card cyan"><div className="circuit-icon"><Database size={16} /></div><div><strong>Memory</strong><span>Persistent context</span></div><div className="signal cyan-signal" /></div>
            <div className="circuit-card orange"><div className="circuit-icon"><Zap size={16} /></div><div><strong>Skills</strong><span>24 capabilities ready</span></div><div className="signal orange-signal" /></div>
            <div className="circuit-card green"><div className="circuit-icon"><ShieldCheck size={16} /></div><div><strong>Soul</strong><span>Calibrated to you</span></div><div className="signal green-signal" /></div>
            <div className="circuit-card white"><div className="circuit-icon"><Settings2 size={16} /></div><div><strong>Settings</strong><span>Core preferences</span></div><div className="signal white-signal" /></div>
          </section>

          <section className="panel agent-panel">
            <PanelHeader label="Agent town" icon={<Bot size={13} />} action={<div className="segmented"><button className="active">Agents</button><button>Visual hub</button><button>Gesture</button></div>} actionRight={<button className="icon-button" onClick={() => setShowMemoryPanel(true)} title="View memories"><Database size={13} /></button>} />
            <div className="agent-scene">
              <div className="scene-grid" />
              <div className="scene-window window-one" /><div className="scene-window window-two" />
              <div className="scene-desk desk-one"><span /><i /><b /></div><div className="scene-desk desk-two"><span /><i /><b /></div><div className="scene-desk desk-three"><span /><i /><b /></div>
              {agents.map((agent, index) => <button key={agent.name} className={`agent-figure figure-${index + 1}`} style={{ '--agent-color': agent.color } as CSSProperties} onClick={() => setSelectedAgent(agent)}><span className="agent-head">{agent.initials}</span><span className="agent-body" /><span className="agent-name">{agent.name}</span></button>)}
              <div className="scene-floor-line" /><div className="scene-status"><span className="status-dot" /> 4/4 active <span className="scene-divider" /> 04 busy</div>
            </div>
          </section>
        </section>

        <aside className="right-column">
          <section className="panel chat-panel">
            <div className="chat-tabs">
              <button className={activeConversationId ? '' : 'active'} onClick={() => clearConversationSelection()}><MessageSquare size={12} /> All</button>
              {conversations.slice(0, 5).map((conv) => (
                <button
                  key={conv.id}
                  className={activeConversationId === conv.id ? 'active' : ''}
                  onClick={() => selectConversation(conv.id)}
                >
                  <span className="conv-title">{conv.title}</span>
                </button>
              ))}
              <button className="chat-plus" onClick={() => setNewConversationDialog(true)}><Plus size={14} /></button>
            </div>
            <div className="chat-stream">
              {messages.map((message, index) => {
                const timeStr = message.timestamp ? new Date(message.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : 'now';
                return <div className={`message ${message.from}`} key={`${message.text}-${index}-${message.timestamp ?? ''}`}><div className="message-label">{message.from === 'nasi' ? 'NASI CORE' : 'COMMANDER'} <span>· {timeStr}</span></div><div className="message-text">{message.text}</div></div>;
              })}
              {isSending && <div className="typing"><span /><span /><span /> NASI is thinking</div>}
              {isVoiceSending && <div className="typing"><span /><span /><span /> NASI is processing your voice</div>}
            </div>
            <div className="command-bar"><input value={command} onChange={(event) => setCommand(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void sendCommand(command); }} placeholder="Type an instruction or command for NASI..." /><button className={isListening ? 'listening' : ''} onClick={() => { setIsListening(!isListening); setIsCoreActive(!isListening); }}><Mic size={16} /></button><button className="send-button" onClick={() => void sendCommand(command)}><Send size={15} /></button></div>
          </section>
          <section className="panel telemetry-panel"><PanelHeader label="System telemetry" icon={<Cpu size={13} />} /><div className="telemetry-row"><span>Neural load</span><strong>34%</strong><div className="meter"><i style={{ width: '34%' }} /></div></div><div className="telemetry-row"><span>Memory cache</span><strong>78%</strong><div className="meter orange-meter"><i style={{ width: '78%' }} /></div></div><div className="telemetry-row"><span>Agent network</span><strong className="green-text">Stable</strong><div className="pulse-line"><i /><i /><i /><i /><i /><i /><i /></div></div><div className="telemetry-footer"><span><span className="status-dot" /> Encrypted</span><span>v1.0.52</span></div></section>
        </aside>
      </main>

      <nav className="bottom-nav">{[{ label: 'Today', icon: LayoutGrid }, { label: 'Radar', icon: Globe2 }, { label: 'Agents', icon: Bot }, { label: 'Search', icon: Search }, { label: 'More', icon: MoreHorizontal }].map(({ label, icon: Icon }) => <button key={label} className={activeNav === label ? 'active' : ''} onClick={() => setActiveNav(label)}><Icon size={16} /><span>{label}</span></button>)}</nav>

      {showPanel && <div className="modal-backdrop" onClick={() => setShowPanel(false)}><div className="modal-card" onClick={(event) => event.stopPropagation()}><button className="modal-close" onClick={() => setShowPanel(false)}><X size={16} /></button><div className="modal-kicker"><Command size={14} /> NASI CONTROL</div><h2>Personal AI, made tangible.</h2><p>Talk to your living core, delegate work to your agents, and keep the whole world within reach from one focused command center.</p><div className="modal-stats"><div><strong>04</strong><span>agents online</span></div><div><strong>24</strong><span>skills loaded</span></div><div><strong>30d</strong><span>memory depth</span></div></div></div></div>}
      {selectedAgent && <div className="modal-backdrop" onClick={() => setSelectedAgent(null)}><div className="agent-modal" onClick={(event) => event.stopPropagation()}><button className="modal-close" onClick={() => setSelectedAgent(null)}><X size={16} /></button><div className="agent-modal-avatar" style={{ background: selectedAgent.color }}>{selectedAgent.initials}</div><div className="modal-kicker" style={{ color: selectedAgent.color }}><span className="status-dot" /> {selectedAgent.status.toUpperCase()}</div><h2>{selectedAgent.name}</h2><p>{selectedAgent.role} agent is active in Agent Town and ready to receive a delegated task.</p><button className="delegate-button" onClick={() => setSelectedAgent(null)}><MessageSquare size={14} /> Delegate a task</button></div></div>}
      {showMemoryPanel && <div className="modal-backdrop" onClick={() => setShowMemoryPanel(false)}><div className="memory-modal" onClick={(event) => event.stopPropagation()}><button className="modal-close" onClick={() => setShowMemoryPanel(false)}><X size={16} /></button><div className="modal-kicker"><Database size={14} /> NASI MEMORY</div><MemoryManager memories={memories} onDelete={deleteMemory} onClear={clearMemories} /></div></div>}
      {newConversationDialog && <div className="modal-backdrop" onClick={() => setNewConversationDialog(false)}><div className="new-conv-modal" onClick={(event) => event.stopPropagation()}><button className="modal-close" onClick={() => setNewConversationDialog(false)}><X size={16} /></button><div className="modal-kicker"><Plus size={14} /> NEW CONVERSATION</div><h2>Start a new conversation</h2><p>Begin a fresh conversation thread with NASI. Previous conversations will be preserved.</p><div className="new-conv-form"><input value={newConversationTitle} onChange={(e) => setNewConversationTitle(e.target.value)} placeholder="Conversation title (optional)" className="new-conv-input" /></div><div className="new-conv-actions"><button className="new-conv-cancel" onClick={() => setNewConversationDialog(false)}>Cancel</button><button className="new-conv-start" onClick={() => { setNewConversationDialog(false); setNewConversationTitle(''); }}><Plus size={12} /> Start new</button></div></div></div>}
    </div>
  );
}

function PanelHeader({ label, icon, action, actionRight }: { label: string; icon: ReactNode; action?: ReactNode; actionRight?: ReactNode }) {
  return <div className="panel-header"><div className="panel-label">{icon}<span>{label}</span></div><div>{action}{actionRight}</div></div>;
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
