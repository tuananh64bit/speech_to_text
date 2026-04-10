/**
 * VoiceScribe — Main Application
 * Orchestrates speech recognition, translation, recording, and playback
 */

import { SpeechEngine } from './modules/speechEngine.js';
import { Translator } from './modules/translator.js';
import { Recorder } from './modules/recorder.js';
import { Player } from './modules/player.js';

class VoiceScribeApp {
  constructor() {
    // Core modules
    this.speechEngine = new SpeechEngine();
    this.translator = new Translator();
    this.recorder = new Recorder();
    this.player = null;

    // State
    this.segments = []; // { text, translation, timestamp, language }
    this.currentLanguage = 'en-US';
    this.isActive = false;
    this._timerInterval = null;

    // DOM Elements
    this.els = {};
    this._cacheDOMElements();
    this._bindEvents();
    this._setupModuleCallbacks();
  }

  _cacheDOMElements() {
    this.els = {
      // Status
      statusIndicator: document.getElementById('statusIndicator'),
      statusText: this.els?.statusText || document.querySelector('.status-text'),

      // Controls
      langBtns: document.querySelectorAll('.lang-btn'),
      btnRecord: document.getElementById('btnRecord'),
      btnPause: document.getElementById('btnPause'),
      btnStop: document.getElementById('btnStop'),
      recordingTimer: document.getElementById('recordingTimer'),
      timerText: document.getElementById('timerText'),
      waveformContainer: document.getElementById('waveformContainer'),
      waveformCanvas: document.getElementById('waveformCanvas'),

      // Transcript
      transcriptList: document.getElementById('transcriptList'),
      emptyState: document.getElementById('emptyState'),
      interimSegment: document.getElementById('interimSegment'),
      interimText: document.getElementById('interimText'),
      btnClearTranscript: document.getElementById('btnClearTranscript'),
      btnExport: document.getElementById('btnExport'),

      // Playback
      playbackSection: document.getElementById('playbackSection'),
      audioElement: document.getElementById('audioElement'),
      btnPlay: document.getElementById('btnPlay'),
      iconPlay: document.querySelector('.icon-play'),
      iconPause: document.querySelector('.icon-pause'),
      progressBar: document.getElementById('progressBar'),
      progressFill: document.getElementById('progressFill'),
      playerCurrentTime: document.getElementById('playerCurrentTime'),
      playerDuration: document.getElementById('playerDuration'),
      playbackSpeed: document.getElementById('playbackSpeed'),
      subtitleList: document.getElementById('subtitleList'),
      btnDownloadAudio: document.getElementById('btnDownloadAudio'),

      // API Key
      apiKeyInput: document.getElementById('apiKeyInput'),
      btnSaveKey: document.getElementById('btnSaveKey'),
    };

    // Re-query status text (wasn't available in first pass)
    this.els.statusText = document.querySelector('.status-text');

    // Load saved API key
    const savedKey = this.speechEngine.getApiKey();
    if (savedKey && this.els.apiKeyInput) {
      this.els.apiKeyInput.value = savedKey;
    }
  }

