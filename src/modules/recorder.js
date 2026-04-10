/**
 * Recorder - MediaRecorder API wrapper
 * Records audio from microphone as WebM/Opus
 * Supports pause/resume
 */

export class Recorder {
  constructor() {
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.stream = null;
    this.audioBlob = null;
    this.audioUrl = null;
    this.isRecording = false;
    this.isPaused = false;
    this.startTime = 0;
    this.pausedDuration = 0;
    this._pauseStart = 0;

    // Audio visualization
    this.audioContext = null;
    this.analyser = null;
    this.dataArray = null;

    // Callbacks
    this.onStateChange = null;
    this.onDataAvailable = null;
    this.onVisualize = null;
    this._animFrameId = null;
  }

  async start() {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100,
          channelCount: 1
        }
      });

      // Setup audio visualization
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const source = this.audioContext.createMediaStreamSource(this.stream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      source.connect(this.analyser);
      this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);

      // Setup MediaRecorder
      const mimeType = this._getSupportedMimeType();
      this.mediaRecorder = new MediaRecorder(this.stream, {
        mimeType: mimeType,
        audioBitsPerSecond: 128000
      });

      this.audioChunks = [];
      this.audioBlob = null;
      this.audioUrl = null;
      this.pausedDuration = 0;

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      this.mediaRecorder.onstop = () => {
        this.audioBlob = new Blob(this.audioChunks, { type: mimeType });
        this.audioUrl = URL.createObjectURL(this.audioBlob);
        if (this.onDataAvailable) {
          this.onDataAvailable(this.audioBlob, this.audioUrl);
        }
      };

      this.mediaRecorder.start(100); // Collect data every 100ms
      this.isRecording = true;
      this.isPaused = false;
      this.startTime = Date.now();

      this._startVisualization();

      if (this.onStateChange) this.onStateChange('recording');
      return this.startTime;
    } catch (error) {
      console.error('Failed to start recording:', error);
      throw new Error('Microphone access denied or not available.');
    }
  }

  pause() {
    if (this.mediaRecorder && this.isRecording && !this.isPaused) {
      this.mediaRecorder.pause();
      this.isPaused = true;
      this._pauseStart = Date.now();
      if (this.onStateChange) this.onStateChange('paused');
    }
  }

  resume() {
    if (this.mediaRecorder && this.isRecording && this.isPaused) {
      this.mediaRecorder.resume();
      this.isPaused = false;
      this.pausedDuration += Date.now() - this._pauseStart;
      if (this.onStateChange) this.onStateChange('recording');
    }
  }

  stop() {
    if (this.mediaRecorder && this.isRecording) {
      this.isRecording = false;
      this.isPaused = false;
      this.mediaRecorder.stop();
      this._stopVisualization();

      // Stop all tracks
      if (this.stream) {
        this.stream.getTracks().forEach(track => track.stop());
      }


      if (this.audioContext) {
        this.audioContext.close();
      }

      if (this.onStateChange) this.onStateChange('stopped');
    }
  }

  getElapsedTime() {
    if (!this.isRecording) return 0;
    const now = this.isPaused ? this._pauseStart : Date.now();
    return (now - this.startTime - this.pausedDuration) / 1000;
  }

  _getSupportedMimeType() {
    const types = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/mp4'
    ];

    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }
    return 'audio/webm';
  }

  _startVisualization() {
    const visualize = () => {
      if (!this.isRecording) return;

      this.analyser.getByteFrequencyData(this.dataArray);

      if (this.onVisualize) {
        this.onVisualize(this.dataArray);
      }

      this._animFrameId = requestAnimationFrame(visualize);
    };

    visualize();
  }

  _stopVisualization() {
    if (this._animFrameId) {
      cancelAnimationFrame(this._animFrameId);
      this._animFrameId = null;
    }
  }

  downloadAudio(filename = 'recording') {
    if (!this.audioUrl) return;

    const a = document.createElement('a');
    a.href = this.audioUrl;
    a.download = `${filename}.webm`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
}
