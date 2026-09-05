import { useCallback, useEffect, useRef, useState } from 'react';

export type CoreState = 'IDLE' | 'LISTENING' | 'THINKING' | 'SPEAKING' | 'ERROR';

export interface VoiceConfig {
  /** Preferred TTS voice locale hints, e.g. ['en-US', 'en-GB', 'ur-PK']. */
  ttsLocaleHints?: string[];
  /** Function called when STT returns a transcript. Receives the text. */
  onTranscript?: (text: string) => void;
  /** Function called when NASI generates a response. Receives the text. */
  onResponse?: (text: string) => void;
}

const STT_URL = '/api/voice/stt';

function isUrduScript(text: string): boolean {
  return /[\u0600-\u06FF\u0750-\u077F]/.test(text);
}

/** Best-effort voice selection. Does not claim a specific Urdu voice is available. */
function pickVoice(voices: SpeechSynthesisVoice[], hints: string[]): SpeechSynthesisVoice | null {
  if (voices.length === 0) return null;
  for (const hint of hints) {
    const match = voices.find((v) => v.lang.startsWith(hint));
    if (match) return match;
  }
  // Prefer a female voice if the browser labels one, else any English-ish voice.
  const female = voices.find((v) => /female/i.test(v.name) && v.lang.startsWith('en'));
  if (female) return female;
  return voices.find((v) => v.lang.startsWith('en')) ?? voices[0];
}

export function useVoice(config: VoiceConfig = {}) {
  const { ttsLocaleHints = ['en-US', 'en-GB', 'ur-PK'], onTranscript, onResponse } = config;

  const [coreState, setCoreState] = useState<CoreState>('IDLE');
  const [micStatus, setMicStatus] = useState<'idle' | 'requesting' | 'active' | 'error'>('idle');
  const [transcript, setTranscript] = useState('');
  const [lastTranscript, setLastTranscript] = useState('');
  const [speechEnabled, setSpeechEnabled] = useState(true);
  const [speechEnabledWarning, setSpeechEnabledWarning] = useState('');

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const ttsUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  // Stop speech when component unmounts.
  useEffect(() => {
    return () => {
      window.speechSynthesis?.cancel();
    };
  }, []);

  const updateCoreState = useCallback((state: CoreState) => setCoreState(state), []);

  const buildTts = useCallback(
    (text: string): string => {
      // Keep it concise for TTS; avoid huge reads.
      return text;
    },
    [],
  );

  const speak = useCallback(
    (text: string) => {
      if (!window.speechSynthesis) {
        setSpeechEnabled(false);
        setSpeechEnabledWarning('Text-to-speech is not supported in this browser.');
        return;
      }
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.98;
      utterance.pitch = 1.0;
      utterance.volume = 1;

      const voices = window.speechSynthesis.getVoices();
      // getVoices() can be empty on first call; re-fetch after a tick if needed.
      const selected = pickVoice(voices, ttsLocaleHints) ?? null;
      if (selected) utterance.voice = selected;

      ttsUtteranceRef.current = utterance;

      utterance.onstart = () => {
        updateCoreState('SPEAKING');
      };
      utterance.onend = () => {
        ttsUtteranceRef.current = null;
        updateCoreState('IDLE');
      };
      utterance.onerror = () => {
        ttsUtteranceRef.current = null;
        updateCoreState('IDLE');
      };

      window.speechSynthesis.speak(utterance);
    },
    [ttsLocaleHints, updateCoreState],
  );

  const stopSpeech = useCallback(() => {
    window.speechSynthesis?.cancel();
    ttsUtteranceRef.current = null;
    if (coreState === 'SPEAKING') {
      updateCoreState('IDLE');
    }
  }, [coreState, updateCoreState]);

  const stopAll = useCallback(() => {
    stopSpeech();
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      try {
        recorderRef.current.stop();
      } catch {
        // ignore
      }
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    recorderRef.current = null;
    chunksRef.current = [];
    setMicStatus('idle');
  }, [stopSpeech]);

  const startListening = useCallback(async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setMicStatus('error');
      updateCoreState('ERROR');
      return;
    }

    // Guard: if we are already listening, stop first.
    if (coreState === 'LISTENING' || coreState === 'THINKING') {
      stopAll();
      return;
    }

    updateCoreState('THINKING');
    setMicStatus('requesting');
    setTranscript('');
    setLastTranscript('');

    controllerRef.current = new AbortController();
    const controller = controllerRef.current;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;
      setMicStatus('active');

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : '';

      if (!mimeType) {
        // Fall back to default container; STT endpoint accepts audio/webm.
        setMicStatus('error');
        updateCoreState('ERROR');
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        return;
      }

      const recorder = new MediaRecorder(stream, {
        mimeType,
        audioBitsPerSecond: 128000,
      });
      recorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        const chunks = chunksRef.current;
        chunksRef.current = [];
        if (chunks.length === 0) {
          updateCoreState('IDLE');
          setMicStatus('idle');
          return;
        }
        const blob = new Blob(chunks, { type: mimeType || 'audio/webm' });
        const arrayBuffer = await blob.arrayBuffer();
        const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));

        const mimeOut = blob.type || 'audio/webm';
        updateCoreState('THINKING');

        try {
          const response = await fetch(STT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ audioBase64: base64, mimeType: mimeOut }),
            signal: controller.signal,
          });
          const data = (await response.json()) as {
            text?: string;
            provider?: string;
            model?: string;
            status?: string;
            error?: string;
          };

          const text = typeof data.text === 'string' ? data.text.trim() : '';
          setTranscript(text);

          if (text) {
            setLastTranscript(text);
            onTranscript?.(text);
            // Hand the transcript to the existing chat/AI pipeline via the response callback.
            // The App is responsible for actually calling /api/gemini/generate and TTS.
            onResponse?.(text);
          } else {
            // Empty transcript still counts as a completed voice turn.
            if (data.status === 'no_api_key' || data.status === 'stt_failed') {
              // Keep user-facing messages friendly; no stack traces.
              setTranscript('');
              onResponse?.( '');
            }
          }

          updateCoreState('IDLE');
          setMicStatus('idle');
        } catch (err: any) {
          if (err?.name === 'AbortError') {
            updateCoreState('IDLE');
            setMicStatus('idle');
            return;
          }
          updateCoreState('ERROR');
          setMicStatus('error');
        }
      };

      recorder.start();
      updateCoreState('LISTENING');
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        updateCoreState('IDLE');
        setMicStatus('idle');
        return;
      }
      const message =
        err?.name === 'NotAllowedError'
          ? 'Microphone access was denied. Allow microphone access to use Voice.'
          : err?.name === 'NotFoundError'
          ? 'No microphone was found. Connect a microphone and try again.'
          : err?.name === 'NotReadableError'
          ? 'The microphone is busy or unavailable. Close other apps using the microphone and try again.'
          : 'Could not access the microphone.';
      setTranscript('');
      setLastTranscript('');
      updateCoreState('ERROR');
      setMicStatus('error');
    }
  }, [coreState, onTranscript, onResponse, stopAll, updateCoreState]);

  // Keep mic status in sync if the core state is forcibly changed externally.
  useEffect(() => {
    if (coreState === 'IDLE' && micStatus !== 'idle') {
      setMicStatus('idle');
    }
  }, [coreState, micStatus]);

  return {
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
    buildTts,
  };
}
