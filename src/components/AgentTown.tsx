import { Bot, ChevronLeft, ChevronRight, Settings } from 'lucide-react';
import { useState } from 'react';
import type { CSSProperties } from 'react';

const agents = [
  { name: 'Nora', role: 'Director', color: '#3ad5e3' },
  { name: 'Dave', role: 'Engineer', color: '#f09b47' },
  { name: 'Kitsune', role: 'Researcher', color: '#43dcaa' },
  { name: 'Bob', role: 'Builder', color: '#9babb0' },
  { name: 'Carol', role: 'Memory', color: '#eaa247' },
  { name: 'David', role: 'Security', color: '#5a7a80' },
  { name: 'Libra', role: 'Analyst', color: '#a9b5c4' },
];

export function AgentTown({ onAgentClick }: { onAgentClick?: (agent: typeof agents[0]) => void }) {
  const [selectedTab, setSelectedTab] = useState('agents');

  return (
    <section className="stonic-agenttown-panel">
      <div className="stonic-panel-header">
        <div className="stonic-panel-label">
          <Bot size={12} />
          <span>AGENT TOWN</span>
        </div>
        <div className="stonic-segmented-control">
          <button className={selectedTab === 'agents' ? 'active' : ''} onClick={() => setSelectedTab('agents')}>Agents</button>
          <button className={selectedTab === 'visual hub' ? 'active' : ''} onClick={() => setSelectedTab('visual hub')}>Visual hub</button>
          <button className={selectedTab === 'gesture' ? 'active' : ''} onClick={() => setSelectedTab('gesture')}>Gesture</button>
        </div>
        <div className="stonic-panel-actions-right">
          <button className="stonic-icon-btn"><ChevronLeft size={11} /></button>
          <button className="stonic-icon-btn"><ChevronRight size={11} /></button>
          <button className="stonic-icon-btn"><Settings size={11} /></button>
        </div>
      </div>
      <div className="stonic-agent-avatars">
        {agents.map((agent, i) => (
          <button key={agent.name} className="stonic-agent-avatar" style={{ '--agent-color': agent.color } as CSSProperties}>
            {agent.name[0]}
          </button>
        ))}
      </div>
      <div className="stonic-pixel-scene">
        <div className="stonic-scene-grid" />
        <div className="stonic-scene-wall" />
        <div className="stonic-scene-doors">
          <div className="stonic-door door-left" />
          <div className="stonic-door door-right" />
        </div>
        <div className="stonic-scene-desks">
          <div className="stonic-desk desk-1">
            <div className="stonic-monitor" />
            <div className="stonic-chair" />
            <div className="stonic-computer" />
          </div>
          <div className="stonic-desk desk-2">
            <div className="stonic-monitor" />
            <div className="stonic-chair" />
            <div className="stonic-filing-cabinet" />
          </div>
          <div className="stonic-desk desk-3">
            <div className="stonic-monitor" />
            <div className="stonic-chair" />
            <div className="stonic-plant" />
          </div>
          <div className="stonic-desk desk-4">
            <div className="stonic-chair" />
            <div className="stonic-computer" />
          </div>
        </div>
        <div className="stonic-pixel-characters">
          <div className="stonic-pixel-char" style={{ '--char-color': agents[0].color } as CSSProperties} data-name="Nora">
            <div className="stonic-pixel-char-head"><span>N</span></div>
          </div>
          <div className="stonic-pixel-char" style={{ '--char-color': agents[1].color } as CSSProperties} data-name="Dave">
            <div className="stonic-pixel-char-head"><span>D</span></div>
          </div>
          <div className="stonic-pixel-char" style={{ '--char-color': agents[2].color } as CSSProperties} data-name="Kitsune">
            <div className="stonic-pixel-char-head"><span>K</span></div>
          </div>
          <div className="stonic-pixel-char" style={{ '--char-color': agents[3].color } as CSSProperties} data-name="Bob">
            <div className="stonic-pixel-char-head"><span>B</span></div>
          </div>
          <div className="stonic-pixel-char" style={{ '--char-color': agents[4].color } as CSSProperties} data-name="Carol">
            <div className="stonic-pixel-char-head"><span>C</span></div>
          </div>
          <div className="stonic-pixel-char" style={{ '--char-color': agents[5].color } as CSSProperties} data-name="David">
            <div className="stonic-pixel-char-head"><span>D</span></div>
          </div>
          <div className="stonic-pixel-char active" style={{ '--char-color': agents[6].color } as CSSProperties} data-name="Libra">
            <div className="stonic-pixel-char-head"><span>L</span></div>
            <div className="stonic-char-label">Press E</div>
          </div>
        </div>
        <div className="stonic-scene-floor" />
      </div>
      <div className="stonic-scene-status">
        <span className="stonic-status-dot" /> 7/7 active
        <span className="stonic-scene-divider" />
        04 busy
      </div>
    </section>
  );
}
