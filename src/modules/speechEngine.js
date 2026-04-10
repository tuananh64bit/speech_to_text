/**
 * SpeechEngine - Deepgram WebSocket Streaming (v9.1 - Fixed)
 * 
 * Fixes: 
 * - Removed explicit encoding params (let Deepgram auto-detect WebM/Opus)
 * - Accepts external MediaStream instead of capturing its own mic
 * - Added robust logging for debugging
 */

export class SpeechEngine {
  constructor() {
    this.isListening = false;
    this.language = 'en-US';
    this.startTime = 0;

    // Callbacks
    this.onInterim = null;
    this.onFinal = null;
    this.onError = null;
    this.onStateChange = null;

    // Deepgram state
    this._socket = null;
    this._mediaRecorder = null;
    this._apiKey = import.meta.env.VITE_DEEPGRAM_API_KEY || localStorage.getItem('deepgram_api_key') || '';
    this._keepAliveInterval = null;
    this._segmentStartTime = null;
  }

  // ─── Language Mapping ──────────────────────────────────
  _getDeepgramLang(code) {
    const map = {
      'en-US': 'en-US',
      'ko-KR': 'ko',
      'zh-CN': 'zh'
    };
    return map[code] || 'en-US';
  }

  // ─── WebSocket Connection ──────────────────────────────
  _buildUrl() {
    const lang = this._getDeepgramLang(this.language);
    // nova-3 = best for English, nova-2 = better word spacing for Korean/Chinese
    const model = (lang === 'en-US') ? 'nova-3' : 'nova-2';
    
    const params = new URLSearchParams({
      model,
      language: lang,
      smart_format: 'true',
      punctuate: 'true',
      dictation: 'true',
      interim_results: 'true',
      endpointing: '300',
      vad_events: 'true',
    });
    return `wss://api.deepgram.com/v1/listen?${params.toString()}`;
  }

