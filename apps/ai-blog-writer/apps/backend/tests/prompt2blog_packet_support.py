"""One place for tests to say what a run was written from.

`prepare_v3_runtime_request` requires a selection, because the arrangement
where leaving one out means "use every fact" is exactly the silent widening
the writing packet exists to prevent. Tests about compose, the outline, the
audit, resume or the graph are not about that decision, so they say "take the
dossier's own flags, on purpose" here in one line and get a real packet. A
fixture that marks nothing keeps everything, which is what most of them want.

A test that IS about the cut builds its own selection and does not use this.
"""

from __future__ import annotations

from app.features.prompt2blog.contracts_v4 import Prompt2BlogV4Request
from app.features.prompt2blog.editorial_catalog import EditorialCatalog
from app.features.prompt2blog.intake_v3 import prepare_v3_runtime_request
from app.features.prompt2blog.models import PipelineV4RuntimeRequest
from app.features.prompt2blog.packet_v4 import WritingPacket, build_packet
from app.features.prompt2blog.selection_v4 import Selection, selection_from_flags

FIXTURE_NOTE = "Test fixture: the dossier's own flags, chosen deliberately."


def keep_everything(
    request: Prompt2BlogV4Request, *, target_word_count: int = 900
) -> Selection:
    return selection_from_flags(
        request.brief,
        request.work_order,
        request.evidence_package,
        target_word_count=target_word_count,
        note=FIXTURE_NOTE,
    )


def packet_for(
    request: Prompt2BlogV4Request, *, target_word_count: int = 900
) -> WritingPacket:
    return build_packet(
        request.brief,
        request.work_order,
        request.evidence_package,
        keep_everything(request, target_word_count=target_word_count),
    )


def runtime_for(
    request: Prompt2BlogV4Request,
    *,
    catalog: EditorialCatalog | None = None,
    target_word_count: int = 900,
) -> PipelineV4RuntimeRequest:
    return prepare_v3_runtime_request(
        request,
        keep_everything(request, target_word_count=target_word_count),
        catalog=catalog,
    )
