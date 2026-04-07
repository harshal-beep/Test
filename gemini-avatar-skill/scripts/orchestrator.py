#!/usr/bin/env python3
"""
Orchestrator — the main entry point that glues avatar, voice, and meeting together.

Usage:
  python orchestrator.py join --meet-url <url> --bot-name <name> --avatar <path> [--system-prompt <text>]
  python orchestrator.py leave --session-id <id>
  python orchestrator.py status --session-id <id>
"""

import argparse
import asyncio
import json
import os
import signal
import sys
import time
from pathlib import Path

import requests


def eprint(*args, **kwargs):
    print(*args, file=sys.stderr, **kwargs)


# Session state stored on disk for cross-process access
SESSION_DIR = Path("/tmp/gemini-avatar-sessions")


def save_session(session_id: str, data: dict):
    SESSION_DIR.mkdir(parents=True, exist_ok=True)
    path = SESSION_DIR / f"{session_id}.json"
    with open(path, "w") as f:
        json.dump(data, f, indent=2)


def load_session(session_id: str) -> dict | None:
    path = SESSION_DIR / f"{session_id}.json"
    if path.exists():
        with open(path) as f:
            return json.load(f)
    return None


def delete_session(session_id: str):
    path = SESSION_DIR / f"{session_id}.json"
    if path.exists():
        path.unlink()


def build_system_prompt(
    custom_prompt: str = "",
    bot_name: str = "AI Assistant",
    context_dir: str = None,
) -> str:
    """Build a system prompt with optional workspace context."""
    parts = []

    # Identity
    parts.append(f"You are {bot_name}, an AI meeting assistant.")
    parts.append("You are participating in a live video meeting.")
    parts.append("Speak naturally and concisely. Be helpful and professional.")
    parts.append("If someone says 'leave' or 'goodbye', acknowledge and end gracefully.")

    # Custom instructions
    if custom_prompt:
        parts.append(f"\nAdditional instructions:\n{custom_prompt}")

    # Workspace context (read recent files for meeting context)
    if context_dir and Path(context_dir).is_dir():
        context_files = []
        for ext in ("*.md", "*.txt", "*.json"):
            context_files.extend(Path(context_dir).glob(ext))

        if context_files:
            parts.append("\nWorkspace context (for reference during the meeting):")
            for cf in sorted(context_files)[:5]:  # Max 5 files
                try:
                    content = cf.read_text()[:2000]  # Max 2KB per file
                    parts.append(f"\n--- {cf.name} ---\n{content}")
                except Exception:
                    pass

    return "\n".join(parts)


async def cmd_join(args):
    """Join a meeting with the AI avatar."""
    from voice_engine import GeminiLiveSession
    from meeting_bot import MeetingBot, GoogleMeetBridge, DailyRoom

    # Validate environment
    gemini_key = os.environ.get("GEMINI_API_KEY")
    if not gemini_key:
        eprint("Error: GEMINI_API_KEY environment variable required")
        sys.exit(1)

    daily_key = os.environ.get("DAILY_API_KEY")
    if not daily_key:
        eprint("Error: DAILY_API_KEY environment variable required")
        sys.exit(1)

    # Validate avatar
    avatar_path = args.avatar
    if avatar_path and not Path(avatar_path).exists():
        eprint(f"Warning: Avatar not found at {avatar_path}, proceeding without avatar")
        avatar_path = None

    # Build system prompt
    system_prompt_text = args.system_prompt or ""
    if args.system_prompt_file:
        try:
            system_prompt_text = Path(args.system_prompt_file).read_text()
        except FileNotFoundError:
            eprint(f"Warning: System prompt file not found: {args.system_prompt_file}")

    system_prompt = build_system_prompt(
        custom_prompt=system_prompt_text,
        bot_name=args.bot_name,
        context_dir=args.context_dir,
    )

    # Save system prompt for debugging
    prompt_path = Path("/tmp/meeting_system_prompt.txt")
    prompt_path.write_text(system_prompt)
    eprint(f"System prompt saved to {prompt_path}")

    session_id = f"avatar-{int(time.time())}"

    # Step 1: Set up the meeting bridge
    eprint("Step 1/3: Setting up meeting room...")
    bridge = GoogleMeetBridge.create_bridge_room(
        daily_key, args.meet_url, args.bot_name
    )

    # Step 2: Connect to Gemini Live
    eprint("Step 2/3: Connecting to Gemini 3.1 Flash Live...")
    gemini = GeminiLiveSession(gemini_key, system_prompt)
    await gemini.connect()

    # Step 3: Join with the bot
    eprint("Step 3/3: Joining meeting with avatar...")
    bot = MeetingBot(
        room_url=bridge["daily_room_url"],
        token=bridge["daily_token"],
        bot_name=args.bot_name,
        avatar_path=avatar_path,
    )
    bot_session = await bot.join(gemini)

    # Save session info
    session_data = {
        "session_id": session_id,
        "bot_session": bot_session,
        "meet_url": args.meet_url,
        "daily_room": bridge["daily_room_name"],
        "daily_room_url": bridge["daily_room_url"],
        "bot_name": args.bot_name,
        "started_at": time.time(),
        "status": "active",
    }
    save_session(session_id, session_data)

    result = {
        "status": "ok",
        "session_id": session_id,
        "meet_url": args.meet_url,
        "daily_room_url": bridge["daily_room_url"],
        "bot_name": args.bot_name,
        "message": f"AI avatar '{args.bot_name}' has joined the meeting.",
    }
    print(json.dumps(result, indent=2))

    # Handle graceful shutdown
    shutdown_event = asyncio.Event()

    def handle_signal(sig, frame):
        eprint(f"\nReceived signal {sig}, leaving meeting...")
        shutdown_event.set()

    signal.signal(signal.SIGINT, handle_signal)
    signal.signal(signal.SIGTERM, handle_signal)

    # Keep running until shutdown
    eprint(f"Avatar is active in meeting. Press Ctrl+C to leave.")
    await shutdown_event.wait()

    # Cleanup
    await bot.leave()
    await gemini.disconnect()

    session_data["status"] = "ended"
    session_data["ended_at"] = time.time()
    save_session(session_id, session_data)

    eprint("Meeting ended.")


