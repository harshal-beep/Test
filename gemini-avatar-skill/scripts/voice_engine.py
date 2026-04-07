#!/usr/bin/env python3
"""
Voice Engine — handles real-time conversation using Gemini 3.1 Flash Live.

This is the core "brain" of the avatar. It:
  1. Receives audio from the meeting room (via Daily.co)
  2. Streams it to Gemini 3.1 Flash Live over WebSocket
  3. Receives Gemini's spoken response in real-time
  4. Streams the response audio back to the meeting room

Also supports voice cloning via ElevenLabs as an optional enhancement.
"""

import argparse
import asyncio
import json
import os
import subprocess
import sys
import wave
from pathlib import Path

import requests


def eprint(*args, **kwargs):
    print(*args, file=sys.stderr, **kwargs)


class GeminiLiveSession:
    """Manages a real-time audio conversation with Gemini 3.1 Flash Live."""

    MODEL = "gemini-3.1-flash-live-preview"

    def __init__(self, api_key: str, system_prompt: str = ""):
        self.api_key = api_key
        self.system_prompt = system_prompt
        self.session = None
        self.client = None
        self._running = False

    async def connect(self):
        """Establish a live session with Gemini."""
        try:
            from google import genai
            from google.genai import types
        except ImportError:
            eprint("Install google-genai: pip install google-genai")
            sys.exit(1)

        self.client = genai.Client(api_key=self.api_key)

        config = {
            "response_modalities": ["AUDIO"],
            "speech_config": {
                "voice_config": {
                    "prebuilt_voice_config": {"voice_name": "Kore"}
                }
            },
        }

        if self.system_prompt:
            config["system_instruction"] = self.system_prompt

        self._session_context = self.client.aio.live.connect(
            model=self.MODEL, config=config
        )
        self.session = await self._session_context.__aenter__()
        self._running = True
        eprint("Gemini Live session connected")
        return self

    async def send_audio(self, audio_chunk: bytes):
        """Send a chunk of PCM audio (16-bit, 16kHz, mono) to Gemini."""
        from google.genai import types

        if not self.session:
            raise RuntimeError("Session not connected")

        await self.session.send_realtime_input(
            audio=types.Blob(data=audio_chunk, mime_type="audio/pcm;rate=16000")
        )

    async def send_text(self, text: str):
        """Send text input to Gemini."""
        if not self.session:
            raise RuntimeError("Session not connected")
        await self.session.send_realtime_input(text=text)

    async def receive_responses(self, audio_callback=None, text_callback=None):
        """Listen for responses from Gemini. Calls callbacks with data."""
        if not self.session:
            raise RuntimeError("Session not connected")

        try:
            async for response in self.session.receive():
                if not self._running:
                    break

                content = response.server_content
                if not content:
                    continue

                # Handle audio response
                if content.model_turn:
                    for part in content.model_turn.parts:
                        if part.inline_data and audio_callback:
                            await audio_callback(part.inline_data.data)

                # Handle transcriptions
                if content.input_transcription and text_callback:
                    await text_callback(
                        "user", content.input_transcription.text
                    )
                if content.output_transcription and text_callback:
                    await text_callback(
                        "assistant", content.output_transcription.text
                    )

        except Exception as e:
            eprint(f"Receive loop error: {e}")
            raise

    async def disconnect(self):
        """Close the Gemini session."""
        self._running = False
        if self.session:
            await self._session_context.__aexit__(None, None, None)
            self.session = None
            eprint("Gemini Live session disconnected")


