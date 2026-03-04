import logging
import os
import time
from typing import Dict, Any

from langchain_core.callbacks.base import BaseCallbackHandler
from langchain_core.prompts import PromptTemplate
from langchain_google_vertexai import VertexAI


class VertexAILoggingHandler(BaseCallbackHandler):
    """Custom handler to log Vertex AI requests and responses."""

    def on_llm_start(self, serialized: Dict[str, Any], prompts: list, **kwargs) -> None:
        logging.info("🔄 Starting Vertex AI request")
        if prompts:
            logging.debug(f"📤 Prompt preview: {prompts[0][:200]}...")

    def on_llm_end(self, response, **kwargs) -> None:
        logging.info("✅ Vertex AI request completed")
        if hasattr(response, 'generations') and response.generations:
            content = response.generations[0][0].text
            logging.debug(f"📥 Response preview: {content[:200]}..." if content else "📥 Empty response")

    def on_llm_error(self, error: Exception, **kwargs) -> None:
        logging.error(f"❌ Vertex AI error: {str(error)}")


class AITranscriptNormalizer:
    """AI-powered transcript normalization using Google Vertex AI."""

    def __init__(self):
        self.logger = logging.getLogger(__name__)

        # Validate environment
        project = os.getenv("GOOGLE_CLOUD_PROJECT")
        if not project:
            raise RuntimeError("GOOGLE_CLOUD_PROJECT environment variable is required")

        # Initialize Vertex AI with logging
        self.llm = VertexAI(
            model_name="gemini-2.5-pro",
            temperature=0.1,
            max_tokens=2000,
            project=project,
            location=os.getenv("GOOGLE_CLOUD_LOCATION", "us-central1"),
            callbacks=[VertexAILoggingHandler()]
        )

        self.prompt = PromptTemplate(
            input_variables=["transcript"],
            template="""Clean this video transcript by:
1. Remove stage directions in brackets like [music], [applause], [laughter]
2. Remove parenthetical notes like (laughter), (silence), (music)
3. Remove filler words and phrases: um, uh, like, you know, so, well, actually
4. Fix obvious transcription errors and typos
5. Remove duplicate or near-duplicate consecutive lines
6. Normalize speaker labels to consistent format (Speaker 1:, Speaker 2:, etc.)
7. Keep the transcript readable and natural while preserving all meaningful content

Return only the cleaned transcript, no explanations or metadata:

{transcript}"""
        )

    @staticmethod
    def _extract_text(response: Any) -> str:
        if isinstance(response, str):
            return response
        content = getattr(response, "content", None)
        if isinstance(content, str):
            return content
        return str(response)

    def normalize(self, text: str) -> str:
        """Normalize transcript using AI with comprehensive logging."""
        start_time = time.time()
        request_id = f"req_{int(start_time)}"

        self.logger.info(f"🤖 AI Normalization Request {request_id}")
        self.logger.info(f"📝 Input length: {len(text)} characters")

        if len(text.strip()) == 0:
            self.logger.warning(f"⚠️  Empty input for request {request_id}")
            return ""

        try:
            # Make the API call
            api_start = time.time()
            self.logger.info("📤 Sending to Vertex AI...")

            prompt = self.prompt.format(transcript=text)
            result = self.llm.invoke(prompt)
            cleaned = self._extract_text(result).strip()

            api_duration = time.time() - api_start

            # Log success metrics
            self.logger.info(f"📥 Received from Vertex AI ({api_duration:.2f}s)")
            self.logger.info(f"✨ Output length: {len(cleaned)} characters")
            self.logger.info(f"📊 Compression ratio: {len(cleaned)/len(text):.1%}")

            # Warn if significant content reduction
            if len(cleaned) < len(text) * 0.3:
                self.logger.warning(f"⚠️  Significant content reduction detected ({len(cleaned)/len(text):.1%})")
                self.logger.debug(f"Input: {text[:100]}...")
                self.logger.debug(f"Output: {cleaned[:100]}...")

            total_duration = time.time() - start_time
            self.logger.info(f"🎯 Request {request_id} completed in {total_duration:.2f}s")

            return cleaned

        except Exception as e:
            total_duration = time.time() - start_time
            self.logger.error(f"💥 Request {request_id} failed after {total_duration:.2f}s: {str(e)}")
            self.logger.error(f"🔍 Failed input preview: {text[:200]}...")
            raise RuntimeError(f"AI normalization failed: {str(e)}") from e
