/**
 * transcript.js — Transcript rendering with timestamps and POI markers
 */
const Transcript = {
    /**
     * Render a transcript for a given segment.
     * @param {number} segmentIndex
     * @param {Array} transcriptData - [{start, end, text}]
     * @param {Array} poiMarkers - [{elapsedSec, durationSec}]
     */
    render(segmentIndex, transcriptData, poiMarkers) {
        const panel = document.getElementById("transcript-content");
        const label = document.getElementById("transcript-segment-label");
        if (!panel) return;

        // Update label
        const seg = DEBATE_CONFIG.segments[segmentIndex];
        if (label && seg) {
            label.textContent = `${seg.speaker} — ${seg.type}`;
        }

        if (!transcriptData || transcriptData.length === 0) {
            panel.innerHTML = '<p class="placeholder">No transcript available.</p>';
            return;
        }

        let html = "";
        for (const t of transcriptData) {
            const timeStr = this.formatTime(t.start);
            const poiBadge = this._getPoiBadge(t.start, t.end, poiMarkers);

            html += `<div class="transcript-line">
                <span class="timestamp">[${timeStr}]</span>
                ${poiBadge}
                <span class="text">${this.escapeHtml(t.text)}</span>
            </div>`;
        }

        panel.innerHTML = html;
    },

    /**
     * Show a placeholder for the current segment.
     */
    showPlaceholder(text) {
        const panel = document.getElementById("transcript-content");
        const label = document.getElementById("transcript-segment-label");
        if (panel) {
            panel.innerHTML = `<p class="placeholder">${this.escapeHtml(text)}</p>`;
        }
        if (label) {
            const idx = DebateState.current.currentSegment;
            const seg = DEBATE_CONFIG.segments[idx];
            if (seg) label.textContent = `${seg.speaker} — ${seg.type}`;
        }
    },

    /**
     * Show the transcription spinner.
     */
    showSpinner() {
        const el = document.getElementById("transcribing-spinner");
        if (el) el.classList.remove("hidden");
    },

    /**
     * Hide the transcription spinner.
     */
    hideSpinner() {
        const el = document.getElementById("transcribing-spinner");
        if (el) el.classList.add("hidden");
    },

    /**
     * Show the debate-complete message.
     */
    showDebateComplete() {
        const panel = document.getElementById("transcript-content");
        const label = document.getElementById("transcript-segment-label");
        if (label) label.textContent = "";
        if (panel) {
            panel.innerHTML = `
                <div id="debate-complete">
                    <h2>&#10003; Debate Complete</h2>
                    <p>All 8 speeches have been recorded and transcribed.</p>
                    <p>Use the Export button to download the full transcript.</p>
                </div>`;
        }
    },

    /**
     * Format seconds as M:SS.
     */
    formatTime(seconds) {
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m}:${String(s).padStart(2, "0")}`;
    },

    /**
     * Check if a POI marker falls within a time range and return badge HTML.
     */
    _getPoiBadge(start, end, poiMarkers) {
        if (!poiMarkers || poiMarkers.length === 0) return "";
        for (const poi of poiMarkers) {
            if (poi.elapsedSec >= start && poi.elapsedSec < end) {
                const timeStr = this.formatTime(poi.elapsedSec);
                return `<span class="poi-badge">POI ${timeStr}</span>`;
            }
        }
        return "";
    },

    /**
     * Basic HTML escaping.
     */
    escapeHtml(str) {
        if (!str) return "";
        const div = document.createElement("div");
        div.textContent = str;
        return div.innerHTML;
    },
};
