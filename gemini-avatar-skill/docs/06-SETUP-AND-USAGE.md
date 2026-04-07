# Setup and Usage Guide

## Prerequisites

| Requirement | How to Get It |
|-------------|---------------|
| Python 3.10+ | `python3 --version` — install from python.org if needed |
| Gemini API Key | Free at https://aistudio.google.com/apikey |
| Daily.co API Key | Free at https://dashboard.daily.co (10K min/month free) |
| ffmpeg (optional) | `brew install ffmpeg` / `apt install ffmpeg` — only for voice cloning with non-MP3/WAV formats |
| ElevenLabs API Key (optional) | https://elevenlabs.io — only if you want to clone your voice |

---

## Step 1: Install Dependencies

```bash
cd gemini-avatar-skill
pip install -r requirements.txt
```

This installs:
- `requests>=2.32.5` — HTTP client for API calls
- `google-genai>=1.0.0` — Google's Gemini SDK (includes Live API)
- `daily-python>=0.10.0` — Daily.co's Python SDK for WebRTC
- `Pillow>=10.0.0` — Image processing

---

## Step 2: Set Environment Variables

```bash
# Required
export GEMINI_API_KEY="AIza..."
export DAILY_API_KEY="abc123..."

# Optional (only for voice cloning)
export ELEVENLABS_API_KEY="xi_..."
```

For persistent config, add these to your `~/.bashrc`, `~/.zshrc`, or `.env` file.

---

## Step 3: Generate an Avatar

Choose one of three methods:

### Option A: AI-Generated (Gemini Imagen)
```bash
python scripts/avatar_generator.py generate \
  --prompt "professional woman, business casual, friendly smile, neutral background" \
  --output identity/avatar.png
```

### Option B: AI-Generated (Local Stable Diffusion)
```bash
# First time: downloads ~4GB model
pip install diffusers torch transformers accelerate

python scripts/avatar_generator.py generate \
  --backend sd \
  --prompt "young man with glasses, tech startup vibe" \
  --output identity/avatar.png
```

### Option C: Use Your Own Photo
```bash
python scripts/avatar_generator.py generate \
  --backend file \
  --source ~/Pictures/my-headshot.png \
  --output identity/avatar.png
```

---

## Step 4: Clone Your Voice (Optional)

Record a 10-second to 5-minute audio clip of yourself speaking naturally, then:

```bash
python scripts/voice_engine.py clone \
  --audio ~/recordings/my-voice-sample.wav \
  --name "my-voice" \
  --output identity/voice_config.json
```

**Skip this step** to use Gemini's built-in "Kore" voice instead.

---

## Step 5: Test the Connection

Run a quick demo to verify your Gemini API key works:

```bash
python scripts/voice_engine.py demo \
  --system-prompt "You are a friendly assistant named Alex"
```

You should see transcription output and audio byte counts. Press Ctrl+C after a few seconds.

---

## Step 6: Join a Meeting

### Basic Usage
```bash
python scripts/orchestrator.py join \
  --meet-url "https://meet.google.com/abc-defg-hij" \
  --bot-name "My AI Avatar"
```

### With Custom Persona
```bash
python scripts/orchestrator.py join \
  --meet-url "https://meet.google.com/abc-defg-hij" \
  --bot-name "Project Manager Bot" \
  --avatar identity/avatar.png \
  --system-prompt "You are a project manager. Keep track of action items and deadlines discussed in the meeting. Summarize decisions when asked."
```

### With Workspace Context
```bash
python scripts/orchestrator.py join \
  --meet-url "https://meet.google.com/abc-defg-hij" \
  --bot-name "Sprint Bot" \
  --context-dir ./docs/ \
  --system-prompt "You have access to our project docs. Answer questions about the project during the meeting."
```

The `--context-dir` flag reads up to 5 `.md`/`.txt`/`.json` files from the specified directory and includes them in the system prompt, so the avatar has project context.

### With System Prompt File
```bash
# Create a detailed prompt file
cat > /tmp/meeting-prompt.txt << 'PROMPT'
You are representing the engineering team in this stakeholder meeting.
Key points to cover:
- Sprint velocity is at 42 points/week
- The API migration is 80% complete
- We need a decision on the auth provider by Friday
Be professional but concise. Don't volunteer information not asked about.
PROMPT

python scripts/orchestrator.py join \
  --meet-url "https://meet.google.com/abc-defg-hij" \
  --bot-name "Engineering Rep" \
  --system-prompt-file /tmp/meeting-prompt.txt
```

---

## Step 7: Leave the Meeting

### From the Same Terminal
Press `Ctrl+C` — the bot will leave gracefully.

### From a Different Terminal
Use the session ID printed when you joined:

```bash
python scripts/orchestrator.py leave --session-id avatar-1712500000
```

### Check Session Status
```bash
python scripts/orchestrator.py status --session-id avatar-1712500000
```

---

## Common Workflows

### Daily Standup Bot
```bash
python scripts/orchestrator.py join \
  --meet-url "https://meet.google.com/daily-standup" \
  --bot-name "Standup Scribe" \
  --system-prompt "Listen to the standup meeting. When asked, summarize what each person said. Track blockers mentioned."
```

### Client Meeting Representative
```bash
python scripts/orchestrator.py join \
  --meet-url "https://meet.google.com/client-call" \
  --bot-name "Alex from Engineering" \
  --avatar identity/professional-avatar.png \
  --context-dir ./project-docs/ \
  --system-prompt "You represent our engineering team. Answer technical questions about the project. Be honest about timelines."
```

### Interview Practice Bot
```bash
python scripts/orchestrator.py join \
  --meet-url "https://meet.google.com/practice" \
  --bot-name "Interviewer" \
  --system-prompt "You are a senior software engineer conducting a technical interview. Ask algorithm and system design questions. Give constructive feedback."
```

---

## Troubleshooting

| Issue | Cause | Fix |
|-------|-------|-----|
| `Error: GEMINI_API_KEY environment variable required` | Key not set | `export GEMINI_API_KEY="your-key"` |
| `Error: DAILY_API_KEY environment variable required` | Key not set | `export DAILY_API_KEY="your-key"` |
| `Imagen API error 403` | Imagen not enabled for your key | Uses Gemini native fallback automatically |
| `daily-python not found` | SDK not installed | `pip install daily-python` |
| `ffmpeg not found` | ffmpeg not installed | `brew install ffmpeg` or `apt install ffmpeg` |
| `Voice cloning failed: 401` | Bad ElevenLabs key | Check `ELEVENLABS_API_KEY` is correct |
| `Session not found` | Session expired or wrong ID | Check `/tmp/gemini-avatar-sessions/` for available sessions |
| Bot joins but no audio | Audio bridge not connecting | Ensure Daily.co room is active, check stderr logs |
