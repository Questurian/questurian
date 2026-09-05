# AI Blog Writer

An intelligent content creation platform that transforms YouTube video transcripts into polished, publication-ready blog articles using AI-powered processing pipelines.


https://github.com/user-attachments/assets/6daf0aa8-c69b-4153-8be1-08ca9479eeb1


## What It Does

AI Blog Writer automates the conversion of YouTube videos into structured, engaging blog posts. Paste a YouTube video URL and the system will:

1. **Clean & Process Transcripts** - Remove ads, intros, and filler content using AI
2. **Classify Content Type** - Automatically determine the best article format (reviews, guides, tutorials, etc.)
3. **Compose Articles** - Generate well-structured articles following editorial guidelines
4. **Generate Titles** - Create compelling, SEO-friendly headlines

The result is professional-quality articles ready for publication, with full provenance tracking and structured data output.

## Key Features

- **URL-First YouTube Flow** - Start runs directly from a YouTube video URL
- **AI-Powered Pipeline** - 4-stage intelligent processing with Google Vertex AI (Gemini)
- **Web Interface** - Clean, modern React frontend for monitoring and managing processing
- **REST API** - Full FastAPI backend for programmatic access
- **Provenance Tracking** - Complete audit trail of AI decisions and transformations
- **Article Type Templates** - 40+ predefined article formats with custom guidelines
- **Export Options** - Markdown articles + structured JSON artifacts

## Technology Stack

<h3>Backend (apps/backend)</h3>
<p>
<img alt="Python" src="https://img.shields.io/badge/Python-3670A0?style=for-the-badge&logo=python&logoColor=ffdd54"/>
<img alt="FastAPI" src="https://img.shields.io/badge/FastAPI-005571?style=for-the-badge&logo=fastapi&logoColor=white"/>
<img alt="SQLite" src="https://img.shields.io/badge/SQLite-07405E?style=for-the-badge&logo=sqlite&logoColor=white"/>
<img alt="Vertex AI" src="https://img.shields.io/badge/Vertex%20AI-4285F4?style=for-the-badge&logo=googlecloud&logoColor=white"/>
</p>

<h3>Frontend (apps/frontend)</h3>
<p>
<img alt="TypeScript" src="https://img.shields.io/badge/typescript-007ACC?style=for-the-badge&logo=typescript&logoColor=white"/>
<img alt="React" src="https://img.shields.io/badge/react-%2320232a.svg?style=for-the-badge&logo=react&logoColor=%2361DAFB"/>
<img alt="CSS" src="https://img.shields.io/badge/css-%231572B6.svg?style=for-the-badge&logo=css&logoColor=white"/>
<img alt="Vite" src="https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white"/>
</p>

## Project Structure

```
apps/
├── backend/           # FastAPI service (Python 3.11)
│   ├── app/
│   │   ├── api/routes.py      # REST endpoints
│   │   ├── pipeline/          # 4-stage AI processing pipeline
│   │   │   ├── orchestrator.py
│   │   │   └── stages/        # Individual pipeline stages
│   │   └── storage/           # File and database operations
│   └── tests/                 # Backend unit tests
└── frontend/          # React SPA (Vite + TanStack Query)
    └── src/           # React components and API client

packages/
├── shared/            # Pydantic models & TypeScript types
└── utils/             # Shared text processing utilities

output/                # Generated articles and artifacts
data/                  # Pipeline stage data and article guidelines
```

## Prerequisites

- **Node.js** 20+
- **Python** 3.11+
- **uv** (recommended for fast Python env/dependency bootstrap)
- **Google Cloud Project** with Vertex AI enabled
- **Docker** + Docker Compose (optional, for full containerized setup)

## Quick Start

### 1. Clone and Install Dependencies

```bash
# Install Node.js dependencies
pnpm install

# Set up Python virtual environment
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
pip install -r apps/backend/requirements.txt -r apps/backend/requirements-dev.txt
```

### 2. Configure Environment

```bash
# Copy environment templates
cp apps/backend/.env.example apps/backend/.env
cp apps/frontend/.env.example apps/frontend/.env

# Edit backend .env with your Google Cloud Project ID
GOOGLE_CLOUD_PROJECT=your-actual-gcp-project-id
```

### 3. Set Up Google Cloud Vertex AI

**Prerequisites:**
- A Google Cloud Project with billing enabled
- Vertex AI API enabled in your project

**Step 1: Enable Vertex AI API**
1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project (or create a new one)
3. Navigate to "APIs & Services" > "Library"
4. Search for "Vertex AI API" and enable it

**Step 2: Authenticate with Google Cloud**

```bash
# Authenticate with your Google account
gcloud auth application-default login

# Set your project (replace with your actual project ID)
gcloud config set project YOUR_PROJECT_ID

# Verify authentication
gcloud auth list
```

