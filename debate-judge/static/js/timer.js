/**
 * timer.js — Countdown timer with visual/audio alerts
 */
const Timer = {
    _intervalId: null,
    _startTime: null,
    _pausedElapsed: 0,
    remaining: 0,
    elapsed: 0,
    duration: 0,
    _alertedThresholds: new Set(),
    _onExpired: null,
    _onTick: null,

    /**
     * Start the countdown timer.
     * @param {number} durationSec - total seconds
     * @param {function} onExpired - callback when timer reaches 0
     * @param {function} onTick - callback every tick with (remaining, elapsed)
     */
    start(durationSec, onExpired, onTick) {
        this.stop();
        this.duration = durationSec;
        this.remaining = durationSec;
        this.elapsed = 0;
        this._pausedElapsed = 0;
        this._startTime = performance.now();
        this._alertedThresholds = new Set();
        this._onExpired = onExpired;
        this._onTick = onTick;
        this.render();
        this._intervalId = setInterval(() => this._tick(), 100);
    },

    _tick() {
        const now = performance.now();
        this.elapsed = (now - this._startTime) / 1000 + this._pausedElapsed;
        this.remaining = Math.max(0, this.duration - this.elapsed);
        this.render();

        // Check warning thresholds
        const rem = Math.ceil(this.remaining);
        for (const threshold of DEBATE_CONFIG.timerWarnings) {
            if (rem === threshold && !this._alertedThresholds.has(threshold)) {
                this._alertedThresholds.add(threshold);
                this.playAlert(threshold);
            }
        }

        // Tick callback
        if (this._onTick) {
            this._onTick(this.remaining, this.elapsed);
        }

        // Timer expired
        if (this.remaining <= 0) {
            this.stop();
            if (this._onExpired) {
                this._onExpired();
            }
        }
    },

    pause() {
        if (this._intervalId) {
            clearInterval(this._intervalId);
            this._intervalId = null;
            // Save elapsed so far
            this._pausedElapsed += (performance.now() - this._startTime) / 1000;
        }
    },

    resume() {
        if (!this._intervalId && this.remaining > 0) {
            this._startTime = performance.now();
            this._intervalId = setInterval(() => this._tick(), 100);
        }
    },

    stop() {
        if (this._intervalId) {
            clearInterval(this._intervalId);
            this._intervalId = null;
        }
    },

    isRunning() {
        return this._intervalId !== null;
    },

    isPaused() {
        return this._intervalId === null && this.remaining > 0 && this.elapsed > 0;
    },

    render() {
        const el = document.getElementById("timer");
        if (!el) return;

        const mins = Math.floor(this.remaining / 60);
        const secs = Math.floor(this.remaining % 60);
        el.textContent = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;

        // Color classes
        el.classList.remove("timer-green", "timer-yellow", "timer-red", "timer-flash");
        if (this.remaining <= 0) {
            el.classList.add("timer-flash");
        } else if (this.remaining <= 30) {
            el.classList.add("timer-red");
        } else if (this.remaining <= 60) {
            el.classList.add("timer-yellow");
        } else {
            el.classList.add("timer-green");
        }
    },

    /**
     * Check if POI is allowed at the current elapsed time.
     */
    isPoiEligible() {
        const idx = DebateState.current.currentSegment;
        const seg = DEBATE_CONFIG.segments[idx];
        if (!seg || !seg.poiAllowed) return false;

        const rules = DEBATE_CONFIG.poiRules;
        return (
            this.elapsed >= rules.protectedStartSec &&
            this.elapsed <= (this.duration - rules.protectedEndSec)
        );
    },

    /**
     * Play an audio alert using Web Audio API (no file needed).
     */
    playAlert(threshold) {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);

            // Different tones for different warnings
            if (threshold === 60) {
                osc.frequency.value = 440; // A4
                osc.type = "sine";
            } else if (threshold === 30) {
                osc.frequency.value = 660; // E5
                osc.type = "sine";
            } else {
                osc.frequency.value = 880; // A5
                osc.type = "square";
            }

            gain.gain.setValueAtTime(0.3, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);

            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.5);

            // Second beep for 10-second warning
            if (threshold === 10) {
                const osc2 = ctx.createOscillator();
                const gain2 = ctx.createGain();
                osc2.connect(gain2);
                gain2.connect(ctx.destination);
                osc2.frequency.value = 880;
                osc2.type = "square";
                gain2.gain.setValueAtTime(0.3, ctx.currentTime + 0.6);
                gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 1.1);
                osc2.start(ctx.currentTime + 0.6);
                osc2.stop(ctx.currentTime + 1.1);
            }
        } catch (e) {
            console.warn("Audio alert failed:", e);
        }
    },
};
