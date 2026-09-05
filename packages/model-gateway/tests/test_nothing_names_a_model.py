"""The guard that keeps this from happening again.

The repo reached its previous state one reasonable commit at a time. Nobody
decided to spread a model decision across 22 files and three rate tables; each
addition was small, local and sensible, and the sum was a sweep that had to
touch every one of them and still missed a whole service for days.

So this fails when a file outside the allow-list below names a model or
reaches a provider directly. It is the feature, not the tidying: without it
the gateway decays back into scattered constants within months.

Two things it deliberately does not do:

* It does not read the allow-list as permission. Every entry names why it is
  there, and an entry whose reason has stopped being true is a bug even while
  the test is green.
* It does not scan for what a model call *looks like*. It scans for the four
  provider entry points by name and for model strings by shape, which is
  crude, catches the mistake people actually make, and stays readable.
"""

from __future__ import annotations

import re
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]

# Where code that may make a model call lives. Everything else in the repo is
# out of scope -- Questura calls no models at all.
SEARCH_ROOTS = (
    "apps/ai-blog-writer/apps/backend/app",
    "apps/ai-blog-writer/apps/frontend/src",
    "apps/ai-blog-writer/packages/utils/src",
    "apps/location-manager/packages/python-alt-text",
    "apps/location-manager/packages/server/src",
    "apps/dashboard/src",
    "packages/model-gateway/src",
)

SOURCE_SUFFIXES = {".py", ".ts", ".tsx"}

SKIP_DIRECTORIES = {
    ".venv", "venv", "node_modules", "__pycache__", ".git", "dist", "build",
    ".nx", ".cache", ".pnpm-store", "migrations",
}

# A model name, as it appears when somebody writes one down.
MODEL_NAME = re.compile(r"['\"]gemini-[0-9]")

# The ways this repo reaches a provider. Each was called directly from feature
# code before this work; each is now the gateway's to call.
#
# Matched as a call or an import rather than as a mention, because these names
# appear in prose all over the codebase -- explaining what routes where is most
# of what the comments in this area do, and a guard that flagged an
# explanation would be trained away within a week.
PROVIDER_NAMES = (
    "get_vertex_llm",
    "invoke_google_grounded_text",
    "invoke_vertex_multimodal_text",
    "invoke_structured_tool",
    "get_vertex_generative_model",
)

PROVIDER_USE = re.compile(
    r"(?:^|[^\w.])(?:" + "|".join(PROVIDER_NAMES) + r")\s*\("
    r"|^\s*(?:from|import)\s+.*\b(?:" + "|".join(PROVIDER_NAMES) + r")\b"
    r"|\bvertexai\.generative_models\b"
    r"|^\s*from\s+vertexai(?:\.\w+)*\s+import\b",
    re.M,
)


def _allowed(reason: str, *paths: str) -> dict[str, str]:
    return {path: reason for path in paths}


