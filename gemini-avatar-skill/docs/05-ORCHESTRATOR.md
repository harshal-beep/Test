# Orchestrator — Detailed Documentation

**File**: `scripts/orchestrator.py`
**Lines**: 287
**Dependencies**: `requests`, `asyncio`, `signal`

---

## Purpose

The orchestrator is the **main entry point** for the entire skill. It:

1. Parses CLI arguments
2. Validates environment (API keys, files)
3. Builds context-aware system prompts
4. Coordinates the avatar, voice, and meeting components
5. Manages session lifecycle (create, persist, cleanup)
6. Handles graceful shutdown (Ctrl+C / SIGTERM)

---

## Commands

### `join` — Join a Meeting

The primary command. Sets up everything and puts the AI avatar into a meeting.

#### Arguments

| Argument | Required | Default | Description |
|----------|----------|---------|-------------|
| `--meet-url` | Yes | — | Google Meet or Zoom URL |
| `--bot-name` | No | `"AI Assistant"` | Display name in the meeting |
| `--avatar` | No | `identity/avatar.png` | Path to avatar image |
| `--system-prompt` | No | — | Custom system prompt text |
| `--system-prompt-file` | No | — | Path to a file containing the system prompt |
| `--voice-config` | No | — | Path to ElevenLabs voice config JSON |
| `--context-dir` | No | — | Directory with `.md`/`.txt`/`.json` files for meeting context |

#### Execution Flow

```
Step 1: Validation
├── Check GEMINI_API_KEY exists
├── Check DAILY_API_KEY exists
└── Verify avatar file exists (warn if missing, proceed anyway)

Step 2: System Prompt Construction
├── Base identity: "You are {bot_name}, an AI meeting assistant."
├── Behavioral rules: speak naturally, be concise, handle "leave" command
├── Custom instructions: from --system-prompt or --system-prompt-file
└── Workspace context: reads up to 5 files (max 2KB each) from --context-dir

Step 3: Meeting Setup (3 sub-steps)
├── 3a: GoogleMeetBridge.create_bridge_room()
│       → Creates Daily.co room + token + bridge info
├── 3b: GeminiLiveSession.connect()
│       → Opens WebSocket to Gemini 3.1 Flash Live
└── 3c: MeetingBot.join(gemini_session)
        → Joins room, starts audio bridge

Step 4: Session Persistence
└── Save session JSON to /tmp/gemini-avatar-sessions/{session_id}.json

Step 5: Wait for Shutdown
├── Register SIGINT handler (Ctrl+C)
├── Register SIGTERM handler
└── asyncio.Event.wait() — blocks until signal received

Step 6: Cleanup
├── bot.leave()
├── gemini.disconnect()
└── Update session status to "ended"
```

#### Output

**stdout** (JSON):
```json
{
  "status": "ok",
  "session_id": "avatar-1712500000",
  "meet_url": "https://meet.google.com/abc-defg-hij",
  "daily_room_url": "https://your-domain.daily.co/xyz789",
  "bot_name": "AI Assistant",
  "message": "AI avatar 'AI Assistant' has joined the meeting."
}
```

**stderr**: Step-by-step progress messages

---

### `leave` — Leave a Meeting

Stops the avatar and cleans up resources.

#### Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `--session-id` | Yes | Session ID from the `join` command output |

#### Execution Flow

```
1. Load session JSON from /tmp/gemini-avatar-sessions/
2. If Daily room exists → DailyRoom.delete_room()
3. Update session status to "ended"
4. Save updated session
```

#### Output

```json
{
  "status": "ok",
  "message": "Left meeting",
  "session_id": "avatar-1712500000"
}
```

---

### `status` — Check Session Status

Query the current state of a meeting session.

#### Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `--session-id` | Yes | Session ID to check |

#### Output

```json
{
  "status": "ok",
  "session": {
    "id": "avatar-1712500000",
    "state": "active",
    "bot_name": "AI Assistant",
    "meet_url": "https://meet.google.com/abc-defg-hij",
    "duration_seconds": 342.5
  }
}
```

---

## System Prompt Builder

### Function: `build_system_prompt(custom_prompt, bot_name, context_dir)`

Constructs a comprehensive system prompt by combining multiple sources:

#### Layer 1 — Identity (always included)
```
You are {bot_name}, an AI meeting assistant.
You are participating in a live video meeting.
Speak naturally and concisely. Be helpful and professional.
If someone says 'leave' or 'goodbye', acknowledge and end gracefully.
```

#### Layer 2 — Custom Instructions (if provided)
```
Additional instructions:
{contents of --system-prompt or --system-prompt-file}
```

#### Layer 3 — Workspace Context (if `--context-dir` provided)

Reads up to **5 files** (sorted alphabetically) from the context directory, each truncated to **2KB**. Supported extensions: `.md`, `.txt`, `.json`.

```
Workspace context (for reference during the meeting):

--- project-brief.md ---
{first 2000 chars of file}

--- team-notes.txt ---
{first 2000 chars of file}
```

This allows the avatar to reference project details, meeting agendas, or team information during the conversation without manual prompting.

---

## Session Persistence

### Storage Location
```
/tmp/gemini-avatar-sessions/
├── avatar-1712500000.json
├── avatar-1712503600.json
└── ...
```

### Session Schema
```json
{
  "session_id": "avatar-1712500000",
  "bot_session": "bot-1712500001",
  "meet_url": "https://meet.google.com/abc-defg-hij",
  "daily_room": "xyz789",
  "daily_room_url": "https://your-domain.daily.co/xyz789",
  "bot_name": "AI Assistant",
  "started_at": 1712500000.0,
  "status": "active",
  "ended_at": null
}
```

### Why `/tmp`?

Sessions are ephemeral by design. They represent active or recently-ended meeting sessions, not persistent data. Using `/tmp` ensures:
- No disk accumulation over time
- OS handles cleanup on reboot
- No permissions issues
- Cross-process accessible (for `leave`/`status` from separate terminal)

---

## Signal Handling

The orchestrator registers handlers for graceful shutdown:

```python
signal.signal(signal.SIGINT, handle_signal)   # Ctrl+C
signal.signal(signal.SIGTERM, handle_signal)  # kill / docker stop
```

When triggered:
1. Sets the `shutdown_event` asyncio Event
2. `cmd_join` exits the wait loop
3. Calls `bot.leave()` (stops audio bridge)
4. Calls `gemini.disconnect()` (closes WebSocket)
5. Updates session state to `"ended"`
6. Exits cleanly with code 0
