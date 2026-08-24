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
