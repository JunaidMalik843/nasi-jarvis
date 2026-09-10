import React from 'react';

interface Agent {
  name: string;
  role: string;
  color: string;
  status: string;
  initials: string;
}

interface AgentOfficeProps {
  agents: Agent[];
  onSelectAgent: (agent: Agent) => void;
}

interface Room {
  x: number;
  w: number;
  label: string;
  agents: number[];
}

const rooms: Room[] = [
  { x: 30, w: 165, label: 'RESEARCH', agents: [0, 1] },
  { x: 210, w: 165, label: 'COMPUTING', agents: [2, 3] },
  { x: 390, w: 165, label: 'COMMERCE', agents: [4] },
  { x: 570, w: 190, label: 'INFRASTRUCTURE', agents: [5, 6, 7] },
];

const agentDefs: { name: string; role: string; color: string; initials: string }[] = [
  { name: 'Research', role: 'Research Agent', color: '#3ad6ea', initials: 'R' },
  { name: 'Browser', role: 'Browser Agent', color: '#45df9b', initials: 'B' },
  { name: 'Computer', role: 'Computer Agent', color: '#f09b47', initials: 'C' },
  { name: 'Memory', role: 'Memory Agent', color: '#a9b5c4', initials: 'M' },
  { name: 'Shopify', role: 'Shopify Agent', color: '#45df9b', initials: 'S' },
  { name: 'Comm', role: 'Communication Agent', color: '#3ad6ea', initials: 'C' },
  { name: 'File', role: 'File Agent', color: '#f09b47', initials: 'F' },
  { name: 'Security', role: 'Security Agent', color: '#e9675f', initials: 'X' },
];

