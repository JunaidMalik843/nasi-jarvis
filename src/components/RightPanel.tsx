import { Mic, Terminal, MessageSquare, Plus, ChevronLeft, ChevronRight, Settings2 } from 'lucide-react';
import { useState } from 'react';

const tabItems = [
  { id: 'voice', label: 'VOICE', icon: Mic },
  { id: 'agent', label: 'AGENT', icon: Terminal },
  { id: 'notes', label: 'NOTES', icon: MessageSquare },
];

export function RightPanel({ onNewTab }: { onNewTab: () => void }) {
  const [activeTab, setActiveTab] = useState('agent');

  return (
    <section className="stonic-right-panel">
      <div className="stonic-tabs-header">
        <div className="stonic-tab-buttons">
          {tabItems.map((tab) => (
            <button
              key={tab.id}
              className={`stonic-tab ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <tab.icon size={11} />
              <span>{tab.label}</span>
            </button>
          ))}
          <button className="stonic-tab-add" onClick={onNewTab}>
            <Plus size={12} />
          </button>
        </div>
        <div className="stonic-tab-history">
          <button className="stonic-tab-history-btn"><ChevronLeft size={10} /></button>
          <button className="stonic-tab-history-btn"><ChevronRight size={10} /></button>
          <button className="stonic-tab-history-btn"><Settings2 size={10} /></button>
        </div>
      </div>
      <div className="stonic-panel-content">
        {activeTab === 'voice' && <VoiceTabContent />}
        {activeTab === 'agent' && <AgentTabContent />}
        {activeTab === 'notes' && <NotesTabContent />}
      </div>
    </section>
  );
}

function VoiceTabContent() {
  return (
    <div className="stonic-tab-content">
      <div className="stonic-tab-content-header">VOICE INPUT</div>
      <div className="stonic-voice-status">
        <span className="stonic-voice-state-pill">STANDBY</span>
      </div>
      <div className="stonic-voice-visual">
        <div className="stonic-voice-ring ring-one" />
        <div className="stonic-voice-ring ring-two" />
        <div className="stonic-voice-ring ring-three" />
        <div className="stonic-voice-core">
          <Mic size={22} />
        </div>
      </div>
      <button className="stonic-start-voice-btn">
        <Mic size={11} />
        <span>START VOICE</span>
      </button>
    </div>
  );
}

function AgentTabContent() {
  return (
    <div className="stonic-tab-content">
      <div className="stonic-tab-content-header">AGENT OUTPUT</div>
      <div className="stonic-code-block">
        <div className="stonic-code-header">
          <span className="stonic-code-lang">Python</span>
          <span className="stonic-code-filename">scraper.py</span>
        </div>
        <pre className="stonic-code"><code>{`.exec(rate|price|gold', re.I)):
    text = div.get_text(strip=True)
    if any(k in text.lower() for k in ['tola', '10 gram', '24k']) and any(c.isdigit() for c in text):
        print(f"Div: {text[:150]}\n")
`}</code></pre>
      </div>
      <div className="stonic-output-section">
        <div className="stonic-output-header">OUTPUT</div>
        <div className="stonic-output-content">
          {"{\"status\": \"success\", \"output\": \"Found 3 tables\\r\\n\\r\\n-- Table 8 --\\r\\nGold Purity | Ounce\\r\\n\\r\\n24K Ounce | $4,872\\r\\n\", \"duration_seconds\": 1.84}"}
        </div>
      </div>
    </div>
  );
}

function NotesTabContent() {
  return (
    <div className="stonic-tab-content">
      <div className="stonic-tab-content-header">NOTES</div>
      <div className="stonic-notes-empty">
        No notes yet
      </div>
    </div>
  );
}
