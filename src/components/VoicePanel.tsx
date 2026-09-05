import { Mic, Square, Volume2, VolumeX, RefreshCw, AlertCircle, MessageSquare } from 'lucide-react';
import type { CSSProperties } from 'react';
import type { CoreState, VoiceConfig } from '../hooks/useVoice';
import { useVoice } from '../hooks/useVoice';

interface VoicePanelProps {
  /** Called when a transcript is ready and should be sent through the existing chat/AI pipeline. */
  onVoiceInput: (transcript: string) => void;
  /** True when NASI is generating a response (so we can show thinking state). */
  isThinking?: boolean;
  /** Current chat command text (optional, used to render the last heard command). */
  command?: string;
  config?: VoiceConfig;
}

export function VoicePanel({ onVoiceInput, isThinking = false, command = '', config }: VoicePanelProps) {
  const {
    coreState,
    micStatus,
    transcript,
    lastTranscript,
    speechEnabled,
    speechEnabledWarning,
    startListening,
    stopAll,
    stopSpeech,
    speak,
  } = useVoice(config);

  const isActive = coreState === 'LISTENING' || coreState === 'THINKING' || coreState === 'SPEAKING';

  const statusLabel: Record<CoreState, string> = {
    IDLE: 'STANDBY',
    LISTENING: 'LISTENING',
    THINKING: 'PROCESSING',
    SPEAKING: 'SPEAKING',
    ERROR: 'ERROR',
  };

  const stateColor: Record<CoreState, string> = {
    IDLE: '#6e9da1',
    LISTENING: '#4ce7df',
    THINKING: '#eaa247',
    SPEAKING: '#4ce7df',
    ERROR: '#eb6e69',
  };

  function handleStart() {
    startListening();
  }

  function handleStop() {
    stopAll();
  }

  // When the transcript lands and the app says "send it", we speak the response
  // once the app feeds us the response text through the voice hook's onResponse.
  // We expose speak() so the parent can speak a NASI response after Gemini returns.

  return (
    <div className="voice-panel">
      <div className="voice-status-bar">
        <div className={`voice-state-pill ${coreState.toLowerCase()}`}>
          <span className="voice-state-dot" />
          {statusLabel[coreState]}
          <span className="voice-state-sep" />
          {coreState === 'LISTENING' && 'REC'}
          {coreState === 'THINKING' && '···'}
          {coreState === 'SPEAKING' && '🔊'}
          {coreState === 'ERROR' && '⚠'}
        </div>
        <div className="voice-mic-status">
          {micStatus === 'requesting' && <span className="voice-mic-tag requesting">REQUESTING MIC</span>}
          {micStatus === 'active' && <span className="voice-mic-tag active">MIC ON</span>}
          {micStatus === 'error' && <span className="voice-mic-tag error">MIC ERROR</span>}
          {micStatus === 'idle' && coreState === 'IDLE' && <span className="voice-mic-tag idle">READY</span>}
        </div>
      </div>

      <div className="voice-core-visual">
        <div className="voice-core-ring ring-one" />
        <div className="voice-core-ring ring-two" />
        <div className="voice-core-ring ring-three" />
        <div className={`voice-core-glow ${coreState === 'LISTENING' || coreState === 'SPEAKING' ? 'voice-core-active' : ''}`}>
          <Mic size={34} />
        </div>
        <div className="voice-core-particles">
          {Array.from({ length: 14 }, (_, i) => (
            <span key={i} style={{ '--i': i } as CSSProperties} />
          ))}
        </div>
      </div>

      <div className="voice-transcript-box">
        <div className="voice-transcript-label">
          {coreState === 'LISTENING' && 'HEARD'}
          {coreState === 'THINKING' && 'PROCESSING'}
          {coreState === 'SPEAKING' && 'PLAYING'}
          {coreState === 'ERROR' && 'FAILED'}
          {coreState === 'IDLE' && lastTranscript && 'LAST HEARD'}
          {coreState === 'IDLE' && !lastTranscript && 'VOICE INPUT'}
          <span className="voice-transcript-sep" />
          <span className="voice-transcript-language">
            {transcript && (isUrdu(transcript) ? 'URDU' : 'ENGLISH')}
          </span>
        </div>
        <div className="voice-transcript-text">
          {transcript || (
            <span className="voice-transcript-placeholder">
              {coreState === 'ERROR'
                ? 'Voice input could not be completed. Check microphone access and try again.'
                : 'Activate Voice to speak naturally in English or Urdu.'}
            </span>
          )}
        </div>
        {speechEnabledWarning && <div className="voice-tts-warning"><AlertCircle size={12} /> {speechEnabledWarning}</div>}
      </div>

      <div className="voice-controls">
        <button
          className={`voice-button ${isActive ? 'voice-active' : ''} ${coreState === 'SPEAKING' ? 'voice-speaking' : ''}`}
          onClick={handleStop}
          disabled={!isActive}
          title={isActive ? 'Stop voice' : 'Voice inactive'}
        >
          <Square size={13} />
          <span>Stop</span>
        </button>

        <button
          className={`voice-button ${coreState === 'SPEAKING' ? 'voice-speaking' : ''} ${coreState === 'LISTENING' ? 'voice-secondary' : ''}`}
          onClick={stopSpeech}
          disabled={coreState !== 'SPEAKING'}
          title="Stop speaking"
        >
          <VolumeX size={13} />
          <span>Stop speech</span>
        </button>

        <button
          className={`voice-button ${isActive ? 'voice-secondary' : 'voice-start'}`}
          onClick={handleStart}
          disabled={coreState === 'ERROR' && micStatus === 'error'}
          title="Start voice"
        >
          {coreState === 'LISTENING' ? (
            <Mic size={13} />
          ) : (
            <Mic size={13} />
          )}
          <span>{coreState === 'LISTENING' ? 'Listening...' : 'Start Voice'}</span>
        </button>

        <button
          className={`voice-button ${speechEnabled ? '' : 'voice-muted'}`}
          onClick={() => {}}
          disabled
          title="TTS status"
        >
          {speechEnabled ? <Volume2 size={13} /> : <VolumeX size={13} />}
          <span>{speechEnabled ? 'TTS on' : 'TTS off'}</span>
        </button>
      </div>

      {coreState === 'ERROR' && (
        <div className="voice-error-banner">
          <AlertCircle size={13} />
          <span>
            {micStatus === 'error'
              ? 'Microphone access is required to use Voice. Please allow microphone access and try again.'
              : 'Voice input failed. You can still type commands using the chat bar.'}
          </span>
          <button className="voice-retry" onClick={handleStart}>
            <RefreshCw size={11} /> Retry
          </button>
        </div>
      )}

      {coreState === 'IDLE' && lastTranscript && (
        <div className="voice-last-message">
          <MessageSquare size={11} />
          <span>Heard: <strong>{lastTranscript}</strong></span>
        </div>
      )}
    </div>
  );
}

function isUrdu(text: string): boolean {
  return /[\u0600-\u06FF\u0750-\u077F]/.test(text);
}
