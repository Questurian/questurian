# Image Alt Text Generator

A FastAPI service that generates alt text/captions for images using vision-language models (VLMs) powered by MLX on Apple Silicon.

## Features

- **Two-Stage Alt Text Generation**: Florence-2 creates descriptive captions, then GPT-2 refines them into SEO-optimized alt text (~6 words)
- **Automatic Captioning**: Generate descriptive alt text for images using Florence-2 models
- **FastAPI Integration**: RESTful API with endpoints for captioning and alt text generation
- **MLX Optimized**: Leverages Apple's MLX framework for efficient inference on Apple Silicon
- **Local AI Models**: Uses free, local models (no API costs or external dependencies)
- **Fallback Support**: Automatic fallback to quantized models if full-precision models fail to load
- **SEO Optimized**: Alt text optimized for search engines with concise, keyword-rich descriptions
- **Configurable**: Environment variables for model selection, prompts, and inference parameters

## Prerequisites

- macOS with Apple Silicon (M1/M2/M3/M4 chips)
- Python 3.8+

## Installation

1. Clone or download this repository
2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

## Usage

### Starting the Server

```bash
python app.py
```

The server will start on `http://localhost:8642` by default.

### API Endpoints

#### POST `/caption`
Returns both the alt text and word count.

**Request:**
- Method: `POST`
- Content-Type: `multipart/form-data`
- Body: `image` (file upload)

**Response:**
```json
{
  "alt": "A descriptive caption of the image",
  "words": 5
}
```

#### POST `/alt`
Returns SEO-optimized alt text with optional raw caption access.

**Request:**
- Method: `POST`
- Content-Type: `multipart/form-data`
- Body: `image` (file upload)
- Query Parameters:
  - `raw` (boolean): Include raw model output
  - `debug` (boolean): Include debug information
  - `include_caption` (boolean): Include the raw descriptive caption alongside the optimized alt text

**Response:**
```json
{
  "alt": "Red athletic running shoes on white background"
}
```

**Response with caption:**
```json
{
  "alt": "Red athletic running shoes on white background",
  "caption": "A pair of red athletic running shoes sitting on a clean white background with good lighting"
}
```

### Configuration

Configure the service using environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `VLM_MODEL` | `microsoft/Florence-2-base-ft` | Vision-language model to use |
| `VLM_PROMPT` | `<CAPTION>` | Prompt template for the model |
| `INFERENCE_TIMEOUT_S` | `20` | Maximum inference time in seconds |
| `VLM_MAX_TOKENS` | `32` | Maximum tokens to generate |
| `VLM_TEMPERATURE` | `0.2` | Sampling temperature |
| `ALT_REFINEMENT_MODEL` | `gpt2` | Text model for alt text refinement (gpt2 or distilgpt2) |
| `ALT_REFINEMENT_PROMPT` | `"Create SEO-optimized alt text (max 6 words): {caption}\nAlt:"` | Prompt template for alt text refinement |
| `ALT_REFINEMENT_MAX_LENGTH` | `20` | Maximum tokens to generate for alt text |
| `ALT_REFINEMENT_TEMPERATURE` | `0.3` | Sampling temperature for alt text generation |

### Supported Models

#### Vision-Language Models (Stage 1)
- `microsoft/Florence-2-base-ft` (with fallback to `mlx-community/Florence-2-base-ft-8bit`)
- `microsoft/Florence-2-large-ft` (with fallback to `mlx-community/Florence-2-large-ft-8bit`)

#### Text Refinement Models (Stage 2)
- `gpt2` (recommended - 117M parameters, good quality)
- `distilgpt2` (faster - 82M parameters, slightly less creative)

## How It Works

The application uses a two-stage AI pipeline:

1. **Stage 1 - Image Understanding**: Florence-2 model analyzes the image and generates a detailed descriptive caption
2. **Stage 2 - Alt Text Optimization**: GPT-2 model takes the descriptive caption and refines it into SEO-optimized alt text (typically 4-6 words)

**Example:**
- Input Image: Photo of red running shoes
- Stage 1: "A pair of bright red athletic running shoes with white laces sitting on a clean white background"
- Stage 2: "Red athletic running shoes on white background"

## Development

The application uses:
- **FastAPI**: Web framework for building APIs
- **MLX-VLM**: Vision-language model inference on Apple Silicon
- **Transformers**: Local text generation models for alt text refinement
- **PIL/Pillow**: Image processing
- **Uvicorn**: ASGI server for FastAPI

