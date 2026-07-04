/**
 * visualizer.js — Real-time audio waveform & volume level display
 * Uses Web Audio API AnalyserNode to visualise the microphone input.
 */
const Visualizer = {
    _audioCtx: null,
    _analyser: null,
    _source: null,       // MediaStreamSource (tied to the mic stream)
    _animId: null,       // requestAnimationFrame handle
    _canvas: null,
    _ctx: null,          // Canvas 2D context
    _volumeBar: null,    // volume level DOM element
    _volumeLabel: null,  // dB text label
    _connected: false,

    /**
     * Bind DOM elements (called once after DOM is ready).
     */
    bindElements() {
        this._canvas = document.getElementById("waveform-canvas");
        this._volumeBar = document.getElementById("volume-level-fill");
        this._volumeLabel = document.getElementById("volume-db");
        if (this._canvas) {
            this._ctx = this._canvas.getContext("2d");
        }
    },

    /**
     * Connect to a MediaStream and start drawing.
     * Safe to call multiple times — disconnects previous source first.
     * @param {MediaStream} stream
     */
    connect(stream) {
        this.disconnect();
        if (!stream || !this._canvas) return;

        // Create or reuse AudioContext
        if (!this._audioCtx || this._audioCtx.state === "closed") {
            this._audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        // Resume if suspended (browser autoplay policy)
        if (this._audioCtx.state === "suspended") {
            this._audioCtx.resume();
        }

        this._analyser = this._audioCtx.createAnalyser();
        this._analyser.fftSize = 2048;
        this._analyser.smoothingTimeConstant = 0.8;

        this._source = this._audioCtx.createMediaStreamSource(stream);
        this._source.connect(this._analyser);
        // Do NOT connect analyser to destination (would cause feedback)

        this._connected = true;
        this._resizeCanvas();
        this._draw();
    },

    /**
     * Disconnect from the current stream and stop drawing.
     */
    disconnect() {
        if (this._animId) {
            cancelAnimationFrame(this._animId);
            this._animId = null;
        }
        if (this._source) {
            this._source.disconnect();
            this._source = null;
        }
        if (this._analyser) {
            this._analyser = null;
        }
        this._connected = false;
        // Clear canvas
        if (this._ctx && this._canvas) {
            this._ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);
            this._drawIdleWaveform();
        }
        // Reset volume bar
        if (this._volumeBar) {
            this._volumeBar.style.height = "0%";
            this._volumeBar.className = "volume-level-fill";
        }
        if (this._volumeLabel) {
            this._volumeLabel.textContent = "-- dB";
        }
    },

    /**
     * Main animation loop.
     */
    _draw() {
        if (!this._connected || !this._analyser) return;

        this._animId = requestAnimationFrame(() => this._draw());

        this._resizeCanvas();
        this._drawWaveform();
        this._drawVolume();
    },

    /**
     * Draw the time-domain waveform on the canvas.
     */
    _drawWaveform() {
        const canvas = this._canvas;
        const ctx = this._ctx;
        const analyser = this._analyser;
        const W = this._drawW;
        const H = this._drawH;

        const bufferLength = analyser.fftSize;
        const dataArray = new Uint8Array(bufferLength);
        analyser.getByteTimeDomainData(dataArray);

        // Background
        ctx.fillStyle = "#1a1a2e";
        ctx.fillRect(0, 0, W, H);

        // Center line (subtle)
        ctx.strokeStyle = "rgba(255,255,255,0.08)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, H / 2);
        ctx.lineTo(W, H / 2);
        ctx.stroke();

        // Waveform
        ctx.lineWidth = 2;
        ctx.strokeStyle = this._getWaveColor(dataArray);
        ctx.beginPath();

        const sliceWidth = W / bufferLength;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
            const v = dataArray[i] / 128.0;  // normalize 0..2
            const y = (v * H) / 2;

            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
            x += sliceWidth;
        }

        ctx.lineTo(W, H / 2);
        ctx.stroke();

        // Glow effect for loud signals
        const rms = this._calcRMS(dataArray);
        if (rms > 0.15) {
            ctx.shadowColor = ctx.strokeStyle;
            ctx.shadowBlur = rms * 30;
            ctx.stroke();
            ctx.shadowBlur = 0;
        }
    },

    /**
     * Draw idle/empty waveform (no stream connected).
     */
    _drawIdleWaveform() {
        const canvas = this._canvas;
        const ctx = this._ctx;
        const W = this._drawW;
        const H = this._drawH;

        ctx.fillStyle = "#1a1a2e";
        ctx.fillRect(0, 0, W, H);

        // Flat center line
        ctx.strokeStyle = "rgba(255,255,255,0.15)";
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(0, H / 2);
        ctx.lineTo(W, H / 2);
        ctx.stroke();
        ctx.setLineDash([]);
    },

    /**
     * Update the volume level bar.
     */
    _drawVolume() {
        if (!this._volumeBar) return;

        const dataArray = new Uint8Array(this._analyser.fftSize);
        this._analyser.getByteTimeDomainData(dataArray);
        const rms = this._calcRMS(dataArray);

        // Convert RMS to percentage (0..1 → 0..100) with some scaling
        const pct = Math.min(100, rms * 250);

        this._volumeBar.style.height = pct + "%";

        // Color classes
        this._volumeBar.classList.remove("vol-low", "vol-ok", "vol-good", "vol-loud", "vol-clip");
        if (pct < 5) {
            this._volumeBar.classList.add("vol-low");
        } else if (pct < 30) {
            this._volumeBar.classList.add("vol-ok");
        } else if (pct < 65) {
            this._volumeBar.classList.add("vol-good");
        } else if (pct < 90) {
            this._volumeBar.classList.add("vol-loud");
        } else {
            this._volumeBar.classList.add("vol-clip");
        }

        // Approximate dB display
        if (this._volumeLabel) {
            if (rms < 0.001) {
                this._volumeLabel.textContent = "-∞ dB";
            } else {
                const db = (20 * Math.log10(rms)).toFixed(0);
                this._volumeLabel.textContent = db + " dB";
            }
        }
    },

    /**
     * Calculate RMS (root mean square) of the audio buffer.
     */
    _calcRMS(dataArray) {
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
            const v = (dataArray[i] - 128) / 128;
            sum += v * v;
        }
        return Math.sqrt(sum / dataArray.length);
    },

    /**
     * Get waveform color based on signal level.
     */
    _getWaveColor(dataArray) {
        const rms = this._calcRMS(dataArray);
        if (rms < 0.02) return "rgba(149,165,166,0.6)";      // grey — silence
        if (rms < 0.1)  return "rgba(46,204,113,0.8)";        // green — quiet
        if (rms < 0.3)  return "rgba(46,204,113,1)";          // green — good
        if (rms < 0.6)  return "rgba(241,196,15,1)";          // yellow — loud
        return "rgba(231,76,60,1)";                            // red — clipping
    },

    /**
     * Resize canvas to match its CSS size (for sharp rendering).
     */
    _resizeCanvas() {
        if (!this._canvas) return;
        const rect = this._canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        const w = Math.floor(rect.width * dpr);
        const h = Math.floor(rect.height * dpr);
        if (this._canvas.width !== w || this._canvas.height !== h) {
            this._canvas.width = w;
            this._canvas.height = h;
            // Reset transform and re-apply DPR scale
            this._ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            this._cssW = rect.width;
            this._cssH = rect.height;
        }
    },

    /**
     * Override canvas dimensions for drawing to use CSS pixels.
     */
    get _drawW() { return this._cssW || this._canvas.clientWidth; },
    get _drawH() { return this._cssH || this._canvas.clientHeight; },

    /**
     * Check if visualizer is active.
     */
    isActive() {
        return this._connected;
    },
};
