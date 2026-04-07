#!/usr/bin/env python3
"""
Avatar Generator — creates AI-generated avatar images for meeting bots.

Supports multiple backends:
  - Gemini Imagen (default, uses GEMINI_API_KEY)
  - Local Stable Diffusion via diffusers (offline, --backend sd)
  - Custom image file (--backend file --source /path/to/image.png)
"""

import argparse
import base64
import json
import os
import sys
from pathlib import Path

import requests


def eprint(*args, **kwargs):
    print(*args, file=sys.stderr, **kwargs)


def generate_with_gemini(prompt: str, output_path: str, api_key: str) -> str:
    """Generate avatar using Gemini's image generation via Imagen."""
    url = f"https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key={api_key}"

    payload = {
        "instances": [{"prompt": prompt}],
        "parameters": {
            "sampleCount": 1,
            "aspectRatio": "1:1",
            "personGeneration": "allow_adult",
        },
    }

    eprint(f"Generating avatar with Gemini Imagen...")
    resp = requests.post(url, json=payload, timeout=60)

    if resp.status_code != 200:
        eprint(f"Imagen API error {resp.status_code}: {resp.text}")
        # Fallback to Gemini native image generation
        return generate_with_gemini_native(prompt, output_path, api_key)

    data = resp.json()
    predictions = data.get("predictions", [])
    if not predictions:
        eprint("No image returned from Imagen, trying Gemini native...")
        return generate_with_gemini_native(prompt, output_path, api_key)

    image_bytes = base64.b64decode(predictions[0]["bytesBase64Encoded"])
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "wb") as f:
        f.write(image_bytes)

    eprint(f"Avatar saved to {output_path}")
    return output_path


def generate_with_gemini_native(prompt: str, output_path: str, api_key: str) -> str:
    """Fallback: use Gemini's native image generation capability."""
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key={api_key}"

    payload = {
        "contents": [
            {
                "parts": [
                    {
                        "text": f"Generate a professional avatar image: {prompt}. "
                        "The image should be a clean headshot suitable for video meetings, "
                        "1:1 aspect ratio, neutral background."
                    }
                ]
            }
        ],
        "generationConfig": {"responseModalities": ["IMAGE", "TEXT"]},
    }

    eprint("Generating avatar with Gemini native...")
    resp = requests.post(url, json=payload, timeout=60)

    if resp.status_code != 200:
        eprint(f"Gemini API error {resp.status_code}: {resp.text}")
        sys.exit(3)

    data = resp.json()
    candidates = data.get("candidates", [])
    for candidate in candidates:
        parts = candidate.get("content", {}).get("parts", [])
        for part in parts:
            if "inlineData" in part:
                image_bytes = base64.b64decode(part["inlineData"]["data"])
                Path(output_path).parent.mkdir(parents=True, exist_ok=True)
                with open(output_path, "wb") as f:
                    f.write(image_bytes)
                eprint(f"Avatar saved to {output_path}")
                return output_path

    eprint("No image generated. Try a different prompt.")
    sys.exit(4)


def generate_with_sd(prompt: str, output_path: str) -> str:
    """Generate avatar using local Stable Diffusion (requires diffusers)."""
    try:
        from diffusers import StableDiffusionPipeline
        import torch
    except ImportError:
        eprint("Install diffusers: pip install diffusers torch transformers accelerate")
        sys.exit(1)

    eprint("Loading Stable Diffusion model (first run downloads ~4GB)...")
    pipe = StableDiffusionPipeline.from_pretrained(
        "stabilityai/stable-diffusion-2-1",
        torch_dtype=torch.float16 if torch.cuda.is_available() else torch.float32,
    )
    if torch.cuda.is_available():
        pipe = pipe.to("cuda")

    full_prompt = (
        f"professional headshot portrait, {prompt}, "
        "neutral background, high quality, photorealistic, 4k"
    )

    image = pipe(full_prompt, num_inference_steps=30, guidance_scale=7.5).images[0]
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    image.save(output_path)
    eprint(f"Avatar saved to {output_path}")
    return output_path


def use_custom_image(source: str, output_path: str) -> str:
    """Copy a custom image to the avatar path."""
    import shutil

    if not os.path.exists(source):
        eprint(f"Source image not found: {source}")
        sys.exit(2)

    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, output_path)
    eprint(f"Avatar copied to {output_path}")
    return output_path


def main():
    parser = argparse.ArgumentParser(description="Generate AI avatar for meetings")
    parser.add_argument("command", choices=["generate"], help="Command to run")
    parser.add_argument("--output", "-o", default="identity/avatar.png", help="Output path")
    parser.add_argument("--prompt", "-p", default="friendly professional person", help="Image prompt")
    parser.add_argument(
        "--backend",
        choices=["gemini", "sd", "file"],
        default="gemini",
        help="Generation backend",
    )
    parser.add_argument("--source", help="Source image path (for --backend file)")

    args = parser.parse_args()

    if args.command == "generate":
        if args.backend == "gemini":
            api_key = os.environ.get("GEMINI_API_KEY")
            if not api_key:
                eprint("Error: GEMINI_API_KEY environment variable required")
                sys.exit(1)
            result = generate_with_gemini(args.prompt, args.output, api_key)

        elif args.backend == "sd":
            result = generate_with_sd(args.prompt, args.output)

        elif args.backend == "file":
            if not args.source:
                eprint("Error: --source required for file backend")
                sys.exit(2)
            result = use_custom_image(args.source, args.output)

        print(json.dumps({"status": "ok", "path": result}))


if __name__ == "__main__":
    main()
