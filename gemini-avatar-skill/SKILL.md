# Gemini Avatar Skill

> A self-hosted AI avatar meeting skill powered by Google Gemini 3.1 Flash Live.
> No Pika dependency — uses open APIs directly.

## When to Activate

Activate this skill when the user wants to:
- Join a Google Meet or video call as an AI avatar
- Generate an avatar image for meetings
- Clone their voice for the AI avatar
- Have an AI bot attend a meeting on their behalf

## Requirements

- `GEMINI_API_KEY` environment variable (from https://aistudio.google.com/apikey)
- `DAILY_API_KEY` environment variable (from https://www.daily.co — free tier available)
- Python 3.10+
- Optional: `ffmpeg` (for audio format conversion during voice cloning)

## Setup

```bash
pip install -r requirements.txt
```

## Commands

### 1. Generate Avatar

Create an AI-generated avatar image for your meeting bot.

```bash
python scripts/avatar_generator.py generate \
  --output identity/avatar.png \
  --prompt "Professional headshot of a friendly person, neutral background"
```

### 2. Clone Voice

Clone your voice from a short audio recording (10s–5min).

```bash
python scripts/voice_engine.py clone \
  --audio /path/to/recording.wav \
  --name "my-voice" \
  --output identity/voice_config.json
```

Skip this step to use Gemini's native voice output.

### 3. Join Meeting

Send the AI avatar into a Google Meet call.

```bash
python scripts/orchestrator.py join \
  --meet-url "https://meet.google.com/xxx-xxxx-xxx" \
  --bot-name "AI Assistant" \
  --avatar identity/avatar.png \
  --system-prompt "You are a helpful meeting assistant." \
  [--voice-config identity/voice_config.json]
```

### 4. Leave Meeting

```bash
python scripts/orchestrator.py leave --session-id <session_id>
```

## Architecture

```
User's Microphone  →  Daily.co Room  →  Gemini 3.1 Flash Live  →  Audio Response
                         ↑                                            ↓
                    Avatar Video                              Daily.co Room → Meeting
```

- **Brain**: Gemini 3.1 Flash Live handles real-time conversation (audio in → audio out)
- **Body**: Daily.co provides the video room with avatar overlay
- **Bridge**: A headless bot joins Google Meet via Daily.co's dial-out or browser automation

## Cost Comparison

| Component | Pika Skills | This Skill |
|-----------|-------------|------------|
| AI Brain | Included ($0.275/min) | Gemini Flash (~$0.01/min) |
| Voice | MiniMax (proxied) | Gemini native (free) or ElevenLabs |
| Avatar | OpenAI (proxied) | Stable Diffusion (free) or Gemini Imagen |
| Video Bot | Pika proprietary | Daily.co (free tier: 10K min/mo) |
| **Total** | **~$0.275/min** | **~$0.01/min** |
