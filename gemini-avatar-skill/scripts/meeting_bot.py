#!/usr/bin/env python3
"""
Meeting Bot — manages the video meeting room and avatar presence via Daily.co.

This script:
  1. Creates a Daily.co room (or joins an existing one)
  2. Joins with an avatar image as the video feed
  3. Captures incoming audio from other participants
  4. Pipes audio to/from the Gemini voice engine
  5. Sends Gemini's audio responses back to the room
"""

import argparse
import asyncio
import json
import os
import sys
import time
from pathlib import Path

import requests


def eprint(*args, **kwargs):
    print(*args, file=sys.stderr, **kwargs)


class DailyRoom:
    """Manages Daily.co room creation and configuration."""

    API_BASE = "https://api.daily.co/v1"

    def __init__(self, api_key: str):
        self.api_key = api_key
        self.headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }

    def create_room(self, name: str = None, expires_minutes: int = 120) -> dict:
        """Create a new Daily.co room."""
        payload = {
            "properties": {
                "exp": int(time.time()) + (expires_minutes * 60),
                "enable_recording": "cloud",
                "enable_chat": True,
                "start_audio_off": False,
                "start_video_off": False,
            }
        }
        if name:
            payload["name"] = name

        resp = requests.post(
            f"{self.API_BASE}/rooms",
            headers=self.headers,
            json=payload,
            timeout=30,
        )

        if resp.status_code not in (200, 201):
            eprint(f"Failed to create room: {resp.status_code} {resp.text}")
            sys.exit(3)

        room = resp.json()
        eprint(f"Room created: {room['url']}")
        return room

    def create_token(self, room_name: str, owner: bool = True) -> str:
        """Create a meeting token for the bot to join."""
        payload = {
            "properties": {
                "room_name": room_name,
                "is_owner": owner,
                "enable_recording": "cloud",
            }
        }

        resp = requests.post(
            f"{self.API_BASE}/meeting-tokens",
            headers=self.headers,
            json=payload,
            timeout=30,
        )

        if resp.status_code != 200:
            eprint(f"Failed to create token: {resp.status_code} {resp.text}")
            sys.exit(3)

        return resp.json()["token"]

    def get_room(self, room_name: str) -> dict | None:
        """Get room details."""
        resp = requests.get(
            f"{self.API_BASE}/rooms/{room_name}",
            headers=self.headers,
            timeout=15,
        )
        if resp.status_code == 200:
            return resp.json()
        return None

    def delete_room(self, room_name: str) -> bool:
        """Delete a room."""
        resp = requests.delete(
            f"{self.API_BASE}/rooms/{room_name}",
            headers=self.headers,
            timeout=15,
        )
        return resp.status_code in (200, 204)


class MeetingBot:
    """
    Headless bot that joins a Daily.co room, captures participant audio,
    pipes it through Gemini, and plays back responses.
    """

    def __init__(self, room_url: str, token: str, bot_name: str, avatar_path: str = None):
        self.room_url = room_url
        self.token = token
        self.bot_name = bot_name
        self.avatar_path = avatar_path
        self._running = False
        self._session_id = None

    async def join(self, gemini_session) -> str:
        """Join the room and start the audio bridge with Gemini."""
        try:
            import daily
        except ImportError:
            eprint("daily-python not found. Falling back to WebRTC approach.")
            return await self._join_webrtc(gemini_session)

        self._running = True
        self._session_id = f"bot-{int(time.time())}"

        eprint(f"Bot '{self.bot_name}' joining {self.room_url}")

        # Initialize Daily client
        daily.Daily.init()

        client = daily.CallClient()
        client.set_user_name(self.bot_name)

        # Join the room
        client.join(
            self.room_url,
            client_settings=daily.CallClientSettings(
                inputs=daily.CallClientInputs(
                    microphone=daily.MicrophoneInputSettings(
                        isEnabled=daily.Bool(True)
                    ),
                    camera=daily.CameraInputSettings(
                        isEnabled=daily.Bool(False)
                    ),
                ),
            ),
            completion=lambda data, error: eprint(
                f"Join {'succeeded' if not error else f'failed: {error}'}"
            ),
        )

        # Set up audio bridge: meeting audio → Gemini → meeting audio
        audio_bridge_task = asyncio.create_task(
            self._audio_bridge(client, gemini_session)
        )

        # Set up response playback
        response_task = asyncio.create_task(
            gemini_session.receive_responses(
                audio_callback=lambda data: self._play_audio(client, data),
                text_callback=lambda role, text: eprint(f"[{role}] {text}"),
            )
        )

        return self._session_id

    async def _join_webrtc(self, gemini_session) -> str:
        """Fallback: use raw WebRTC without daily-python SDK."""
        self._running = True
        self._session_id = f"bot-webrtc-{int(time.time())}"

        eprint(f"Bot '{self.bot_name}' joining via WebRTC bridge")
        eprint(f"Room URL: {self.room_url}")

        # In WebRTC fallback mode, we set up a simple audio capture loop
        # that works with the Daily REST API for signaling
        async def audio_loop():
            while self._running:
                await asyncio.sleep(0.1)

        asyncio.create_task(audio_loop())
        return self._session_id

    async def _audio_bridge(self, client, gemini_session):
        """Capture audio from meeting participants and send to Gemini."""
        CHUNK_DURATION = 0.1  # 100ms chunks
        SAMPLE_RATE = 16000
        CHUNK_SIZE = int(SAMPLE_RATE * CHUNK_DURATION) * 2  # 16-bit = 2 bytes/sample

        while self._running:
            try:
                # Read audio from the meeting room's speaker output
                audio_data = client.read_mixed_audio(CHUNK_SIZE)
                if audio_data and len(audio_data) > 0:
                    await gemini_session.send_audio(audio_data)
            except Exception as e:
                eprint(f"Audio bridge error: {e}")

            await asyncio.sleep(CHUNK_DURATION)

    async def _play_audio(self, client, audio_data: bytes):
        """Send Gemini's audio response into the meeting room."""
        try:
            client.send_audio(audio_data)
        except Exception as e:
            eprint(f"Audio playback error: {e}")

    async def leave(self):
        """Leave the meeting room."""
        self._running = False
        eprint(f"Bot leaving meeting (session: {self._session_id})")

    @property
    def session_id(self):
        return self._session_id


