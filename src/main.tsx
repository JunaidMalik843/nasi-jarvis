import { StrictMode, useState, useCallback, useEffect, useMemo, type MouseEvent } from 'react';
import { createRoot } from 'react-dom/client';
import {
  BrainCircuit, Mic, VolumeX, Settings2, Database,
  Send, X, Activity, Globe2, Bot,
  Users, Cpu, Key, Languages, Speaker, Save,
  Plus, Trash2, MessageSquare, Clock, ChevronLeft,
} from 'lucide-react';
import WorldGlobe from './components/WorldGlobe';
import AgentOffice from './components/AgentOffice';
import { useConversations, useMemories } from './hooks/useStorage';
import { getPersonalitySystemPrompt, type PersonalityType } from './lib/personality';
import { parseMemoryCommand, getMemoryResponse } from './lib/memoryCommands';
import type { Memory } from './lib/storage';
import './styles.css';

/* ===== Types ===== */
type CoreState = 'IDLE' | 'LISTENING' | 'THINKING' | 'SPEAKING' | 'ERROR';
type Agent = { name: string; role: string; color: string; status: string; initials: string };
type Message = { from: 'user' | 'nasi'; text: string };

interface NasiSettings {
  provider: string;
  model: string;
  apiKey: string;
  voiceLanguage: string;
  voiceSpeed: number;
  personality: PersonalityType;
}

const DEFAULT_SETTINGS: NasiSettings = {
  provider: 'Gemini',
  model: '',
  apiKey: '',
  voiceLanguage: 'en-US',
  voiceSpeed: 0.98,
  personality: 'warm',
};

