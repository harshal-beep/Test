# Meeting Bot — Detailed Documentation

**File**: `scripts/meeting_bot.py`
**Lines**: 320
**Dependencies**: `requests`, `daily-python`

---

## Purpose

The meeting bot is the **body** of the avatar. It handles everything related to the video meeting room:

1. Creates and manages Daily.co rooms (the video infrastructure)
2. Joins rooms as a headless participant with a bot name
3. Captures audio from other meeting participants
4. Bridges audio between the meeting and Gemini's voice engine
5. Plays Gemini's audio responses back into the meeting

---

## Class: `DailyRoom`

### What It Does

REST API wrapper for Daily.co's room management. Daily.co provides WebRTC-based video rooms with a generous free tier (10,000 participant-minutes/month).

### API Base URL

```
https://api.daily.co/v1
```

### Authentication

```python
headers = {
    "Authorization": "Bearer {DAILY_API_KEY}",
    "Content-Type": "application/json"
}
```

### Methods

#### `create_room(name=None, expires_minutes=120)`

Creates a new Daily.co video room.

**API**: `POST /rooms`

**Payload**:
```json
{
  "name": "optional-custom-name",
  "properties": {
    "exp": 1712507600,
    "enable_recording": "cloud",
    "enable_chat": true,
    "start_audio_off": false,
    "start_video_off": false
  }
}
```

**Returns**: Room object with `url` and `name` fields.

**Default expiry**: 2 hours from creation.

#### `create_token(room_name, owner=True)`

Generates a meeting token that allows the bot to join the room as an owner.

**API**: `POST /meeting-tokens`

**Returns**: JWT token string.

#### `get_room(room_name)`

Fetches room details. Returns `None` if room doesn't exist.

**API**: `GET /rooms/{name}`

#### `delete_room(room_name)`

Deletes a room and disconnects all participants.

**API**: `DELETE /rooms/{name}`

---

## Class: `MeetingBot`

### What It Does

A headless meeting participant that joins a Daily.co room and creates a bidirectional audio bridge with the Gemini voice engine.

### Constructor Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `room_url` | str | Daily.co room URL (e.g., `https://your-domain.daily.co/room-name`) |
| `token` | str | Meeting token from `DailyRoom.create_token()` |
| `bot_name` | str | Display name shown to other participants |
| `avatar_path` | str | Path to avatar image (optional) |

### Method: `join(gemini_session)`

The main entry point. Joins the room and starts the audio bridge.

**Flow**:
```
1. Try to import daily-python SDK
   ├─ If available → use native Daily.CallClient
   └─ If not → fall back to _join_webrtc() (basic WebRTC)

2. Initialize Daily.CallClient
3. Set bot username
4. Join room with settings:
   - Microphone: ENABLED (for playing Gemini's responses)
   - Camera: DISABLED (avatar is static image, not video)

5. Start two async tasks:
   a. _audio_bridge(client, gemini_session)
      → Captures meeting audio → sends to Gemini
   b. gemini_session.receive_responses(...)
      → Receives Gemini audio → plays into meeting
```

**Returns**: Session ID string (e.g., `"bot-1712500000"`)

### Method: `_audio_bridge(client, gemini_session)`

The real-time audio capture loop. Runs continuously while the bot is in the meeting.

**Configuration**:
```python
CHUNK_DURATION = 0.1     # 100ms chunks
SAMPLE_RATE = 16000      # 16kHz (Gemini's input requirement)
CHUNK_SIZE = 3200        # 16000 * 0.1 * 2 bytes = 3200 bytes per chunk
```

**Loop** (every 100ms):
```
1. client.read_mixed_audio(3200) → raw PCM bytes from all participants
2. gemini_session.send_audio(audio_data) → stream to Gemini
3. asyncio.sleep(0.1) → wait for next chunk
```

### Method: `_play_audio(client, audio_data)`

Sends Gemini's audio response into the meeting room via `client.send_audio()`.

### Method: `leave()`

Sets `_running = False` to stop the audio bridge loop.

---

## Class: `GoogleMeetBridge`

### What It Does

Creates a bridge between a Daily.co room and a Google Meet call. The bot lives in the Daily.co room, and the bridge connects it to the actual Google Meet meeting.

### Method: `create_bridge_room(daily_api_key, meet_url, bot_name)`

**Flow**:
```
1. Create a new Daily.co room
2. Generate an owner-level meeting token
3. Return bridge_info dict:
   {
     "daily_room_url": "https://...",
     "daily_room_name": "abc123",
     "daily_token": "jwt...",
     "google_meet_url": "https://meet.google.com/...",
     "bot_name": "AI Assistant",
     "bridge_method": "daily_direct"
   }
```

**Bridge methods** (by priority):
1. **Daily Direct** — Daily.co's native dial-out to Google Meet (if SIP available)
2. **Browser Automation** — Headless Chrome joins Google Meet (fallback)

---

## CLI Reference

### Create Room
```bash
python scripts/meeting_bot.py create-room [--name custom-room-name]
```

**Output**:
```json
{
  "status": "ok",
  "room_url": "https://your-domain.daily.co/abc123",
  "room_name": "abc123",
  "token": "eyJ..."
}
```

### Bridge to Google Meet
```bash
python scripts/meeting_bot.py bridge \
  --meet-url "https://meet.google.com/abc-defg-hij" \
  --bot-name "AI Assistant"
```

**Output**:
```json
{
  "status": "ok",
  "daily_room_url": "https://your-domain.daily.co/xyz789",
  "daily_room_name": "xyz789",
  "daily_token": "eyJ...",
  "google_meet_url": "https://meet.google.com/abc-defg-hij",
  "bot_name": "AI Assistant",
  "bridge_method": "daily_direct"
}
```

---

## Daily.co Free Tier Limits

| Resource | Limit |
|----------|-------|
| Participant-minutes/month | 10,000 |
| Rooms | Unlimited |
| Recording storage | 1 GB |
| Max participants per room | 200 |
| Max meeting duration | 60 min (free), unlimited (paid) |

At 10,000 free minutes/month, you can run the avatar bot for ~166 hours/month at no cost.