**Step 3: Configure Environment Variables**

Ensure your `apps/backend/.env` file contains:
```bash
GOOGLE_CLOUD_PROJECT=your-actual-gcp-project-id
GOOGLE_CLOUD_LOCATION=us-central1
PAYLOAD_API_URL=http://localhost:4000
```

**Additional Resources:**
- [Vertex AI Documentation](https://cloud.google.com/vertex-ai/docs)
- [Enable Vertex AI API](https://console.cloud.google.com/apis/library/aiplatform.googleapis.com)
- [Google Cloud Console](https://console.cloud.google.com/)
- Internal guide: `docs/google-vertex-auth-guide.md`
- API changelog: `docs/api-changelog.md`

### 4. Start Development Servers

```bash
# Start local AI Blog Writer dev services (frontend + backend + converter)
pnpm run dev

# Alias of default local dev (also includes converter)
pnpm run dev:local:full
```

On first run, this command may do a one-time local dependency bootstrap for `node_modules` metadata and Python deps.

Access the application at:
- **Frontend**: http://localhost:3003
- **Backend API**: http://localhost:4003

## Usage

### Web Interface

1. Open http://localhost:3003
2. Paste a YouTube video URL in `youtube2blog`
3. Monitor the 5-stage processing pipeline in real-time
4. Download the generated articles when complete

### API Usage

#### Start From YouTube URL
```bash
curl -X POST http://localhost:4003/youtube2blog/from-url \
  -H "Content-Type: application/json" \
  -d '{"url":"https://www.youtube.com/watch?v=dQw4w9WgXcQ"}'
```

#### Check Processing Status
```bash
curl http://localhost:4003/youtube2blog/status/<run_id>
```

#### Get Results
```bash
# Get JSON response with article and metadata
curl http://localhost:4003/youtube2blog/result/<run_id>

# Get just the markdown article
curl http://localhost:4003/youtube2blog/result/<run_id>?format=md
```

## Pipeline Stages

The AI processing pipeline consists of 5 sequential stages:

### Stage 1: Transcript Cleaning
- Removes ads, sponsorships, and promotional content
- Eliminates intros, outros, and calls-to-action
- Preserves core educational/informational content
- Uses AI to identify and extract relevant material

### Stage 2: Article Type Classification
- Analyzes cleaned transcript content
- Classifies into one of 40+ article types (guides, reviews, tutorials, etc.)
- Uses predefined editorial guidelines for each type
- Provides confidence scoring for classification decisions

### Stage 3: Article Composition
- Retrieves editorial guidelines for the classified article type
- Performs coverage analysis to identify content gaps
- Generates supplemental content for missing sections
- Composes final structured article following professional standards

### Stage 4: Editorial Augmentation
- Applies optional editorial blocks to improve readability and skimmability
- Preserves factual integrity and existing article structure
- Uses parse-friendly editorial block markers compatible with staging tools

### Stage 5: Title Generation
- Creates compelling, SEO-friendly headlines
- Follows title guidelines specific to each article type
- Maintains consistency with original video content
- Optimizes for readability and engagement

## Development

### Available Nx Commands

```bash
# Default local development (no Docker)
pnpm run dev              # Starts backend + frontend + converter via Nx
pnpm run dev:local:full   # Alias of pnpm run dev
pnpm run dev:clean        # Kills ports, reinstalls deps, then starts local dev

# Development servers
pnpm nx serve backend      # FastAPI dev server
pnpm nx serve frontend     # Vite dev server

# Quality checks
pnpm nx lint backend       # Python linting (flake8)
pnpm nx lint frontend      # TypeScript/ESLint

# Testing
pnpm nx test backend       # Run Python tests (pytest)

# Building
pnpm nx build frontend     # Production build
pnpm nx build backend      # Python bytecode compilation
```

### Testing the Pipeline

```bash
# Test individual pipeline stages
curl -X POST http://localhost:4003/youtube2blog/test-stage1

# Test full pipeline with sample data
curl -X POST http://localhost:4003/youtube2blog/test

# Clear database between tests
curl -X POST http://localhost:4003/youtube2blog/clear
```

## Output Formats

Each processed video generates:

- **Markdown Article** (`output/<run_id>.md`) - Publication-ready blog post
- **Structured Artifact** (`output/<run_id>/video_artifact.json`) - Complete processing metadata
- **Stage Data** (`data/runs/<run_id>/`) - Individual pipeline stage outputs for debugging

## Contributing

1. Follow the established code style (Black for Python, Prettier for TypeScript)
2. Add tests for new functionality
3. Update documentation for API changes
4. Use conventional commit messages

## License

This project is private and proprietary.

## Support

For issues or questions:
1. Check the debug endpoint: `GET /debug/<run_id>`
2. Review pipeline stage outputs in `data/runs/<run_id>/`
3. Check backend logs for AI processing details
