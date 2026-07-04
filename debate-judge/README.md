# Debate Judge Assistant

A web-based debate judging tool that uses **Whisper ASR** to automatically transcribe speeches, manage debate flow with timed segments, and track Points of Information (POIs).

## Features

- **8-segment debate flow** with automatic progression
- **Countdown timer** per segment (6 min / 4 min) with audio warnings
- **Real-time audio recording** via browser microphone
- **Whisper transcription** with timestamps (via faster-whisper)
- **POI tracking** with rule enforcement (protected zones, max 1 per speech)
- **Export** transcripts as TXT, Markdown, or JSON

## Prerequisites

- **Python 3.10+**
- **ffmpeg** — must be installed and available on PATH
  - Windows: `winget install ffmpeg` or download from [ffmpeg.org](https://ffmpeg.org)
  - macOS: `brew install ffmpeg`
  - Linux: `apt install ffmpeg`
- **Modern browser** (Chrome, Firefox, Edge) with microphone access

## Installation

```bash
# Clone or navigate to the project directory
cd D:\task\LuBP\74SSDC

# Install Python dependencies
pip install -r requirements.txt
```

## Usage

```bash
# Start the server
python app.py
```

Open **http://localhost:5000** in your browser.

### Workflow

1. **Allow microphone access** when prompted
2. Click **Record** to start the first speech — the timer begins automatically
3. The timer shows countdown with color changes (green → yellow → red)
4. Click **POI** to mark a Point of Information (only available during 2nd–5th minute)
5. When the timer expires (or you click **Stop**), the audio is uploaded for transcription
6. The transcript appears with timestamps — then the next segment is ready
7. After all 8 speeches, use **Export** to download the full record

### Controls

| Button | Action |
|--------|--------|
| ● Record | Start recording the current speech |
| ⏸ Pause | Pause/resume recording and timer |
| ⏹ Stop | Stop recording and trigger transcription |
| ⏭ Skip | Skip to the next segment (discards audio) |
| ⚑ POI | Mark a Point of Information |

## Configuration

Edit `config.py` to adjust:

```python
WHISPER_MODEL = "small"        # "tiny", "base", "small", "medium", "large-v3"
WHISPER_DEVICE = "cpu"         # "cpu" or "cuda" (requires NVIDIA GPU)
WHISPER_COMPUTE_TYPE = "int8"  # "int8" for CPU, "float16" for GPU
```

### Model Selection

| Model | Size | Speed (CPU) | Quality |
|-------|------|-------------|---------|
| tiny | ~39MB | Fast | Basic |
| base | ~74MB | Moderate | Decent |
| small | ~244MB | Slow | Good (recommended) |
| medium | ~769MB | Very slow | Better |
| large-v3 | ~1.5GB | Extremely slow | Best |

For GPU (CUDA) users, set `WHISPER_DEVICE = "cuda"` and `WHISPER_COMPUTE_TYPE = "float16"`.

## Debate Format

| # | Speaker | Type | Duration | POI |
|---|---------|------|----------|-----|
| 1 | 1st Affirmative | Constructive | 6 min | Yes |
| 2 | 1st Negative | Constructive | 6 min | Yes |
| 3 | 2nd Affirmative | Rebuttal & Extension | 6 min | Yes |
| 4 | 2nd Negative | Rebuttal & Extension | 6 min | Yes |
| 5 | 3rd Affirmative | Rebuttal & Summary | 6 min | Yes |
| 6 | 3rd Negative | Rebuttal & Summary | 6 min | Yes |
| 7 | Reply Negative | Closing Remarks | 4 min | No |
| 8 | Reply Affirmative | Closing Remarks | 4 min | No |

### POI Rules
- First and last minute of each speech: **Protected** (no POIs)
- Minutes 2–5: POIs allowed, max 1 accepted per speech (15 seconds max)
- No POIs during closing remarks (speeches 7–8)

## Project Structure

```
├── app.py               # Flask application + API routes
├── config.py            # Configuration
├── whisper_engine.py    # Whisper transcription engine
├── requirements.txt     # Python dependencies
├── templates/
│   └── index.html       # Single-page application
├── static/
│   ├── css/style.css    # Styles
│   └── js/
│       ├── config.js    # Debate segment definitions
│       ├── state.js     # State management
│       ├── timer.js     # Countdown timer
│       ├── recorder.js  # MediaRecorder wrapper
│       ├── poi.js       # POI tracking
│       ├── transcript.js# Transcript rendering
│       ├── export.js    # Export functions
│       └── app.js       # Main orchestrator
└── uploads/             # Temporary audio files
```

## Troubleshooting

- **"ffmpeg not found"**: Install ffmpeg and ensure it's on your system PATH
- **Microphone not working**: The app requires HTTPS or localhost. Make sure you're accessing via `http://localhost:5000`
- **Slow transcription**: Use a smaller model (e.g., `base` or `tiny`) in `config.py`
- **No audio in recording**: Check that your browser has microphone permission for localhost
