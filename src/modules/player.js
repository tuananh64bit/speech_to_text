/**
 * Player - Audio playback with synchronized subtitles
 * Highlights current segment, auto-scrolls
 */

export class Player {
  constructor(audioElement) {
    this.audio = audioElement;
    this.segments = [];
    this.currentSegmentIndex = -1;
    this.isPlaying = false;
    this._animFrameId = null;

    // Callbacks
    this.onSegmentChange = null;
    this.onTimeUpdate = null;
    this.onStateChange = null;

    this._setupAudioEvents();
  }

  _setupAudioEvents() {
    this.audio.addEventListener('play', () => {
      this.isPlaying = true;
      this._startSync();
      if (this.onStateChange) this.onStateChange('playing');
    });

    this.audio.addEventListener('pause', () => {
      this.isPlaying = false;
      this._stopSync();
      if (this.onStateChange) this.onStateChange('paused');
    });

    this.audio.addEventListener('ended', () => {
      this.isPlaying = false;
      this._stopSync();
      this.currentSegmentIndex = -1;
      if (this.onStateChange) this.onStateChange('ended');
    });

    this.audio.addEventListener('seeked', () => {
      this._updateCurrentSegment();
    });
  }

  loadAudio(url) {
    this.audio.src = url;
    this.audio.load();
  }

  setSegments(segments) {
    // segments: [{ text, translation, timestamp, language }]
    this.segments = segments.sort((a, b) => a.timestamp - b.timestamp);
    this.currentSegmentIndex = -1;
  }

  play() {
    if (this.audio.src) {
      this.audio.play();
    }
  }

  pause() {
    this.audio.pause();
  }

  togglePlay() {
    if (this.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }

  seek(time) {
    if (this.audio.src) {
      this.audio.currentTime = time;
    }
  }

  setPlaybackRate(rate) {
    this.audio.playbackRate = rate;
  }

  getCurrentTime() {
    return this.audio.currentTime;
  }

  getDuration() {
    return this.audio.duration || 0;
  }

  _startSync() {
    const sync = () => {
      if (!this.isPlaying) return;

      const currentTime = this.audio.currentTime;

      if (this.onTimeUpdate) {
        this.onTimeUpdate(currentTime, this.audio.duration);
      }

      this._updateCurrentSegment();

      this._animFrameId = requestAnimationFrame(sync);
    };

    sync();
  }

  _stopSync() {
    if (this._animFrameId) {
      cancelAnimationFrame(this._animFrameId);
      this._animFrameId = null;
    }
  }

  _updateCurrentSegment() {
    const currentTime = this.audio.currentTime;
    let newIndex = -1;

    for (let i = this.segments.length - 1; i >= 0; i--) {
      if (currentTime >= this.segments[i].timestamp) {
        newIndex = i;
        break;
      }
    }

    if (newIndex !== this.currentSegmentIndex) {
      this.currentSegmentIndex = newIndex;
      if (this.onSegmentChange) {
        this.onSegmentChange(newIndex, this.segments[newIndex] || null);
      }
    }
  }

  destroy() {
    this._stopSync();
    this.audio.pause();
    this.audio.src = '';
  }
}