# Every exemption, and why. A reason that has stopped being true is a bug even
# while this test is green.
ALLOWED: dict[str, str] = {
    **_allowed(
        "The gateway itself. This is the one place a model decision lives.",
        "packages/model-gateway/src/model_gateway/jobs.py",
        "packages/model-gateway/src/model_gateway/rates.py",
        "packages/model-gateway/src/model_gateway/settings.py",
        "packages/model-gateway/src/model_gateway/substitution.py",
        "packages/model-gateway/src/model_gateway/usage.py",
        "packages/model-gateway/src/model_gateway/vertex.py",
    ),
    **_allowed(
        "The single seam through which ai-blog-writer performs a call. Its "
        "whole job is to reach a provider, and nothing else in that backend "
        "may.",
        "apps/ai-blog-writer/apps/backend/app/shared/model_calls.py",
    ),
    **_allowed(
        "The LLM factory and its policy. These *are* the provider transport "
        "that the gateway calls; the model names left here are the last-resort "
        "default and the Gemini-3 endpoint rule, not a job's model.",
        "apps/ai-blog-writer/packages/utils/src/utils/llm_client.py",
        "apps/ai-blog-writer/packages/utils/src/utils/llm_model_policy.py",
        "apps/ai-blog-writer/packages/utils/src/utils/google_grounding.py",
        "apps/ai-blog-writer/packages/utils/src/utils/vertex_multimodal.py",
        "apps/ai-blog-writer/packages/utils/src/utils/gemini_tools.py",
        "apps/ai-blog-writer/packages/utils/src/utils/__init__.py",
    ),
    **_allowed(
        "The operator's model catalogue. A person choosing a model from a "
        "dropdown is the one case where naming one is the point, and that "
        "choice still wins over the gateway's default.",
        "apps/ai-blog-writer/apps/frontend/src/shared/api/ai/models.ts",
        "apps/ai-blog-writer/apps/frontend/src/features/prompt2blog/constants/prompt2blog.constants.ts",
        "apps/ai-blog-writer/apps/frontend/src/features/prompt2blog/constants/prompt2blog-pricing.ts",
        "apps/ai-blog-writer/apps/frontend/src/features/prompt2blog/types/pipeline.types.ts",
        "apps/ai-blog-writer/apps/frontend/src/features/itinerariesPipeline/constants/titleModel.constants.ts",
        "apps/ai-blog-writer/apps/frontend/src/features/staging/features/editorial-stage-article/constants.ts",
    ),
    **_allowed(
        "The transport beneath the seam. `model_calls` delegates to these; "
        "they are what actually reaches a provider, and nothing above them "
        "may.",
        "apps/ai-blog-writer/apps/backend/app/shared/writer_invocation.py",
        "apps/ai-blog-writer/apps/backend/app/features/prompt2blog/llm.py",
        "apps/ai-blog-writer/packages/utils/src/utils/claude_cli_llm.py",
    ),
    **_allowed(
        "The operator's model allowlist, backend side. Being on this list is "
        "permission to ask for a name, not a claim about which transport "
        "answers -- and an operator's choice still wins over the gateway.",
        "apps/ai-blog-writer/apps/backend/app/shared/writer_models.py",
    ),
    **_allowed(
        "Initialises Vertex for the alt-text service at startup, so it can "
        "warn when the project is unconfigured before any request arrives.",
        "apps/location-manager/packages/python-alt-text/vertex_runtime.py",
    ),
    **_allowed(
        "Prices stored runs. A rate table has to name the models it prices, "
        "including ones nothing calls any more.",
        "apps/ai-blog-writer/apps/backend/app/features/prompt2blog/pricing.py",
        "apps/ai-blog-writer/apps/backend/app/shared/token_usage.py",
    ),
}


def source_files() -> list[Path]:
    found: list[Path] = []
    for root in SEARCH_ROOTS:
        base = REPO_ROOT / root
        if not base.exists():
            continue
        for path in base.rglob("*"):
            if path.suffix not in SOURCE_SUFFIXES or not path.is_file():
                continue
            if any(part in SKIP_DIRECTORIES for part in path.parts):
                continue
            found.append(path)
    return found


def relative(path: Path) -> str:
    return str(path.relative_to(REPO_ROOT))


def is_test(path: Path) -> bool:
    """Tests may name models: a double has to pretend to be something."""
    name = path.name
    return (
        name.startswith("test_")
        or ".test." in name
        or ".drift." in name
        or "tests" in path.parts
        or "__tests__" in path.parts
    )


class TheGuardItself(unittest.TestCase):
    def test_it_is_actually_reading_the_repo(self):
        # A walk that silently found nothing would make every assertion below
        # pass without checking anything.
        files = source_files()
        self.assertGreater(len(files), 500, "the source walk found almost nothing")

    def test_it_covers_both_apps_that_call_models(self):
        # The app most likely to be treated as an afterthought is the one this
        # whole piece of work exists for.
        paths = {relative(path) for path in source_files()}
        self.assertTrue(
            any(p.startswith("apps/location-manager/packages/python-alt-text") for p in paths)
        )
        self.assertTrue(
            any(p.startswith("apps/ai-blog-writer/apps/backend/app") for p in paths)
        )

    def test_every_exemption_still_points_at_a_file(self):
        # An allow-list entry for a file that has moved is an exemption
        # nobody is watching.
        for path in ALLOWED:
            self.assertTrue((REPO_ROOT / path).exists(), f"{path} no longer exists")

    def test_every_exemption_says_why(self):
        for path, reason in ALLOWED.items():
            self.assertGreater(len(reason), 40, f"{path} has no real reason")