def cmd_leave(args):
    """Leave a meeting session."""
    session = load_session(args.session_id)
    if not session:
        eprint(f"Session not found: {args.session_id}")
        sys.exit(1)

    # Clean up the Daily room
    daily_key = os.environ.get("DAILY_API_KEY")
    if daily_key and session.get("daily_room"):
        from meeting_bot import DailyRoom

        room_mgr = DailyRoom(daily_key)
        room_mgr.delete_room(session["daily_room"])
        eprint(f"Daily room '{session['daily_room']}' deleted")

    session["status"] = "ended"
    session["ended_at"] = time.time()
    save_session(args.session_id, session)

    print(json.dumps({"status": "ok", "message": "Left meeting", "session_id": args.session_id}))


def cmd_status(args):
    """Check the status of a session."""
    session = load_session(args.session_id)
    if not session:
        print(json.dumps({"status": "error", "message": "Session not found"}))
        sys.exit(1)

    duration = None
    if session.get("started_at"):
        end = session.get("ended_at", time.time())
        duration = round(end - session["started_at"], 1)

    print(
        json.dumps(
            {
                "status": "ok",
                "session": {
                    "id": session["session_id"],
                    "state": session["status"],
                    "bot_name": session.get("bot_name"),
                    "meet_url": session.get("meet_url"),
                    "duration_seconds": duration,
                },
            },
            indent=2,
        )
    )


def main():
    parser = argparse.ArgumentParser(
        description="Gemini Avatar Skill — AI avatar for video meetings"
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    # Join command
    join_parser = subparsers.add_parser("join", help="Join a meeting with AI avatar")
    join_parser.add_argument("--meet-url", required=True, help="Google Meet / Zoom URL")
    join_parser.add_argument("--bot-name", default="AI Assistant", help="Bot display name")
    join_parser.add_argument("--avatar", default="identity/avatar.png", help="Avatar image path")
    join_parser.add_argument("--system-prompt", help="System prompt text")
    join_parser.add_argument("--system-prompt-file", help="System prompt file path")
    join_parser.add_argument("--voice-config", help="Voice config JSON (for ElevenLabs)")
    join_parser.add_argument("--context-dir", help="Directory with context files")

    # Leave command
    leave_parser = subparsers.add_parser("leave", help="Leave a meeting")
    leave_parser.add_argument("--session-id", required=True, help="Session ID")

    # Status command
    status_parser = subparsers.add_parser("status", help="Check session status")
    status_parser.add_argument("--session-id", required=True, help="Session ID")

    args = parser.parse_args()

    if args.command == "join":
        asyncio.run(cmd_join(args))
    elif args.command == "leave":
        cmd_leave(args)
    elif args.command == "status":
        cmd_status(args)


if __name__ == "__main__":
    main()
