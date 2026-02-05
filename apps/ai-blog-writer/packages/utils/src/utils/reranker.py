import re
from typing import List


class CrossEncoderReranker:
    """Lightweight reranker without external model dependencies."""

    def __init__(self, model_name: str = "local") -> None:
        self.model_name = model_name

    def rerank(
        self, query: str, docs: List[dict], top_k: int = 5
    ) -> List[dict]:
        if not docs:
            return []
        query_terms = re.findall(r"[a-z0-9]+", query.lower())
        if not query_terms:
            return sorted(
                docs,
                key=lambda doc: len(doc.get("text", "")),
                reverse=True,
            )[:top_k]

        def score(doc: dict) -> tuple[int, int]:
            text = doc.get("text", "").lower()
            hits = sum(1 for term in query_terms if term in text)
            return hits, len(text)

        return sorted(docs, key=score, reverse=True)[:top_k]
