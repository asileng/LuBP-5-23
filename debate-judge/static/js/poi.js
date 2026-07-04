/**
 * poi.js — Points of Information tracking
 */
const POI = {
    _markers: [],  // markers for current segment: [{elapsedSec, durationSec}]

    reset() {
        this._markers = [];
    },

    getMarkers() {
        return this._markers;
    },

    /**
     * Check if a POI can be marked right now.
     */
    canMark() {
        const idx = DebateState.current.currentSegment;
        const seg = DEBATE_CONFIG.segments[idx];
        if (!seg || !seg.poiAllowed) return false;
        if (this._markers.length >= DEBATE_CONFIG.poiRules.maxPoiPerSpeech) return false;
        if (!Timer.isRunning() && !Timer.isPaused()) return false;
        return Timer.isPoiEligible();
    },

    /**
     * Mark a POI at the current elapsed time.
     */
    async mark() {
        if (!this.canMark()) return false;

        const elapsed = Timer.elapsed;
        const idx = DebateState.current.currentSegment;

        // Send to server
        try {
            const resp = await fetch("/api/poi", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    segment_index: idx,
                    elapsed_sec: elapsed,
                }),
            });
            const result = await resp.json();
            if (result.success) {
                this._markers.push({
                    elapsedSec: elapsed,
                    durationSec: DEBATE_CONFIG.poiRules.poiDurationSec,
                });
                DebateState.addPoiMarker(idx, elapsed);
                return true;
            }
        } catch (e) {
            console.error("Failed to mark POI:", e);
        }
        return false;
    },

    /**
     * Get POI zone text for display.
     */
    getZoneText() {
        const idx = DebateState.current.currentSegment;
        const seg = DEBATE_CONFIG.segments[idx];

        if (!seg || !seg.poiAllowed) {
            return "POI: Not allowed during closing remarks";
        }

        const elapsed = Timer.elapsed;
        const rules = DEBATE_CONFIG.poiRules;

        if (elapsed < rules.protectedStartSec) {
            const left = Math.ceil(rules.protectedStartSec - elapsed);
            return `POI: Protected zone (${left}s until POI window)`;
        }

        if (elapsed > seg.duration - rules.protectedEndSec) {
            return "POI: Protected zone (final minute)";
        }

        const count = this._markers.length;
        if (count >= rules.maxPoiPerSpeech) {
            return `POI: Max ${rules.maxPoiPerSpeech} POI accepted`;
        }

        return `POI: Window open (${rules.maxPoiPerSpeech - count} remaining)`;
    },

    /**
     * Update the POI UI elements.
     */
    updateDisplay() {
        const poiText = document.getElementById("poi-zone-text");
        const poiBtn = document.getElementById("btn-poi");
        const poiZone = document.getElementById("poi-zone-indicator");
        const idx = DebateState.current.currentSegment;
        const seg = DEBATE_CONFIG.segments[idx];

        // Update text
        if (poiText) {
            poiText.textContent = this.getZoneText();
        }

        // Show/hide POI zone indicator
        if (poiZone) {
            poiZone.classList.toggle("hidden", !seg || !seg.poiAllowed);
        }

        // Enable/disable POI button
        if (poiBtn) {
            if (seg && seg.poiAllowed) {
                poiBtn.classList.remove("hidden");
                poiBtn.disabled = !this.canMark();
            } else {
                poiBtn.classList.add("hidden");
            }
        }
    },
};
