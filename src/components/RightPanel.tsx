import { Terminal, MessageSquare, Settings2, Database, Globe2, BrainCircuit, Shield, Zap, Wrench, FileText, Server, Radar } from 'lucide-react';
import { useState } from 'react';
import type { CSSProperties } from 'react';

const tabs = [
  { id: 'tools', label: 'Tools', icon: Wrench },
  { id: 'agents', label: 'Agents', icon: Terminal },
  { id: 'world', label: 'World', icon: Globe2 },
  { id: 'security', label: 'Security', icon: Shield },
];

const toolList = [
  { icon: Database, label: 'Memory', color: '#3ad6ea' },
  { icon: Zap, label: 'Skills', color: '#f09b47' },
  { icon: BrainCircuit, label: 'Core', color: '#9babb0' },
  { icon: Globe2, label: 'World', color: '#5a9cff' },
  { icon: Shield, label: 'Security', color: '#e9675f' },
  { icon: FileText, label: 'Notes', color: '#5fe0c8' },
  { icon: Server, label: 'System', color: '#eab458' },
];

export function RightPanel() {
  const [activeTab, setActiveTab] = useState<'tools' | 'agents' | 'world' | 'security'>('tools');

  return (
    <section className="right-panel">
      <div className="right-tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`right-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <tab.icon size={11} />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>
      <div className="right-content">
        {activeTab === 'tools' && (
          <div className="right-tools">
            {toolList.map((tool) => (
              <button
                key={tool.label}
                className="right-tool"
                style={{ '--tool-color': tool.color } as CSSProperties}
              >
                <tool.icon size={12} />
                <span>{tool.label}</span>
              </button>
            ))}
          </div>
        )}
        {activeTab === 'agents' && (
          <div className="right-agents">
            <div className="right-agent" style={{ '--agent-color': '#3ad6ea' } as CSSProperties}>
              <div className="right-agent-dot" />
              <span>Alice</span>
              <span className="right-agent-role">Intelligence</span>
            </div>
            <div className="right-agent" style={{ '--agent-color': '#f09b47' } as CSSProperties}>
              <div className="right-agent-dot" />
              <span>Bob</span>
              <span className="right-agent-role">Engineering</span>
            </div>
            <div className="right-agent" style={{ '--agent-color': '#3fe0b8' } as CSSProperties}>
              <div className="right-agent-dot" />
              <span>Carol</span>
              <span className="right-agent-role">Memory</span>
            </div>
            <div className="right-agent" style={{ '--agent-color': '#a9b5c4' } as CSSProperties}>
              <div className="right-agent-dot" />
              <span>Dave</span>
              <span className="right-agent-role">Telemetry</span>
            </div>
          </div>
        )}
        {activeTab === 'world' && (
          <div className="right-world">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <span className="right-world-label"><Radar size={11} /> MONITOR</span>
              <span className="right-world-status"><span className="right-world-dot" /> LIVE</span>
            </div>
            <div className="right-world-regions">
              <div className="right-region"><span>NA</span><span className="right-region-dot" /></div>
              <div className="right-region"><span>EU</span><span className="right-region-dot emerald" /></div>
              <div className="right-region"><span>AS</span><span className="right-region-dot gold" /></div>
            </div>
          </div>
        )}
        {activeTab === 'security' && (
          <div className="right-security">
            <div className="right-security-item">
              <Shield size={12} />
              <span>Voice encryption</span>
              <span className="right-security-badge active" />
            </div>
            <div className="right-security-item">
              <Shield size={12} />
              <span>Payments</span>
              <span className="right-security-badge" />
            </div>
            <div className="right-security-item">
              <Shield size={12} />
              <span>PC control</span>
              <span className="right-security-badge" />
            </div>
            <div className="right-security-item">
              <Shield size={12} />
              <span>Web access</span>
              <span className="right-security-badge pending" />
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
