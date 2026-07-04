/**
 * state.js — Central debate state with observer pattern
 */
const DebateState = {
    current: {
        status: "idle",
        currentSegment: 0,
        segments: [],
    },

    _listeners: [],

    subscribe(fn) {
        this._listeners.push(fn);
    },

    notify() {
        this._listeners.forEach(fn => fn(this.current));
    },

    /** Initialize segments from DEBATE_CONFIG */
    init() {
        this.current.segments = DEBATE_CONFIG.segments.map((seg, i) => ({
            index: i,
            speaker: seg.speaker,
            type: seg.type,
            side: seg.side,
            duration: seg.duration,
            poiAllowed: seg.poiAllowed,
            status: "pending",
            poiMarkers: [],
            transcript: null,
            isRecording: false,
            timerRemaining: seg.duration,
            elapsedSec: 0,
        }));
        this.current.status = "idle";
        this.current.currentSegment = 0;
        this.notify();
    },

    setSegmentStatus(idx, status) {
        if (idx >= 0 && idx < this.current.segments.length) {
            this.current.segments[idx].status = status;
            this.notify();
        }
    },

    setCurrentSegment(idx) {
        this.current.currentSegment = idx;
        this.notify();
    },

    addPoiMarker(idx, elapsedSec) {
        if (idx >= 0 && idx < this.current.segments.length) {
            this.current.segments[idx].poiMarkers.push({
                elapsedSec: elapsedSec,
                durationSec: 15,
            });
            this.notify();
        }
    },

    setTranscript(idx, transcript) {
        if (idx >= 0 && idx < this.current.segments.length) {
            this.current.segments[idx].transcript = transcript;
            this.current.segments[idx].status = "completed";
            this.notify();
        }
    },

    advanceToNext() {
        const idx = this.current.currentSegment;
        this.current.segments[idx].status = "completed";
        if (idx < this.current.segments.length - 1) {
            this.current.currentSegment = idx + 1;
            this.current.segments[idx + 1].status = "pending";
        } else {
            this.current.status = "finished";
        }
        this.notify();
    },

    reset() {
        this.init();
    },

    /** Sync state from server */
    async syncFromServer() {
        try {
            const resp = await fetch("/api/state");
            const data = await resp.json();
            // Map server state to client state shape
            this.current.status = data.status;
            this.current.currentSegment = data.current_segment;
            this.current.segments = data.segments.map(seg => ({
                index: seg.index,
                speaker: seg.speaker,
                type: seg.type,
                side: seg.side,
                duration: seg.duration_sec,
                poiAllowed: seg.poi_allowed,
                status: seg.status,
                poiMarkers: seg.poi_markers.map(p => ({
                    elapsedSec: p.elapsed_sec,
                    durationSec: p.duration_sec,
                })),
                transcript: seg.transcript,
                isRecording: false,
                timerRemaining: seg.duration_sec,
                elapsedSec: 0,
            }));
            this.notify();
        } catch (e) {
            console.error("Failed to sync state:", e);
        }
    },
};
