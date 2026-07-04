"""Debate Judge Assistant — Flask Application"""

import os
import json
import io
import threading
from datetime import datetime
from flask import Flask, render_template, request, jsonify, send_file
import config

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = config.MAX_CONTENT_LENGTH

# Ensure uploads directory exists
os.makedirs(config.UPLOAD_FOLDER, exist_ok=True)

# ---------------------------------------------------------------------------
# Debate segment definitions
# ---------------------------------------------------------------------------
SEGMENTS_DEF = [
    {"speaker": "1st Speaker Affirmative",  "type": "Constructive",          "side": "affirmative", "duration_sec": 360, "poi_allowed": True},
    {"speaker": "1st Speaker Negative",     "type": "Constructive",          "side": "negative",    "duration_sec": 360, "poi_allowed": True},
    {"speaker": "2nd Speaker Affirmative",  "type": "Rebuttal & Extension",  "side": "affirmative", "duration_sec": 360, "poi_allowed": True},
    {"speaker": "2nd Speaker Negative",     "type": "Rebuttal & Extension",  "side": "negative",    "duration_sec": 360, "poi_allowed": True},
    {"speaker": "3rd Speaker Affirmative",  "type": "Rebuttal & Summary",    "side": "affirmative", "duration_sec": 360, "poi_allowed": True},
    {"speaker": "3rd Speaker Negative",     "type": "Rebuttal & Summary",    "side": "negative",    "duration_sec": 360, "poi_allowed": True},
    {"speaker": "Reply Speaker Negative",   "type": "Closing Remarks",       "side": "negative",    "duration_sec": 240, "poi_allowed": False},
    {"speaker": "Reply Speaker Affirmative","type": "Closing Remarks",       "side": "affirmative", "duration_sec": 240, "poi_allowed": False},
]


def init_debate_state():
    """Build a fresh debate state dictionary."""
    segments = []
    for i, sdef in enumerate(SEGMENTS_DEF):
        segments.append({
            "index": i,
            "speaker": sdef["speaker"],
            "type": sdef["type"],
            "side": sdef["side"],
            "duration_sec": sdef["duration_sec"],
            "poi_allowed": sdef["poi_allowed"],
            "status": "pending",        # pending | recording | transcribing | completed
            "poi_markers": [],           # [{elapsed_sec, duration_sec}]
            "transcript": None,          # list of {start, end, text}
            "audio_filename": None,
        })
    return {
        "status": "idle",               # idle | in_progress | finished
        "current_segment": 0,
        "segments": segments,
        "created_at": datetime.now().isoformat(),
    }


# Global in-memory debate state
debate_state = init_debate_state()

# ---------------------------------------------------------------------------
# Log buffer — circular buffer for frontend log panel
# ---------------------------------------------------------------------------
_log_buffer = []          # list of {id, time, level, msg}
_log_next_id = 0
_log_lock = threading.Lock()
_LOG_MAX = 300            # keep last N entries


def add_log(msg, level="info"):
    """Append a log entry visible in the frontend log panel."""
    global _log_next_id
    with _log_lock:
        entry = {
            "id": _log_next_id,
            "time": datetime.now().strftime("%H:%M:%S"),
            "level": level,      # info | warn | error | success
            "msg": msg,
        }
        _log_buffer.append(entry)
        _log_next_id += 1
        # Trim to max
        if len(_log_buffer) > _LOG_MAX:
            del _log_buffer[: len(_log_buffer) - _LOG_MAX]
    # Also print to console
    print(f"[{entry['time']}] [{level.upper()}] {msg}")


def get_logs_since(since_id):
    """Return all log entries with id > since_id."""
    with _log_lock:
        return [e for e in _log_buffer if e["id"] > since_id]

# ---------------------------------------------------------------------------
# Lazy-load Whisper engine
# ---------------------------------------------------------------------------
_whisper_engine = None