export default function AgentOffice({ agents, onSelectAgent }: AgentOfficeProps) {
  const agentStatuses = agentDefs.map((a, i) => ({
    ...a,
    status: agents[i]?.status || 'Idle',
  }));

  return (
    <svg viewBox="0 0 800 240" preserveAspectRatio="xMidYMid meet" style={{ width: '100%', height: '100%' }}>
      <defs>
        <linearGradient id="agFloor" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(10,18,26,0.6)" />
          <stop offset="100%" stopColor="rgba(6,12,18,0.9)" />
        </linearGradient>
        <linearGradient id="agWall" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(58,214,234,0.12)" />
          <stop offset="100%" stopColor="rgba(58,214,234,0.03)" />
        </linearGradient>
        <filter id="agGlow">
          <feGaussianBlur stdDeviation="2.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="screenGlow">
          <feGaussianBlur stdDeviation="1.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Floor */}
      <rect x="20" y="20" width="760" height="200" rx="6" fill="url(#agFloor)" stroke="rgba(58,214,234,0.06)" strokeWidth="0.8" />

      {/* Floor grid */}
      {Array.from({ length: 22 }).map((_, i) => (
        <line key={`fh${i}`} x1="20" y1={30 + i * 9} x2="780" y2={30 + i * 9} stroke="rgba(58,214,234,0.02)" strokeWidth="0.3" />
      ))}
      {Array.from({ length: 42 }).map((_, i) => (
        <line key={`fv${i}`} x1={20 + i * 18.5} y1="20" x2={20 + i * 18.5} y2="220" stroke="rgba(58,214,234,0.02)" strokeWidth="0.3" />
      ))}

      {/* Room walls */}
      {rooms.map((room, ri) => (
        <React.Fragment key={`wall-${ri}`}>
          {/* Vertical wall after room */}
          {ri < rooms.length - 1 && (
            <>
              <line x1={room.x + room.w + 15} y1="20" x2={room.x + room.w + 15} y2="108" stroke="rgba(58,214,234,0.1)" strokeWidth="1.2" strokeDasharray="3,3" />
              <line x1={room.x + room.w + 15} y1="132" x2={room.x + room.w + 15} y2="220" stroke="rgba(58,214,234,0.1)" strokeWidth="1.2" strokeDasharray="3,3" />
              {/* Door gap */}
              <rect x={room.x + room.w + 11} y="108" width="8" height="24" rx="1" fill="rgba(58,214,234,0.02)" />
            </>
          )}

          {/* Room label */}
          <text x={room.x + room.w / 2 + 7.5} y="36" textAnchor="middle" fill="rgba(58,214,234,0.18)" fontSize="6.5" fontFamily="'JetBrains Mono', monospace" letterSpacing="0.2em" fontWeight="600">
            {room.label}
          </text>
        </React.Fragment>
      ))}

      {/* Windows on top wall */}
      {[60, 170, 280, 390, 500, 610, 700].map((wx, i) => (
        <rect key={`win-${i}`} x={wx} y="22" width="30" height="6" rx="1" fill="none" stroke="rgba(58,214,234,0.08)" strokeWidth="0.5" strokeDasharray="2,2">
          <animate attributeName="stroke-opacity" values="0.08;0.18;0.08" dur={`${3 + i * 0.5}s`} repeatCount="indefinite" />
        </rect>
      ))}

      {/* Workstations for each room */}
      {rooms.map((room, ri) =>
        room.agents.map((ai, wi) => {
          const agent = agentStatuses[ai];
          const isWorking = agent.status !== 'Idle';
          const deskX = room.x + 15 + wi * (room.w / room.agents.length + 10);
          const deskY = 80;

          return (
            <g key={`ws-${ri}-${wi}`} style={{ cursor: 'pointer' }} onClick={() => onSelectAgent({ ...agent, status: agent.status } as Agent)}>
              {/* Desk */}
              <rect x={deskX} y={deskY} width="46" height="16" rx="2" fill="rgba(14,22,30,0.9)" stroke="rgba(58,214,234,0.12)" strokeWidth="0.6" />
              {/* Desk surface highlight */}
              <rect x={deskX + 1} y={deskY + 1} width="44" height="2" rx="1" fill="rgba(58,214,234,0.06)" />

              {/* Monitor */}
              <rect x={deskX + 10} y={deskY - 14} width="26" height="16" rx="2" fill="rgba(4,10,16,0.95)" stroke={isWorking ? `${agent.color}55` : 'rgba(58,214,234,0.1)'} strokeWidth="0.7" />
              {/* Screen content */}
              <rect x={deskX + 12} y={deskY - 12} width="22" height="12" rx="1" fill={isWorking ? `${agent.color}11` : 'rgba(58,214,234,0.02)'}>
                {isWorking && (
                  <animate attributeName="fill" values={`${agent.color}11;${agent.color}22;${agent.color}11`} dur="2s" repeatCount="indefinite" />
                )}
              </rect>
              {/* Screen scan line */}
              {isWorking && (
                <rect x={deskX + 12} y={deskY - 12} width="22" height="2" rx="1" fill={`${agent.color}20`} filter="url(#screenGlow)">
                  <animate attributeName="y" values={`${deskY - 12};${deskY - 2};${deskY - 12}`} dur="3s" repeatCount="indefinite" />
                </rect>
              )}
              {/* Monitor stand */}
              <line x1={deskX + 23} y1={deskY + 2} x2={deskX + 23} y2={deskY - 0} stroke="rgba(58,214,234,0.08)" strokeWidth="1" />
              <rect x={deskX + 18} y={deskY + 2} width="10" height="2" rx="1" fill="rgba(58,214,234,0.06)" />

              {/* Keyboard */}
              <rect x={deskX + 4} y={deskY + 3} width="16" height="6" rx="1" fill="rgba(10,16,22,0.8)" stroke="rgba(58,214,234,0.06)" strokeWidth="0.3" />

              {/* Chair */}
              <ellipse cx={deskX + 23} cy={deskY + 30} rx="9" ry="6" fill="rgba(12,20,28,0.8)" stroke="rgba(58,214,234,0.06)" strokeWidth="0.4" />
              {/* Chair back */}
              <rect x={deskX + 16} y={deskY + 20} width="14" height="6" rx="3" fill="rgba(12,20,28,0.6)" stroke="rgba(58,214,234,0.04)" strokeWidth="0.3" />

              {/* Agent figure */}
              <g filter="url(#agGlow)">
                {/* Head */}
                <circle cx={deskX + 23} cy={deskY - 24} r="5.5" fill={isWorking ? `${agent.color}66` : `${agent.color}33`} stroke={isWorking ? agent.color : `${agent.color}44`} strokeWidth="0.6" />
                {/* Eyes */}
                <circle cx={deskX + 21} cy={deskY - 25} r="1" fill={isWorking ? agent.color : `${agent.color}44`} />
                <circle cx={deskX + 25} cy={deskY - 25} r="1" fill={isWorking ? agent.color : `${agent.color}44`} />
                {/* Body */}
                <rect x={deskX + 17} y={deskY - 17} width="12" height="10" rx="3" fill={isWorking ? `${agent.color}44` : `${agent.color}22`} stroke={isWorking ? `${agent.color}55` : `${agent.color}22`} strokeWidth="0.4" />
                {/* Status LED */}
                <circle cx={deskX + 30} cy={deskY - 26} r="2" fill={isWorking ? agent.color : '#3a7a5a'} filter={isWorking ? 'url(#agGlow)' : undefined}>
                  {isWorking && (
                    <animate attributeName="opacity" values="1;0.4;1" dur="1.8s" repeatCount="indefinite" />
                  )}
                </circle>
              </g>

              {/* Agent name */}
              <text x={deskX + 23} y={deskY + 46} textAnchor="middle" fill={`${agent.color}66`} fontSize="5.5" fontFamily="'JetBrains Mono', monospace" letterSpacing="0.08em">
                {agent.name.toUpperCase()}
              </text>
            </g>
          );
        })
      )}

      {/* Decorative: Server rack in room 4 */}
      <g>
        <rect x="620" y="55" width="14" height="38" rx="2" fill="rgba(10,18,26,0.9)" stroke="rgba(58,214,234,0.08)" strokeWidth="0.4" />
        {[0, 1, 2, 3, 4].map(i => (
          <rect key={`sr-${i}`} x="622" y={57 + i * 7} width="10" height="5" rx="0.8" fill="rgba(58,214,234,0.04)" stroke="rgba(58,214,234,0.06)" strokeWidth="0.3">
            <animate attributeName="fill" values="rgba(58,214,234,0.04);rgba(58,214,234,0.12);rgba(58,214,234,0.04)" dur={`${1.2 + i * 0.4}s`} repeatCount="indefinite" />
          </rect>
        ))}
      </g>

      {/* Decorative: Plant in room 1 */}
      <g>
        <line x1="185" y1="175" x2="185" y2="158" stroke="rgba(69,223,155,0.18)" strokeWidth="1.5" />
        <circle cx="185" cy="152" r="8" fill="rgba(69,223,155,0.1)" />
        <circle cx="181" cy="155" r="5" fill="rgba(69,223,155,0.07)" />
        <circle cx="189" cy="155" r="5" fill="rgba(69,223,155,0.07)" />
      </g>

      {/* Decorative: Whiteboard in room 2 */}
      <g>
        <rect x="340" y="50" width="28" height="18" rx="1" fill="rgba(14,22,30,0.5)" stroke="rgba(58,214,234,0.08)" strokeWidth="0.4" />
        <line x1="344" y1="56" x2="362" y2="56" stroke="rgba(58,214,234,0.06)" strokeWidth="0.4" />
        <line x1="344" y1="60" x2="358" y2="60" stroke="rgba(58,214,234,0.04)" strokeWidth="0.4" />
      </g>

      {/* Decorative: Watercooler in room 3 */}
      <g>
        <rect x="530" y="165" width="10" height="16" rx="2" fill="rgba(10,18,26,0.9)" stroke="rgba(58,214,234,0.06)" strokeWidth="0.4" />
        <rect x="532" y="168" width="6" height="4" rx="1" fill="rgba(58,214,234,0.03)" />
        <rect x="530" y="162" width="10" height="4" rx="2" fill="rgba(58,214,234,0.06)" />
      </g>

      {/* Decorative: Coffee machine in room 4 */}
      <g>
        <rect x="720" y="160" width="16" height="20" rx="2" fill="rgba(10,18,26,0.9)" stroke="rgba(58,214,234,0.06)" strokeWidth="0.4" />
        <circle cx="728" cy="168" r="3" fill="rgba(58,214,234,0.04)" stroke="rgba(58,214,234,0.08)" strokeWidth="0.3" />
        <rect x="724" y="174" width="8" height="3" rx="1" fill="rgba(58,214,234,0.03)" />
      </g>

      {/* Bottom status bar */}
      <line x1="30" y1="208" x2="770" y2="208" stroke="rgba(58,214,234,0.05)" strokeWidth="0.5" />
      <text x="35" y="218" fill="rgba(58,214,234,0.2)" fontSize="6" fontFamily="'JetBrains Mono', monospace" letterSpacing="0.12em">
        {agentStatuses.filter(a => a.status !== 'Idle').length}/{agentStatuses.length} ACTIVE
      </text>
      <text x="765" y="218" textAnchor="end" fill="rgba(58,214,234,0.12)" fontSize="5.5" fontFamily="'JetBrains Mono', monospace" letterSpacing="0.1em">
        NASI AGENT ENVIRONMENT
      </text>
    </svg>
  );
}
