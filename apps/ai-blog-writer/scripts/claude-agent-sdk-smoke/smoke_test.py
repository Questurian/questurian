"""Standalone smoke test for the Claude Agent SDK on a Claude subscription.

Phase 1 only: prove that the officially supported subscription-authenticated
path works on this machine. This script is deliberately isolated from the
ai-blog-writer backend -- it imports nothing from ``apps/backend`` and runs in
its own virtualenv (see ``run.sh``).

Auth comes from the Claude Code OAuth login stored by ``claude auth login``
(macOS Keychain). No API key is read, written, or accepted here: if an API-key
style credential is present in the environment the test aborts, because that
would silently move usage onto separately billed API credits.
"""

import asyncio
import os
import sys

from claude_agent_sdk import (
    AssistantMessage,
    ClaudeAgentOptions,
    ResultMessage,
    TextBlock,
    query,
)

EXPECTED = 'CLAUDE_SUBSCRIPTION_OK'
PROMPT = f'Reply with exactly {EXPECTED}'

# Credentials that would take precedence over the subscription login.
# See https://code.claude.com/docs/en/authentication#authentication-precedence
API_BILLED_VARS = (
    'ANTHROPIC_API_KEY',
    'ANTHROPIC_AUTH_TOKEN',
    'CLAUDE_CODE_OAUTH_TOKEN',
    'CLAUDE_CODE_USE_BEDROCK',
    'CLAUDE_CODE_USE_VERTEX',
    'CLAUDE_CODE_USE_FOUNDRY',
    'ANTHROPIC_PROFILE',
)

# Nothing in this test needs a tool. Empty allow-list plus an explicit
# deny-list so a future default-tool change cannot silently grant one.
DENIED_TOOLS = [
    'Bash',
    'BashOutput',
    'Edit',
    'Glob',
    'Grep',
    'KillShell',
    'NotebookEdit',
    'Read',
    'Task',
    'TodoWrite',
    'WebFetch',
    'WebSearch',
    'Write',
]


def check_no_api_billing() -> None:
    present = [name for name in API_BILLED_VARS if os.environ.get(name)]
    if present:
        print(
            'ABORT: these variables outrank the subscription login and would '
            'bill elsewhere: ' + ', '.join(present),
            file=sys.stderr,
        )
        print('Unset them and rerun.', file=sys.stderr)
        raise SystemExit(2)


async def run() -> int:
    options = ClaudeAgentOptions(
        allowed_tools=[],
        disallowed_tools=DENIED_TOOLS,
        mcp_servers={},
        # Do not pick up repo CLAUDE.md / settings / skills: keep the test
        # independent of project configuration.
        setting_sources=[],
        system_prompt='Answer with the exact literal text requested. Nothing else.',
        permission_mode='default',
        max_turns=1,
    )

    reply = ''
    result: ResultMessage | None = None

    async for message in query(prompt=PROMPT, options=options):
        if isinstance(message, AssistantMessage):
            for block in message.content:
                if isinstance(block, TextBlock):
                    reply += block.text
        elif isinstance(message, ResultMessage):
            result = message

    reply = reply.strip()
    print(f'model reply: {reply!r}')

    if result is not None:
        print(f'result subtype: {result.subtype}')
        print(f'turns: {result.num_turns}')
        usage = result.usage or {}
        print(
            'tokens: in={} out={}'.format(
                usage.get('input_tokens'), usage.get('output_tokens')
            )
        )

    if reply != EXPECTED:
        print(f'FAIL: expected {EXPECTED!r}', file=sys.stderr)
        return 1

    print('PASS: subscription-authenticated Agent SDK round trip succeeded')
    return 0


def main() -> int:
    check_no_api_billing()
    return asyncio.run(run())


if __name__ == '__main__':
    raise SystemExit(main())
