import { BrainCircuit, Mic } from 'lucide-react';
import { useState } from 'react';
import type { CSSProperties } from 'react';

export function AISphere({ onVoiceStart }: { onVoiceStart: () => void }) {
  const [isThinking, setIsThinking] = useState(false);

  return (
    <section className="stonic-aisphere-panel">
      <div className="stonic-aisphere-header">
        <div className="stonic-aisphere-status">
          <span className={`stonic-thinking-dot ${isThinking ? 'active' : ''}`} />

        </div>
      </div>
      <div className="stonic-aisphere-visual">
        <div className="stonic-core-ring ring-one" />
        <div className="stonic-core-ring ring-two" />
        <div className="stonic-core-ring ring-three" />
        <div className="stonic-core-glow">
          <BrainCircuit size={32} />
        </div>
        <div className="stonic-core-particles">
          {Array.from({ length: 16 }, (_, i) => (
            <span key={i} className="stonic-particle" style={{ '--i': i } as CSSProperties} />
          ))}
        </div>
      </div>
      <button className="stonic-start-button" onClick={onVoiceStart}>
        <Mic size={11} />

        <span className="stonic-button-arrow">→</span>
      </button>
      <div className="stonic-aisphere-caption">

      </div>
    </section>
  );
}