def get_whisper_engine():
    """Lazy-load the Whisper engine on first transcription request."""
    global _whisper_engine
    if _whisper_engine is None:
        add_log(f"Loading Whisper model '{config.WHISPER_MODEL}' on {config.WHISPER_DEVICE}...")
        try:
            from whisper_engine import WhisperEngine
            _whisper_engine = WhisperEngine(
                model_size=config.WHISPER_MODEL,
                device=config.WHISPER_DEVICE,
                compute_type=config.WHISPER_COMPUTE_TYPE,
            )
            add_log(f"Model '{config.WHISPER_MODEL}' loaded successfully", "success")
        except Exception as e:
            add_log(f"Failed to load Whisper model: {e}", "error")
            raise
    return _whisper_engine


# ---------------------------------------------------------------------------
# Routes — Pages
# ---------------------------------------------------------------------------

@app.route("/")
def index():
    return render_template("index.html")


# ---------------------------------------------------------------------------
# Routes — API
# ---------------------------------------------------------------------------

@app.route("/api/state")
def get_state():
    return jsonify(debate_state)


@app.route("/api/logs")
def api_logs():
    """Return log entries since the given ID."""
    since = request.args.get("since", -1, type=int)
    entries = get_logs_since(since)
    return jsonify({"entries": entries})


@app.route("/api/start_segment", methods=["POST"])
def start_segment():
    data = request.get_json()
    idx = data.get("segment_index", 0)
    if 0 <= idx < len(debate_state["segments"]):
        debate_state["segments"][idx]["status"] = "recording"
        debate_state["current_segment"] = idx
        debate_state["status"] = "in_progress"
    return jsonify({"success": True, "segment": debate_state["segments"][idx]})


@app.route("/api/stop_segment", methods=["POST"])
def stop_segment():
    data = request.get_json()
    idx = data.get("segment_index", 0)
    if 0 <= idx < len(debate_state["segments"]):
        debate_state["segments"][idx]["status"] = "completed"
    return jsonify({"success": True})


# ---------------------------------------------------------------------------
# Background transcription
# ---------------------------------------------------------------------------
_transcribe_lock = threading.Lock()


def _run_transcription(idx, filepath):
    """Run Whisper transcription in a background thread."""
    seg_name = debate_state["segments"][idx]["speaker"]
    add_log(f"[Seg {idx+1}] Transcription started: {seg_name}")
    try:
        engine = get_whisper_engine()
        transcript = engine.transcribe(filepath)
        n_segments = len(transcript) if transcript else 0
        debate_state["segments"][idx]["transcript"] = transcript
        debate_state["segments"][idx]["status"] = "completed"
        add_log(f"[Seg {idx+1}] Transcription done — {n_segments} segments", "success")
    except Exception as e:
        add_log(f"[Seg {idx+1}] Transcription ERROR: {e}", "error")
        debate_state["segments"][idx]["transcript"] = []
        debate_state["segments"][idx]["status"] = "completed"
        debate_state["segments"][idx]["transcript_error"] = str(e)


@app.route("/api/transcribe", methods=["POST"])
def transcribe_upload():
    """Upload audio and start transcription in background. Returns immediately."""
    audio_file = request.files.get("audio")
    if not audio_file:
        return jsonify({"success": False, "error": "No audio file provided"}), 400

    idx = int(request.form.get("segment_index", 0))
    if idx < 0 or idx >= len(debate_state["segments"]):
        return jsonify({"success": False, "error": "Invalid segment index"}), 400

    # Save uploaded audio
    ext = "webm"
    if audio_file.filename and "." in audio_file.filename:
        ext = audio_file.filename.rsplit(".", 1)[-1]
    filename = f"segment_{idx}.{ext}"
    filepath = os.path.join(config.UPLOAD_FOLDER, filename)
    audio_file.save(filepath)

    # Update status
    debate_state["segments"][idx]["status"] = "transcribing"
    debate_state["segments"][idx]["audio_filename"] = filename
    debate_state["segments"][idx].pop("transcript_error", None)

    # Start background transcription
    t = threading.Thread(target=_run_transcription, args=(idx, filepath), daemon=True)
    t.start()
    add_log(f"[Seg {idx+1}] Audio uploaded ({filename}), transcription queued")

    return jsonify({"success": True, "segment_index": idx, "status": "transcribing"})


