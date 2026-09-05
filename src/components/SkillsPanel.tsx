import { Database, Zap, ShieldCheck, Settings2 } from 'lucide-react';

const skills = [
  { color: '#3ad5e3', label: 'MEMORY', icon: Database },
  { color: '#f09b47', label: 'SKILLS', icon: Zap },
  { color: '#43dcaa', label: 'SOUL', icon: ShieldCheck },
  { color: '#9babb0', label: 'SETTINGS', icon: Settings2 },
];

export function SkillsPanel() {
  return (
    <div className="stonic-skills-stack">
      {skills.map((skill, index) => (
        <button key={skill.label} className={`stonic-skill-card ${index === 0 ? 'cyan' : index === 1 ? 'orange' : index === 2 ? 'green' : 'white'}`}>
          <div className="stonic-skill-icon" style={{ color: skill.color }}>
            <skill.icon size={14} />
          </div>
          <div className="stonic-skill-label">{skill.label}</div>
          {index < 3 && <div className="stonic-skill-connector" />}
        </button>
      ))}
    </div>
  );
}
