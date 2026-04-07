# Pika Skills vs Gemini Avatar Skill — Full Comparison

## TL;DR

Pika Skills is a **$0.275/min proxy** that wraps OpenAI + MiniMax + PikaStreaming behind a single API key. We replaced it with **direct API calls** to Gemini + Daily.co for ~$0.01/min — 27x cheaper, fully open, no vendor lock-in.

---

## Architecture Comparison

### Pika Skills

```
Your Agent
    │
    ▼
pikastreaming_videomeeting.py (single 400-line script)
    │
    ├─ Avatar: POST pika.art/proxy/openai/v1/images/generations
    │          (proxied OpenAI GPT-Image-1-Mini)
    │
    ├─ Voice:  POST pika.art/proxy/minimax/v1/voice_clone
    │          (proxied MiniMax voice cloning)
    │
    ├─ Brain:  Bundled in PikaStreaming (opaque, no control)
    │
    ├─ Video:  POST pika.art/proxy/realtime/meeting-session
    │          (proprietary PikaStreaming bot)
    │
    └─ Billing: pika.art/developer/balance + /developer/topup
               (mandatory payment integration)
```

**Key insight**: Every API call goes through `pika.art/proxy/` — they're just forwarding to OpenAI, MiniMax, etc. and adding a markup.

### Gemini Avatar Skill (Ours)

```
Your Agent
    │
    ▼
orchestrator.py (coordinates 3 independent modules)
    │
    ├─ Avatar: avatar_generator.py
    │          → Gemini Imagen 3.0 (direct) OR Stable Diffusion (local)
    │
    ├─ Voice:  voice_engine.py
    │          → Gemini 3.1 Flash Live (direct WebSocket)
    │          → Optional: ElevenLabs voice cloning (direct)
    │
    ├─ Brain:  voice_engine.py (same as voice — Gemini does both)
    │          → Real-time audio conversation via WebSocket
    │
    └─ Video:  meeting_bot.py
              → Daily.co (direct REST + WebRTC)
              → Google Meet bridge
```

---

## Feature-by-Feature Comparison

| Feature | Pika Skills | Gemini Avatar Skill |
|---------|-------------|---------------------|
| **Avatar Generation** | OpenAI GPT-Image-1-Mini (proxied) | Gemini Imagen 3.0 / Stable Diffusion / Custom image |
| **Voice Cloning** | MiniMax (proxied) | ElevenLabs (direct) or skip (use Gemini native) |
| **Conversational AI** | Bundled (no control over model/prompt) | Gemini 3.1 Flash Live (full prompt control, 128K context) |
| **Video Streaming** | PikaStreaming (proprietary) | Daily.co (open, free tier) |
| **Meeting Platforms** | Google Meet | Google Meet (Zoom planned) |
| **Billing** | Mandatory Pika balance system | Pay-per-use directly to each provider |
| **System Prompts** | Basic workspace context | Full control + workspace file injection |
| **Session Management** | Server-side (Pika controls) | Local JSON files (you control) |
| **Recording** | Not documented | Daily.co cloud recording (free tier) |
| **Transcription** | Not documented | Built-in via Gemini (input + output transcripts) |
| **Languages** | Not documented | 70+ languages (Gemini) |
| **Offline Mode** | No | Yes (Stable Diffusion for avatar, but need internet for meetings) |

---

## Cost Comparison

### Per-Minute Costs

| Component | Pika Skills | Gemini Avatar Skill | Savings |
|-----------|-------------|---------------------|---------|
| AI Brain + Voice | $0.275/min (bundled) | ~$0.006/min (Gemini Flash Live) | 98% |
| Avatar Generation | Included | ~$0.03/image (one-time) or free (SD) | — |
| Voice Cloning | Included | Free (use Gemini voice) or $0.01 (ElevenLabs, one-time) | — |
| Video Infrastructure | Included | Free (Daily.co, 10K min/month) | 100% |
| **Total per minute** | **$0.275** | **~$0.006 - $0.01** | **96-98%** |

### Monthly Cost Examples

