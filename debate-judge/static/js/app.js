/**
 * app.js — Main application orchestrator
 */
const App = {
    _mode: "idle", // idle | recording | paused | viewing
    _pendingTranscriptions: [],   // segment indices awaiting transcription
    _pollTimerId: null,           // setInterval ID for polling
    _poiMarkersSnapshot: {},      // {segmentIndex: markers[]} saved before advance
    _logLastId: -1,               // last seen log entry ID
    _logPollId: null,             // log polling interval ID
    _logUnread: 0,                // unread log count for badge

    async init() {
        // Initialize state
        DebateState.init();

        // Request microphone early
        await Recorder.init();

        // Populate device selector
        await this._populateDeviceSelector();

        // Start audio visualizer
        Visualizer.bindElements();
        Visualizer.connect(Recorder.getStream());

        // Start log polling
        this._logPollId = setInterval(() => this._pollLogs(), 1500);

        // Sync from server (in case of page refresh)
        await DebateState.syncFromServer();

        // Bind UI
        this._bindButtons();
        this._bindExportDropdown();

        // Listen for device changes (plug/unplug)
        navigator.mediaDevices.addEventListener("devicechange", () => {
            this._populateDeviceSelector();
        });

        // Render initial UI
        this.renderTimeline();
        this.renderCurrentSegment();

        // Warn before leaving during active debate
        window.addEventListener("beforeunload", (e) => {
            if (DebateState.current.status === "in_progress") {
                e.preventDefault();
                e.returnValue = "";
            }
        });
    },

    // -----------------------------------------------------------------------
    // UI Binding
    // -----------------------------------------------------------------------

    _bindButtons() {
        document.getElementById("btn-record").addEventListener("click", () => this.onRecord());
        document.getElementById("btn-pause").addEventListener("click", () => this.onPause());
        document.getElementById("btn-stop").addEventListener("click", () => this.onStop());
        document.getElementById("btn-skip").addEventListener("click", () => this.onSkip());
        document.getElementById("btn-poi").addEventListener("click", () => this.onPoi());
        document.getElementById("btn-reset").addEventListener("click", () => this.onReset());

        // Device refresh button
        const refreshBtn = document.getElementById("btn-refresh-devices");
        if (refreshBtn) {
            refreshBtn.addEventListener("click", () => this._populateDeviceSelector());
        }
    },

    _bindExportDropdown() {
        const btn = document.getElementById("btn-export");
        const menu = document.getElementById("export-menu");

        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            menu.classList.toggle("hidden");
        });

        document.addEventListener("click", () => {
            menu.classList.add("hidden");
        });

        document.getElementById("export-txt").addEventListener("click", (e) => {
            e.preventDefault();
            Export.downloadTxt();
            menu.classList.add("hidden");
        });
        document.getElementById("export-md").addEventListener("click", (e) => {
            e.preventDefault();
            Export.downloadMarkdown();
            menu.classList.add("hidden");
        });
        document.getElementById("export-json").addEventListener("click", (e) => {
            e.preventDefault();
            Export.downloadJson();
            menu.classList.add("hidden");
        });
    },

    /**
     * Populate the audio device dropdown with available microphones.
     */
    async _populateDeviceSelector() {
        const select = document.getElementById("audio-device-select");
        const status = document.getElementById("device-status");
        if (!select) return;

        const devices = await Recorder.getDevices();

        if (devices.length === 0) {
            select.innerHTML = '<option value="">No audio devices found</option>';
            if (status) {
                status.textContent = "No devices";
                status.className = "device-status error";
            }
            return;
        }

        const currentId = Recorder.getCurrentDeviceId();
        let html = "";
        for (const dev of devices) {
            const selected = (dev.deviceId === currentId) ? "selected" : "";
            html += `<option value="${dev.deviceId}" ${selected}>${dev.label}</option>`;
        }
        select.innerHTML = html;

        // If no device was explicitly selected, pick the first one
        if (!currentId && devices.length > 0) {
            select.value = devices[0].deviceId;
        }

        if (status) {
            status.textContent = `${devices.length} device${devices.length > 1 ? "s" : ""} available`;
            status.className = "device-status ok";
        }

        // Bind change handler (remove old one first to avoid duplicates)
        select.onchange = () => this._onDeviceChange(select.value);
    },

    /**
     * Handle device selection change.
     */
    async _onDeviceChange(deviceId) {
        const status = document.getElementById("device-status");
        const select = document.getElementById("audio-device-select");

        if (!deviceId) return;

        // Disable selector during switch
        select.disabled = true;
        if (status) {
            status.textContent = "Switching...";
            status.className = "device-status";
        }

        const success = await Recorder.switchDevice(deviceId);

        select.disabled = false;
        if (status) {
            if (success) {
                const label = select.options[select.selectedIndex]?.text || "Unknown";
                status.textContent = `✓ ${label}`;
                status.className = "device-status ok";
                // Reconnect visualizer to the new stream
                Visualizer.connect(Recorder.getStream());
            } else {
                status.textContent = "✗ Switch failed";
                status.className = "device-status error";
            }
        }
    },

    // -----------------------------------------------------------------------
    // Actions
    // -----------------------------------------------------------------------

    async onRecord() {
        const idx = DebateState.current.currentSegment;
        const seg = DEBATE_CONFIG.segments[idx];

        // Notify server
        await fetch("/api/start_segment", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ segment_index: idx }),
        });

        // Start recording + timer
        Recorder.start();
        POI.reset();
        Timer.start(
            seg.duration,
            () => this.onTimerExpired(),  // onExpired
            (remaining, elapsed) => {     // onTick
                POI.updateDisplay();
            }
        );

        DebateState.setSegmentStatus(idx, "recording");
        this._mode = "recording";
        this._updateControls();

        Transcript.showPlaceholder("Recording in progress... Speech will be transcribed when stopped.");
        this.renderTimeline();
    },

    onPause() {
        if (this._mode === "recording") {
            Timer.pause();
            Recorder.pause();
            this._mode = "paused";
            document.getElementById("btn-pause").innerHTML = "&#9654; Resume";
        } else if (this._mode === "paused") {
            Timer.resume();
            Recorder.resume();
            this._mode = "recording";
            document.getElementById("btn-pause").innerHTML = "&#9208; Pause";
        }
        this._updateControls();
    },

    async onStop() {
        await this._stopAndTranscribe();
    },

    async onSkip() {
        const idx = DebateState.current.currentSegment;

        if (this._mode === "recording" || this._mode === "paused") {
            // Stop recording without uploading
            Timer.stop();
            await Recorder.stopAndGetBlob(); // discard audio
            DebateState.setSegmentStatus(idx, "completed");
        }

        // Advance
        if (idx < DEBATE_CONFIG.segments.length - 1) {
            DebateState.setCurrentSegment(idx + 1);
            this._mode = "idle";
            this.renderCurrentSegment();
            this.renderTimeline();
            Transcript.showPlaceholder("Press Record to start the next speech.");
        } else {
            DebateState.current.status = "finished";
            this._mode = "idle";
            Transcript.showDebateComplete();
            this.renderCurrentSegment();
            this.renderTimeline();
        }
    },

    async onPoi() {
        const success = await POI.mark();
        if (success) {
            // Brief visual feedback
            const btn = document.getElementById("btn-poi");
            btn.innerHTML = "&#10003; POI Marked";
            btn.disabled = true;
            setTimeout(() => {
                btn.innerHTML = "&#9873; POI";
                POI.updateDisplay();
            }, 1500);
        }
    },

    async onReset() {
        if (this._mode === "recording" || this._mode === "paused") {
            Timer.stop();
            await Recorder.stopAndGetBlob(); // discard
        }

        if (!confirm("Reset the entire debate? All transcripts will be lost.")) {
            return;
        }

        // Stop polling
        if (this._pollTimerId) {
            clearInterval(this._pollTimerId);
            this._pollTimerId = null;
        }
        this._pendingTranscriptions = [];
        this._poiMarkersSnapshot = {};

        await fetch("/api/reset", { method: "POST" });

        DebateState.reset();
        POI.reset();
        this._mode = "idle";

        this.renderTimeline();
        this.renderCurrentSegment();
        Transcript.showPlaceholder("Press Record to start the first speech.");
    },

    /**
     * Called by Timer when countdown reaches 0.
     */
    async onTimerExpired() {
        await this._stopAndTranscribe();
    },

    // -----------------------------------------------------------------------
    // Internal helpers
    // -----------------------------------------------------------------------

    async _stopAndTranscribe() {
        const idx = DebateState.current.currentSegment;
        const poiMarkers = POI.getMarkers().map(m => ({ ...m }));

        Timer.stop();

        // Stop recording and get the blob
        const blob = await Recorder.stopAndGetBlob();

        // Mark segment as transcribing
        DebateState.setSegmentStatus(idx, "transcribing");
        this.renderTimeline();

        // Upload audio (quick — just saves file and starts background thread)
        if (blob) {
            try {
                const result = await Recorder.uploadBlob(blob, idx);
                if (result.success) {
                    // Save POI markers snapshot before advancing
                    this._poiMarkersSnapshot[idx] = poiMarkers;
                    // Add to polling queue
                    this._pendingTranscriptions.push(idx);
                    this._startPolling();
                } else {
                    const errMsg = result.error || "Upload failed";
                    DebateState.setSegmentStatus(idx, "completed");
                    DebateState.current.segments[idx].transcript = [];
                    console.error(`Upload failed for segment ${idx}:`, errMsg);
                }
            } catch (e) {
                DebateState.setSegmentStatus(idx, "completed");
                DebateState.current.segments[idx].transcript = [];
                console.error(`Upload error for segment ${idx}:`, e);
            }
        } else {
            // No audio recorded (e.g. skip)
            DebateState.setSegmentStatus(idx, "completed");
        }

        // Advance to next PENDING segment (not just linear idx+1)
        const nextIdx = this._findNextPending(idx);
        if (nextIdx !== -1) {
            DebateState.setCurrentSegment(nextIdx);
            this._mode = "idle";
            this.renderCurrentSegment();
            this.renderTimeline();
            const nextSeg = DEBATE_CONFIG.segments[nextIdx];
            if (this._pendingTranscriptions.length > 0) {
                Transcript.showPlaceholder(`Next: ${nextSeg.speaker}. Press Record to start. (${this._pendingTranscriptions.length} transcription(s) in progress)`);
            } else {
                Transcript.showPlaceholder(`Press Record to start ${nextSeg.speaker} — ${nextSeg.type}.`);
            }
        } else {
            DebateState.current.status = "finished";
            this._mode = "idle";
            this.renderCurrentSegment();
            this.renderTimeline();
            if (this._pendingTranscriptions.length > 0) {
                Transcript.showPlaceholder("All speeches recorded. Waiting for remaining transcriptions...");
            } else {
                Transcript.showDebateComplete();
            }
        }
    },

    /**
     * Start the polling loop if not already running.
     */
    _startPolling() {
        if (this._pollTimerId) return;
        this._pollTimerId = setInterval(() => this._pollTranscriptions(), 2000);
    },

    /**
     * Poll all pending transcriptions and update UI when done.
     */
    async _pollTranscriptions() {
        if (this._pendingTranscriptions.length === 0) {
            // Nothing to poll — stop the timer
            clearInterval(this._pollTimerId);
            this._pollTimerId = null;

            // Check if debate is finished
            if (DebateState.current.status === "finished") {
                Transcript.showDebateComplete();
            }
            return;
        }

        const stillPending = [];

        for (const idx of this._pendingTranscriptions) {
            try {
                const resp = await fetch(`/api/transcribe/${idx}`);
                const data = await resp.json();

                if (data.done) {
                    // Transcription complete
                    const markers = this._poiMarkersSnapshot[idx] || [];
                    delete this._poiMarkersSnapshot[idx];

                    if (data.transcript && data.transcript.length > 0) {
                        DebateState.setTranscript(idx, data.transcript);
                        DebateState.current.segments[idx].poiMarkers = markers;
                    } else if (data.error) {
                        DebateState.setSegmentStatus(idx, "completed");
                        DebateState.current.segments[idx].transcript = [];
                        console.error(`Transcription error for segment ${idx}:`, data.error);
                    } else {
                        DebateState.setSegmentStatus(idx, "completed");
                        DebateState.current.segments[idx].transcript = [];
                    }

                    this.renderTimeline();

                    // If viewing this segment, update the display
                    if (DebateState.current.currentSegment === idx) {
                        this.renderCurrentSegment();
                    }

                    console.log(`[Transcribe] Segment ${idx} complete`);
                } else {
                    stillPending.push(idx);
                }
            } catch (e) {
                // Network error — keep retrying
                console.warn(`Poll error for segment ${idx}:`, e);
                stillPending.push(idx);
            }
        }

        this._pendingTranscriptions = stillPending;
    },

    // -----------------------------------------------------------------------
    // Rendering
    // -----------------------------------------------------------------------

    renderTimeline() {
        const container = document.getElementById("timeline-cards");
        if (!container) return;

        const currentIdx = DebateState.current.currentSegment;
        let html = "";

        for (let i = 0; i < DEBATE_CONFIG.segments.length; i++) {
            const seg = DEBATE_CONFIG.segments[i];
            const state = DebateState.current.segments[i];
            const status = state ? state.status : "pending";

            let statusIcon = "○";
            let cardClass = `timeline-card ${seg.side}`;
            if (status === "recording") {
                statusIcon = "●";
                cardClass += " recording";
            } else if (status === "transcribing") {
                statusIcon = "⏳";
            } else if (status === "completed") {
                statusIcon = "✓";
                cardClass += " completed";
            }
            if (i === currentIdx && status !== "completed") {
                cardClass += " active";
            }

            // Abbreviated speaker name for card
            const shortName = this._abbreviate(seg.speaker);

            html += `
                <div class="${cardClass}" data-index="${i}" onclick="App.onViewSegment(${i})">
                    <div class="card-number">Speech ${i + 1}</div>
                    <div class="card-speaker" title="${seg.speaker}">${shortName}</div>
                    <div class="card-status">${statusIcon}</div>
                </div>`;
        }

        container.innerHTML = html;
    },

    renderCurrentSegment() {
        const idx = DebateState.current.currentSegment;
        const seg = DEBATE_CONFIG.segments[idx];
        if (!seg) return;

        document.getElementById("segment-counter").textContent = `SPEECH ${idx + 1} of ${DEBATE_CONFIG.segments.length}`;
        document.getElementById("segment-title").textContent = `${seg.speaker} — ${seg.type}`;

        const sideBadge = document.getElementById("segment-side");
        sideBadge.className = `side-badge ${seg.side}`;
        sideBadge.textContent = seg.side.charAt(0).toUpperCase() + seg.side.slice(1);

        // Reset timer display
        const mins = Math.floor(seg.duration / 60);
        const secs = seg.duration % 60;
        document.getElementById("timer").textContent = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
        document.getElementById("timer").className = "timer-green";

        // POI zone
        POI.updateDisplay();
        this._updateControls();

        // Show transcript if available
        const state = DebateState.current.segments[idx];
        if (state && state.transcript) {
            Transcript.render(idx, state.transcript, state.poiMarkers || []);
        }

        // Check if debate is finished
        if (DebateState.current.status === "finished") {
            Transcript.showDebateComplete();
        }
    },

    /**
     * Navigate to any segment by clicking its timeline card.
     * Allows free (non-linear) navigation.
     */
    onViewSegment(idx) {
        // Don't navigate while actively recording
        if (this._mode === "recording" || this._mode === "paused") return;

        const state = DebateState.current.segments[idx];
        if (!state) return;

        // Navigate to the segment
        DebateState.setCurrentSegment(idx);
        this.renderCurrentSegment();
        this.renderTimeline();

        const seg = DEBATE_CONFIG.segments[idx];

        if (state.transcript && state.transcript.length > 0) {
            // Show existing transcript
            Transcript.render(idx, state.transcript, state.poiMarkers || []);
        } else if (state.status === "transcribing") {
            Transcript.showPlaceholder(`Transcribing ${seg.speaker}... (you can start another segment while waiting)`);
        } else if (state.status === "completed") {
            Transcript.showPlaceholder("No transcript available for this segment.");
        } else {
            Transcript.showPlaceholder(`Press Record to start ${seg.speaker} — ${seg.type}.`);
        }
    },

    _updateControls() {
        const btnRecord = document.getElementById("btn-record");
        const btnPause = document.getElementById("btn-pause");
        const btnStop = document.getElementById("btn-stop");
        const btnSkip = document.getElementById("btn-skip");
        const btnPoi = document.getElementById("btn-poi");
        const seg = DEBATE_CONFIG.segments[DebateState.current.currentSegment];
        const deviceSelect = document.getElementById("audio-device-select");
        const deviceRefresh = document.getElementById("btn-refresh-devices");

        // Reset visibility
        btnRecord.classList.add("hidden");
        btnPause.classList.add("hidden");
        btnStop.classList.add("hidden");
        btnSkip.classList.remove("hidden");

        // Device selector: disabled during recording/paused
        const deviceLocked = ["recording", "paused"].includes(this._mode);
        if (deviceSelect) deviceSelect.disabled = deviceLocked;
        if (deviceRefresh) deviceRefresh.disabled = deviceLocked;

        switch (this._mode) {
            case "idle":
                btnRecord.classList.remove("hidden");
                btnRecord.classList.remove("recording");
                btnRecord.disabled = DebateState.current.status === "finished";
                btnSkip.disabled = false;
                btnPoi.classList.add("hidden");
                break;

            case "recording":
                btnPause.classList.remove("hidden");
                btnPause.innerHTML = "&#9208; Pause";
                btnStop.classList.remove("hidden");
                btnSkip.disabled = false;
                if (seg && seg.poiAllowed) {
                    btnPoi.classList.remove("hidden");
                }
                break;

            case "paused":
                btnPause.classList.remove("hidden");
                btnPause.innerHTML = "&#9654; Resume";
                btnStop.classList.remove("hidden");
                btnSkip.disabled = false;
                btnPoi.classList.add("hidden");
                break;
        }
    },

    _abbreviate(speaker) {
        // "1st Speaker Affirmative" -> "1A Constr."
        const map = {
            "1st Speaker Affirmative": "1A",
            "1st Speaker Negative": "1N",
            "2nd Speaker Affirmative": "2A",
            "2nd Speaker Negative": "2N",
            "3rd Speaker Affirmative": "3A",
            "3rd Speaker Negative": "3N",
            "Reply Speaker Negative": "RN",
            "Reply Speaker Affirmative": "RA",
        };
        return map[speaker] || speaker;
    },

    /**
     * Find the next pending segment after the given index.
     */
    _findNextPending(afterIdx) {
        const segs = DebateState.current.segments;
        for (let i = afterIdx + 1; i < segs.length; i++) {
            if (segs[i].status === "pending") return i;
        }
        for (let i = 0; i < afterIdx; i++) {
            if (segs[i].status === "pending") return i;
        }
        return -1;
    },

    // -----------------------------------------------------------------------
    // Log Panel
    // -----------------------------------------------------------------------

    /**
     * Poll backend for new log entries.
     */
    async _pollLogs() {
        try {
            const resp = await fetch(`/api/logs?since=${this._logLastId}`);
            const data = await resp.json();
            if (!data.entries || data.entries.length === 0) return;

            const container = document.getElementById("log-entries");
            if (!container) return;

            for (const entry of data.entries) {
                this._logLastId = entry.id;
                const div = document.createElement("div");
                div.className = `log-entry ${entry.level}`;
                div.innerHTML = `<span class="log-time">${entry.time}</span><span class="log-msg">${this._escapeLogMsg(entry.msg)}</span>`;
                container.appendChild(div);
            }

            // Auto-scroll to bottom
            container.scrollTop = container.scrollHeight;

            // Update badge if collapsed
            const panel = document.getElementById("log-panel");
            if (panel && panel.classList.contains("log-collapsed")) {
                this._logUnread += data.entries.length;
                const badge = document.getElementById("log-badge");
                if (badge) {
                    badge.textContent = this._logUnread;
                    badge.classList.remove("hidden");
                }
            }

            // Flash header on errors
            const hasError = data.entries.some(e => e.level === "error");
            if (hasError) {
                const header = document.getElementById("log-header");
                header.style.background = "#5e1914";
                setTimeout(() => { header.style.background = ""; }, 1500);
                // Auto-expand on error
                if (panel && panel.classList.contains("log-collapsed")) {
                    this.toggleLogPanel();
                }
            }
        } catch (e) {
            // Silently ignore polling errors
        }
    },

    /**
     * Toggle log panel expanded/collapsed.
     */
    toggleLogPanel() {
        const panel = document.getElementById("log-panel");
        if (!panel) return;
        const isCollapsed = panel.classList.contains("log-collapsed");
        panel.classList.toggle("log-collapsed", !isCollapsed);
        panel.classList.toggle("log-expanded", isCollapsed);

        if (isCollapsed) {
            // Expanding — clear badge
            this._logUnread = 0;
            const badge = document.getElementById("log-badge");
            if (badge) badge.classList.add("hidden");
        }
    },

    /**
     * Clear the log display.
     */
    clearLogView() {
        const container = document.getElementById("log-entries");
        if (container) container.innerHTML = "";
    },

    _escapeLogMsg(str) {
        if (!str) return "";
        return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    },
};

// Boot
document.addEventListener("DOMContentLoaded", () => App.init());
