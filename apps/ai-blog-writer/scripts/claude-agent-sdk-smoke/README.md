# Claude Agent SDK subscription smoke test

Phase-1 proof that this machine can reach Claude through the **Claude Agent SDK**
using the owner's **Claude Pro subscription login**, not an Anthropic API key.

Nothing here is wired into the blog-writing pipeline. It is standalone on purpose.

## Run it

From `apps/ai-blog-writer`:

```bash
pnpm smoke:claude
```

Or directly:

```bash
sh apps/ai-blog-writer/scripts/claude-agent-sdk-smoke/run.sh
```

Expected tail:

```
model reply: 'CLAUDE_SUBSCRIPTION_OK'
result subtype: success
PASS: subscription-authenticated Agent SDK round trip succeeded
```

## Auth

Credentials come from the normal Claude Code browser login (`claude auth login`),
stored in the macOS Keychain. This repo never reads, copies, or stores the token.

Check which credential is active:

```bash
claude auth status
```

A subscription session reports `"authMethod": "claude.ai"` and
`"apiProvider": "firstParty"`.

`ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, `CLAUDE_CODE_OAUTH_TOKEN`, the cloud
provider flags, and `ANTHROPIC_PROFILE` all outrank the subscription login
(<https://code.claude.com/docs/en/authentication#authentication-precedence>).
`smoke_test.py` aborts with exit code 2 if any of them is set, so the test can
never quietly fall through to separately billed API usage.

## Why its own virtualenv

`claude-agent-sdk` pulls in `mcp`, which upgrades `starlette` and `uvicorn` past
the versions FastAPI 0.111 is pinned against. Installing it into the shared
`apps/ai-blog-writer/.venv` breaks the backend, so this test keeps a private
`.venv` here (gitignored) built from the local `requirements.txt`.

## Isolation

The agent runs with an empty `allowed_tools` list plus an explicit deny-list, no
MCP servers, `setting_sources=[]` (no repo `CLAUDE.md`, settings, or skills), and
`max_turns=1`. It can only produce text.

## Limits worth knowing

**The dollar credit does not exist.** Anthropic *paused* the credit plan on
2026-06-15. The announced Pro $20 / Max5x $100 / Max20x $200 credits are "not
currently in effect", and `claude -p` usage today draws from the subscription's
own usage limits — the same pool as Claude.ai and interactive Claude Code.
See <https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan>.

Three consequences, all of which shaped what got built:

- **There is no dollar balance to track**, and no CLI subcommand exposes one.
  A budget guard against a monthly credit would have been guarding a number
  that is not there.
- **`total_cost_usd` is a notional API-equivalent figure.** It is real, per
  call, and worth comparing between stacks. It is not money leaving an account.
  Anything that shows it has to say so.
- **Overflow to API rates is strictly opt-in.** It goes through "usage credits"
  which a person enables in Settings → Usage; the docs are explicit that "all
  transitions to API credit usage require explicit user consent". With that
  never enabled, a surprise charge is not possible.

### What hitting a limit actually does

It refuses, and it reports `$0.00`. It does not silently bill. That was the
open question the earlier round could not answer without spending the credit to
find out; asking for a model this plan cannot serve answered it.

The shape of that refusal is the dangerous part — see below.

Subscription OAuth is for the plan holder's own use. Anthropic does not permit
routing other people's requests through Pro/Max credentials, or collecting or
intermediating Claude session tokens
(<https://code.claude.com/docs/en/legal-and-compliance>). A shared staff
deployment needs per-person seats or a company API key — decided separately.

## Seeing this from the app

`GET /claude/status` on the backend reports the same login state this test
depends on, and the AI Blog Writer nav carries a Claude light beside the Payload
one that reads it. **Settings → Claude Connection** (`/settings/claude`) shows
the account, the plan, and what to do when the light is not green.

The endpoint reads status, never credentials: it copies an allow-list of fields
out of `claude auth status` and has no path to the token, which stays in the
Keychain where Claude Code puts it. It reports the same API-billed variables
this test aborts on (`API_BILLED_VARS` above) as a degraded state rather than a
green light, and it also believes the CLI's own `apiKeySource` field, which
catches a key reaching the CLI by a route this backend's environment does not
show — an `apiKeyHelper`, a settings file, a shell profile.

The page's **Sign in to Claude** button opens a terminal on the host running
`claude auth login --claudeai`. It is offered only to a browser on that host,
because the sign-in signs in *the machine*, not whoever clicked — a shared
deployment where one person's click re-points everyone's Claude session is the
arrangement Anthropic's terms rule out. Everywhere else the page shows the
command to run by hand. See `apps/backend/.env.example` for `ABW_CLAUDE_CLI` and
`ABW_ENABLE_CLAUDE_LOGIN`.

## Using the subscription as a writer backend

`WRITER_PROVIDER=claude-cli` points the pipeline's writing calls at this same
subscription login. The transport is
`apps/backend/app/features/claude_connection/cli_writer.py`, behind the existing
`WriterResult` / `StructuredWriterResult` contract, so it is a third provider
beside Vertex and the Anthropic API rather than a replacement for either. Unset
— the default — changes nothing.

It is the CLI and not the Agent SDK for the dependency reason above: installing
`claude-agent-sdk` into the backend virtualenv drags `starlette` and `uvicorn`
past FastAPI 0.111's pin. Measured against the real thing, the CLI gives up
nothing that mattered.

### `--json-schema` is a real forced-tool equivalent

This was the open risk, and it is closed. `claude --print --json-schema <schema>`
returns a top-level `structured_output` field that is **already a parsed
object**, and the reply carries `stop_reason: "tool_use"`. Read
`structured_output`, not `result`: both hold the same JSON, but `result` is a
string the model wrote and `structured_output` is what the CLI validated.

Verified against the pipeline's own `SEO_PATCH_INPUT_SCHEMA` and a harder nested
schema. It honours `required`, `enum`, `minItems`/`maxItems`, integer types, and
`additionalProperties: false` — including refusing to add an extra field when the
prompt explicitly asked it to. Optional fields are correctly omitted rather than
filled with empties.

Failures are loud, not silent: a malformed schema or an unknown `--resume` id
exits non-zero with empty stdout and the reason on stderr.

### Cost: a stable prefix is the whole game

| | cache created | cache read | cost |
|---|---|---|---|
| Default system prompt | ~18.0k | 0 | ~$0.039 |
| Small `--system-prompt` | ~11.5k | 0 | ~$0.028 |
| Second call, same prompt + schema | ~2.7k | ~8.7k | ~$0.010 |
| Continuing via `--resume` | ~0.6k | ~11.5k | ~$0.005 |

The earlier read of this — that continuing a session is ~12× cheaper than
starting one, so per-stage one-shot calls pay a cold start every time — was only
true of the CLI's *default* system prompt. With a fixed `--system-prompt` and a
fixed schema, independent calls warm their own prefix and the gap narrows to
about 2×. So the pipeline does **not** need session threading, which would
otherwise couple a stage to a conversation and leak one stage's context into the
next.

The prefix is only cheap while it is byte-identical, which is why
`cli_writer.SYSTEM_PROMPT` is a module constant and stage-specific instructions
go in the prompt body. There is a test pinning that.

### A refusal arrives shaped like a successful answer

This is the one finding that changes what a caller has to do. Asking for a
model the plan cannot serve returns:

```json
{
  "is_error": true,
  "subtype": "success",
  "terminal_reason": "api_error",
  "total_cost_usd": 0,
  "result": "You've hit your monthly spend limit. Switch to another model, or
             manage usage credits at claude.ai/settings/usage... to continue."
}
```

`subtype` reads `"success"` and the apology sits in `result`. **Anything that
trusts `subtype` and reads `result` publishes that sentence as article prose.**

`cli_writer._assert_claude_actually_answered` is the guard, at the one
chokepoint both call shapes go through. It is three checks, and `subtype` is
not one of them:

- `is_error` — the flag actually set on the observed refusal.
- **a deny list** of `terminal_reason` values (`api_error`,
  `budget_exhausted`, `max_turns`, `refusal`, …). A deny list rather than an
  allow list, so a benign new value on a CLI version bump does not take the
  pipeline down.
- **a reported zero generated tokens** — the check that does not depend on
  guessing which flags a future refusal will carry. If the model wrote nothing,
  whatever is in `result` came from the harness. Absent usage is not treated as
  zero, so a CLI that stops reporting it does not break every call.

### There is no output-length flag

The CLI has no `--max-tokens` or equivalent. Claude uses its own default (32k
output observed on Haiku). The pipeline's stages ask for ~6144 and the shared
floor in `_resolve_generation_max_tokens` already widens that to 64k, so the
CLI's default is roomier than anything being asked for. Nothing is being
silently truncated — there is just no setting, and this is written down so
nobody goes looking for one.

`--max-budget-usd` does exist and works (`terminal_reason: "budget_exhausted"`),
but it is **per invocation, not cumulative**, so it is not a spend rail for a
pipeline that makes many calls per article. It is not wired up.

### Two things that cost time

- **Close stdin.** The CLI waits ~3s for piped input that is never coming, even
  when the prompt arrived as an argument, then warns about it on stderr. Under a
  server that inherited stdin from its parent, that is ~3.7s of pure latency on
  every call. `stdin=subprocess.DEVNULL` — now set on every CLI call here.
- **Never use `--bare`.** It looks like the right flag for an isolated call, but
  its auth is "strictly `ANTHROPIC_API_KEY` or `apiKeyHelper`; OAuth and keychain
  are never read". It would move the spend straight off the subscription — the
  exact failure the status light exists to catch.

### The spending guard

`cli_writer` refuses to send unless `GET /claude/status` is green, the same guard
the test bench uses. The state it is really guarding is `api_billed_override`:
Claude answers normally, so nothing looks wrong, while every stage of every run
quietly bills API credit instead of the subscription. It matters more here than
on the bench because the pipeline makes many calls per article.

Local authoring only, for the licensing reason above. Do not set
`WRITER_PROVIDER=claude-cli` on the Linux laptop or any shared deployment.

## Claude on the Prompt2Blog writer role

`WRITER_PROVIDER` never reached Prompt2Blog. It only diverts calls routed
through `app/shared/writer_invocation.py` — editor_assist and
itineraries_pipeline — and Prompt2Blog calls `utils.get_vertex_llm` directly.
The pipeline is wired through that factory instead, on its own switch.

### The switch

`CLAUDE_SUBSCRIPTION_MODELS_ENABLED=1` on the backend. It is **not**
`ANTHROPIC_MODELS_ENABLED`, and the two must not be conflated — they differ in
who pays:

| switch | transport | pays with |
|---|---|---|
| `ANTHROPIC_MODELS_ENABLED` | Anthropic API, needs `ANTHROPIC_API_KEY` | Console credit — unfunded |
| `CLAUDE_SUBSCRIPTION_MODELS_ENABLED` | the Claude Code CLI on this machine | the plan holder's own allowance |

Both default to off, in which case `claude-*` names are substituted to Google
exactly as before. When both are on, the API-key path wins, so switching the
new one on cannot re-point a machine that was already funded. Ask
`utils.claude_provider()` rather than re-reading the environment.

`.env` edits need a **full process restart**, not `uvicorn --reload` — the
parent already imported `main.py` and every reloaded child inherits its
environment.

### What Claude does and does not do

Claude writes. Gemini keeps research and audit. Six run stacks, a 2×3 grid of
two writers across three research-and-audit tiers, so comparing two runs
isolates one variable — if Opus + Lean beats Sonnet + Max the writer matters
more than the research, and if they tie there is no reason to keep paying for
Pro research. The six Gemini stacks are the control group and are untouched.

Repair stays on the writer model, so on a Claude stack it is Claude. That is
deliberate: routing it to the cheaper analysis model was tried and downgraded
every repaired run. Worth measuring whether better first drafts make repair
fire less often, since repair is up to two full-article rewrites plus a
house-rules pass, all on the writer.

### What a run costs, and what that number means

The measured figures below are **cold-call overhead** on a trivial "reply OK" —
pure setup, not article cost:

| model | cost | cache-creation tokens |
|---|---|---|
| Haiku | $0.028 | 11.5k |
| Sonnet | $0.147 | 24.3k |
| Opus | $0.186 | 18.5k |

A real article has not been measured yet. The run receipt reports the CLI's own
per-call figure rather than a rate-table estimate, labelled `cost_basis:
"measured"`, and the pricing note says it is plan usage rather than a charge.

The stack price panel says "Included in your Claude plan" where a plan-served
role would have had a dollar figure. Claude has no dollar-per-million rate and
cannot be given one; the blended rate shown covers the Gemini research and
audit alone.

### JSON

The writer-model JSON stages — outline, compose, repair, editorial
augmentation — go through `--json-schema` on this provider, so there is no
ask-politely-and-retry loop. Schemas live in
`app/features/prompt2blog/schemas.py`. Capability is asked of the LLM object
rather than inferred from the model name, so a Gemini stack is unaffected.
