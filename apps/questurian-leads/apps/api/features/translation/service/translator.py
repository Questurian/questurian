import os
from typing import Optional, Dict, Tuple
from dotenv import load_dotenv
import requests

load_dotenv()


class TranslationService:
    """Service for translating text using LibreTranslate API."""

    def __init__(self, host: str = None):
        """Initialize with LibreTranslate host URL."""
        self.host = host or os.getenv("LIBRETRANSLATE_URL", "http://localhost:5001")
        self.api_key = os.getenv("LIBRETRANSLATE_API_KEY")

    def detect_language(self, text: str) -> Optional[str]:
        """Detect language of text. Returns language code or None."""
        if not text or not text.strip():
            return None

        try:
            payload = {"q": text}
            if self.api_key:
                payload["api_key"] = self.api_key

            response = requests.post(f"{self.host}/detect", json=payload)
            response.raise_for_status()
            result = response.json()
            # Result format: [{"confidence": 0.99, "language": "en"}]
            if result and len(result) > 0:
                return result[0].get("language")
        except Exception as e:
            print(f"Language detection error: {e}")
            return None

    def translate_text(self, text: str, source: str = "auto", target: str = "en") -> Tuple[Optional[str], str]:
        """
        Translate text to target language.

        Returns:
            Tuple of (translated_text, status)
            status: "translated", "already_english", "error", "empty"
        """
        if not text or not text.strip():
            return None, "empty"

        # Only detect language if source is "auto" (not explicitly provided)
        if source == "auto":
            detected_lang = self.detect_language(text)
            if detected_lang == "en":
                return text, "already_english"
        else:
            # If explicit source language is provided and it's English, skip translation
            if source == "en":
                return text, "already_english"

        try:
            payload = {
                "q": text,
                "source": source,
                "target": target,
                "format": "text"
            }
            if self.api_key:
                payload["api_key"] = self.api_key

            response = requests.post(f"{self.host}/translate", json=payload)
            response.raise_for_status()
            result = response.json()
            translated = result.get("translatedText", text)
            return translated, "translated"
        except Exception as e:
            print(f"Translation error: {e}")
            return None, "error"

    def translate_batch(self, texts: list[str], source: str = "auto", target: str = "en") -> list[Dict]:
        """
        Translate multiple texts efficiently.

        Returns:
            List of dicts with keys: original, translated, detected_language, status
        """
        results = []
        for text in texts:
            if not text or not text.strip():
                results.append({
                    "original": text,
                    "translated": None,
                    "detected_language": None,
                    "status": "empty"
                })
                continue

            detected_lang = self.detect_language(text)

            if detected_lang == "en":
                results.append({
                    "original": text,
                    "translated": text,
                    "detected_language": "en",
                    "status": "already_english"
                })
                continue

            translated, status = self.translate_text(text, source=source, target=target)
            results.append({
                "original": text,
                "translated": translated,
                "detected_language": detected_lang,
                "status": status
            })

        return results


# Singleton instance
_translator_instance = None


def get_translator() -> TranslationService:
    """Get or create translator singleton."""
    global _translator_instance
    if _translator_instance is None:
        _translator_instance = TranslationService()
    return _translator_instance
