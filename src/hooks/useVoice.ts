import { useCallback, useEffect, useRef, useState } from 'react';

export type CoreState = 'IDLE' | 'LISTENING' | 'THINKING' | 'SPEAKING' | 'ERROR';

export interface VoiceConfig {
  ttsLocaleHints?: string[];
  onTranscript?: (text: string) => void;
  onStateChange?: (state: CoreState) => void;
  elevenlabsApiKey?: string;
  elevenlabsVoiceId?: string;
  elevenlabsModel?: string;
}

const STT_URL = '/api/voice/stt';

function pickVoice(voices: SpeechSynthesisVoice[], hints: string[]): SpeechSynthesisVoice | null {
  if (voices.length === 0) return null;
  for (const hint of hints) {
    const match = voices.find(v => v.lang.startsWith(hint));
    if (match) return match;
  }
  const female = voices.find(v => /female/i.test(v.name) && v.lang.startsWith('en'));
  if (female) return female;
  return voices.find(v => v.lang.startsWith('en')) ?? voices[0];
}

function getSpeechRecognition(): new () => any {
  const w = window as any;
  const R = w.SpeechRecognition || w.webkitSpeechRecognition;
  if (!R) throw new Error('SpeechRecognition unavailable');
  return R as new () => any;
}

export function useVoice(config: VoiceConfig = {}) {
  const {
    ttsLocaleHints = ['en-US', 'en-GB', 'ur-PK'],
    onTranscript,
    onStateChange,
    elevenlabsApiKey,
    elevenlabsVoiceId,
    elevenlabsModel,
  } = config;

  const [coreState, _setCoreState] = useState<CoreState>('IDLE');
  const [micStatus, setMicStatus] = useState<'idle' | 'requesting' | 'active' | 'error'>('idle');
  const [transcript, setTranscript] = useState('');
  const [lastTranscript, setLastTranscript] = useState('');
  const [voicesLoaded, setVoicesLoaded] = useState(false);
  const [voiceLog, setVoiceLog] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState('');

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const playbackStopRef = useRef<(() => void) | null>(null);
  const coreStateRef = useRef<CoreState>('IDLE');
  const isProcessingRef = useRef(false);
  const recognitionRef = useRef<any>(null);
  const sttStartRef = useRef(0);
  const ttsStartRef = useRef(0);

  const log = useCallback((msg: string, detailed = false) => {
    if (detailed) {
      console.log(`[NASI VOICE DEBUG] ${msg}`);
    } else {
      console.log(`[NASI VOICE] ${msg}`);
    }
    setVoiceLog(prev => {
      const next = [...prev];
      const last = next.length ? next[next.length - 1] : null;
      // Consecutive-duplicate collapse: the same message logged again
      // immediately bumps a (×N) counter on the existing row instead of
      // appending an identical line (voice-load events used to spam this).
      const parsed = last?.match(/^\[([^\]]+)\] ([\s\S]*?)(?: \(×(\d+)\))?$/);
      if (parsed && parsed[2] === msg) {
        const count = (parseInt(parsed[3] || '1', 10) || 1) + 1;
        next[next.length - 1] = `[${parsed[1]}] ${msg} (×${count})`;
        return next.slice(-20);
      }
      next.push(`[${new Date().toLocaleTimeString()}] ${msg}`);
      return next.slice(-20);
    });
  }, []);

  // Debug helper: log ElevenLabs key status (non-empty shows key is configured)
  const logElevenLabsStatus = useCallback(() => {
    const hasKey = !!(elevenlabsApiKey && elevenlabsApiKey.trim());
    const keyPreview = hasKey ? elevenlabsApiKey.slice(0, 8) + '...' : '(empty)';
    const hasVoice = !!(elevenlabsVoiceId && elevenlabsVoiceId.trim());
    log(`ElevenLabs config: key=${hasKey ? keyPreview : '(missing)'}, voice=${hasVoice ? elevenlabsVoiceId.slice(0, 12) + '...' : '(using default)'}, model=${elevenlabsModel || '(default)'}`, true);
  }, [elevenlabsApiKey, elevenlabsVoiceId, elevenlabsModel, log]);

  const setCoreState = useCallback((state: CoreState) => {
    coreStateRef.current = state;
    _setCoreState(state);
    onStateChange?.(state);
  }, [onStateChange]);

  // Latest hints without re-running the voice-load effect on every identity
  // change of the array — the caller rebuilds `ttsLocaleHints` inside a memo,
  // and the old `[ttsLocaleHints, log]` deps re-fired the whole load (and its
  // two log lines) every time that fresh array appeared.
  const hintsRef = useRef(ttsLocaleHints);
  hintsRef.current = ttsLocaleHints;
  /** Signature of the last announced voice state — identical states stay silent. */
  const voicesKeyRef = useRef<string | null>(null);

  // Load voices on mount. Chrome re-fires `voiceschanged` several times while
  // the list populates and StrictMode re-runs effects in dev; the signature
  // guard announces each DISTINCT voice state exactly once instead of logging
  // "N voices loaded" + "Best voice = …" on every re-fire.
  useEffect(() => {
    if (!window.speechSynthesis) {
      log('TTS: speechSynthesis not available');
      return;
    }
    const loadVoices = () => {
      const voices = window.speechSynthesis!.getVoices();
      if (voices.length === 0) {
        log('TTS: 0 voices loaded');
        return;
      }
      setVoicesLoaded(true);
      const selected = pickVoice(voices, hintsRef.current);
      const key = `${voices.length}|${selected?.name ?? ''}|${selected?.lang ?? ''}`;
      if (voicesKeyRef.current === key) return; // already announced this state
      voicesKeyRef.current = key;
      log(`TTS: ${voices.length} voices loaded`);
      log(`TTS: Best voice = ${selected?.name || 'default'} (${selected?.lang || 'unknown'})`);
    };
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
    return () => {
      if (window.speechSynthesis) window.speechSynthesis.onvoiceschanged = null;
    };
  }, [log]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      playbackStopRef.current?.();
      playbackStopRef.current = null;
      window.speechSynthesis?.cancel();
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch { /* */ }
        recognitionRef.current = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
    };
  }, []);

  const stopSpeech = useCallback(() => {
    playbackStopRef.current?.();
    playbackStopRef.current = null;
    window.speechSynthesis?.cancel();
    if (coreStateRef.current === 'SPEAKING') {
      setCoreState('IDLE');
    }
  }, [setCoreState]);

  const stopAll = useCallback(() => {
    playbackStopRef.current?.();
    playbackStopRef.current = null;
    window.speechSynthesis?.cancel();
    // Stop Web Speech Recognition if running
    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch { /* */ }
      recognitionRef.current = null;
    }
    // Stop MediaRecorder if running
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      try { recorderRef.current.stop(); } catch { /* */ }
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    recorderRef.current = null;
    chunksRef.current = [];
    isProcessingRef.current = false;
    setMicStatus('idle');
    setCoreState('IDLE');
  }, [setCoreState]);

  // Speak text — ElevenLabs stream + browser fallback
  const speak = useCallback((text: string, speed?: number, pitch?: number, volume?: number, onTtsLatency?: (ttsMs: number) => void): Promise<void> => {
    return new Promise((resolve) => {
      if (!text.trim()) { resolve(); return; }

      // Clean up existing playback
      window.speechSynthesis?.cancel();

      // ElevenLabs TTS — route through server proxy for reliability
      if (elevenlabsApiKey && text.trim()) {
        logElevenLabsStatus();
        log(`TTS: Requesting ElevenLabs → server proxy (voice ${elevenlabsVoiceId || 'default'}, model ${elevenlabsModel || 'default'})`);
        setCoreState('SPEAKING');
        ttsStartRef.current = performance.now();

        // Log the exact key being sent
        log(`TTS: API key configured: ${elevenlabsApiKey ? 'YES (' + elevenlabsApiKey.slice(0, 4) + '...) ' : 'NO'}`, true);

        const voiceId = elevenlabsVoiceId;
        const model = elevenlabsModel;
        const stability = Math.max(0.1, Math.min(1, (pitch ?? 1) * 0.7));
        const rate = Math.max(0.5, Math.min(1.5, speed ?? 1));

        (async () => {
          let audioCtx: AudioContext | null = null;
          let aborted = false;
          try {
            const res = await fetch('/api/voice/tts', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                text,
                voiceId,
                model,
                stability,
                similarityBoost: Math.max(0.1, pitch ?? 1),
                style: 0.2,
                apiKey: elevenlabsApiKey,
              }),
            });
            if (!res.ok) {
              const errBody = await res.json().catch(() => ({})) as any;
              // Detailed debug log: show status + full body
              log(`TTS: ElevenLabs HTTP ${res.status} — full body: ${JSON.stringify(errBody, null, 2)}`, true);
              const errMsg = errBody?.error || errBody?.detail || errBody?.message || `HTTP ${res.status}`;
              throw new Error(errMsg);
            }
            const reader = res.body?.getReader();
            if (!reader) throw new Error('No body');

            const Ctx = window.AudioContext || (window as any).webkitAudioContext;
            audioCtx = new Ctx();
            if (audioCtx.state === 'suspended') {
              try { await audioCtx.resume(); } catch { /* */ }
            }
            const gain = audioCtx.createGain();
            gain.gain.value = volume ?? 1;
            gain.connect(audioCtx.destination);

            // Register a stopper so STOP button / LIVE hangup kills playback immediately
            playbackStopRef.current = () => {
              aborted = true;
              try { audioCtx?.close(); } catch { /* */ }
              setCoreState('IDLE');
              resolve();
            };

            const concat = (a: Uint8Array, b: Uint8Array) => {
              const out = new Uint8Array(a.length + b.length);
              out.set(a); out.set(b, a.length);
              return out;
            };

            let pending = new Uint8Array(0);
            let nextStart = 0;
            let activeSources = 0;
            let playedAny = false;
            let finished = false;

            const maybeFinish = () => {
              if (finished && !aborted && activeSources === 0) {
                log('TTS: ElevenLabs playback ended');
                playbackStopRef.current = null;
                isProcessingRef.current = false;
                setCoreState('IDLE');
                audioCtx?.close().catch(() => { /* */ });
                resolve();
              }
            };

            // Decode a slice and schedule it seamlessly after previous chunks
            const schedule = async (bytes: Uint8Array): Promise<boolean> => {
              if (!audioCtx || aborted || bytes.length === 0) return aborted;
              try {
                const copy = bytes.slice().buffer as ArrayBuffer;
                const buffer = await audioCtx.decodeAudioData(copy);
                if (aborted) return true;
                const src = audioCtx.createBufferSource();
                src.buffer = buffer;
                src.playbackRate.value = rate;
                src.connect(gain);
                const startAt = Math.max(audioCtx.currentTime + 0.03, nextStart);
                src.start(startAt);
                nextStart = startAt + buffer.duration / rate;
                activeSources++;
                if (!playedAny) {
                  playedAny = true;
                  if (ttsStartRef.current) {
                    const elapsed = Math.round(performance.now() - ttsStartRef.current);
                    log(`⏱ TTS first audio: ${elapsed}ms`);
                    onTtsLatency?.(elapsed);
                    ttsStartRef.current = 0;
                  }
                  log(`TTS: PROVIDER = ElevenLabs ✓ — voice ${elevenlabsVoiceId}, playing`);
                }
                src.onended = () => { activeSources--; maybeFinish(); };
                return true;
              } catch {
                return false;
              }
            };

            while (!aborted) {
              const { done, value } = await reader.read();
              if (value && value.length) pending = concat(pending, value);
              if (done) break;
              const minChunk = playedAny ? 8192 : 12288;
              if (pending.length >= minChunk) {
                const ok = await schedule(pending);
                if (ok) pending = new Uint8Array(0);
                else if (!playedAny && pending.length > 262144) throw new Error('Stream decode stalled');
              }
            }
            if (!aborted && pending.length > 0) await schedule(pending);
            finished = true;
            if (!playedAny) throw new Error('No decodable audio');
            maybeFinish();
          } catch (err: any) {
            playbackStopRef.current = null;
            try { audioCtx?.close(); } catch { /* */ }
            if (!aborted) {
              log(`TTS: ElevenLabs failed — ${err?.message || err}. ⚠ Falling back to browser TTS.`);
              fallbackSpeak(text, speed, pitch, volume, true).then(resolve);
            }
          }
        })();
        return;
      }

      // Browser TTS (default or fallback)
      fallbackSpeak(text, speed, pitch, volume).then(resolve);
    });
  }, [elevenlabsApiKey, elevenlabsVoiceId, elevenlabsModel, setCoreState, log, logElevenLabsStatus]);

  // Browser TTS helper — used as fallback when ElevenLabs is unavailable
  const fallbackSpeak = useCallback((text: string, speed?: number, pitch?: number, volume?: number, isFallback = false): Promise<void> => {
    return new Promise((resolve) => {
      if (!window.speechSynthesis) {
        log('TTS: speechSynthesis unavailable');
        resolve();
        return;
      }
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = speed ?? 0.98;
      utterance.pitch = pitch ?? 1.0;
      utterance.volume = volume ?? 1.0;

      const voices = window.speechSynthesis.getVoices();
      const selected = pickVoice(voices, ttsLocaleHints);
      if (selected) {
        utterance.voice = selected;
      }

      utterance.onstart = () => {
        log(`TTS: PROVIDER = Browser ${isFallback ? '⚠ (ElevenLabs unavailable — fallback)' : '⚠ (no ElevenLabs key)'} — "${selected?.name || 'default'}"`);
        setCoreState('SPEAKING');
      };
      utterance.onend = () => {
        log('TTS: Browser playback ended');
        isProcessingRef.current = false;
        setCoreState('IDLE');
        resolve();
      };
      utterance.onerror = (e: any) => {
        log(`TTS: Browser error — ${e.error}`);
        isProcessingRef.current = false;
        setCoreState('IDLE');
        resolve();
      };

      log(`TTS: Speaking via browser${isFallback ? ' (fallback — no ElevenLabs key)' : ''}...`);
      window.speechSynthesis.speak(utterance);

      // Chrome bug workaround
      setTimeout(() => {
        if (window.speechSynthesis && !window.speechSynthesis.speaking) {
          window.speechSynthesis.resume();
        }
      }, 100);

      // Safety timeout
      setTimeout(() => {
        if (coreStateRef.current === 'SPEAKING') {
          window.speechSynthesis?.cancel();
          setCoreState('IDLE');
          resolve();
        }
      }, 15000);
    });
  }, [ttsLocaleHints, setCoreState, log]);

  // === BROWSER STT event wiring (used by startBrowserSTT AND auto-restart) ===
  const registerSTTEvents = useCallback((recognition: any, lang: string) => {
    recognition.lang = lang || 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      log('STT: Browser recognition started — speak now');
      // A fresh session means the previous transient failure recovered —
      // clear the red error banner so it can't sit stale in the voice log.
      setErrorMessage('');
      sttStartRef.current = performance.now();
      setCoreState('LISTENING');
      setMicStatus('active');
    };

    recognition.onresult = (event: any) => {
      const result = event.results[0];
      if (result && result[0]) {
        const text = result[0].transcript as string;
        if (sttStartRef.current) {
          log(`⏱ STT latency: ${Math.round(performance.now() - sttStartRef.current)}ms`);
          sttStartRef.current = 0;
        }
        log(`STT: Browser result = "${text}" (confidence: ${result[0].confidence?.toFixed(2)})`);
        setTranscript(text);
        setLastTranscript(text);
        setCoreState('THINKING');
        setMicStatus('idle');
        isProcessingRef.current = true;
        // Handoff is synchronous — LIVE loop can restart immediately after reply
        onTranscript?.(text);
      } else {
        log('STT: Empty result from browser recognition');
        setCoreState('IDLE');
        setMicStatus('idle');
      }
    };

    recognition.onerror = (event: any) => {
      const error = event.error as string;
      log(`STT: Browser recognition error '${error}' — message: ${event.message || 'N/A'}, isRestarting: ${!!recognitionRef.current}`, true);
      if (error === 'aborted') {
        // Benign: start() raced an active session. Log-only — this branch used
        // to fall through to the generic error path below, which painted a red
        // duplicate of this very line in the voice console and pushed the hook
        // into the ERROR state for a non-error condition.
        log('STT: Recognition was aborted — this can happen if start() was called while another recognition was active', true);
      } else if (error === 'no-speech') {
        log('STT: No speech — restarting in 400ms for LIVE mode');
        isProcessingRef.current = false;
        setCoreState('IDLE');
        setMicStatus('idle');
        setTimeout(() => {
          if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return;
          if (coreStateRef.current === 'IDLE' && !isProcessingRef.current) {
            isProcessingRef.current = false;
            recognitionRef.current = null;
            log('STT: Auto-restarting mic after no-speech');
            const SR = getSpeechRecognition();
            if (!SR) return;
            recognitionRef.current = new SR();
            recognitionRef.current.lang = lang || 'en-US';
            recognitionRef.current.interimResults = false;
            recognitionRef.current.maxAlternatives = 1;
            registerSTTEvents(recognitionRef.current, lang);
            try { recognitionRef.current.start(); } catch (e: any) {
              log(`STT: auto-restart failed — ${e?.message || e}`);
            }
          }
        }, 400);
      } else if (error === 'not-allowed') {
        log('STT: Microphone permission denied');
        setErrorMessage('Microphone access denied. Allow mic in browser settings.');
        setCoreState('ERROR');
        setMicStatus('error');
        recognitionRef.current = null;
      } else if (error === 'network' || error === 'audio-capture' || error === 'timeout') {
        // Transient browser hiccups: log them but don't escalate to the
        // sticky red ERROR banner — the session recovers on its own (LIVE
        // mode auto-restarts it as soon as state returns to IDLE).
        log(`STT: Transient '${error}' — not treated as a fatal error`);
        recognitionRef.current = null;
      } else {
        log(`STT: Browser recognition error '${error}' — message: ${event.message || ''}`);
        setErrorMessage(`Speech recognition error: ${error}`);
        setCoreState('ERROR');
        setMicStatus('error');
        recognitionRef.current = null;
      }
    };

    recognition.onend = () => {
      log('STT: Browser recognition ended');
      recognitionRef.current = null;
      if (!isProcessingRef.current) {
        setCoreState('IDLE');
        setMicStatus('idle');
      }
    };
  }, [onTranscript, log, setCoreState]);

  // === Start a fresh browser STT session ===
  const startBrowserSTT = useCallback((lang: string) => {
    let SR: new () => any;
    try { SR = getSpeechRecognition(); } catch {
      log('STT: Web Speech Recognition API not available in this browser');
      setErrorMessage('Speech recognition not available in this browser');
      setCoreState('ERROR');
      setMicStatus('error');
      return;
    }
    const recognition = new SR();
    recognitionRef.current = recognition;
    registerSTTEvents(recognition, lang);
    try {
      recognition.start();
    } catch (err: any) {
      log(`STT: Failed to start — ${err?.message}`);
      setErrorMessage(`Could not start speech recognition: ${err?.message}`);
      setCoreState('ERROR');
      setMicStatus('error');
    }
  }, [registerSTTEvents, log, setCoreState]);

  // === SERVER STT via MediaRecorder + Gemini ===
  const startServerSTT = useCallback(async (lang: string) => {
    log('STT: Using server-side Gemini STT');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      streamRef.current = stream;
      setMicStatus('active');

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '';

      if (!mimeType) {
        log('MIC: No supported MIME type');
        stream.getTracks().forEach(t => t.stop());
        streamRef.current = null;
        setCoreState('ERROR');
        setMicStatus('error');
        return;
      }

      const recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 128000 });
      recorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        const chunks = chunksRef.current;
        chunksRef.current = [];
        if (chunks.length === 0) {
          log('MIC: No audio captured');
          setCoreState('IDLE');
          setMicStatus('idle');
          return;
        }
        const blob = new Blob(chunks, { type: mimeType || 'audio/webm' });
        log(`MIC: Audio captured (${(blob.size / 1024).toFixed(1)}KB)`);

        const arrayBuffer = await blob.arrayBuffer();
        const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));

        setCoreState('THINKING');
        log('STT: Sending to server...');

        try {
          const response = await fetch(STT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ audioBase64: base64, mimeType: blob.type || 'audio/webm' }),
          });
          const data = await response.json() as { text?: string; status?: string; error?: string };

          log(`STT: Server response — status: ${data.status || 'ok'}, text: "${data.text || ''}"`);

          if (data.status === 'no_api_key') {
            log('STT: No Gemini API key — server cannot transcribe');
            setErrorMessage('Server STT requires Gemini API key. Configure in Settings.');
            setCoreState('ERROR');
            setMicStatus('error');
            return;
          }

          const text = (typeof data.text === 'string' ? data.text : '').trim();
          if (sttStartRef.current) {
            log(`⏱ STT latency: ${Math.round(performance.now() - sttStartRef.current)}ms`);
            sttStartRef.current = 0;
          }

          if (text) {
            setTranscript(text);
            setLastTranscript(text);
            isProcessingRef.current = true;
            onTranscript?.(text);
          } else {
            log('STT: Empty transcript');
            setCoreState('IDLE');
            setMicStatus('idle');
          }
        } catch (err: any) {
          log(`STT: Request failed — ${err?.message}`);
          setErrorMessage(`STT request failed: ${err?.message}`);
          setCoreState('ERROR');
          setMicStatus('error');
        }
      };

      recorder.start();
      sttStartRef.current = performance.now();
      log('MIC: Recording started (server STT)');
      setCoreState('LISTENING');

      // Auto-stop after 10s
      setTimeout(() => {
        if (recorder.state === 'recording') {
          log('MIC: Auto-stopping after 10s');
          recorder.stop();
        }
      }, 10000);
    } catch (err: any) {
      const msg = err?.name === 'NotAllowedError'
        ? 'Microphone access denied'
        : err?.name === 'NotFoundError'
          ? 'No microphone found'
          : `Microphone error: ${err?.message}`;
      log(`MIC: ${msg}`);
      setErrorMessage(msg);
      setCoreState('ERROR');
      setMicStatus('error');
    }
  }, [onTranscript, log, setCoreState]);

  // === MAIN ENTRY POINT: startListening ===
  const startListening = useCallback(async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      log('MIC: getUserMedia not available');
      setErrorMessage('Microphone not available in this browser');
      setCoreState('ERROR');
      setMicStatus('error');
      return;
    }

    // Never cut off mid-turn. In LIVE mode we re-enter only when idle.
    // This prevents "Speech recognition error: aborted" races.
    if (isProcessingRef.current || coreStateRef.current === 'LISTENING' || coreStateRef.current === 'THINKING' || coreStateRef.current === 'SPEAKING') {
      log('MIC: still busy from previous turn — waiting (not aborting)', true);
      log(`MIC: isProcessing=${isProcessingRef.current}, state=${coreStateRef.current}`, true);
      return;
    }

    // Clear any stale recognition reference before starting fresh
    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch { /* */ }
      recognitionRef.current = null;
    }

    isProcessingRef.current = false;
    setTranscript('');
    setLastTranscript('');
    setErrorMessage('');
    setMicStatus('requesting');
    log('MIC: Starting...');

    let SR: new () => any;
    try { SR = getSpeechRecognition(); } catch {
      SR = null as any;
    }

    if (SR) {
      log('MIC: Browser STT available — using browser recognition');
      startBrowserSTT(ttsLocaleHints[0] || 'en-US');
    } else {
      log('MIC: Browser STT not available — using server STT');
      await startServerSTT(ttsLocaleHints[0] || 'en-US');
    }
  }, [ttsLocaleHints, registerSTTEvents, startBrowserSTT, startServerSTT, stopAll, log, setCoreState]);

  return {
    coreState,
    micStatus,
    transcript,
    lastTranscript,
    voicesLoaded,
    voiceLog,
    errorMessage,
    startListening,
    stopAll,
    stopSpeech,
    speak,
    pushLog: log,
  };
}
