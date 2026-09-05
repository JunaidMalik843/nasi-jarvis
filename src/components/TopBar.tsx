import { CircleHelp, Settings2, Minimize2, Maximize2, X, Volume2 } from 'lucide-react';

interface TopBarProps {
  onHelpClick: () => void;
  onSettingsClick: () => void;
}

export function TopBar({ onHelpClick, onSettingsClick }: TopBarProps) {
  return (
    <header className="stonic-topbar">
      <div className="stonic-brand-lockup">
        <div className="stonic-logo">
          <svg viewBox="0 0 32 32" className="stonic-logo-svg">
            <defs>
              <radialGradient id="stonic-glow" cx="50%" cy="40%" r="50%">
                <stop offset="0%" stopColor="#3ad5e3" stopOpacity="0.9"/>
                <stop offset="55%" stopColor="#1a7a85" stopOpacity="0.3"/>
                <stop offset="100%" stopColor="#0a2528" stopOpacity="0"/>
              </radialGradient>
            </defs>
            <circle cx="16" cy="16" r="14" fill="none" stroke="#1a3a42" strokeWidth="0.8" opacity="0.6"/>
            <circle cx="16" cy="16" r="11" fill="none" stroke="#1a3a42" strokeWidth="0.5" strokeDasharray="2 3" opacity="0.5"/>
            <circle cx="16" cy="16" r="6.5" fill="url(#stonic-glow)"/>
            <circle cx="16" cy="16" r="3.5" fill="#0d2428" stroke="#3ad5e3" strokeWidth="1"/>
            <circle cx="16" cy="16" r="1.2" fill="#5aecc4"/>
            <circle cx="8" cy="9" r="1.2" fill="#3ad5e3" opacity="0.9"/>
            <circle cx="24" cy="9" r="1.2" fill="#3ad5e3" opacity="0.9"/>
            <circle cx="8" cy="23" r="1.2" fill="#3ad5e3" opacity="0.9"/>
            <circle cx="24" cy="23" r="1.2" fill="#3ad5e3" opacity="0.9"/>
          </svg>
        </div>
        <span className="stonic-brand-name">Stonic AI</span>
      </div>
      <div className="stonic-topbar-actions">
        <span className="stonic-system-status"><span className="stonic-status-dot" /> NOMINAL</span>
        <button className="stonic-top-btn" onClick={onHelpClick}>
          <CircleHelp size={12} /> Demo Video
        </button>
        <button className="stonic-top-btn" onClick={onSettingsClick}>
          <Settings2 size={12} /> Feedback
        </button>
        <div className="stonic-window-controls">
          <button className="stonic-window-btn" title="Minimize"><Minimize2 size={10}/></button>
          <button className="stonic-window-btn" title="Maximize"><Maximize2 size={10}/></button>
          <button className="stonic-window-btn" title="Close"><X size={10}/></button>
        </div>
      </div>
    </header>
  );
}