class NothingOutsideTheGatewayNamesAModel(unittest.TestCase):
    def test_no_hardcoded_model_names(self):
        offenders: list[str] = []
        for path in source_files():
            rel = relative(path)
            if rel in ALLOWED or is_test(path):
                continue
            for number, line in enumerate(
                path.read_text(encoding="utf-8", errors="ignore").splitlines(), 1
            ):
                stripped = line.strip()
                # A model named in a comment is documentation, not a decision.
                if stripped.startswith(("#", "//", "*", "/*")):
                    continue
                if MODEL_NAME.search(line):
                    offenders.append(f"{rel}:{number}: {stripped[:90]}")

        self.assertEqual(
            offenders,
            [],
            "\n\nThese name a model. Name a job instead -- see "
            "packages/model-gateway/src/model_gateway/jobs.json -- or add the "
            "file to ALLOWED with a reason:\n  " + "\n  ".join(offenders),
        )

    def test_no_direct_calls_to_a_provider(self):
        offenders: list[str] = []
        for path in source_files():
            rel = relative(path)
            if rel in ALLOWED or is_test(path):
                continue
            text = path.read_text(encoding="utf-8", errors="ignore")
            for number, line in enumerate(text.splitlines(), 1):
                stripped = line.strip()
                if stripped.startswith(("#", "//", "*", "/*")):
                    continue
                if PROVIDER_USE.search(line):
                    offenders.append(f"{rel}:{number}: {stripped[:90]}")

        self.assertEqual(
            offenders,
            [],
            "\n\nThese reach a provider directly. Go through the gateway "
            "(`model_gateway.vertex`) or, in ai-blog-writer, through "
            "`app/shared/model_calls.py`:\n  " + "\n  ".join(offenders),
        )


class TheRegistryIsTheOnlyPlaceAJobIsDefined(unittest.TestCase):
    def test_every_job_a_call_site_names_exists(self):
        """A job id typed at a call site must be one the registry knows.

        `job()` raises on an unknown id, but only when that line runs. This
        catches a typo in a rarely-taken branch without having to take it.
        """
        from model_gateway import JOBS_BY_ID

        named = re.compile(r"""job_id\s*[=:]\s*["']([a-z0-9_.]+)["']""")
        unknown: list[str] = []
        for path in source_files():
            if is_test(path):
                continue
            for number, line in enumerate(
                path.read_text(encoding="utf-8", errors="ignore").splitlines(), 1
            ):
                for job_id in named.findall(line):
                    if job_id not in JOBS_BY_ID:
                        unknown.append(f"{relative(path)}:{number}: {job_id}")

        self.assertEqual(unknown, [], "\n  ".join(unknown))


if __name__ == "__main__":
    unittest.main()


class TheGuardCatchesWhatItClaimsTo(unittest.TestCase):
    """A guard nobody has watched fail is a guard nobody should trust.

    These exercise the matchers directly, on the shapes the mistake actually
    takes, so a regex that quietly stops matching is caught here rather than
    six months later by a sweep.
    """

    def test_it_matches_a_model_named_at_a_call_site(self):
        for line in (
            'DEFAULT_MODEL = "gemini-2.5-flash"',
            "    model_name='gemini-2.5-pro',",
            '  { value: "gemini-3.1-flash-lite", label: "cheap" },',
        ):
            self.assertTrue(MODEL_NAME.search(line), line)

    def test_it_leaves_alone_what_is_not_a_model_name(self):
        for line in (
            'JOB = "p2b.compose"',
            "# gemini-2.5-flash is what this runs on today",
            'endpoint = "generateContent"',
            'family = "gemini"',
        ):
            self.assertIsNone(MODEL_NAME.search(line), line)

    def test_it_matches_a_provider_reached_directly(self):
        for line in (
            "    llm = get_vertex_llm(temperature=0.1)",
            "    result = invoke_google_grounded_text(prompt, model_name=x)",
            "from utils import invoke_vertex_multimodal_text",
            "from vertexai.generative_models import GenerativeModel",
            "    from vertexai import init",
            "        payload = invoke_structured_tool(prompt=p)",
        ):
            self.assertTrue(PROVIDER_USE.search(line), line)

    def test_it_leaves_alone_a_provider_merely_described(self):
        # Explaining what routes where is most of what the comments in this
        # area do. A guard that flagged an explanation gets trained away.
        for line in (
            "    ``get_vertex_llm`` picks a provider per call from the model name",
            "# Names route via the existing dispatch in utils.get_vertex_llm.",
            "    name falls back to Vertex (see ``model_calls.writer_text``).",
            "    return writer_text(job_id, prompt=prompt)",
        ):
            self.assertIsNone(PROVIDER_USE.search(line), line)

    def test_a_job_id_that_does_not_exist_would_be_caught(self):
        from model_gateway import JOBS_BY_ID

        named = re.compile(r"""job_id\s*[=:]\s*["']([a-z0-9_.]+)["']""")
        self.assertEqual(named.findall('job_id="p2b.invented",'), ["p2b.invented"])
        self.assertNotIn("p2b.invented", JOBS_BY_ID)