| Usage | Pika Skills | Gemini Avatar Skill |
|-------|-------------|---------------------|
| 1 hour/week (4 hrs/mo) | $66.00 | $2.40 |
| 1 hour/day (30 hrs/mo) | $495.00 | $18.00 |
| 8 hours/day (240 hrs/mo) | $3,960.00 | $144.00 |

### What You Actually Pay

**Pika Skills**:
- Minimum balance: $1.00 (auto-prompted to top up)
- Billing: Per-minute via Pika's payment system
- Hidden costs: Markup on every proxied API call

**Gemini Avatar Skill**:
- Gemini API: Free tier available (15 RPM), then ~$0.006/min
- Daily.co: Free (10,000 participant-minutes/month)
- ElevenLabs: Free tier (10K chars/month) or skip entirely
- Total minimum: **$0.00** to start

---

## Code Comparison

### Pika Skills: 1 script, ~400 lines

```
pikastream-video-meeting/
├── SKILL.md
├── requirements.txt          # requests>=2.32.5
├── assets/placeholder-avatar.jpg
└── scripts/
    └── pikastreaming_videomeeting.py   # Everything in one file
```

Single-file design with all functionality (avatar, voice, meeting, billing) mixed together. Tightly coupled to Pika's API endpoints.

### Gemini Avatar Skill: 4 scripts, ~1,064 lines

```
gemini-avatar-skill/
├── SKILL.md
├── requirements.txt          # 4 packages
├── docs/                     # 8 documentation files
├── assets/
└── scripts/
    ├── avatar_generator.py   # 183 lines — image generation only
    ├── voice_engine.py       # 274 lines — Gemini Live + voice cloning
    ├── meeting_bot.py        # 320 lines — Daily.co + meeting bridge
    └── orchestrator.py       # 287 lines — coordination + CLI
```

Modular design. Each script is independently testable and replaceable. Want to swap Daily.co for LiveKit? Just rewrite `meeting_bot.py` — nothing else changes.

---

## Dependency Comparison

### Pika Skills
```
requests>=2.32.5
```
That's it — because all the work happens on Pika's servers.

### Gemini Avatar Skill
```
requests>=2.32.5        # HTTP client
google-genai>=1.0.0     # Gemini SDK (Live API)
daily-python>=0.10.0    # Daily.co SDK (WebRTC)
Pillow>=10.0.0          # Image processing
```

Four packages. All well-maintained, widely-used libraries.

**Optional extras**:
```
diffusers torch transformers accelerate   # For local Stable Diffusion
elevenlabs                                 # For ElevenLabs voice cloning
```

---

## What Pika Does Better

To be fair, Pika has some advantages:

1. **Simplicity**: One API key, one script, it works. No multi-provider setup.
2. **Managed infrastructure**: Pika handles scaling, uptime, and maintenance.
3. **Single billing**: One payment system instead of managing multiple API accounts.
4. **Video quality**: PikaStreaming may have more polished avatar rendering (lip sync, head movement).

## What We Do Better

1. **Cost**: 27x cheaper for the same functionality.
2. **Control**: Full access to the AI model's system prompt, voice selection, and behavior.
3. **Privacy**: Audio flows directly between you and Google/Daily — not through Pika's servers.
4. **Customization**: Swap any component (different voice provider, different video platform).
5. **No lock-in**: If Gemini gets expensive, switch to another model. If Daily.co changes pricing, switch to LiveKit.
6. **Transparency**: You can read every line of code and understand exactly what's happening.
7. **Offline avatar**: Stable Diffusion generates avatars without any API call.
8. **Transcription**: Built-in real-time transcription of both sides of the conversation.

---

## Migration from Pika Skills

If you're currently using Pika Skills, here's how the commands map:

| Pika Command | Gemini Avatar Command |
|--------------|-----------------------|
| `join --meet-url URL --bot-name NAME --image IMG --voice-id VID` | `orchestrator.py join --meet-url URL --bot-name NAME --avatar IMG` |
| `leave --session-id ID` | `orchestrator.py leave --session-id ID` |
| `generate-avatar --output PATH --prompt TEXT` | `avatar_generator.py generate --output PATH --prompt TEXT` |
| `clone-voice --audio FILE --name NAME` | `voice_engine.py clone --audio FILE --name NAME` |

The CLI interface is intentionally similar to make migration straightforward.
