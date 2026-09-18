import { Database, Zap, Heart, BrainCircuit, Globe2, Shield, MoreHorizontal } from 'lucide-react';
import type { CSSProperties } from 'react';

const skills = [
  { color: '#3ad6ea', icon: Database, label: 'Memory' },
  { color: '#f09b47', icon: Zap, label: 'Skills' },
  { color: '#3fe0b8', icon: Heart, label: 'Personality' },
  { color: '#9babb0', icon: BrainCircuit, label: 'Core' },
  { color: '#5a9cff', icon: Globe2, label: 'World' },
  { color: '#e9675f', icon: Shield, label: 'Security' },
];

export function SkillsPanel() {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '2px' }}>
      {skills.slice(0, 3).map((skill) => (
        <button key={skill.label} className="skill-chip" style={{ '--chip-color': skill.color } as CSSProperties}>
          <span className="skill-chip-icon"><skill.icon size={11} /></span>
          <span className="skill-chip-label">{skill.label}</span>
        </button>
      ))}
      <button className="skill-chip more" style={{ '--chip-color': '#9babb0' } as CSSProperties}>
        <span className="skill-chip-icon"><MoreHorizontal size={11} /></span>
        <span className="skill-chip-label">+{skills.length - 3}</span>
      </button>
    </div>
  );
}