  async _connect() {
    if (!this._apiKey) {
      if (this.onError) this.onError('Chưa có API Key. Hãy nhập Deepgram API Key.');
      return false;
    }

    return new Promise((resolve) => {
      const url = this._buildUrl();
      console.log('🔌 Connecting to Deepgram...', url);
      
      try {
        // Connect with API key as WebSocket protocol
        this._socket = new WebSocket(url, ['token', this._apiKey]);
      } catch (e) {
        console.error('WebSocket creation failed:', e);
        if (this.onError) this.onError('Không thể tạo kết nối WebSocket.');
        resolve(false);
        return;
      }

      // Timeout after 10 seconds
      const timeout = setTimeout(() => {
        console.error('Connection timeout');
        if (this.onError) this.onError('Kết nối Deepgram quá thời gian.');
        resolve(false);
      }, 10000);

      this._socket.onopen = () => {
        clearTimeout(timeout);
        console.log('🟢 Deepgram connected!');
        resolve(true);
        
        // KeepAlive every 8s to prevent timeout
        this._keepAliveInterval = setInterval(() => {
          if (this._socket && this._socket.readyState === WebSocket.OPEN) {
            this._socket.send(JSON.stringify({ type: 'KeepAlive' }));
          }
        }, 8000);
      };

      this._socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this._handleMessage(data);
        } catch(e) {
          console.warn('Failed to parse Deepgram message:', e);
        }
      };

      this._socket.onerror = (err) => {
        clearTimeout(timeout);
        console.error('Deepgram WebSocket error:', err);
        if (this.onError) this.onError('Lỗi kết nối Deepgram. Kiểm tra API Key.');
        resolve(false);
      };

      this._socket.onclose = (event) => {
        clearTimeout(timeout);
        console.log('🔴 Deepgram disconnected:', event.code, event.reason);
        this._cleanup();
        
        // Auto-reconnect if still supposed to be listening
        if (this.isListening) {
          console.log('♻️ Reconnecting in 1s...');
          setTimeout(() => {
            if (this.isListening) {
              this._connect().then((ok) => {
                if (ok && this._externalStream) {
                  this._startStreamingAudio(this._externalStream);
                }
              });
            }
          }, 1000);
        }
      };
    });
  }

  // ─── Handle Deepgram Messages ──────────────────────────
  _handleMessage(data) {
    if (data.type !== 'Results') return;
    
    const rawNow = (Date.now() - this.startTime) / 1000;
    const transcript = data.channel?.alternatives?.[0]?.transcript || '';
    const confidence = data.channel?.alternatives?.[0]?.confidence || 0.8;
    
    if (transcript.trim().length === 0) return;

    if (this._segmentStartTime === null) {
      this._segmentStartTime = data.start !== undefined 
        ? data.start 
        : Math.max(0, rawNow - 0.3);
    }

    if (data.is_final) {
      // ★ Final transcription
      console.log('📝 Final:', transcript);
      if (this.onFinal) {
        this.onFinal({
          text: transcript.trim(),
          timestamp: this._segmentStartTime,
          confidence,
          language: this.language
        });
      }
      if (this.onInterim) {
        this.onInterim({ text: '', timestamp: rawNow });
      }
      
      if (data.speech_final) {
        this._segmentStartTime = null;
      }
    } else {
      // Interim — show immediately
      if (this.onInterim) {
        this.onInterim({
          text: transcript.trim(),
          timestamp: this._segmentStartTime,
          confidence: 0.7,
          language: this.language
        });
      }
    }
  }

  // ─── Audio Streaming (uses SHARED mic stream) ──────────
  _startStreamingAudio(stream) {
    if (!stream) return;
    
    // Check supported mimeType
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') 
      ? 'audio/webm;codecs=opus'
      : 'audio/webm';

    try {
      this._mediaRecorder = new MediaRecorder(stream, { mimeType });
    } catch(e) {
      console.error('MediaRecorder creation failed:', e);
      if (this.onError) this.onError('Không thể tạo MediaRecorder.');
      return;
    }

    this._mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0 && this._socket && this._socket.readyState === WebSocket.OPEN) {
        this._socket.send(event.data);
      }
    };

    // Send chunks every 250ms for balance of latency vs overhead
    this._mediaRecorder.start(250);
    console.log('🎙️ Streaming audio to Deepgram...');
  }

  _stopStreamingAudio() {
    if (this._mediaRecorder && this._mediaRecorder.state !== 'inactive') {
      try { this._mediaRecorder.stop(); } catch(e) {}
    }
    this._mediaRecorder = null;
  }

  _cleanup() {
    if (this._keepAliveInterval) {
      clearInterval(this._keepAliveInterval);
      this._keepAliveInterval = null;
    }
  }

  // ─── Public API ────────────────────────────────────────
  setApiKey(key) {
    this._apiKey = key;
    localStorage.setItem('deepgram_api_key', key);
  }

  getApiKey() {
    return this._apiKey;
  }

  setLanguage(langCode) {
    this.language = langCode;
  }

  /**
   * Start streaming transcription.
   * @param {number} recordingStartTime
   * @param {MediaStream} [stream] - Optional shared mic stream from Recorder
   */
  async start(recordingStartTime = Date.now(), stream = null) {
    if (!this._apiKey) {
      if (this.onError) this.onError('Hãy nhập Deepgram API Key trước khi bắt đầu.');
      return false;
    }

    this.startTime = recordingStartTime;
    this.isListening = true;
    this._segmentStartTime = null;

    // If no shared stream provided, capture our own mic
    if (!stream) {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 }
        });
      } catch(e) {
        if (this.onError) this.onError('Không thể truy cập micro.');
        this.isListening = false;
        return false;
      }
    }
    this._externalStream = stream;

    const connected = await this._connect();
    if (!connected) {
      this.isListening = false;
      return false;
    }

    this._startStreamingAudio(stream);
    
    if (this.onStateChange) this.onStateChange(true);
    return true;
  }

  stop() {
    this.isListening = false;
    
    this._stopStreamingAudio();
    
    // Close WebSocket gracefully
    if (this._socket && this._socket.readyState === WebSocket.OPEN) {
      this._socket.send(JSON.stringify({ type: 'CloseStream' }));
      setTimeout(() => {
        if (this._socket) {
          try { this._socket.close(); } catch(e) {}
          this._socket = null;
        }
      }, 300);
    }

    this._cleanup();
    this._externalStream = null;

    if (this.onStateChange) this.onStateChange(false);
  }

  static getSupportedLanguages() {
    return [
      { code: 'en-US', name: 'English', flag: '🇺🇸', shortName: 'EN' },
      { code: 'ko-KR', name: '한국어', flag: '🇰🇷', shortName: 'KO' },
      { code: 'zh-CN', name: '中文', flag: '🇨🇳', shortName: 'ZH' }
    ];
  }
}
