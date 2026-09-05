import { Mic, Paperclip, Send, Terminal, MessageSquare, Plus } from 'lucide-react';
import { useState } from 'react';

export function ChatPanel({
  onSendMessage,
  isLoading,
}: {
  onSendMessage: (text: string) => void;
  isLoading: boolean;
}) {
  const [input, setInput] = useState('');

  return (
    <section className="stonic-chat-panel">
      <div className="stonic-chat-tabs">
        <button className="active"><Mic size={11} /> Voice</button>
        <button><Terminal size={11} /> Agent</button>
        <button><MessageSquare size={11} /> Notes</button>
        <button className="stonic-chat-plus"><Plus size={12} /></button>
      </div>
      <div className="stonic-chat-output">
        <div className="stonic-message stonic-message-nasi">
          <div className="stonic-message-label">NASI CORE <span>· now</span></div>
          <div className="stonic-message-text">NASI core online. Awaiting your directive, Commander.</div>
        </div>
      </div>
      {isLoading && (
        <div className="stonic-typing-indicator">
          <span /><span /><span />
          NASI is thinking
        </div>
      )}
      <div className="stonic-command-bar">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && input.trim()) {
              onSendMessage(input.trim());
              setInput('');
            }
          }}
          placeholder="Type instruction or / command for Hermes..."
          className="stonic-command-input"
        />
        <button className="stonic-command-btn">
          <Paperclip size={12} />
        </button>
        <button className={`stonic-command-btn ${''}`}>
          <Mic size={13} />
        </button>
        <button className="stonic-send-btn" onClick={() => {
          if (input.trim()) {
            onSendMessage(input.trim());
            setInput('');
          }
        }}>
          <Send size={13} />
        </button>
      </div>
    </section>
  );
}