@app.route("/api/transcribe/<int:idx>")
def transcribe_check(idx):
    """Poll transcription status for a segment."""
    if idx < 0 or idx >= len(debate_state["segments"]):
        return jsonify({"success": False, "error": "Invalid segment index"}), 400

    seg = debate_state["segments"][idx]
    status = seg["status"]

    if status == "transcribing":
        return jsonify({
            "success": True,
            "status": "transcribing",
            "done": False,
        })

    # Completed (or any other terminal state)
    return jsonify({
        "success": True,
        "status": status,
        "done": True,
        "transcript": seg.get("transcript"),
        "error": seg.get("transcript_error"),
    })


@app.route("/api/poi", methods=["POST"])
def record_poi():
    data = request.get_json()
    idx = data.get("segment_index", 0)
    elapsed = data.get("elapsed_sec", 0)

    if 0 <= idx < len(debate_state["segments"]):
        marker = {"elapsed_sec": elapsed, "duration_sec": 15}
        debate_state["segments"][idx]["poi_markers"].append(marker)
        return jsonify({
            "success": True,
            "poi_markers": debate_state["segments"][idx]["poi_markers"],
        })
    return jsonify({"success": False, "error": "Invalid segment index"}), 400


@app.route("/api/reset", methods=["POST"])
def reset():
    global debate_state
    debate_state = init_debate_state()
    # Clean up uploads
    for f in os.listdir(config.UPLOAD_FOLDER):
        try:
            os.remove(os.path.join(config.UPLOAD_FOLDER, f))
        except OSError:
            pass
    add_log("Debate reset — all transcripts cleared")
    return jsonify({"success": True})


# ---------------------------------------------------------------------------
# Routes — Export
# ---------------------------------------------------------------------------

def _format_time(seconds):
    """Format seconds as M:SS."""
    m = int(seconds) // 60
    s = int(seconds) % 60
    return f"{m}:{s:02d}"


def _generate_txt():
    lines = ["DEBATE TRANSCRIPT", "=" * 40, ""]
    for seg in debate_state["segments"]:
        duration_str = _format_time(seg["duration_sec"])
        lines.append(f"--- {seg['speaker']} — {seg['type']} ({duration_str}) ---")

        # POI markers
        for poi in seg.get("poi_markers", []):
            lines.append(f"  [POI at {_format_time(poi['elapsed_sec'])}]")

        # Transcript
        if seg.get("transcript"):
            for t in seg["transcript"]:
                lines.append(f"  [{_format_time(t['start'])}] {t['text']}")
        else:
            lines.append("  (no transcript)")
        lines.append("")
    return "\n".join(lines)


def _generate_md():
    lines = ["# Debate Transcript", "",
             f"*Generated: {debate_state.get('created_at', 'N/A')}*", ""]
    for seg in debate_state["segments"]:
        duration_str = _format_time(seg["duration_sec"])
        lines.append(f"## {seg['speaker']} — {seg['type']}")
        lines.append(f"*Duration: {duration_str}*")
        lines.append("")

        # POI markers
        for poi in seg.get("poi_markers", []):
            lines.append(f"**⚑ POI at {_format_time(poi['elapsed_sec'])}**")
            lines.append("")

        # Transcript
        if seg.get("transcript"):
            for t in seg["transcript"]:
                lines.append(f"> **[{_format_time(t['start'])}]** {t['text']}")
            lines.append("")
        else:
            lines.append("*(no transcript)*")
            lines.append("")
    return "\n".join(lines)


@app.route("/api/export/<fmt>")
def export(fmt):
    if fmt == "txt":
        content = _generate_txt()
        filename = "debate_transcript.txt"
        mimetype = "text/plain"
    elif fmt == "md":
        content = _generate_md()
        filename = "debate_transcript.md"
        mimetype = "text/markdown"
    elif fmt == "json":
        content = json.dumps(debate_state, indent=2, ensure_ascii=False)
        filename = "debate_transcript.json"
        mimetype = "application/json"
    else:
        return jsonify({"error": "Unsupported format"}), 400

    buf = io.BytesIO(content.encode("utf-8"))
    return send_file(buf, as_attachment=True, download_name=filename, mimetype=mimetype)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    add_log(f"Server starting — Whisper: {config.WHISPER_MODEL} | Device: {config.WHISPER_DEVICE}")
    add_log(f"Listening on http://localhost:{config.PORT}", "success")
    app.run(host=config.HOST, port=config.PORT, debug=config.DEBUG)
