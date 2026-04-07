# Architecture Deep Dive

## Design Principles

1. **Direct API calls** — No intermediary proxies. Every API call goes straight to the provider.
2. **Modular scripts** — Each script is standalone and testable independently.
3. **Async-first** — All real-time components use Python's `asyncio` for non-blocking I/O.
4. **Graceful degradation** — If `daily-python` isn't installed, falls back to WebRTC. If Imagen fails, falls back to Gemini native image gen.
5. **JSON-over-stdout** — All scripts output structured JSON to stdout for agent integration. Human-readable logs go to stderr.

---

## Component Interaction Diagram

```
                    ┌─────────────────────────┐
                    │      ORCHESTRATOR       │
                    │    (orchestrator.py)     │
                    │                         │
                    │  - Parses CLI args       │
                    │  - Builds system prompt  │
                    │  - Manages session state │
                    │  - Handles SIGINT/SIGTERM│
                    └────┬───────┬────────┬───┘
                         │       │        │
              ┌──────────┘       │        └──────────┐
              ▼                  ▼                   ▼
     ┌────────────────┐  ┌──────────────┐   ┌──────────────┐
     │ avatar_generator│  │ voice_engine │   │ meeting_bot  │
     │                │  │              │   │              │
     │ Called BEFORE   │  │ Called DURING│   │ Called DURING│
     │ meeting join    │  │ meeting      │   │ meeting      │
     │                │  │              │   │              │
     │ Generates 1    │  │ Maintains    │   │ Creates room │
     │ static image   │  │ persistent   │   │ + joins +    │
     │                │  │ WebSocket    │   │ audio bridge │
     └────────────────┘  └──────────────┘   └──────────────┘
```

---

## How Each Component Works

### 1. Orchestrator (`orchestrator.py`)

The orchestrator is the **main entry point**. It doesn't contain business logic — it coordinates:

```
cmd_join(args):
    1. Validate env vars (GEMINI_API_KEY, DAILY_API_KEY)
    2. Validate avatar file exists
    3. Build system prompt (identity + custom instructions + workspace context)
    4. Save system prompt to /tmp for debugging
    5. Call GoogleMeetBridge.create_bridge_room() → get Daily room + token
    6. Call GeminiLiveSession.connect() → establish WebSocket
    7. Call MeetingBot.join(gemini_session) → start audio bridge
    8. Save session state to /tmp/gemini-avatar-sessions/
    9. Wait for SIGINT/SIGTERM
    10. Cleanup: bot.leave() + gemini.disconnect()
```

**Session persistence**: Sessions are stored as JSON files in `/tmp/gemini-avatar-sessions/`. This allows the `leave` and `status` commands to work across separate process invocations.

### 2. Voice Engine (`voice_engine.py`)

Two classes:

**`GeminiLiveSession`** — The real-time AI brain:
```
connect():
    1. Create google.genai.Client with API key
    2. Configure: response_modalities=["AUDIO"], voice="Kore"
    3. Open persistent WebSocket via client.aio.live.connect()

send_audio(chunk):
    → session.send_realtime_input(audio=Blob(data, "audio/pcm;rate=16000"))

receive_responses():
    → async for response in session.receive():
        → if model_turn.parts[].inline_data → audio_callback(data)
        → if input_transcription → text_callback("user", text)
        → if output_transcription → text_callback("assistant", text)
```

**`VoiceCloner`** — Optional ElevenLabs integration:
```
clone(audio_path, voice_name):
    1. prepare_audio() → convert to mp3/wav if needed (via ffmpeg)
    2. POST /v1/voices/add with audio file
    3. Save voice_id to identity/voice_config.json
```

### 3. Meeting Bot (`meeting_bot.py`)

Three classes:

**`DailyRoom`** — REST API wrapper for Daily.co:
```
create_room()   → POST /v1/rooms
create_token()  → POST /v1/meeting-tokens
get_room()      → GET /v1/rooms/{name}
delete_room()   → DELETE /v1/rooms/{name}
```

**`MeetingBot`** — Headless meeting participant:
```
join(gemini_session):
    1. Initialize Daily.CallClient
    2. Set bot name, enable mic, disable camera
    3. Start _audio_bridge() task:
       - Every 100ms: read mixed audio from room → send to Gemini
    4. Start receive_responses() task:
       - Gemini audio → play into room via client.send_audio()
```

**`GoogleMeetBridge`** — Connects Daily room to Google Meet:
```
create_bridge_room(daily_key, meet_url, bot_name):
    1. Create Daily.co room
    2. Generate meeting token
    3. Return bridge_info dict with room URL, token, meet URL
```

### 4. Avatar Generator (`avatar_generator.py`)

Three backends, one interface:

```
--backend gemini (default):
    1. POST to Imagen 3.0 API → base64 PNG
    2. If Imagen fails → fallback to Gemini native (gemini-2.0-flash-exp)
    3. Save to output path

--backend sd:
    1. Load StableDiffusionPipeline("stabilityai/stable-diffusion-2-1")
    2. Generate with professional headshot prompt enrichment
    3. Save to output path

--backend file:
    1. Copy user's image to output path
```

---

## Error Handling Strategy

All scripts use **exit codes** for machine-readable error reporting:

| Exit Code | Meaning |
|-----------|---------|
| 0 | Success |
| 1 | Missing API key or dependency |
| 2 | Validation error (bad input) |
| 3 | HTTP/API error |
| 4 | Processing error (no output generated) |

Errors are printed to **stderr** (via `eprint()`). Success output goes to **stdout** as JSON.

---

## Security Considerations

- **API keys** are read from environment variables only — never hardcoded or logged
- **Avatar images** are stored locally — never uploaded to third parties (unless using Gemini Imagen)
- **Audio data** flows directly between Daily.co and Gemini — no intermediary storage
- **Session files** are stored in `/tmp` with session IDs — no PII in filenames
- **System prompts** can include workspace context — be careful what's in your `--context-dir`
