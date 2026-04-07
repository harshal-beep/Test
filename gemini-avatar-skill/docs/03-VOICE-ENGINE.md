# Voice Engine — Detailed Documentation

**File**: `scripts/voice_engine.py`
**Lines**: 274
**Dependencies**: `google-genai`, `requests` (optional: `elevenlabs`)

---

## Purpose

The voice engine is the **brain** of the avatar. It manages two things:

1. **Real-time conversation** via Gemini 3.1 Flash Live (the core loop)
2. **Voice cloning** via ElevenLabs (optional one-time setup)

---

## Class: `GeminiLiveSession`

### What It Does

Maintains a **persistent WebSocket connection** to Gemini 3.1 Flash Live. Audio goes in, audio comes out — in real time, with sub-second latency.

### Model

```python
MODEL = "gemini-3.1-flash-live-preview"
```

This is Google's latest model optimized for real-time multimodal interaction:
- **Input**: Audio (16-bit PCM, 16kHz, mono), images, text
- **Output**: Audio (16-bit PCM, 24kHz), text transcriptions
- **Context window**: 128K tokens
- **Latency**: Sub-second for audio responses
- **Languages**: 70+ supported
- **Cost**: ~$0.01/min of conversation

### Connection Setup

```python
config = {
    "response_modalities": ["AUDIO"],        # We want spoken responses
    "speech_config": {
        "voice_config": {
            "prebuilt_voice_config": {
                "voice_name": "Kore"          # Gemini's built-in voice
            }
        }
    },
    "system_instruction": system_prompt       # Meeting context + persona
}

session = client.aio.live.connect(model=MODEL, config=config)
```

### Audio Format Details

| Direction | Format | Sample Rate | Bit Depth | Channels | MIME Type |
|-----------|--------|-------------|-----------|----------|-----------|
| Input (to Gemini) | Raw PCM | 16,000 Hz | 16-bit | Mono | `audio/pcm;rate=16000` |
| Output (from Gemini) | Raw PCM | 24,000 Hz | 16-bit | Mono | Inline binary data |

### Method Reference

#### `connect()`
Establishes the WebSocket session. Creates a `genai.Client`, configures audio output with the "Kore" voice, and opens the connection.

**Returns**: `self` (for chaining)

#### `send_audio(audio_chunk: bytes)`
Sends a chunk of raw PCM audio to Gemini. Called continuously by the meeting bot's audio bridge (~every 100ms).

```python
await session.send_realtime_input(
    audio=types.Blob(data=audio_chunk, mime_type="audio/pcm;rate=16000")
)
```

#### `send_text(text: str)`
Sends text input to Gemini (used for the demo command and initial prompts).

#### `receive_responses(audio_callback, text_callback)`
Async generator loop that listens for Gemini's responses:

```python
async for response in session.receive():
    # Audio response → audio_callback(bytes)
    # User transcription → text_callback("user", text)
    # Assistant transcription → text_callback("assistant", text)
```

**Important**: This runs forever until `disconnect()` is called or an error occurs. It's designed to be launched as an `asyncio.Task`.

#### `disconnect()`
Closes the WebSocket session cleanly.

---

## Class: `VoiceCloner`

### What It Does

Clones a user's voice from an audio sample using the ElevenLabs API. This is **entirely optional** — if skipped, the avatar uses Gemini's built-in "Kore" voice.

### Supported Audio Formats

| Format | Native Support | Needs ffmpeg |
|--------|---------------|--------------|
| MP3 | Yes | No |
| WAV | Yes | No |
| M4A | Yes | No |
| OGG | No | Yes |
| FLAC | No | Yes |
| AAC | No | Yes |
| WEBM | No | Yes |

### API Flow

```
1. prepare_audio(path)
   └─ If format needs conversion → ffmpeg -i input.ogg -ar 44100 -ac 1 -b:a 192k output.mp3

2. POST https://api.elevenlabs.io/v1/voices/add
   ├─ Headers: xi-api-key: {ELEVENLABS_API_KEY}
   ├─ Form data: name={voice_name}, description="Cloned for AI avatar"
   └─ File: audio recording

3. Response: {"voice_id": "abc123..."}

4. Save to identity/voice_config.json:
   {
     "voice_id": "abc123...",
     "voice_name": "my-voice",
     "provider": "elevenlabs",
     "created_at": "..."
   }

5. Also save voice_id to identity/voice_id.txt (for quick access)
```

### Audio Requirements for Cloning

- **Duration**: 10 seconds to 5 minutes
- **Quality**: Clear speech, minimal background noise
- **Content**: Natural speaking voice (reading aloud works well)

---

## CLI Reference

### Clone Voice
```bash
python scripts/voice_engine.py clone \
  --audio /path/to/recording.wav \
  --name "my-voice" \
  --output identity/voice_config.json
```

**Required env**: `ELEVENLABS_API_KEY`

### Demo Session
```bash
python scripts/voice_engine.py demo \
  --system-prompt "You are a cheerful assistant named Alex"
```

**Required env**: `GEMINI_API_KEY`

Runs a 30-second test session where Gemini introduces itself. Useful for verifying your API key works and hearing the voice output.

---

## Output Format

### Clone Command
**stdout**:
```json
{
  "status": "ok",
  "voice_id": "abc123...",
  "voice_name": "my-voice",
  "provider": "elevenlabs",
  "created_at": "1712500000.0"
}
```

### Demo Command
**stdout**: Transcription lines `[user] ...` and `[assistant] ...`
**stderr**: Audio byte counts and connection status
