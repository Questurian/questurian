"""Every job id this app calls with is one the registry has heard of.

`p2b.section_edit` shipped without being registered. `model_for` raises
`UnknownJob` rather than falling back to a default -- deliberately, because a
typo silently running on some other model is the bug the gateway exists to
remove -- so every post-writing edit raised the moment it reached a real
provider.

1,379 green tests did not catch it. None of them resolves a model: the LLM is a
double everywhere it appears, which is right for testing what the code does
with an answer and useless for testing that the call can be made at all.

So this walks the source instead. It is a cheap check and it is the only one
that would have caught the original.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest
from model_gateway import JOBS_BY_ID

FEATURE = Path(__file__).resolve().parents[1] / "app" / "features" / "prompt2blog"

# `job_id="p2b.something"`, as every call site writes it. A call site building
# its id from a variable is not covered, and there are none.
JOB_ID_CALL = re.compile(r"""job_id\s*=\s*["']([\w.]+)["']""")


def _job_ids_in_source() -> set[str]:
    found: set[str] = set()
    for path in FEATURE.rglob("*.py"):
        found.update(JOB_ID_CALL.findall(path.read_text(encoding="utf-8")))
    return found


def test_the_sweep_finds_the_call_sites_it_is_meant_to():
    """A regex that matched nothing would pass this file silently."""
    found = _job_ids_in_source()
    assert "p2b.compose" in found
    assert "p2b.section_edit" in found
    assert "p2b.edit_review" in found


@pytest.mark.parametrize("job_id", sorted(_job_ids_in_source()))
def test_every_job_id_named_in_source_is_registered(job_id: str):
    assert job_id in JOBS_BY_ID, (
        f"{job_id} is called but not in jobs.json, so it raises UnknownJob "
        "the moment it reaches a real provider."
    )