  _bindEvents() {
    // Language selection
    this.els.langBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        if (this.isActive) return; // Can't change language while recording
        this._selectLanguage(btn.dataset.lang);
      });
    });

    // Record button
    this.els.btnRecord.addEventListener('click', () => {
      if (!this.isActive) {
        this._startSession();
      }
    });

    // Pause button
    this.els.btnPause.addEventListener('click', () => {
      this._togglePause();
    });

    // Stop button
    this.els.btnStop.addEventListener('click', () => {
      this._stopSession();
    });

    // Clear transcript
    this.els.btnClearTranscript.addEventListener('click', () => {
      this._clearTranscript();
    });

    // Export
    this.els.btnExport.addEventListener('click', () => {
      this._exportTranscript();
    });

    // Playback controls
    this.els.btnPlay.addEventListener('click', () => {
      if (this.player) this.player.togglePlay();
    });

    // Progress bar seek
    this.els.progressBar.addEventListener('click', (e) => {
      if (!this.player) return;
      const rect = this.els.progressBar.getBoundingClientRect();
      const ratio = (e.clientX - rect.left) / rect.width;
      const time = ratio * this.player.getDuration();
      this.player.seek(time);
    });

    // Playback speed
    this.els.playbackSpeed.addEventListener('change', (e) => {
      if (this.player) this.player.setPlaybackRate(parseFloat(e.target.value));
    });

    // Download audio
    this.els.btnDownloadAudio.addEventListener('click', () => {
      this.recorder.downloadAudio('voicescribe_recording');
    });

    // Save API Key
    this.els.btnSaveKey.addEventListener('click', () => {
      const key = this.els.apiKeyInput.value.trim();
      if (key) {
        this.speechEngine.setApiKey(key);
        this._showToast('API Key đã được lưu!', 'success');
      } else {
        this._showToast('Vui lòng nhập API Key.', 'warning');
      }
    });
  }

  _setupModuleCallbacks() {
    // Speech Engine callbacks
    this.speechEngine.onInterim = (data) => {
      this._showInterim(data.text);
    };

    this.speechEngine.onFinal = (data) => {
      this._hideInterim();
      this._addSegment(data);
    };

    this.speechEngine.onError = (message) => {
      this._showToast(message, 'error');
    };

    this.speechEngine.onStateChange = (listening) => {
      this._updateStatus(listening ? 'listening' : (this.isActive ? 'recording' : 'idle'));
    };

    // Recorder callbacks
    this.recorder.onStateChange = (state) => {
      if (state === 'recording') {
        this._updateStatus('recording');
      } else if (state === 'paused') {
        this._updateStatus('paused');
      } else if (state === 'stopped') {
        // Handled in _stopSession
      }
    };

    this.recorder.onDataAvailable = (blob, url) => {
      this._setupPlayback(url);
    };

    this.recorder.onVisualize = (dataArray) => {
      this._drawWaveform(dataArray);
    };
  }

  // ─── Language ─────────────────────────────────

  _selectLanguage(langCode) {
    this.currentLanguage = langCode;
    this.speechEngine.setLanguage(langCode);

    this.els.langBtns.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.lang === langCode);
    });
  }

  // ─── Session Control ─────────────────────────

  async _startSession() {
    try {
      // Start recording first (requests mic permission)
      const startTime = await this.recorder.start();

      // Start speech recognition sharing the SAME mic stream
      const started = await this.speechEngine.start(startTime, this.recorder.stream);

      if (!started) {
        this.recorder.stop();
        this._showToast('Không thể kết nối Deepgram. Kiểm tra API Key.', 'error');
        return;
      }

      this.isActive = true;
      this.segments = [];

      // Update UI
      this.els.btnRecord.classList.add('recording');
      this.els.btnRecord.querySelector('span').textContent = 'Đang ghi...';
      this.els.btnPause.disabled = false;
      this.els.btnStop.disabled = false;
      this.els.recordingTimer.classList.add('active');
      this.els.waveformContainer.classList.add('active');
      this.els.emptyState.style.display = 'none';

      // Disable language switching
      this.els.langBtns.forEach(btn => {
        btn.style.pointerEvents = 'none';
        btn.style.opacity = '0.5';
      });

      // Hide playback if exists
      this.els.playbackSection.style.display = 'none';

      // Start timer
      this._startTimer();

      this._updateStatus('recording');
      this._showToast('Bắt đầu ghi âm và nhận diện giọng nói', 'success');

    } catch (err) {
      this._showToast(err.message, 'error');
    }
  }

  async _togglePause() {
    if (!this.isActive) return;

    if (this.recorder.isPaused) {
      // Resume
      this.recorder.resume();
      await this.speechEngine.start(this.recorder.startTime);
      this.els.btnPause.querySelector('span').textContent = 'Tạm dừng';
      this.els.btnRecord.querySelector('span').textContent = 'Đang ghi...';
      this.els.recordingTimer.querySelector('.timer-dot').style.animationPlayState = 'running';
      this._updateStatus('recording');
    } else {
      // Pause
      this.recorder.pause();
      this.speechEngine.stop();
      this.els.btnPause.querySelector('span').textContent = 'Tiếp tục';
      this.els.btnRecord.querySelector('span').textContent = 'Tạm dừng';
      this.els.recordingTimer.querySelector('.timer-dot').style.animationPlayState = 'paused';
      this._updateStatus('paused');
    }
  }

  _stopSession() {
    if (!this.isActive) return;

    this.isActive = false;

    // IMPORTANT: Stop speech engine first to flush pending text
    this.speechEngine.stop();
    
    // Delay stopping the recorder slightly so the speech API
    // has time to process the last audio chunk before the stream dies
    setTimeout(() => {
      this.recorder.stop();
    }, 300);

    // Update UI
    this.els.btnRecord.classList.remove('recording');
    this.els.btnRecord.querySelector('span').textContent = 'Bắt đầu';
    this.els.btnPause.disabled = true;
    this.els.btnPause.querySelector('span').textContent = 'Tạm dừng';
    this.els.btnStop.disabled = true;
    this.els.waveformContainer.classList.remove('active');

    // Re-enable language switching
    this.els.langBtns.forEach(btn => {
      btn.style.pointerEvents = '';
      btn.style.opacity = '';
    });

    // Stop timer
    this._stopTimer();

    // Delay hiding interim so the last segment has time to be added
    setTimeout(() => {
      this._hideInterim();
    }, 500);
    
    this._updateStatus('idle');
    this._showToast('Đã dừng ghi âm. Bạn có thể phát lại bên dưới.', 'info');
  }

  // ─── Timer ────────────────────────────────────

  _startTimer() {
    this._timerInterval = setInterval(() => {
      const elapsed = this.recorder.getElapsedTime();
      this.els.timerText.textContent = this._formatTime(elapsed);
    }, 200);
  }

  _stopTimer() {
    if (this._timerInterval) {
      clearInterval(this._timerInterval);
      this._timerInterval = null;
    }
  }

  // ─── Transcript ───────────────────────────────

  _showInterim(text) {
    this.els.interimSegment.style.display = 'flex';
    this.els.interimText.textContent = text;
    this._scrollToBottom();
  }

  _hideInterim() {
    this.els.interimSegment.style.display = 'none';
    this.els.interimText.textContent = '';
  }

  async _addSegment(data) {
    const segment = {
      text: data.text,
      translation: null,
      timestamp: data.timestamp,
      language: data.language,
      confidence: data.confidence
    };

    this.segments.push(segment);
    const index = this.segments.length - 1;

    // Create DOM element
    const segEl = this._createSegmentElement(segment, index);
    this.els.transcriptList.insertBefore(segEl, this.els.interimSegment);
    this._scrollToBottom();

    // Translate
    try {
      const translation = await this.translator.translate(data.text, data.language);
      segment.translation = translation;
      this._updateSegmentTranslation(segEl, translation);
    } catch (err) {
      console.error('Translation failed:', err);
      segment.translation = `[Lỗi dịch] ${data.text}`;
      this._updateSegmentTranslation(segEl, segment.translation);
    }
  }

  _createSegmentElement(segment, index) {
    const div = document.createElement('div');
    div.className = 'segment';
    div.dataset.index = index;
    div.dataset.timestamp = segment.timestamp;

    const langLabel = SpeechEngine.getSupportedLanguages().find(l => l.code === segment.language);

    div.innerHTML = `
      <div class="segment-meta">
        <span class="segment-time">${this._formatTime(segment.timestamp)}</span>
        <span class="segment-badge">${langLabel?.shortName || 'EN'}</span>
      </div>
      <div class="segment-content">
        <p class="segment-original">${this._escapeHtml(segment.text)}</p>
        <p class="segment-translation loading">⏳ Đang dịch...</p>
      </div>
    `;

    return div;
  }

  _updateSegmentTranslation(segEl, translation) {
    const transEl = segEl.querySelector('.segment-translation');
    if (transEl) {
      transEl.classList.remove('loading');
      transEl.textContent = `→ ${translation}`;
      transEl.style.animation = 'fadeIn 0.3s ease';
    }
  }

  _clearTranscript() {
    this.segments = [];
    // Remove all segments but keep empty state and interim
    const segments = this.els.transcriptList.querySelectorAll('.segment');
    segments.forEach(s => s.remove());
    this.els.emptyState.style.display = 'flex';
    this.els.playbackSection.style.display = 'none';
    this._showToast('Đã xóa bản ghi', 'info');
  }

  _exportTranscript() {
    if (this.segments.length === 0) {
      this._showToast('Chưa có bản ghi để xuất', 'warning');
      return;
    }

    let content = '=== VoiceScribe — Bản ghi song ngữ ===\n';
    content += `Ngày: ${new Date().toLocaleString('vi-VN')}\n`;
    content += `Ngôn ngữ: ${this.currentLanguage} → vi\n`;
    content += '='.repeat(40) + '\n\n';

    this.segments.forEach((seg, i) => {
      const time = this._formatTime(seg.timestamp);
      content += `[${time}]\n`;
      content += `  ${seg.text}\n`;
      content += `  → ${seg.translation || '(chưa dịch)'}\n\n`;
    });

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `voicescribe_${new Date().toISOString().slice(0,10)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    this._showToast('Đã xuất bản ghi thành công', 'success');
  }

  _scrollToBottom() {
    const list = this.els.transcriptList;
    requestAnimationFrame(() => {
      list.scrollTop = list.scrollHeight;
    });
  }

  // ─── Playback ─────────────────────────────────

  _setupPlayback(audioUrl) {
    this.els.playbackSection.style.display = 'block';

    // Initialize player
    this.player = new Player(this.els.audioElement);
    this.player.loadAudio(audioUrl);
    this.player.setSegments([...this.segments]);

    // Render subtitle segments
    this._renderSubtitles();

    // Player callbacks
    this.player.onStateChange = (state) => {
      if (state === 'playing') {
        this.els.iconPlay.style.display = 'none';
        this.els.iconPause.style.display = 'block';
      } else {
        this.els.iconPlay.style.display = 'block';
        this.els.iconPause.style.display = 'none';
      }
    };

    this.player.onTimeUpdate = (currentTime, duration) => {
      this.els.playerCurrentTime.textContent = this._formatTime(currentTime);
      this.els.playerDuration.textContent = this._formatTime(duration);

      const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
      this.els.progressFill.style.width = `${progress}%`;
    };

    this.player.onSegmentChange = (index, segment) => {
      // Update subtitle highlights
      const subSegments = this.els.subtitleList.querySelectorAll('.segment');
      subSegments.forEach((el, i) => {
        el.classList.remove('active', 'past');
        if (i === index) {
          el.classList.add('active');
          // Scroll into view
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else if (i < index) {
          el.classList.add('past');
        }
      });
    };

    // Scroll to playback section
    this.els.playbackSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  _renderSubtitles() {
    this.els.subtitleList.innerHTML = '';

    this.segments.forEach((seg, i) => {
      const div = document.createElement('div');
      div.className = 'segment';
      div.dataset.index = i;

      const langLabel = SpeechEngine.getSupportedLanguages().find(l => l.code === seg.language);

      div.innerHTML = `
        <div class="segment-meta">
          <span class="segment-time">${this._formatTime(seg.timestamp)}</span>
          <span class="segment-badge">${langLabel?.shortName || 'EN'}</span>
        </div>
        <div class="segment-content">
          <p class="segment-original">${this._escapeHtml(seg.text)}</p>
          <p class="segment-translation">${this._escapeHtml(seg.translation || '')}</p>
        </div>
      `;

      // Click to seek
      div.addEventListener('click', () => {
        if (this.player) {
          this.player.seek(seg.timestamp);
          this.player.play();
        }
      });

      this.els.subtitleList.appendChild(div);
    });
  }

  // ─── Waveform Visualizer ──────────────────────

  _drawWaveform(dataArray) {
    const canvas = this.els.waveformCanvas;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);

    const barCount = 30;
    const barWidth = (width / barCount) - 2;
    const step = Math.floor(dataArray.length / barCount);

    for (let i = 0; i < barCount; i++) {
      const value = dataArray[i * step] || 0;
      const barHeight = (value / 255) * height * 0.9;

      const x = i * (barWidth + 2);
      const y = (height - barHeight) / 2;

      // Gradient from primary to secondary
      const ratio = i / barCount;
      const r = Math.round(108 + (0 - 108) * ratio);
      const g = Math.round(92 + (206 - 92) * ratio);
      const b = Math.round(231 + (201 - 231) * ratio);

      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.8)`;
      ctx.beginPath();
      ctx.roundRect(x, y, barWidth, barHeight || 2, 1);
      ctx.fill();
    }
  }

  // ─── Status ───────────────────────────────────

  _updateStatus(state) {
    const indicator = this.els.statusIndicator;
    indicator.className = 'status-indicator';

    const textEl = this.els.statusText;

    switch (state) {
      case 'recording':
        indicator.classList.add('recording');
        textEl.textContent = 'Đang ghi âm';
        break;
      case 'listening':
        indicator.classList.add('listening');
        textEl.textContent = 'Đang nghe';
        break;
      case 'paused':
        indicator.classList.add('paused');
        textEl.textContent = 'Tạm dừng';
        break;
      default:
        textEl.textContent = 'Sẵn sàng';
    }
  }

  // ─── Toast ────────────────────────────────────

  _showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('toast-exit');
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  // ─── Utilities ────────────────────────────────

  _formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  _escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// ─── Initialize ──────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  window.app = new VoiceScribeApp();
});
