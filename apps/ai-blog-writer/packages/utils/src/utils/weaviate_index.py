import logging
import os
from urllib.parse import urlparse
from typing import List

from shared import TranscriptChunk

try:
    import weaviate
    from weaviate.classes.config import DataType, Property
    from weaviate.classes.query import Filter
except ImportError:  # pragma: no cover
    weaviate = None
    DataType = None
    Property = None
    Filter = None


class WeaviateIndex:
    """Thin wrapper around Weaviate for chunk indexing and hybrid search."""

    def __init__(
        self,
        url: str,
        class_name: str = "TranscriptChunk",
    ) -> None:
        self.url = url
        self.class_name = class_name
        self.vectorizer = (
            os.getenv(
                "WEAVIATE_VECTORIZER_MODULE", "none"
            ).strip()
            or "none"
        )
        self.client = None
        self.available = False
        self._connect()

    def _connect(self) -> None:
        if weaviate is None:
            logging.warning("Weaviate client not installed.")
            return

        parsed = urlparse(self.url)
        host = parsed.hostname or self.url
        http_port = parsed.port or 8080

        if not hasattr(weaviate, "connect_to_local"):
            logging.warning("Weaviate client v4 is required.")
            return
        try:
            self.client = weaviate.connect_to_local(
                host=host,
                port=http_port,
                grpc_port=50051,
            )
            self.available = True
        except Exception as exc:
            logging.warning("Weaviate connection failed: %s", exc)
            self.available = False

    def ensure_schema(self) -> None:
        if not self.available:
            return
        if not hasattr(self.client, "collections"):
            logging.warning("Weaviate client missing collections API.")
            return
        try:
            self.client.collections.get(self.class_name)
            return
        except Exception:
            pass
        if Property is None or DataType is None:
            logging.warning("Weaviate config classes not available.")
            return
        self.client.collections.create(
            name=self.class_name,
            properties=[
                Property(name="run_id", data_type=DataType.TEXT),
                Property(name="chunk_id", data_type=DataType.TEXT),
                Property(name="text", data_type=DataType.TEXT),
                Property(name="start_char", data_type=DataType.INT),
                Property(name="end_char", data_type=DataType.INT),
            ],
        )

    def index_chunks(self, run_id: str, chunks: List[TranscriptChunk]) -> None:
        if not self.available:
            return
        self.ensure_schema()
        if not hasattr(self.client, "collections"):
            return
        collection = self.client.collections.get(self.class_name)
        with collection.batch.fixed_size(batch_size=25) as batch:
            for chunk in chunks:
                batch.add_object(
                    properties={
                        "run_id": run_id,
                        "chunk_id": chunk.chunk_id,
                        "text": chunk.text,
                        "start_char": chunk.start_char,
                        "end_char": chunk.end_char,
                    }
                )

    def delete_by_run_id(self, run_id: str) -> None:
        """Delete all chunks for a given run_id."""
        if not self.available:
            return
        if not hasattr(self.client, "collections"):
            return
        if Filter is None:
            return
        try:
            collection = self.client.collections.get(self.class_name)
            collection.data.delete_many(
                where=Filter.by_property("run_id").equal(run_id)
            )
        except Exception as exc:
            logging.warning("Weaviate delete failed: %s", exc)

    def hybrid_search(self, query: str, limit: int = 5) -> List[dict]:
        if not self.available:
            return []
        try:
            self.ensure_schema()
        except Exception as exc:
            logging.warning("Weaviate schema check failed: %s", exc)
            return []
        try:
            use_hybrid = self.vectorizer.lower() != "none"
            if not hasattr(self.client, "collections"):
                return []
            collection = self.client.collections.get(self.class_name)
            if use_hybrid:
                results = collection.query.hybrid(
                    query=query, limit=limit
                )
            else:
                try:
                    results = collection.query.bm25(
                        query=query,
                        limit=limit,
                        query_properties=["text"],
                    )
                except TypeError:
                    results = collection.query.bm25(query=query, limit=limit)
            return [item.properties for item in results.objects]
        except Exception as exc:
            logging.warning("Weaviate query failed: %s", exc)
            return []
        return []
