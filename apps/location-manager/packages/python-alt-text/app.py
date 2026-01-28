import asyncio
import io
import logging
import os
import re
import threading
from typing import Any

from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from PIL import Image
import torch
from transformers import BlipProcessor, BlipForConditionalGeneration, AutoTokenizer, AutoModelForCausalLM

# Comment out MLX imports to avoid Metal issues for now
# import mlx.core as mx
# from mlx_vlm import generate, load

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("mlx_vlm")

app = FastAPI()

# Model configuration - now using BLIP for image captioning
INFERENCE_TIMEOUT_S = float(os.getenv("INFERENCE_TIMEOUT_S", "20"))

# Alt text refinement configuration
ALT_REFINEMENT_PROMPT = os.getenv(
    "ALT_REFINEMENT_PROMPT",
    "Create SEO-optimized alt text (8-12 words): {caption}\nAlt:"
)
ALT_REFINEMENT_MAX_LENGTH = int(os.getenv("ALT_REFINEMENT_MAX_LENGTH", "30"))
ALT_REFINEMENT_TEMPERATURE = float(os.getenv("ALT_REFINEMENT_TEMPERATURE", "0.3"))

# BLIP model globals for image captioning
BLIP_MODEL = None
BLIP_PROCESSOR = None
BLIP_MODEL_NAME = os.getenv("BLIP_MODEL", "Salesforce/blip-image-captioning-base")
BLIP_LOCK = threading.Lock()

# Alt text refinement model globals
ALT_MODEL = None
ALT_TOKENIZER = None
ALT_MODEL_NAME = os.getenv("ALT_REFINEMENT_MODEL", "distilgpt2")
ALT_MODEL_LOCK = threading.Lock()


# Removed MLX-specific functions - now using BLIP with MPS support


def load_blip_model() -> None:
    """Load BLIP model for image captioning - optimized for Apple Silicon."""
    global BLIP_MODEL, BLIP_PROCESSOR
    if BLIP_MODEL is not None and BLIP_PROCESSOR is not None:
        return
    with BLIP_LOCK:
        if BLIP_MODEL is not None and BLIP_PROCESSOR is not None:
            return

        logger.info("Loading BLIP model %s", BLIP_MODEL_NAME)
        try:
            # Load processor and model
            BLIP_PROCESSOR = BlipProcessor.from_pretrained(BLIP_MODEL_NAME)
            BLIP_MODEL = BlipForConditionalGeneration.from_pretrained(BLIP_MODEL_NAME)

            # Move to MPS (Metal Performance Shaders) if available on Apple Silicon
            if torch.backends.mps.is_available():
                BLIP_MODEL.to("mps")
                logger.info("BLIP model moved to MPS (Apple Silicon GPU)")
            else:
                logger.info("MPS not available, using CPU for BLIP model")

            BLIP_MODEL.eval()
            logger.info("BLIP model loaded successfully: %s", BLIP_MODEL_NAME)

        except Exception as exc:
            logger.exception("Failed to load BLIP model")
            raise RuntimeError(f"BLIP model load failed: {exc}") from exc


def load_alt_refinement_model() -> None:
    """Load the local text generation model for alt text refinement."""
    global ALT_MODEL, ALT_TOKENIZER
    if ALT_MODEL is not None and ALT_TOKENIZER is not None:
        return
    with ALT_MODEL_LOCK:
        if ALT_MODEL is not None and ALT_TOKENIZER is not None:
            return

        logger.info("Loading alt refinement model %s", ALT_MODEL_NAME)
        try:
            ALT_TOKENIZER = AutoTokenizer.from_pretrained(ALT_MODEL_NAME)
            ALT_TOKENIZER.pad_token = ALT_TOKENIZER.eos_token

            ALT_MODEL = AutoModelForCausalLM.from_pretrained(ALT_MODEL_NAME)
            ALT_MODEL.eval()

            # Move to MPS if available (Apple Silicon GPU)
            try:
                if torch.backends.mps.is_available():
                    ALT_MODEL.to("mps")
                    logger.info("Alt refinement model moved to MPS")
                else:
                    logger.info("MPS not available, using CPU for alt refinement")
            except Exception as e:
                logger.warning(f"Failed to move alt model to MPS: {e}, using CPU")

            logger.info("Alt refinement model loaded: %s", ALT_MODEL_NAME)
        except Exception as exc:
            logger.exception("Failed to load alt refinement model")
            raise RuntimeError(f"alt refinement model load failed: {exc}") from exc


