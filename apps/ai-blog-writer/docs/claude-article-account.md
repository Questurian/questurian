# The Claude account that writes the articles

Prompt2Blog writes on a Claude Code subscription, through the CLI, on a
credential that is **deliberately separate from whatever `claude` is logged
into on this Mac**. That separation is the point: the pipeline can bill one
account while the machine is signed in to another.

## Reconnecting it

Two steps, and the second one is the important half.

**1. Mint a token.** In a terminal, signed in to the account that should pay
for articles:

```bash
claude setup-token
```

It opens a browser login and prints a long lived token beginning `sk-ant-oat01-`.

**2. Paste it into the app**, at:

```
http://localhost:3003/settings/claude
```

Not into a terminal, not into a file, not into a chat. That page writes both
halves at once -- the secret into the macOS Keychain and the label into
`claude_credentials` -- and then reads the Keychain back to confirm the write
actually took. Writing one half without the other is what produced two days of
a status claiming an account that was not there.

## Where it lives

| Half | Where | Read by |
|---|---|---|
| The secret | macOS Keychain, service `com.questurian.prompt2blog.claude`, account `prompt2blog` | `load_credential()`, at the moment a run is handed to the writer |
| The label and date | `claude_credentials` table in `data/pipeline.db` | the settings page |

At run time the secret is injected into the CLI subprocess as
`CLAUDE_CODE_OAUTH_TOKEN`. It never reaches argv, so it cannot be read out of
`ps`, and it is never written to a file.

## It is not kept in a file, and should not be

A plaintext token in the repo is one `git add .` from a public remote, and the
reflog keeps it after the file is deleted. A token outside the repo is better
but still a downgrade from the Keychain, which is encrypted at rest and locked
with the login session. The ceremony of pasting it again is cheaper than the
morning spent rotating a leaked one.

## Checking it without exposing it

Both halves, neither of them printing the secret:

```bash
sqlite3 apps/ai-blog-writer/data/pipeline.db "select slot_id, label, updated_at from claude_credentials;"
```

```bash
security find-generic-password -a prompt2blog -s com.questurian.prompt2blog.claude >/dev/null 2>&1 && echo PRESENT || echo MISSING
```

`find-generic-password` without `-w` reads the item's metadata and never the
password. Never add `-w` to check existence.

The settings page now runs the same check: it reports not configured unless
both halves are there, and says when the account was connected and that its
secret has since gone.

## The unsolved part

The Keychain item has vanished twice, on 2026-08-30, the second time within an
hour of a successful use at 04:10Z. `delete_credential()` clears both halves,
so the surviving database row proves nothing that went through the app removed
it. The cause is unknown.

If it goes again, the useful thing to record is **when** relative to the last
use, a sleep, or a restart. That is the one clue that would separate a
time based expiry from an event.
