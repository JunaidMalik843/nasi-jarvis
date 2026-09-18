import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Bot } from 'lucide-react';

type Agent = {
  name: string;
  role: string;
  color: string;
  status: string;
  initials: string;
};

interface AgentTownProps {
  agents: Agent[];
  activeEnv: 'agents' | 'world';
  onEnvChange: (env: 'agents' | 'world') => void;
}

export function AgentTown({ agents, activeEnv, onEnvChange }: AgentTownProps) {
  const [selected, setSelected] = useState<Agent | null>(null);

  return (
    <div className="agent-scene">
      <div className="agent-scene-grid" />
      <div className="agent-scene-floor" />

      {/* Desks with monitors */}
      <div className="agent-workspace">
        {agents.slice(0, 3).map((agent, i) => (
          <div
            key={agent.name}
            className="agent-desk"
            style={{
              left: `${12 + i * 28}%`,
              bottom: '36px',
              '--desk-color': agent.color,
            } as CSSProperties}
            onClick={() => setSelected(agent)}
          >
            <div className={`agent-monitor ${agent.status === 'Scanning' ? 'active' : ''}`}>
              <div className="agent-monitor-screen">
                {agent.status === 'Scanning' && (
                  <span className="agent-monitor-scan" />
                )}
                {agent.status === 'Building' && (
                  <span className="agent-monitor-build" />
                )}
                {agent.status === 'Indexing' && (
                  <span className="agent-monitor-index" />
                )}
                {agent.status === 'Monitoring' && (
                  <span className="agent-monitor-monitor" />
                )}
              </div>
            </div>
            <div className="agent-chair" />
          </div>
        ))}
      </div>

      {/* Agent figures */}
      <div className="agent-figures">
        {agents.map((agent, i) => (
          <div
            key={agent.name}
            className={`agent-figure ${agent.status === 'Scanning' ? 'working' : agent.status === 'Building' ? 'working' : agent.status === 'Indexing' ? 'working' : 'idle'} ${agent.name.toLowerCase()}`}
            style={{
              bottom: '34px',
              left: `${14 + i * 28}%`,
            } as CSSProperties}
            onClick={() => setSelected(agent)}
          >
            <div className="agent-head">{agent.initials}</div>
            <div className="agent-body" />
          </div>
        ))}
      </div>

      {/* Status footer */}
      <div className="agent-town-status">
        <span>
          <span className="agent-dot" />
          {agents.filter((a) => a.status !== 'Offline').length}/{agents.length} active
        </span>
        <button
          className="agent-env-toggle"
          onClick={() => onEnvChange(activeEnv === 'agents' ? 'world' : 'agents')}
        >
          <Bot size={10} />
          {activeEnv === 'agents' ? 'AGENTS' : 'WORLD'}
        </button>
      </div>

      {/* Selected agent modal trigger */}
      {selected && (
        <div className="agent-selected-modal" onClick={() => setSelected(null)}>
          <div className="agent-selected-card" onClick={(e) => e.stopPropagation()}>
            <div
              className="agent-selected-avatar"
              style={{ background: selected.color, color: '#061011', fontWeight: 700 }}
            >
              {selected.initials}
            </div>
            <div className="agent-selected-name">{selected.name}</div>
            <div className="agent-selected-role">{selected.role} · {selected.status}</div>
            <div className="agent-selected-actions">
              <button className="agent-delegate">
                <Bot size={11} /> Delegate
              </button>
              <button className="agent-close">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