class VoiceCloner:
    """Clone a voice using ElevenLabs API (optional enhancement)."""

    API_BASE = "https://api.elevenlabs.io/v1"
    SUPPORTED_FORMATS = {"mp3", "wav", "m4a", "ogg", "flac", "aac", "webm"}

    def __init__(self, api_key: str):
        self.api_key = api_key
        self.headers = {"xi-api-key": api_key}

    def prepare_audio(self, audio_path: str) -> str:
        """Convert audio to a supported format if needed."""
        ext = Path(audio_path).suffix.lower().lstrip(".")

        if ext in {"mp3", "wav", "m4a"}:
            return audio_path

        if ext in self.SUPPORTED_FORMATS:
            output = f"/tmp/voice_clone_input.mp3"
            try:
                subprocess.run(
                    [
                        "ffmpeg", "-y", "-i", audio_path,
                        "-ar", "44100", "-ac", "1", "-b:a", "192k",
                        output,
                    ],
                    capture_output=True, check=True,
                )
                return output
            except FileNotFoundError:
                eprint("ffmpeg not found. Install it or provide mp3/wav/m4a.")
                sys.exit(1)
            except subprocess.CalledProcessError as e:
                eprint(f"Audio conversion failed: {e.stderr.decode()}")
                sys.exit(1)

        eprint(f"Unsupported audio format: .{ext}")
        sys.exit(2)

    def clone(self, audio_path: str, voice_name: str, output_path: str) -> dict:
        """Clone a voice from an audio sample."""
        audio_path = self.prepare_audio(audio_path)

        eprint(f"Cloning voice '{voice_name}' from {audio_path}...")

        with open(audio_path, "rb") as f:
            resp = requests.post(
                f"{self.API_BASE}/voices/add",
                headers=self.headers,
                data={"name": voice_name, "description": "Cloned for AI avatar"},
                files={"files": (Path(audio_path).name, f)},
                timeout=120,
            )

        if resp.status_code != 200:
            eprint(f"Voice cloning failed: {resp.status_code} {resp.text}")
            sys.exit(3)

        voice_data = resp.json()
        voice_config = {
            "voice_id": voice_data["voice_id"],
            "voice_name": voice_name,
            "provider": "elevenlabs",
            "created_at": str(Path(audio_path).stat().st_mtime),
        }

        Path(output_path).parent.mkdir(parents=True, exist_ok=True)
        with open(output_path, "w") as f:
            json.dump(voice_config, f, indent=2)

        # Also write just the voice_id for easy access
        voice_id_path = Path(output_path).parent / "voice_id.txt"
        voice_id_path.write_text(voice_data["voice_id"])

        eprint(f"Voice cloned successfully: {voice_data['voice_id']}")
        return voice_config


async def demo_session(api_key: str, system_prompt: str):
    """Run a demo text-based session with Gemini Live for testing."""
    session = GeminiLiveSession(api_key, system_prompt)
    await session.connect()

    async def on_text(role, text):
        print(f"[{role}] {text}")

    async def on_audio(data):
        eprint(f"  (received {len(data)} bytes of audio)")

    receive_task = asyncio.create_task(
        session.receive_responses(audio_callback=on_audio, text_callback=on_text)
    )

    # Send a test message
    await session.send_text("Hello! Can you introduce yourself briefly?")

    try:
        await asyncio.wait_for(receive_task, timeout=30)
    except asyncio.TimeoutError:
        eprint("Demo session timed out (this is normal)")
    finally:
        await session.disconnect()


def main():
    parser = argparse.ArgumentParser(description="Voice engine for AI avatar")
    subparsers = parser.add_subparsers(dest="command", required=True)

    # Clone voice command
    clone_parser = subparsers.add_parser("clone", help="Clone a voice from audio")
    clone_parser.add_argument("--audio", "-a", required=True, help="Audio file path")
    clone_parser.add_argument("--name", "-n", required=True, help="Voice name")
    clone_parser.add_argument(
        "--output", "-o", default="identity/voice_config.json", help="Output config path"
    )

    # Demo command
    demo_parser = subparsers.add_parser("demo", help="Test Gemini Live session")
    demo_parser.add_argument("--system-prompt", "-s", default="", help="System prompt")

    args = parser.parse_args()

    if args.command == "clone":
        api_key = os.environ.get("ELEVENLABS_API_KEY")
        if not api_key:
            eprint("Error: ELEVENLABS_API_KEY environment variable required for cloning")
            eprint("Tip: You can skip cloning and use Gemini's built-in voice instead.")
            sys.exit(1)
        cloner = VoiceCloner(api_key)
        result = cloner.clone(args.audio, args.name, args.output)
        print(json.dumps({"status": "ok", **result}))

    elif args.command == "demo":
        api_key = os.environ.get("GEMINI_API_KEY")
        if not api_key:
            eprint("Error: GEMINI_API_KEY environment variable required")
            sys.exit(1)
        asyncio.run(demo_session(api_key, args.system_prompt))


if __name__ == "__main__":
    main()
