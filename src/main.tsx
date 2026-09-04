import { StrictMode, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
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
  Volume2,
  X,
  Zap,
} from 'lucide-react';
import './styles.css';

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
  const [isListening, setIsListening] = useState(false);
  const [isCoreActive, setIsCoreActive] = useState(false);
  const [command, setCommand] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    { from: 'nasi', text: 'NASI core online. Your command center is synchronized.' },
  ]);
  const [isSending, setIsSending] = useState(false);
  const [showPanel, setShowPanel] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);

  const localTime = useMemo(() => new Intl.DateTimeFormat('en', { hour: '2-digit', minute: '2-digit' }).format(new Date()), []);

  useEffect(() => {
    if (!isListening) return;
    const timer = window.setTimeout(() => setIsListening(false), 5000);
    return () => window.clearTimeout(timer);
  }, [isListening]);

  async function sendCommand() {
    const prompt = command.trim();
    if (!prompt || isSending) return;
    setMessages((current) => [...current, { from: 'user', text: prompt }]);
    setCommand('');
    setIsSending(true);
    try {
      const response = await fetch('/api/gemini/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, systemInstruction: 'You are NASI, a concise futuristic personal AI operating system. Answer clearly and helpfully.' }),
      });
      const data = (await response.json()) as { text?: string };
      setMessages((current) => [...current, { from: 'nasi', text: data.text || 'Command received. I am ready for your next directive.' }]);
    } catch {
      setMessages((current) => [...current, { from: 'nasi', text: 'The command channel is temporarily unavailable. Local systems remain active.' }]);
    } finally {
      setIsSending(false);
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

          <section className="panel radar-panel">
            <PanelHeader label="Sat-link feed" icon={<Radar size={13} />} action={<button className="icon-button"><MoreHorizontal size={14} /></button>} />
            <div className="feed-title"><span className="live-dot" /> Satellite stream <span className="feed-time">UTC {localTime}</span></div>
            <div className="map-preview">
              <img src="/assets/themes/stonic-theme-cyan-1200.webp" alt="Satellite command map" />
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
          <section className={`panel core-panel ${isCoreActive ? 'core-active' : ''}`}>
            <div className="core-status"><span className="thinking-dot" /> {isCoreActive ? 'LISTENING' : 'STANDBY'} <span className="status-toggle" /></div>
            <div className="core-visual">
              <div className="core-ring ring-one" /><div className="core-ring ring-two" /><div className="core-ring ring-three" />
              <div className="core-glow"><BrainCircuit size={40} /></div>
              <div className="core-particles">{Array.from({ length: 18 }, (_, i) => <span key={i} style={{ '--i': i } as CSSProperties} />)}</div>
            </div>
            <button className="start-button" onClick={() => { setIsCoreActive(!isCoreActive); setIsListening(!isListening); }}><Mic size={15} /> {isListening ? 'Listening...' : 'Start AI'} <span className="button-arrow">→</span></button>
            <div className="core-caption"><Sparkles size={12} /> Your living AI core <span>·</span> Speak naturally</div>
          </section>

          <section className="panel circuits-panel">
            <div className="circuit-card cyan"><div className="circuit-icon"><Database size={16} /></div><div><strong>Memory</strong><span>Persistent context</span></div><div className="signal cyan-signal" /></div>
            <div className="circuit-card orange"><div className="circuit-icon"><Zap size={16} /></div><div><strong>Skills</strong><span>24 capabilities ready</span></div><div className="signal orange-signal" /></div>
            <div className="circuit-card green"><div className="circuit-icon"><ShieldCheck size={16} /></div><div><strong>Soul</strong><span>Calibrated to you</span></div><div className="signal green-signal" /></div>
            <div className="circuit-card white"><div className="circuit-icon"><Settings2 size={16} /></div><div><strong>Settings</strong><span>Core preferences</span></div><div className="signal white-signal" /></div>
          </section>

          <section className="panel agent-panel">
            <PanelHeader label="Agent town" icon={<Bot size={13} />} action={<div className="segmented"><button className="active">Agents</button><button>Visual hub</button><button>Gesture</button></div>} />
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
            <div className="chat-tabs"><button className="active"><Mic size={12} /> Voice</button><button><Terminal size={12} /> Agent</button><button><MessageSquare size={12} /> Notes</button><button className="chat-plus"><Plus size={14} /></button></div>
            <div className="chat-stream">
              {messages.map((message, index) => <div className={`message ${message.from}`} key={`${message.text}-${index}`}><div className="message-label">{message.from === 'nasi' ? 'NASI CORE' : 'COMMANDER'} <span>· now</span></div><div className="message-text">{message.text}</div></div>)}
              {isSending && <div className="typing"><span /><span /><span /> NASI is thinking</div>}
            </div>
            <div className="command-bar"><input value={command} onChange={(event) => setCommand(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void sendCommand(); }} placeholder="Type an instruction or command for NASI..." /><button className={isListening ? 'listening' : ''} onClick={() => { setIsListening(!isListening); setIsCoreActive(!isListening); }}><Mic size={16} /></button><button className="send-button" onClick={() => void sendCommand()}><Send size={15} /></button></div>
          </section>
          <section className="panel telemetry-panel"><PanelHeader label="System telemetry" icon={<Cpu size={13} />} /><div className="telemetry-row"><span>Neural load</span><strong>34%</strong><div className="meter"><i style={{ width: '34%' }} /></div></div><div className="telemetry-row"><span>Memory cache</span><strong>78%</strong><div className="meter orange-meter"><i style={{ width: '78%' }} /></div></div><div className="telemetry-row"><span>Agent network</span><strong className="green-text">Stable</strong><div className="pulse-line"><i /><i /><i /><i /><i /><i /><i /></div></div><div className="telemetry-footer"><span><span className="status-dot" /> Encrypted</span><span>v1.0.52</span></div></section>
        </aside>
      </main>

      <nav className="bottom-nav">{[{ label: 'Today', icon: LayoutGrid }, { label: 'Radar', icon: Globe2 }, { label: 'Agents', icon: Bot }, { label: 'Search', icon: Search }, { label: 'More', icon: MoreHorizontal }].map(({ label, icon: Icon }) => <button key={label} className={activeNav === label ? 'active' : ''} onClick={() => setActiveNav(label)}><Icon size={16} /><span>{label}</span></button>)}</nav>

      {showPanel && <div className="modal-backdrop" onClick={() => setShowPanel(false)}><div className="modal-card" onClick={(event) => event.stopPropagation()}><button className="modal-close" onClick={() => setShowPanel(false)}><X size={16} /></button><div className="modal-kicker"><Command size={14} /> NASI CONTROL</div><h2>Personal AI, made tangible.</h2><p>Talk to your living core, delegate work to your agents, and keep the whole world within reach from one focused command center.</p><div className="modal-stats"><div><strong>04</strong><span>agents online</span></div><div><strong>24</strong><span>skills loaded</span></div><div><strong>30d</strong><span>memory depth</span></div></div></div></div>}
      {selectedAgent && <div className="modal-backdrop" onClick={() => setSelectedAgent(null)}><div className="agent-modal" onClick={(event) => event.stopPropagation()}><button className="modal-close" onClick={() => setSelectedAgent(null)}><X size={16} /></button><div className="agent-modal-avatar" style={{ background: selectedAgent.color }}>{selectedAgent.initials}</div><div className="modal-kicker" style={{ color: selectedAgent.color }}><span className="status-dot" /> {selectedAgent.status.toUpperCase()}</div><h2>{selectedAgent.name}</h2><p>{selectedAgent.role} agent is active in Agent Town and ready to receive a delegated task.</p><button className="delegate-button" onClick={() => setSelectedAgent(null)}><MessageSquare size={14} /> Delegate a task</button></div></div>}
    </div>
  );
}

function PanelHeader({ label, icon, action }: { label: string; icon: ReactNode; action?: ReactNode }) {
  return <div className="panel-header"><div className="panel-label">{icon}<span>{label}</span></div>{action || <span className="panel-menu"><MoreHorizontal size={13} /></span>}</div>;
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