function loadSettings(): NasiSettings {
  try {
    const raw = localStorage.getItem('nasi_settings');
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { ...DEFAULT_SETTINGS };
}

function saveSettingsToDisk(s: NasiSettings) {
  localStorage.setItem('nasi_settings', JSON.stringify(s));
}

const AGENTS: Agent[] = [
  { name: 'Research', role: 'Research Agent', color: '#3ad6ea', status: 'Idle', initials: 'R' },
  { name: 'Browser', role: 'Browser Agent', color: '#45df9b', status: 'Idle', initials: 'B' },
  { name: 'Computer', role: 'Computer Agent', color: '#f09b47', status: 'Idle', initials: 'C' },
  { name: 'Memory', role: 'Memory Agent', color: '#a9b5c4', status: 'Idle', initials: 'M' },
  { name: 'Shopify', role: 'Shopify Agent', color: '#45df9b', status: 'Idle', initials: 'S' },
  { name: 'Comm', role: 'Comm Agent', color: '#3ad6ea', status: 'Idle', initials: 'C' },
  { name: 'File', role: 'File Agent', color: '#f09b47', status: 'Idle', initials: 'F' },
  { name: 'Security', role: 'Security Agent', color: '#e9675f', status: 'Idle', initials: 'X' },
];

const PROVIDERS = ['Gemini', 'OpenAI', 'Claude', 'Grok', 'Ollama'];

function App() {
  const [coreState, setCoreState] = useState<CoreState>('IDLE');
  const [command, setCommand] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showMemory, setShowMemory] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [settings, setSettings] = useState<NasiSettings>(loadSettings);
  const [settingsDraft, setSettingsDraft] = useState<NasiSettings>(settings);
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [nav, setNav] = useState<'home' | 'chat'>('home');

  // Conversation hooks
  const {
    conversations,
    activeConversation,
    activeConversationId,
    createConversation,
    selectConversation,
    addMessage,
    deleteConversation,
    newConversation,
    refreshConversations,
  } = useConversations();

  // Memory hooks
  const {
    memories,
    createMemory,
    deleteMemory,
    clearMemories,
    refreshMemories,
  } = useMemories();

  // Display messages from active conversation
  const messages: Message[] = useMemo(() => {
    if (!activeConversation) return [{ from: 'nasi', text: 'NASI online. Ready.' }];
    return activeConversation.messages.map(m => ({
      from: m.role === 'user' ? 'user' as const : 'nasi' as const,
      text: m.text,
    }));
  }, [activeConversation]);

  // Sync draft when settings modal opens
  useEffect(() => {
    if (showSettings) {
      setSettingsDraft(loadSettings());
      setSettingsSaved(false);
    }
  }, [showSettings]);

  const handleSaveSettings = () => {
    saveSettingsToDisk(settingsDraft);
    setSettings(settingsDraft);
    setSettingsSaved(true);
    setTimeout(() => setSettingsSaved(false), 2000);
  };

  // Get the personality-based system instruction
  const systemInstruction = useMemo(() => {
    return getPersonalitySystemPrompt(settings.personality);
  }, [settings.personality]);

  // Core send function — handles both text and voice input
  const sendCommand = useCallback(async (text: string, source: 'text' | 'voice' = 'text') => {
    if (!text || isSending) return;
    setIsSending(true);
    setCoreState('THINKING');

    // 1. Check for memory commands
    const memCmd = parseMemoryCommand(text);
    if (memCmd) {
      try {
        if (memCmd.type === 'remember') {
          await createMemory(memCmd.category, memCmd.key, memCmd.value, 5, activeConversationId || undefined);
          const response = getMemoryResponse(memCmd);
          if (activeConversationId) {
            await addMessage(activeConversationId, 'user', text, source);
            await addMessage(activeConversationId, 'assistant', response, 'text');
          } else {
            // Create a new conversation for this interaction
            const conv = await createConversation(text);
            if (conv) {
              await addMessage(conv.id, 'assistant', response, 'text');
            }
          }
          refreshMemories();
          setIsSending(false);
          setCoreState('IDLE');
          return;
        }
        if (memCmd.type === 'forget') {
          // Try to find matching memory by key
          const match = memories.find(m =>
            m.key.toLowerCase().includes(memCmd.key.toLowerCase()) ||
            m.value.toLowerCase().includes(memCmd.key.toLowerCase())
          );
          if (match) {
            await deleteMemory(match.id);
            refreshMemories();
          }
          const response = getMemoryResponse(memCmd);
          if (activeConversationId) {
            await addMessage(activeConversationId, 'user', text, source);
            await addMessage(activeConversationId, 'assistant', response, 'text');
          }
          setIsSending(false);
          setCoreState('IDLE');
          return;
        }
        if (memCmd.type === 'forget_all') {
          await clearMemories();
          const response = getMemoryResponse(memCmd);
          if (activeConversationId) {
            await addMessage(activeConversationId, 'user', text, source);
            await addMessage(activeConversationId, 'assistant', response, 'text');
          }
          setIsSending(false);
          setCoreState('IDLE');
          return;
        }
        if (memCmd.type === 'recall') {
          const response = getMemoryResponse(memCmd);
          const memoryList = memories.length > 0
            ? memories.map(m => `• ${m.key}: ${m.value}`).join('\n')
            : 'I don\'t have any memories stored yet.';
          const fullResponse = `${response}\n\n${memoryList}`;
          if (activeConversationId) {
            await addMessage(activeConversationId, 'user', text, source);
            await addMessage(activeConversationId, 'assistant', fullResponse, 'text');
          }
          setIsSending(false);
          setCoreState('IDLE');
          return;
        }
      } catch (err) {
        console.warn('[Memory] Command error:', err);
      }
    }

    // 2. Regular AI generation — ensure we have a conversation
    let convId = activeConversationId;
    if (!convId) {
      const conv = await createConversation(text);
      if (conv) {
        convId = conv.id;
      } else {
        setIsSending(false);
        setCoreState('IDLE');
        return;
      }
    } else {
      // Add user message to existing conversation
      await addMessage(convId, 'user', text, source);
    }

    // 3. Call AI with conversation context
    try {
      const res = await fetch('/api/gemini/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: text,
          systemInstruction,
          conversationId: convId,
        }),
      });
      const data = await res.json();
      const responseText = data.text || 'Command received.';
      await addMessage(convId, 'assistant', responseText, 'text');

      // TTS for voice-initiated conversations
      if (source === 'voice' && responseText) {
        speakText(responseText);
      }
    } catch {
      const errorText = 'Channel temporarily unavailable.';
      if (convId) {
        await addMessage(convId, 'assistant', errorText, 'text');
      }
    } finally {
      setIsSending(false);
      setCoreState('IDLE');
    }
  }, [isSending, activeConversationId, systemInstruction, memories, createConversation, addMessage, createMemory, deleteMemory, clearMemories, refreshMemories, activeConversationId]);

  const speakText = useCallback((text: string) => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = settings.voiceSpeed;
      const voices = window.speechSynthesis.getVoices();
      const prefer = voices.find(v => v.lang.startsWith(settings.voiceLanguage) && /female/i.test(v.name))
        || voices.find(v => v.lang.startsWith(settings.voiceLanguage))
        || voices.find(v => v.lang.startsWith('en'))
        || voices[0];
      if (prefer) u.voice = prefer;
      u.onstart = () => setCoreState('SPEAKING');
      u.onend = () => setCoreState('IDLE');
      u.onerror = () => setCoreState('IDLE');
      window.speechSynthesis.speak(u);
    }
  }, [settings.voiceSpeed, settings.voiceLanguage]);

  const startVoice = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCoreState('ERROR');
      return;
    }
    if (coreState === 'LISTENING') {
      setCoreState('IDLE');
      return;
    }
    setCoreState('THINKING');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : '';
      if (!mimeType) {
        stream.getTracks().forEach(t => t.stop());
        setCoreState('ERROR');
        return;
      }
      const recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 128000 });
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        if (chunks.length === 0) { setCoreState('IDLE'); return; }
        const blob = new Blob(chunks, { type: mimeType });
        const ab = await blob.arrayBuffer();
        const b64 = btoa(String.fromCharCode(...new Uint8Array(ab)));
        setCoreState('THINKING');
        try {
          const sttRes = await fetch('/api/voice/stt', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ audioBase64: b64, mimeType }),
          });
          const sttData = await sttRes.json();
          const text = typeof sttData.text === 'string' ? sttData.text.trim() : '';
          if (text) {
            await sendCommand(text, 'voice');
          } else {
            setCoreState('IDLE');
          }
        } catch {
          setCoreState('ERROR');
        }
      };
      recorder.start();
      setCoreState('LISTENING');
      setTimeout(() => {
        if (recorder.state === 'recording') recorder.stop();
      }, 8000);
    } catch (err: any) {
      setCoreState('ERROR');
    }
  }, [coreState, sendCommand]);

  const handleSend = useCallback((text: string) => {
    if (!text.trim() || isSending) return;
    sendCommand(text.trim());
    setCommand('');
  }, [isSending, sendCommand]);

  const stopSpeech = useCallback(() => {
    window.speechSynthesis?.cancel();
    if (coreState === 'SPEAKING') setCoreState('IDLE');
  }, [coreState]);

  const handleNewConversation = useCallback(() => {
    newConversation();
    setShowSidebar(false);
  }, [newConversation]);

  const handleSelectConversation = useCallback(async (id: string) => {
    await selectConversation(id);
    setShowSidebar(false);
  }, [selectConversation]);

  const handleDeleteConversation = useCallback(async (id: string, e: MouseEvent) => {
    e.stopPropagation();
    await deleteConversation(id);
  }, [deleteConversation]);

  const lastMsg = messages[messages.length - 1];

  return (
    <div className="nasi-app">
      {/* Top bar */}
      <header className="nasi-topbar">
        <div className="nasi-brand">
          <button className="nasi-icon-btn sidebar-toggle" onClick={() => setShowSidebar(!showSidebar)} title="Conversations">
            {showSidebar ? <ChevronLeft size={14} /> : <MessageSquare size={14} />}
          </button>
          <svg className="nasi-logo" viewBox="0 0 32 32">
            <circle cx="16" cy="16" r="14" fill="none" stroke="#1a5a66" strokeWidth="0.7" opacity="0.6" />
            <circle cx="16" cy="16" r="10" fill="none" stroke="#1a5a66" strokeWidth="0.4" strokeDasharray="2 3" opacity="0.5" />
            <circle cx="16" cy="16" r="5" fill="#1a5a66" opacity="0.3" />
            <circle cx="16" cy="16" r="2" fill="#4cdbdf" />
          </svg>
          <span className="nasi-brandname">NASI</span>
        </div>
        <nav className="nasi-nav">
          <button className={`nasi-nav-btn ${nav === 'home' ? 'active' : ''}`} onClick={() => setNav('home')}>Home</button>
          <button className={`nasi-nav-btn ${nav === 'chat' ? 'active' : ''}`} onClick={() => setNav('chat')}>Chat</button>
        </nav>
        <div className="nasi-topbar-actions">
          <button className="nasi-icon-btn" onClick={() => setShowMemory(true)} title="Memory"><Database size={14} /></button>
          <button className="nasi-icon-btn" onClick={() => setShowSettings(true)} title="Settings"><Settings2 size={14} /></button>
        </div>
      </header>

      {/* Conversation sidebar */}
      {showSidebar && (
        <div className="nasi-sidebar">
          <div className="nasi-sidebar-header">
            <span className="nasi-sidebar-title">CONVERSATIONS</span>
            <button className="nasi-sidebar-new" onClick={handleNewConversation} title="New conversation">
              <Plus size={14} />
            </button>
          </div>
          <div className="nasi-sidebar-list">
            {conversations.length === 0 && (
              <div className="nasi-sidebar-empty">No conversations yet</div>
            )}
            {conversations.map(conv => (
              <button
                key={conv.id}
                className={`nasi-sidebar-item ${conv.id === activeConversationId ? 'active' : ''}`}
                onClick={() => handleSelectConversation(conv.id)}
              >
                <div className="nasi-sidebar-item-text">{conv.title}</div>
                <div className="nasi-sidebar-item-meta">
                  <Clock size={9} />
                  <span>{new Date(conv.updatedAt).toLocaleDateString()}</span>
                </div>
                <button
                  className="nasi-sidebar-item-delete"
                  onClick={(e) => handleDeleteConversation(conv.id, e)}
                  title="Delete conversation"
                >
                  <Trash2 size={10} />
                </button>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Main canvas */}
      <div className={`nasi-canvas ${nav === 'chat' ? 'chat-mode' : ''}`}>
        {/* LEFT: World Globe */}
        <div className="nasi-zone-world">
          <WorldGlobe />
        </div>

        {/* CENTER-RIGHT: AI Core + Neural Modules */}
        <div className="nasi-zone-core">
          {/* Neural modules with connection lines */}
          <div className="nasi-neural-cluster">
            <div className="nasi-modules-col">
              {[
                { label: 'MEMORY', icon: <Database size={10} />, color: '#3ad6ea', action: () => setShowMemory(true) },
                { label: 'SKILLS', icon: <Activity size={10} />, color: '#45df9b', action: () => setShowSettings(true) },
                { label: 'PERSONALITY', icon: <Users size={10} />, color: '#f09b47', action: () => setShowSettings(true) },
                { label: 'SETTINGS', icon: <Settings2 size={10} />, color: '#a9b5c4', action: () => setShowSettings(true) },
              ].map(m => (
                <button key={m.label} className="nasi-module" style={{ '--mod-color': m.color } as any} onClick={m.action}>
                  {m.icon}
                  <span>{m.label}</span>
                </button>
              ))}
            </div>
            {/* Connection lines SVG */}
            <svg className="nasi-connections-svg" viewBox="0 0 120 200" preserveAspectRatio="none">
              <path d="M 10,25 C 60,25 60,80 110,95" stroke="#3ad6ea" strokeWidth="1.2" fill="none" opacity="0.35">
                <animate attributeName="stroke-dashoffset" values="0;12" dur="2s" repeatCount="indefinite" />
              </path>
              <path d="M 10,70 C 60,70 60,90 110,95" stroke="#45df9b" strokeWidth="1.2" fill="none" opacity="0.35">
                <animate attributeName="stroke-dashoffset" values="0;12" dur="2.3s" repeatCount="indefinite" />
              </path>
              <path d="M 10,115 C 60,115 60,100 110,95" stroke="#f09b47" strokeWidth="1.2" fill="none" opacity="0.35">
                <animate attributeName="stroke-dashoffset" values="0;12" dur="2.6s" repeatCount="indefinite" />
              </path>
              <path d="M 10,160 C 60,160 60,105 110,95" stroke="#a9b5c4" strokeWidth="1.2" fill="none" opacity="0.35">
                <animate attributeName="stroke-dashoffset" values="0;12" dur="2.9s" repeatCount="indefinite" />
              </path>
            </svg>
          </div>

          {/* THE CORE — particle sphere via Canvas */}
          <div className="nasi-core-area">
            <NASICoreCanvas state={coreState} />
            <div className={`nasi-core-state-overlay ${coreState !== 'IDLE' ? 'active' : ''}`}>
              {coreState !== 'IDLE' && coreState}
            </div>
          </div>

          {/* Voice controls */}
          <div className="nasi-voice-controls">
            <button
              className={`nasi-mic ${coreState === 'LISTENING' ? 'listening' : coreState === 'SPEAKING' ? 'speaking' : ''}`}
              onClick={startVoice}
              title={coreState === 'LISTENING' ? 'Stop' : 'Start voice'}
            >
              <Mic size={22} />
            </button>
            <button
              className={`nasi-stop ${coreState === 'SPEAKING' ? 'active' : ''}`}
              onClick={stopSpeech}
              disabled={coreState !== 'SPEAKING'}
              title="Stop speech"
            >
              <VolumeX size={14} />
            </button>
            <div className="nasi-voice-sep" />
            <span className={`nasi-state-label ${coreState !== 'IDLE' ? 'active' : ''}`}>
              {coreState === 'IDLE' ? 'READY' : coreState}
            </span>
          </div>

          {/* Waveform */}
          <div className={`nasi-waveform ${coreState === 'LISTENING' ? 'listening' : coreState === 'SPEAKING' ? 'speaking' : ''}`}>
            {Array.from({ length: 32 }).map((_, i) => (
              <div key={i} className="nasi-wavebar" style={{ animationDelay: `${i * 0.03}s` }} />
            ))}
          </div>

          {/* Last response */}
          {lastMsg && (
            <div className="nasi-last-response">
              <span className={`nasi-msg-dot ${lastMsg.from}`} />
              <span className="nasi-msg-text">{lastMsg.text.length > 140 ? lastMsg.text.slice(0, 140) + '…' : lastMsg.text}</span>
            </div>
          )}

          {/* Chat input */}
          <div className="nasi-chatbar">
            <input
              className="nasi-chatinput"
              value={command}
              onChange={e => setCommand(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && command.trim()) handleSend(command); }}
              placeholder="Talk to NASI..."
            />
            <button className="nasi-chaticon" onClick={startVoice} title="Voice"><Mic size={12} /></button>
            <button className="nasi-send" onClick={() => handleSend(command)} disabled={!command.trim() || isSending}>
              <Send size={12} />
            </button>
          </div>
        </div>
      </div>

      {/* BOTTOM: Agent Town */}
      <div className="nasi-zone-agents">
        <AgentOffice agents={AGENTS} onSelectAgent={(a) => { setSelectedAgent(a); }} />
      </div>

      {/* ===== SETTINGS MODAL ===== */}
      {showSettings && (
        <div className="nasi-modal-bg" onClick={() => setShowSettings(false)}>
          <div className="nasi-modal nasi-settings-modal" onClick={e => e.stopPropagation()}>
            <button className="nasi-modal-close" onClick={() => setShowSettings(false)}><X size={14} /></button>
            <div className="nasi-modal-kicker"><Settings2 size={10} /> SETTINGS</div>

            {/* Provider */}
            <div className="nasi-settings-group">
              <label className="nasi-settings-label"><Cpu size={9} /> PROVIDER</label>
              <div className="nasi-settings-row-group">
                {PROVIDERS.map(p => (
                  <button
                    key={p}
                    className={`nasi-settings-chip ${settingsDraft.provider === p ? 'active' : ''}`}
                    onClick={() => setSettingsDraft(s => ({ ...s, provider: p }))}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            {/* Model */}
            <div className="nasi-settings-group">
              <label className="nasi-settings-label"><Activity size={9} /> MODEL NAME</label>
              <input
                className="nasi-settings-input"
                value={settingsDraft.model}
                onChange={e => setSettingsDraft(s => ({ ...s, model: e.target.value }))}
                placeholder="e.g. gemini-2.0-flash"
              />
            </div>

            {/* API Key */}
            <div className="nasi-settings-group">
              <label className="nasi-settings-label"><Key size={9} /> API KEY</label>
              <input
                className="nasi-settings-input"
                type="password"
                value={settingsDraft.apiKey}
                onChange={e => setSettingsDraft(s => ({ ...s, apiKey: e.target.value }))}
                placeholder="Paste your API key here"
              />
            </div>

            {/* Voice Language */}
            <div className="nasi-settings-group">
              <label className="nasi-settings-label"><Languages size={9} /> VOICE LANGUAGE</label>
              <div className="nasi-settings-row-group">
                {[
                  { label: 'English', value: 'en-US' },
                  { label: 'Urdu', value: 'ur-PK' },
                  { label: 'Auto', value: '' },
                ].map(l => (
                  <button
                    key={l.value}
                    className={`nasi-settings-chip ${settingsDraft.voiceLanguage === l.value ? 'active' : ''}`}
                    onClick={() => setSettingsDraft(s => ({ ...s, voiceLanguage: l.value }))}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Voice Speed */}
            <div className="nasi-settings-group">
              <label className="nasi-settings-label"><Speaker size={9} /> VOICE SPEED: {settingsDraft.voiceSpeed.toFixed(2)}</label>
              <input
                className="nasi-settings-range"
                type="range"
                min="0.5"
                max="1.5"
                step="0.05"
                value={settingsDraft.voiceSpeed}
                onChange={e => setSettingsDraft(s => ({ ...s, voiceSpeed: parseFloat(e.target.value) }))}
              />
            </div>

            {/* Personality */}
            <div className="nasi-settings-group">
              <label className="nasi-settings-label"><BrainCircuit size={9} /> PERSONALITY</label>
              <div className="nasi-settings-row-group">
                {[
                  { label: 'Warm', value: 'warm' },
                  { label: 'Professional', value: 'professional' },
                  { label: 'Playful', value: 'playful' },
                  { label: 'Stoic', value: 'stoic' },
                ].map(p => (
                  <button
                    key={p.value}
                    className={`nasi-settings-chip ${settingsDraft.personality === p.value ? 'active' : ''}`}
                    onClick={() => setSettingsDraft(s => ({ ...s, personality: p.value as PersonalityType }))}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="nasi-settings-actions">
              <button className="nasi-modal-btn primary" onClick={handleSaveSettings}>
                <Save size={10} /> {settingsSaved ? 'SAVED ✓' : 'SAVE'}
              </button>
              <button className="nasi-modal-btn" onClick={() => setShowSettings(false)}>CLOSE</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== MEMORY MODAL ===== */}
      {showMemory && (
        <div className="nasi-modal-bg" onClick={() => setShowMemory(false)}>
          <div className="nasi-modal nasi-memory-modal" onClick={e => e.stopPropagation()}>
            <button className="nasi-modal-close" onClick={() => setShowMemory(false)}><X size={14} /></button>
            <div className="nasi-modal-kicker"><Database size={12} /> MEMORY</div>

            {memories.length === 0 ? (
              <>
                <div className="nasi-empty">No memories stored yet</div>
                <div className="nasi-empty-hint">
                  Say "NASI, remember that..." or type it in chat to create a memory.
                  <br /><br />
                  Try:
                  <br />• "Remember that I prefer short answers"
                  <br />• "Remember that my project is called NASI"
                  <br />• "What do you remember about me?"
                </div>
              </>
            ) : (
              <div className="nasi-memory-list">
                {memories.map(m => (
                  <div key={m.id} className="nasi-memory-item">
                    <div className="nasi-memory-item-header">
                      <span className="nasi-memory-category">{m.category}</span>
                      <span className="nasi-memory-importance">★ {m.importance}</span>
                    </div>
                    <div className="nasi-memory-key">{m.key}</div>
                    <div className="nasi-memory-value">{m.value}</div>
                    <button className="nasi-memory-delete" onClick={() => deleteMemory(m.id)} title="Delete memory">
                      <Trash2 size={10} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="nasi-settings-actions">
              {memories.length > 0 && (
                <button className="nasi-modal-btn danger" onClick={async () => { await clearMemories(); refreshMemories(); }}>
                  <Trash2 size={10} /> CLEAR ALL
                </button>
              )}
              <button className="nasi-modal-btn" onClick={() => setShowMemory(false)}>CLOSE</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== AGENT MODAL ===== */}
      {selectedAgent && (
        <div className="nasi-modal-bg" onClick={() => setSelectedAgent(null)}>
          <div className="nasi-modal nasi-agent-modal" onClick={e => e.stopPropagation()}>
            <button className="nasi-modal-close" onClick={() => setSelectedAgent(null)}><X size={14} /></button>
            <div className="nasi-agent-avatar" style={{ background: selectedAgent.color, color: '#05090d' }}>
              {selectedAgent.initials}
            </div>
            <div className="nasi-modal-kicker" style={{ color: selectedAgent.color }}>
              <span className="nasi-dot" style={{ background: selectedAgent.color }} /> AGENT
            </div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{selectedAgent.name}</h3>
            <div className="nasi-agent-role">{selectedAgent.role}</div>
            <div className="nasi-agent-status">{selectedAgent.status}</div>
            <div className="nasi-agent-capabilities">
              <div className="nasi-agent-cap-title">CAPABILITIES</div>
              <div className="nasi-agent-cap-list">
                {selectedAgent.name === 'Research' && 'Web search, data analysis, source verification'}
                {selectedAgent.name === 'Browser' && 'Page navigation, content extraction, form filling'}
                {selectedAgent.name === 'Computer' && 'File management, code execution, system commands'}
                {selectedAgent.name === 'Memory' && 'Context storage, preference learning, recall'}
                {selectedAgent.name === 'Shopify' && 'Product management, order processing, analytics'}
                {selectedAgent.name === 'Comm' && 'Email, messaging, notifications, scheduling'}
                {selectedAgent.name === 'File' && 'File organization, document processing, OCR'}
                {selectedAgent.name === 'Security' && 'Access control, threat detection, monitoring'}
              </div>
            </div>
            <button className="nasi-modal-btn" onClick={() => setSelectedAgent(null)}>CLOSE</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ===== NASI CORE — Canvas Particle Sphere ===== */
function NASICoreCanvas({ state }: { state: CoreState }) {
  const canvasRef = useState<HTMLCanvasElement | null>(null)[0];
  const canvasCallbackRef = useCallback((canvas: HTMLCanvasElement | null) => {
    (canvasRef as any).__current = canvas;
  }, []);
  const animRef = useState(0)[0];
  const particlesRef = useState<{ x: number; y: number; z: number; vx: number; vy: number; vz: number; size: number; hue: number }[]>([])[0];

  useEffect(() => {
    const canvas = (canvasRef as any)?.__current as HTMLCanvasElement | undefined;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = 280;
    const H = 280;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.scale(dpr, dpr);

    const cx = W / 2;
    const cy = H / 2;
    const R = 85;

    if (particlesRef.current.length === 0) {
      for (let i = 0; i < 200; i++) {
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        const r = R * (0.6 + Math.random() * 0.4);
        particlesRef.current.push({
          x: r * Math.sin(phi) * Math.cos(theta),
          y: r * Math.sin(phi) * Math.sin(theta),
          z: r * Math.cos(phi),
          vx: (Math.random() - 0.5) * 0.15,
          vy: (Math.random() - 0.5) * 0.15,
          vz: (Math.random() - 0.5) * 0.15,
          size: 0.8 + Math.random() * 1.5,
          hue: Math.random() * 40 + 170,
        });
      }
    }

    let rotY = 0;
    let rotX = 0.3;
    let frame = 0;

    const getStateColor = () => {
      switch (state) {
        case 'LISTENING': return { r: 58, g: 214, b: 234, intensity: 1.0 };
        case 'THINKING': return { r: 58, g: 214, b: 234, intensity: 0.8 };
        case 'SPEAKING': return { r: 69, g: 223, b: 155, intensity: 1.0 };
        case 'ERROR': return { r: 233, g: 103, b: 95, intensity: 0.9 };
        default: return { r: 58, g: 140, b: 160, intensity: 0.4 };
      }
    };

    const animate = () => {
      ctx.clearRect(0, 0, W, H);
      frame++;

      const sc = getStateColor();
      const speed = state === 'THINKING' ? 0.012 : state === 'LISTENING' ? 0.015 : 0.005;
      rotY += speed;
      if (state === 'THINKING') rotX += 0.003;

      const cosY = Math.cos(rotY);
      const sinY = Math.sin(rotY);
      const cosX = Math.cos(rotX);
      const sinX = Math.sin(rotX);

      const atmoGrad = ctx.createRadialGradient(cx, cy, R * 0.3, cx, cy, R * 1.3);
      atmoGrad.addColorStop(0, `rgba(${sc.r},${sc.g},${sc.b},${0.06 * sc.intensity})`);
      atmoGrad.addColorStop(0.5, `rgba(${sc.r},${sc.g},${sc.b},${0.02 * sc.intensity})`);
      atmoGrad.addColorStop(1, 'transparent');
      ctx.fillStyle = atmoGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, R * 1.3, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = `rgba(${sc.r},${sc.g},${sc.b},${0.15 * sc.intensity})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, R + 10, 0, Math.PI * 2);
      ctx.stroke();

      const projected = particlesRef.current.map(p => {
        let x = p.x * cosY - p.z * sinY;
        let z = p.x * sinY + p.z * cosY;
        let y = p.y * cosX - z * sinX;
        z = p.y * sinX + z * cosX;

        p.x += p.vx;
        p.y += p.vy;
        p.z += p.vz;
        const dist = Math.sqrt(p.x * p.x + p.y * p.y + p.z * p.z);
        if (dist > R * 1.1) {
          p.vx *= -0.8;
          p.vy *= -0.8;
          p.vz *= -0.8;
        }

        return { sx: cx + x, sy: cy + y, z, size: p.size, hue: p.hue };
      });

      projected.sort((a, b) => a.z - b.z);

      projected.forEach(p => {
        const depth = (p.z + R) / (2 * R);
        const alpha = 0.15 + depth * 0.6 * sc.intensity;
        const sz = p.size * (0.5 + depth * 0.8);

        ctx.fillStyle = `hsla(${p.hue}, 70%, 65%, ${alpha})`;
        ctx.beginPath();
        ctx.arc(p.sx, p.sy, sz, 0, Math.PI * 2);
        ctx.fill();
      });

      const pulse = state === 'IDLE' ? 1 : 1 + Math.sin(frame * 0.05) * 0.15;
      const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, 25 * pulse);
      coreGrad.addColorStop(0, `rgba(${sc.r},${sc.g},${sc.b},${0.25 * sc.intensity})`);
      coreGrad.addColorStop(1, 'transparent');
      ctx.fillStyle = coreGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, 25 * pulse, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = `rgba(${sc.r},${sc.g},${sc.b},${0.2 * sc.intensity})`;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.arc(cx, cy, R * 0.6, 0, Math.PI * 2);
      ctx.stroke();

      animRef.current = requestAnimationFrame(animate);
    };

    animate();
    return () => cancelAnimationFrame(animRef.current);
  }, [state, canvasRef, particlesRef, animRef]);

  return (
    <canvas
      ref={canvasCallbackRef}
      className="nasi-core-canvas"
      style={{ width: 280, height: 280 }}
    />
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
