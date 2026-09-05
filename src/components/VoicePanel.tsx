import { Mic, Square, Volume2, VolumeX, RefreshCw, AlertCircle, MessageSquare } from 'lucide-react';
import type { CSSProperties } from 'react';
import type { CoreState } from '../hooks/useVoice';

export function VoicePanel() {
  return (
    <div className="voice-panel">
      <div className="voice-core-visual">
        <div className="voice-core-ring ring-one" />
        <div className="voice-core-ring ring-two" />
        <div className="voice-core-ring ring-three" />
        <div className="voice-core-glow">
          <Mic size={34} />
        </div>
        <div className="voice-core-particles">
          {Array.from({ length: 14 }, (_, i) => (
            <span key={i} style={{ '--i': i } as CSSProperties} />
          ))}
        </div>
      </div>

      <div className="voice-controls">
        <button className="voice-button" title="Stop">
          <Square size={13} />
        </button>
        <button className="voice-button" title="Stop speech">
          <VolumeX size={13} />
        </button>
        <button className="voice-button voice-start" title="Start voice">
          <Mic size={13} />
        </button>
        <button className="voice-button" disabled title="TTS">
          <Volume2 size={13} />
        </button>
      </div>
    </div>
  );
}
