"""Debate Judge Assistant — Configuration"""

# Whisper model settings
WHISPER_MODEL = "small"           # Options: "tiny", "base", "small", "medium", "large-v3"
WHISPER_DEVICE = "cpu"            # Options: "cpu", "cuda"
WHISPER_COMPUTE_TYPE = "int8"     # "int8" for CPU, "float16" for GPU

# Upload settings
UPLOAD_FOLDER = "uploads"
MAX_CONTENT_LENGTH = 100 * 1024 * 1024  # 100MB max

# ffmpeg
FFMPEG_PATH = "ffmpeg"            # Path to ffmpeg binary (must be on PATH)

# Flask
HOST = "0.0.0.0"
PORT = 5000
DEBUG = True
