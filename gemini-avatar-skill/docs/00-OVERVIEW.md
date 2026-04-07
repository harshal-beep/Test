# Gemini Avatar Skill — Project Overview

## What Is This?

A **self-hosted, open-source AI avatar system** that joins video meetings (Google Meet, Zoom) on your behalf. It listens to conversations in real-time, thinks using Google's Gemini 3.1 Flash Live model, and responds with natural spoken audio — all through an AI-generated avatar.

This is a **drop-in replacement for Pika Skills** (`pikastream-video-meeting`), built from scratch using open APIs instead of Pika's proprietary paid infrastructure.

---

## Why Build Our Own?

### The Pika Skills Problem

Pika Skills is marketed as an open framework, but under the hood it's a **thin wrapper around Pika's paid API** ($0.275/min). Every component — avatar generation, voice cloning, video streaming — is proxied through Pika's servers:

```
Your Code → Pika API → OpenAI (images) → back to you
Your Code → Pika API → MiniMax (voice) → back to you
Your Code → Pika API → Pika Streaming (video) → meeting
```

You don't own the pipeline. You can't customize it. You pay a markup on every API call.

### Our Approach

We call the same underlying APIs **directly** — and replace some with better/cheaper alternatives:

```
Your Code → Gemini Imagen (images) → saved locally
Your Code → Gemini 3.1 Flash Live (voice + brain) → Daily.co → meeting
```

**Result**: ~27x cheaper ($0.01/min vs $0.275/min), fully customizable, no vendor lock-in.

---

## Architecture at a Glance

```
┌─────────────────────────────────────────────────────────────┐
│                     ORCHESTRATOR (orchestrator.py)           │
│                                                             │
│  Coordinates all components, manages sessions, handles      │
│  graceful shutdown, builds context-aware system prompts      │
└──────┬──────────────────┬──────────────────┬────────────────┘
       │                  │                  │
       ▼                  ▼                  ▼
┌──────────────┐  ┌───────────────┐  ┌───────────────────┐
│   AVATAR     │  │  VOICE ENGINE │  │   MEETING BOT     │
│  GENERATOR   │  │               │  │                   │
│              │  │  Gemini 3.1   │  │   Daily.co room   │
│  Gemini      │  │  Flash Live   │  │   management +    │
│  Imagen /    │  │  (WebSocket)  │  │   Google Meet     │
│  Stable      │  │               │  │   bridge          │
│  Diffusion   │  │  + optional   │  │                   │
│              │  │  ElevenLabs   │  │   Audio capture    │
│              │  │  voice clone  │  │   & playback      │
└──────────────┘  └───────────────┘  └───────────────────┘
```

### Data Flow During a Live Meeting

```
Meeting Participant speaks
        │
        ▼
Daily.co captures audio (16-bit PCM, 16kHz)
        │
        ▼
Audio streamed to Gemini 3.1 Flash Live via WebSocket
        │
        ▼
Gemini processes speech, generates response
        │
        ▼
Response audio (24kHz PCM) streamed back
        │
        ▼
Daily.co plays audio into meeting room
        │
        ▼
Meeting participants hear the AI avatar respond
```

---

## File Structure

```
gemini-avatar-skill/
├── SKILL.md                          # Agent discovery file (how AI agents find & use this skill)
├── requirements.txt                  # Python dependencies (4 packages)
├── docs/
│   ├── 00-OVERVIEW.md                # This file
│   ├── 01-ARCHITECTURE.md            # Deep dive into system design
│   ├── 02-AVATAR-GENERATOR.md        # Avatar generation docs
│   ├── 03-VOICE-ENGINE.md            # Gemini Live + voice cloning docs
│   ├── 04-MEETING-BOT.md             # Daily.co meeting bot docs
│   ├── 05-ORCHESTRATOR.md            # Orchestrator docs
│   ├── 06-SETUP-AND-USAGE.md         # Getting started guide
│   └── 07-PIKA-VS-GEMINI.md          # Detailed comparison with Pika Skills
├── assets/
│   └── (placeholder for generated avatars)
└── scripts/
    ├── __init__.py
    ├── avatar_generator.py           # 183 lines — avatar image generation
    ├── voice_engine.py               # 274 lines — Gemini Live session + voice cloning
    ├── meeting_bot.py                # 320 lines — Daily.co room + meeting bridge
    └── orchestrator.py               # 287 lines — main entry point
```

**Total**: ~1,064 lines of Python across 4 scripts + 1 skill definition.

---

## Tech Stack

| Component | Technology | Why |
|-----------|-----------|-----|
| AI Brain | Gemini 3.1 Flash Live | Real-time audio-in/audio-out, 128K context, $0.01/min |
| Avatar Images | Gemini Imagen 3.0 / Stable Diffusion | Free (SD) or cheap (Imagen), no proxy needed |
| Voice Cloning | ElevenLabs (optional) | Industry-leading quality, skip it to use Gemini's native voice |
| Video Rooms | Daily.co | Free tier (10K min/month), excellent Python SDK |
| Meeting Bridge | Daily.co dial-out / browser automation | Connects Daily room to Google Meet/Zoom |
| Protocol | WebSocket (Gemini) + WebRTC (Daily) | Both optimized for real-time streaming |

---

## Quick Start

```bash
# 1. Set API keys
export GEMINI_API_KEY="your-key-from-aistudio.google.com"
export DAILY_API_KEY="your-key-from-daily.co"

# 2. Install dependencies
pip install -r requirements.txt

# 3. Generate an avatar
python scripts/avatar_generator.py generate --prompt "professional woman, friendly smile"

# 4. Join a meeting
python scripts/orchestrator.py join \
  --meet-url "https://meet.google.com/abc-defg-hij" \
  --bot-name "My AI Assistant" \
  --system-prompt "You are a helpful meeting note-taker."
```

See [06-SETUP-AND-USAGE.md](./06-SETUP-AND-USAGE.md) for the full guide.
