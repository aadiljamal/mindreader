import base64
import binascii
from io import BytesIO
import os
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
import httpx
from PIL import Image, UnidentifiedImageError

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

LLM_BASE_URL = os.getenv("LLM_BASE_URL", "http://localhost:11434")
LLM_MODEL = os.getenv("LLM_MODEL", "llava")
SYSTEM_PROMPT_PATH = Path(__file__).resolve().parent.parent / "prompts" / "systemprompt.txt"
SYSTEM_PROMPT = SYSTEM_PROMPT_PATH.read_text(encoding="utf-8").strip()
MAX_IMAGE_BYTES = 10 * 1024 * 1024
MAX_IMAGE_PIXELS = 16_000_000
MAX_IMAGE_SIZE = (1024, 1024)

@app.get("/")
def read_root():
    return {"status": "running"}

@app.post("/api/chat")
async def chat_endpoint(payload: dict):
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Request body must be a JSON object.")

    image = payload.get("image")
    if not isinstance(image, str) or not image:
        raise HTTPException(status_code=400, detail="A sketch image is required.")
    if len(image) > MAX_IMAGE_BYTES * 4 // 3 + 4:
        raise HTTPException(status_code=413, detail="The sketch image is too large.")

    try:
        image_bytes = base64.b64decode(image, validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(status_code=400, detail="The sketch image must be valid base64 data.")

    if len(image_bytes) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="The sketch image is too large.")

    try:
        with Image.open(BytesIO(image_bytes)) as sketch_image:
            if sketch_image.width * sketch_image.height > MAX_IMAGE_PIXELS:
                raise HTTPException(status_code=400, detail="The sketch image dimensions are too large.")
            sketch_image.load()
            sketch_image = sketch_image.convert("RGB")
            sketch_image.thumbnail(MAX_IMAGE_SIZE, Image.Resampling.LANCZOS)
            processed_image = BytesIO()
            sketch_image.save(processed_image, format="PNG", optimize=True)
    except (UnidentifiedImageError, OSError, ValueError):
        raise HTTPException(status_code=400, detail="The sketch must be a valid image.")

    req_data = {
        "model": LLM_MODEL,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": "",
                "images": [base64.b64encode(processed_image.getvalue()).decode("ascii")],
            },
        ],
        "stream": True,
    }

    async def generate():
        async with httpx.AsyncClient(timeout=60.0) as client:
            async with client.stream(
                "POST",
                f"{LLM_BASE_URL}/api/chat",
                json=req_data,
            ) as response:
                if response.status_code != 200:
                    raise HTTPException(status_code=500, detail="LLM engine error")
                async for chunk in response.aiter_text():
                    yield chunk

    return StreamingResponse(generate(), media_type="application/x-ndjson")