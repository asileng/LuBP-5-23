"""
whisper_engine.py — Whisper model loading and transcription via faster-whisper
"""

import os
import subprocess
import tempfile
from faster_whisper import WhisperModel
import config


class WhisperEngine:
    """Wraps faster-whisper for audio transcription."""

    def __init__(self, model_size: str, device: str, compute_type: str):
        print(f"[Whisper] Loading model '{model_size}' on {device} ({compute_type})...")
        self.model = WhisperModel(model_size, device=device, compute_type=compute_type)
        print(f"[Whisper] Model loaded successfully.")

    def transcribe(self, audio_path: str) -> list[dict]:
        """
        Transcribe an audio file.

        If the file is not WAV/16kHz, convert it first using ffmpeg.

        Args:
            audio_path: Path to the audio file (webm, mp4, wav, etc.)

        Returns:
            List of segment dicts: [{start, end, text, words}, ...]
        """
        # Convert to 16kHz mono WAV if needed
        wav_path = self._convert_to_wav(audio_path)

        try:
            segments_gen, info = self.model.transcribe(
                wav_path,
                language="en",
                word_timestamps=True,
                vad_filter=True,
                vad_parameters=dict(
                    min_silence_duration_ms=500,
                    speech_pad_ms=200,
                ),
            )

            results = []
            for seg in segments_gen:
                segment_dict = {
                    "start": round(seg.start, 2),
                    "end": round(seg.end, 2),
                    "text": seg.text.strip(),
                }

                # Extract word-level timestamps if available
                if seg.words:
                    segment_dict["words"] = [
                        {
                            "word": w.word.strip(),
                            "start": round(w.start, 2),
                            "end": round(w.end, 2),
                        }
                        for w in seg.words
                    ]

                results.append(segment_dict)

            return results

        finally:
            # Clean up temp WAV if we created one
            if wav_path != audio_path and os.path.exists(wav_path):
                os.remove(wav_path)

    def _convert_to_wav(self, audio_path: str) -> str:
        """
        Convert audio to 16kHz mono WAV using ffmpeg.

        If the file is already a suitable WAV, return it as-is.
        """
        ext = os.path.splitext(audio_path)[1].lower()

        # If it's already a WAV, still convert to ensure 16kHz mono
        wav_path = audio_path + ".wav" if ext != ".wav" else tempfile.mktemp(suffix=".wav")

        try:
            subprocess.run(
                [
                    config.FFMPEG_PATH,
                    "-y",               # overwrite output
                    "-i", audio_path,
                    "-ar", "16000",    # 16kHz sample rate
                    "-ac", "1",        # mono
                    "-f", "wav",
                    wav_path,
                ],
                capture_output=True,
                text=True,
                timeout=120,
                check=True,
            )
            return wav_path
        except FileNotFoundError:
            raise RuntimeError(
                f"ffmpeg not found at '{config.FFMPEG_PATH}'. "
                "Please install ffmpeg and ensure it's on your PATH."
            )
        except subprocess.CalledProcessError as e:
            raise RuntimeError(f"ffmpeg conversion failed: {e.stderr}")
        except subprocess.TimeoutExpired:
            raise RuntimeError("ffmpeg conversion timed out after 120 seconds")
