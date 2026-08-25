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

Agent SDK usage on a subscription draws from a per-user monthly credit ($20 on
Pro) before anything else; overflow bills at standard API rates. Credits do not
pool across users and do not roll over.
See <https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan>.

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
