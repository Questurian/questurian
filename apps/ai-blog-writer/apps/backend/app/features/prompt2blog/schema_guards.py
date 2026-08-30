"""Making a schema demand what the code demands.

`required` in JSON Schema means the key is present. It does not mean the value
is useful: an empty string satisfies it completely.

That gap has now broken two live runs in the same afternoon. The grill returned
`{"done": false}` with no question and the code died; the brief returned
`primary_reader: ""` and Pydantic -- which does insist on a real value -- threw
a validation error at the operator mid-flow.

Both times the model was obeying the schema it was given. The schema was the
thing that was wrong, and it was wrong in the same way in four places, so this
fixes the shape rather than the instances.

Applied at definition, so a schema written later gets it without anyone
remembering to.
"""

from __future__ import annotations

from typing import Any


def require_non_empty(schema: dict[str, Any]) -> dict[str, Any]:
    """Give every required string in ``schema`` a minimum length of one.

    Recurses into nested objects and array items. Leaves an already-declared
    `minLength` alone, so a field that wants a longer floor keeps it.
    """
    _harden(schema)
    return schema


def _harden(node: Any, required: frozenset[str] = frozenset()) -> None:
    if not isinstance(node, dict):
        return

    properties = node.get("properties")
    own_required = frozenset(node.get("required") or ())
    if isinstance(properties, dict):
        for name, spec in properties.items():
            if not isinstance(spec, dict):
                continue
            if spec.get("type") == "string" and name in own_required:
                spec.setdefault("minLength", 1)
            _harden(spec, own_required)

    items = node.get("items")
    if isinstance(items, dict):
        _harden(items)