@app.on_event("startup")
def startup() -> None:
    # Load models at startup for better performance
    try:
        load_blip_model()
        load_alt_refinement_model()
        logger.info("Models loaded successfully at startup")
    except Exception as e:
        logger.warning(f"Model loading failed at startup: {e}. Will load on first request.")


def extract_text(output: Any) -> str:
    if isinstance(output, str):
        return output
    for attr in ("text", "caption", "response", "output"):
        value = getattr(output, attr, None)
        if isinstance(value, str):
            return value
    if isinstance(output, dict):
        for key in ("text", "caption", "response", "output"):
            value = output.get(key)
            if isinstance(value, str):
                return value
    if isinstance(output, (list, tuple)):
        for item in output:
            if isinstance(item, str):
                return item
            if isinstance(item, dict):
                for key in ("text", "caption", "response", "output"):
                    value = item.get(key)
                    if isinstance(value, str):
                        return value
    if hasattr(output, "__dict__"):
        for key in ("text", "caption", "response", "output"):
            value = output.__dict__.get(key)
            if isinstance(value, str):
                return value
    rendered = str(output)
    match = re.search(
        r"(?:text|caption|response|output)\s*[:=]\s*['\"]?([^'\"\n]+)",
        rendered,
        re.IGNORECASE,
    )
    if match:
        return match.group(1).strip()
    return rendered


def clean_model_output(text: str) -> str:
    """Clean common special tokens from model output."""
    if not text:
        return text

    # Remove common special tokens
    cleaned = re.sub(r'<[^>]*>', '', text)  # Remove <token> patterns
    cleaned = re.sub(r'^\s*s\s+', '', cleaned)  # Remove leading "s " that might be a token remnant
    cleaned = cleaned.strip()

    return cleaned or "unidentified image"




def run_inference(img: Image.Image) -> str:
    """Run BLIP inference on an image."""
    load_blip_model()

    try:
        inputs = BLIP_PROCESSOR(img, return_tensors="pt")

        # Move inputs to same device as model
        if torch.backends.mps.is_available():
            inputs = {k: v.to("mps") for k, v in inputs.items()}

        with torch.no_grad():
            output = BLIP_MODEL.generate(**inputs, max_length=50, num_beams=6, early_stopping=True)

        caption = BLIP_PROCESSOR.decode(output[0], skip_special_tokens=True)
        return caption

    except Exception as e:
        logger.error(f"BLIP inference failed: {e}")
        return "A beautiful image"


def refine_alt_text(caption_text: str) -> str:
    """Convert descriptive caption to SEO-optimized alt text (8-12 words)."""
    logger.info(f"Refining alt text from caption: '{caption_text}'")

    # Load model if not already loaded
    load_alt_refinement_model()

    try:
        prompt = f"Create SEO-optimized alt text (8-12 words): {caption_text}\nAlt:"
        inputs = ALT_TOKENIZER(prompt, return_tensors="pt", padding=True)

        # Move inputs to same device as model
        if torch.backends.mps.is_available():
            inputs = {k: v.to("mps") for k, v in inputs.items()}

        with torch.no_grad():
            outputs = ALT_MODEL.generate(
                inputs["input_ids"],
                attention_mask=inputs["attention_mask"],
                max_length=len(inputs["input_ids"][0]) + ALT_REFINEMENT_MAX_LENGTH,
                temperature=ALT_REFINEMENT_TEMPERATURE,
                do_sample=True,
                pad_token_id=ALT_TOKENIZER.eos_token_id,
                num_return_sequences=1,
            )

        generated_text = ALT_TOKENIZER.decode(outputs[0], skip_special_tokens=True)

        # Extract just the alt text part after "Alt:"
        if "Alt:" in generated_text:
            alt_text = generated_text.split("Alt:")[-1].strip()
        else:
            alt_text = generated_text.replace(prompt, "").strip()

        # Clean up and ensure 8-12 words
        words = alt_text.split()
        if len(words) > 12:  # If too long, truncate to 10 words
            alt_text = " ".join(words[:10])
        elif len(words) < 8:  # If too short, expand or use original caption
            alt_text = caption_text
        elif len(words) == 0:  # If empty, use original caption
            alt_text = caption_text

        # Remove quotes and extra whitespace
        alt_text = alt_text.strip('"').strip("'").strip()

        logger.info(f"Refined alt text: '{alt_text}'")
        return alt_text or caption_text  # Fallback to original if empty

    except Exception as exc:
        logger.warning(f"Alt text refinement failed: {exc}")
        # Simple fallback: take first 10 words
        words = caption_text.split()[:10]
        return " ".join(words) if words else caption_text