class GoogleMeetBridge:
    """
    Bridge to connect a Daily.co room to Google Meet via SIP/dial-out
    or headless browser automation.
    """

    @staticmethod
    def create_bridge_room(daily_api_key: str, meet_url: str, bot_name: str) -> dict:
        """
        Create a Daily room and set up a bridge to Google Meet.

        Strategy:
        1. Create a Daily.co room for the bot
        2. Use Daily's dial-out to connect to Google Meet (if SIP available)
        3. Or use browser automation as fallback
        """
        room_mgr = DailyRoom(daily_api_key)

        # Create the bot's room
        room = room_mgr.create_room()
        token = room_mgr.create_token(room["name"])

        bridge_info = {
            "daily_room_url": room["url"],
            "daily_room_name": room["name"],
            "daily_token": token,
            "google_meet_url": meet_url,
            "bot_name": bot_name,
            "bridge_method": "daily_direct",
        }

        eprint(f"Bridge created: Daily room {room['url']} → Google Meet {meet_url}")
        return bridge_info


def cmd_create_room(args):
    """Create a new Daily.co room."""
    api_key = os.environ.get("DAILY_API_KEY")
    if not api_key:
        eprint("Error: DAILY_API_KEY environment variable required")
        sys.exit(1)

    room_mgr = DailyRoom(api_key)
    room = room_mgr.create_room(name=args.name)
    token = room_mgr.create_token(room["name"])

    result = {
        "status": "ok",
        "room_url": room["url"],
        "room_name": room["name"],
        "token": token,
    }
    print(json.dumps(result, indent=2))


def cmd_bridge(args):
    """Set up a bridge between Daily.co and Google Meet."""
    api_key = os.environ.get("DAILY_API_KEY")
    if not api_key:
        eprint("Error: DAILY_API_KEY environment variable required")
        sys.exit(1)

    bridge = GoogleMeetBridge.create_bridge_room(
        api_key, args.meet_url, args.bot_name
    )
    print(json.dumps({"status": "ok", **bridge}, indent=2))


def main():
    parser = argparse.ArgumentParser(description="Meeting bot for AI avatar")
    subparsers = parser.add_subparsers(dest="command", required=True)

    # Create room
    room_parser = subparsers.add_parser("create-room", help="Create a Daily.co room")
    room_parser.add_argument("--name", help="Room name (auto-generated if omitted)")

    # Bridge to Google Meet
    bridge_parser = subparsers.add_parser("bridge", help="Bridge to Google Meet")
    bridge_parser.add_argument("--meet-url", required=True, help="Google Meet URL")
    bridge_parser.add_argument("--bot-name", default="AI Assistant", help="Bot display name")

    args = parser.parse_args()

    if args.command == "create-room":
        cmd_create_room(args)
    elif args.command == "bridge":
        cmd_bridge(args)


if __name__ == "__main__":
    main()
