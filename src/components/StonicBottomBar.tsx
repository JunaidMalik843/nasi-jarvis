import { Volume2, MessageSquare, User } from 'lucide-react';

interface StonicBottomBarProps {
  isChatOpen: boolean;
  onChatToggle: () => void;
}

export function StonicBottomBar({ isChatOpen, onChatToggle }: StonicBottomBarProps) {
  return (
    <div className="stonic-bottombar">
      <div className="stonic-bottom-left">
        <div className="stonic-status-item">
          <div className="stonic-profile">N</div>
        </div>
        <div className="stonic-status-item">
          <span className="stonic-online-dot" /> Online
        </div>
        <div className="stonic-status-item">
          <span className="stonic-model-text">No model yet</span>
        </div>
        <div className="stonic-ctx-slider">
          <span className="stonic-ctx-label">CTX</span>
          <div className="stonic-ctx-track">
            <div className="stonic-ctx-fill" style={{ width: '85%' }} />
          </div>
          <span className="stonic-ctx-value">85%</span>
        </div>
        <div className="stonic-status-item">
          <span className="stonic-seat-badge">4/7</span>
        </div>
        <div className="stonic-status-item">
          <span className="stonic-busy-badge">0/4</span>
        </div>
      </div>
      <div className="stonic-bottom-right">
        <button className={`stonic-chat-toggle ${isChatOpen ? 'open' : ''}`} onClick={onChatToggle}>
          <MessageSquare size={12} />
          <span>CHAT</span>
        </button>
      </div>
    </div>
  );
}