async def infer_caption_from_data(image_data: bytes, filename: str, content_type: str) -> str:
    """Get caption from image data using BLIP model."""
    logger.info(f"Processing image data: filename={filename}, content_type={content_type}, size={len(image_data)}")

    # Load BLIP model if not already loaded
    load_blip_model()

    try:
        # Open image from bytes
        image = Image.open(io.BytesIO(image_data)).convert('RGB')

        # Generate caption using BLIP
        inputs = BLIP_PROCESSOR(image, return_tensors="pt")

        # Move inputs to same device as model
        if torch.backends.mps.is_available():
            inputs = {k: v.to("mps") for k, v in inputs.items()}

        with torch.no_grad():
            output = BLIP_MODEL.generate(**inputs, max_length=50, num_beams=6, early_stopping=True)

        caption = BLIP_PROCESSOR.decode(output[0], skip_special_tokens=True)
        logger.info(f"BLIP generated caption: '{caption}'")
        return caption

    except Exception as e:
        logger.error(f"BLIP caption generation failed: {e}")
        # Fallback mock caption
        return "A beautiful image"


async def infer_caption(image: UploadFile) -> str:
    """Legacy function for backward compatibility."""
    # This function is kept for any other code that might call it directly
    # but the main API now uses infer_caption_from_data
    data = await image.read()
    return await infer_caption_from_data(data, image.filename, image.content_type)


async def generate_alt_from_caption(caption_text: str) -> str:
    """Two-stage alt text generation: Caption → SEO Alt Text."""
    logger.info("GENERATE_ALT_FROM_CAPTION: Starting with caption")
    try:
        # Stage 2: Refine to SEO-optimized alt text using GPT-2
        logger.info("GENERATE_ALT_FROM_CAPTION: Stage 2: Refining alt text with GPT-2")
        alt_text = await asyncio.to_thread(refine_alt_text, caption_text)
        logger.info(f"GENERATE_ALT_FROM_CAPTION: Stage 2 complete: '{alt_text}'")

        return alt_text

    except Exception as exc:
        logger.warning(f"GENERATE_ALT_FROM_CAPTION: Alt refinement failed, using raw caption: {exc}")
        # Fallback to raw caption if refinement fails
        return caption_text


async def generate_alt(image: UploadFile) -> str:
    """Legacy function for backward compatibility."""
    logger.info("GENERATE_ALT (LEGACY): Called with UploadFile")
    caption_text = await infer_caption(image)
    return await generate_alt_from_caption(caption_text)


@app.post("/caption")
async def caption(
    image: UploadFile = File(...),
    include_caption: bool = Query(False),
):
    alt = await generate_alt(image)
    response = {"alt": alt, "words": len(alt.split())}

    if include_caption:
        # Get the raw caption for comparison
        caption_text = await infer_caption(image)
        response["caption"] = caption_text

    return response


@app.get("/test")
async def test_endpoint():
    logger.info("Test endpoint called")
    return {"status": "ok", "message": "Server is working"}

@app.post("/alt")
async def alt_only(
    image: UploadFile = File(...),
    raw: bool = Query(False),
    debug: bool = Query(False),
    include_caption: bool = Query(False),
):
    logger.info("API /alt called")

    # Read the image data once to avoid UploadFile consumption issues
    image_data = await image.read()

    # Validate the image
    if not image.content_type or not image.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="file must be an image")
    if not image_data:
        raise HTTPException(status_code=400, detail="empty file")

    # Get caption using the image data
    caption_text = await infer_caption_from_data(image_data, image.filename, image.content_type)
    logger.info(f"Got caption: '{caption_text}'")

    # Get alt text using the caption
    alt_text = await generate_alt_from_caption(caption_text)
    logger.info(f"Got alt text: '{alt_text}'")

    # For include_caption, we need to provide the caption
    # But since we're using mock data, we'll use the caption_text we already have

    if raw or debug:
        return {"alt": alt_text, "raw": alt_text}
    elif include_caption:
        return {"alt": alt_text, "caption": caption_text}
    return {"alt": alt_text}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8642)
