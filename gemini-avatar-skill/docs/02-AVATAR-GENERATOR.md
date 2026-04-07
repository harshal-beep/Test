# Avatar Generator — Detailed Documentation

**File**: `scripts/avatar_generator.py`
**Lines**: 183
**Dependencies**: `requests`, `Pillow` (optional: `diffusers`, `torch`)

---

## Purpose

Generates or imports a static avatar image used as the bot's visual representation in video meetings. The avatar is displayed as the bot's camera feed while Gemini handles the audio conversation.

---

## Backends

### 1. Gemini Imagen (Default)

Uses Google's Imagen 3.0 model via the Generative Language API.

**API Endpoint**:
```
POST https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key={api_key}
```

**Request Payload**:
```json
{
  "instances": [{"prompt": "your prompt here"}],
  "parameters": {
    "sampleCount": 1,
    "aspectRatio": "1:1",
    "personGeneration": "allow_adult"
  }
}
```

**Response**: Base64-encoded PNG in `predictions[0].bytesBase64Encoded`

**Fallback**: If Imagen returns an error or empty result, automatically falls back to `generate_with_gemini_native()` which uses `gemini-2.0-flash-exp` with `responseModalities: ["IMAGE", "TEXT"]`.

**Cost**: ~$0.02-0.04 per image (Imagen), free (Gemini native, experimental)

**Usage**:
```bash
python scripts/avatar_generator.py generate \
  --backend gemini \
  --prompt "professional man in business casual, friendly expression" \
  --output identity/avatar.png
```

### 2. Stable Diffusion (Offline)

Uses the `diffusers` library to run Stable Diffusion 2.1 locally.

**Model**: `stabilityai/stable-diffusion-2-1` (~4GB download on first run)

**Prompt enrichment**: Your prompt is automatically prefixed with `"professional headshot portrait, "` and suffixed with `"neutral background, high quality, photorealistic, 4k"`.

**Generation parameters**:
- `num_inference_steps`: 30
- `guidance_scale`: 7.5
- GPU acceleration: Automatic if CUDA available (uses float16)

**Cost**: Free (runs locally)

**Extra dependencies**:
```bash
pip install diffusers torch transformers accelerate
```

**Usage**:
```bash
python scripts/avatar_generator.py generate \
  --backend sd \
  --prompt "young woman with glasses" \
  --output identity/avatar.png
```

### 3. Custom File

Simply copies a user-provided image to the avatar path.

**Usage**:
```bash
python scripts/avatar_generator.py generate \
  --backend file \
  --source /path/to/my-photo.png \
  --output identity/avatar.png
```

---

## CLI Reference

```
usage: avatar_generator.py generate [options]

positional arguments:
  command               {generate}

options:
  --output, -o PATH     Output file path (default: identity/avatar.png)
  --prompt, -p TEXT      Image generation prompt (default: "friendly professional person")
  --backend {gemini,sd,file}
                        Generation backend (default: gemini)
  --source PATH         Source image path (required for --backend file)
```

## Output Format

**stdout** (JSON):
```json
{
  "status": "ok",
  "path": "identity/avatar.png"
}
```

**stderr**: Progress messages and error details

---

## Function Reference

| Function | Lines | Description |
|----------|-------|-------------|
| `generate_with_gemini()` | 25-58 | Primary: Imagen 3.0 API call with fallback |
| `generate_with_gemini_native()` | 61-101 | Fallback: Gemini multimodal image generation |
| `generate_with_sd()` | 104-130 | Local Stable Diffusion pipeline |
| `use_custom_image()` | 133-144 | File copy with validation |
| `eprint()` | 21-22 | stderr logging helper |
| `main()` | 147-183 | CLI argument parsing and dispatch |
