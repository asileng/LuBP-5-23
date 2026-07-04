/**
 * recorder.js — MediaRecorder wrapper for segment audio capture
 */
const Recorder = {
    _mediaRecorder: null,
    _chunks: [],
    _stream: null,
    _initialized: false,
    _deviceId: null,      // currently selected device ID
    _devices: [],         // cached list of audio input devices

    /**
     * Request microphone permission and initialize.
     * @param {string} [deviceId] - optional device ID to select
     */
    async init(deviceId) {
        this._deviceId = deviceId || null;
        try {
            this._stream = await this._requestStream(this._deviceId);
            this._initialized = true;
            // After first permission grant, enumerate real device labels
            await this._refreshDevices();
            return true;
        } catch (err) {
            console.error("Microphone access denied:", err);
            alert("Microphone access is required for recording. Please allow microphone access and refresh the page.");
            return false;
        }
    },

    /**
     * Request a MediaStream from a specific (or default) audio device.
     */
    async _requestStream(deviceId) {
        const constraints = {
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                sampleRate: 16000,
                ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
            },
        };
        return await navigator.mediaDevices.getUserMedia(constraints);
    },

    /**
     * Enumerate available audio input devices.
     * @returns {Promise<MediaDeviceInfo[]>}
     */
    async _refreshDevices() {
        try {
            const all = await navigator.mediaDevices.enumerateDevices();
            this._devices = all.filter(d => d.kind === "audioinput");
        } catch (e) {
            console.warn("Could not enumerate devices:", e);
            this._devices = [];
        }
        return this._devices;
    },

    /**
     * Get list of available audio input devices.
     * @returns {Promise<Array<{deviceId: string, label: string}>>}
     */
    async getDevices() {
        await this._refreshDevices();
        return this._devices.map(d => ({
            deviceId: d.deviceId,
            label: d.label || `Microphone (${d.deviceId.slice(0, 8)}…)`,
        }));
    },

    /**
     * Get the currently selected device ID.
     */
    getCurrentDeviceId() {
        return this._deviceId;
    },

    /**
     * Get the current MediaStream (for visualizer etc.).
     * @returns {MediaStream|null}
     */
    getStream() {
        return this._stream;
    },

    /**
     * Switch to a different audio input device.
     * Stops the current stream and requests a new one.
     * Only allowed when NOT recording.
     * @param {string} deviceId
     * @returns {Promise<boolean>}
     */
    async switchDevice(deviceId) {
        if (this.isRecording() || this.isPaused()) {
            console.warn("Cannot switch device while recording");
            return false;
        }

        // Stop old stream
        this.destroy();

        this._deviceId = deviceId;
        try {
            this._stream = await this._requestStream(deviceId);
            this._initialized = true;
            console.log(`[Recorder] Switched to device: ${deviceId}`);
            return true;
        } catch (err) {
            console.error("Failed to switch device:", err);
            // Try to recover with default device
            try {
                this._stream = await this._requestStream(null);
                this._deviceId = null;
                this._initialized = true;
                return true;
            } catch (e) {
                this._initialized = false;
                return false;
            }
        }
    },

    /**
     * Start recording audio.
     */
    start() {
        if (!this._stream) {
            console.error("Recorder not initialized");
            return;
        }

        this._chunks = [];

        // Determine supported mime type
        let mimeType = "audio/webm;codecs=opus";
        if (!MediaRecorder.isTypeSupported(mimeType)) {
            mimeType = "audio/webm";
        }
        if (!MediaRecorder.isTypeSupported(mimeType)) {
            mimeType = "audio/mp4";
        }

        this._mediaRecorder = new MediaRecorder(this._stream, { mimeType });

        this._mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) {
                this._chunks.push(e.data);
            }
        };

        this._mediaRecorder.start(1000); // collect data every 1 second
    },

    /**
     * Stop recording and return the audio blob.
     * @returns {Promise<Blob>}
     */
    stopAndGetBlob() {
        return new Promise((resolve) => {
            if (!this._mediaRecorder || this._mediaRecorder.state === "inactive") {
                resolve(null);
                return;
            }

            this._mediaRecorder.onstop = () => {
                const blob = new Blob(this._chunks, {
                    type: this._mediaRecorder.mimeType || "audio/webm",
                });
                resolve(blob);
            };
            this._mediaRecorder.stop();
        });
    },

    /**
     * Stop recording, upload audio, and return the transcription result.
     * @param {number} segmentIndex
     * @returns {Promise<Object>} API response
     */
    async stopAndUpload(segmentIndex) {
        const blob = await this.stopAndGetBlob();
        if (!blob) {
            return { success: false, error: "No audio recorded" };
        }
        return await Recorder.uploadBlob(blob, segmentIndex);
    },

    /**
     * Upload an audio blob for a segment (non-blocking upload).
     * @param {Blob} blob
     * @param {number} segmentIndex
     * @returns {Promise<Object>} API response
     */
    async uploadBlob(blob, segmentIndex) {
        const formData = new FormData();
        const ext = blob.type.includes("mp4") ? "mp4" : "webm";
        formData.append("audio", blob, `segment_${segmentIndex}.${ext}`);
        formData.append("segment_index", segmentIndex);

        const resp = await fetch("/api/transcribe", {
            method: "POST",
            body: formData,
        });
        return await resp.json();
    },

    /**
     * Pause the recording (if supported).
     */
    pause() {
        if (this._mediaRecorder && this._mediaRecorder.state === "recording") {
            this._mediaRecorder.pause();
        }
    },

    /**
     * Resume a paused recording.
     */
    resume() {
        if (this._mediaRecorder && this._mediaRecorder.state === "paused") {
            this._mediaRecorder.resume();
        }
    },

    /**
     * Check if currently recording.
     */
    isRecording() {
        return this._mediaRecorder && this._mediaRecorder.state === "recording";
    },

    /**
     * Check if paused.
     */
    isPaused() {
        return this._mediaRecorder && this._mediaRecorder.state === "paused";
    },

    /**
     * Clean up the stream.
     */
    destroy() {
        if (this._stream) {
            this._stream.getTracks().forEach((t) => t.stop());
            this._stream = null;
            this._initialized = false;
        }
    },
};
