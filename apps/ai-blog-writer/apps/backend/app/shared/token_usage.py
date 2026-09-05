"""What a provider says it used, and what Google charges for it.

The numbers and the counting both moved to ``packages/model-gateway``. This
module is the name ai-blog-writer already imports them under, kept so that
moving them did not have to be one commit with the migration of every call
site that reads them.

Why they moved: there were three copies of the rate table -- this one, the
dashboard's published card, and a third labelling a button in the Prompt2Blog
UI. The 3.x-to-2.5 sweep left one holding 3.x prices under 2.5 names, quoting
$2.00 per million for a model that costs $1.25, and nothing caught it because
nothing compared them. There is now one table, ``rates.json`` in the gateway,
read by the Python that prices a call and by the TypeScript that publishes it.

The counting moved with it for the same reason. A second copy of
``normalize_token_usage`` was written once for the usage monitor and got two
things wrong that the original gets right: it read ``output_tokens`` without
folding in the thinking tokens LangChain files separately, and Anthropic's
``input_tokens`` without the cache figures beside it. Both undercount,
silently, in the direction of "cheaper than it was".

New code should import from ``model_gateway`` directly. Nothing here adds
anything.
"""

from __future__ import annotations

from model_gateway.rates import ModelRate as VertexTokenRate
from model_gateway.rates import MODEL_RATES as VERTEX_TOKEN_RATES
from model_gateway.rates import estimated_cost as estimated_vertex_cost
from model_gateway.tokens import (
    normalize_token_usage,
    token_count,
    usage_value,
)

__all__ = [
    "VertexTokenRate",
    "VERTEX_TOKEN_RATES",
    "estimated_vertex_cost",
    "normalize_token_usage",
    "token_count",
    "usage_value",
]
