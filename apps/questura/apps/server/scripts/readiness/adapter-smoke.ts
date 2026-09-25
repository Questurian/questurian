/**
 * The Cloudflare adapter, built and previewed locally, checked by content
 * revision rather than by byte count (surge plan L09).
 *
 *   pnpm readiness:stack -- up        # the backend the build pre-renders from
 *   pnpm readiness:adapter            # build + preview + checks; mutates one article
 *
 * The earlier adapter evidence (#634) showed "different bytes and 22× the
 * latency" after a purge. Different bytes are not a revision. Here:
 *
 *  1. **An isolated workspace.** A detached git worktree of `origin/main`
 *     under the sandbox state directory, dependencies installed offline from
 *     the local pnpm store (nothing downloaded). The adapter writes `.next`
 *     and `.open-next` into its project directory and does not honour
 *     `NEXT_DIST_DIR`, so building in the real checkout would overwrite the
 *     `.next` a running `pnpm dev` is using.
 *  2. **Build** with the sandbox's neutralised environment and the loopback
 *     guard (Google Fonts allowed while building, nothing else).
 *  3. **Preview locally**: `opennextjs-cloudflare preview` (Miniflare,
 *     `--remote` off), bound to 127.0.0.1, with no Cloudflare credentials in
 *     its environment and wrangler metrics off. The config is checked for
 *     `remote: true` bindings first.
 *  4. **Revision checks** on one article: the Worker serves revision Rn; its
 *     body is changed to Rn+1 through Payload; before any purge the Worker
 *     still serves Rn (it is a cache, and the backend's own deliveries go to
 *     the Node client); a purge with the **wrong** secret is refused and
 *     changes nothing; a purge with the right secret and the exact tags and
 *     paths the backend queued for that save makes the Worker serve Rn+1 and
 *     never both.
 *
 * The build inlines the loopback backend address: this smoke has no browser,
 * and workerd does not resolve the stack's browser-facing
 * `api.readiness.localhost` (with it, every live render answered 500). The
 * committed wrangler.jsonc is used unchanged.
 *
 * Proves local execution of the pinned adapter with emulated bindings. It
 * does not prove global purge, Worker CPU limits, quotas or real cookies.
 */

import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { Pool } from 'pg'

import { assertPortsFree, clientEnv, waitForApp } from './apps'
import { LAUNCH_MANIFEST_PATH, type LaunchManifest, STAFF_EMAIL, SYNTHETIC_PASSWORD } from './launch-corpus'
import { assertPreflight } from './preflight'
import { sandboxSettings, sourceIdentity } from './sandbox'
import { readStackState, stackAppSettings, STACK_PORTS, STATE_DIR } from './stack'

const PREVIEW_PORT = 3104
const WORKTREE = resolve(STATE_DIR, 'adapter-worktree')
const CLIENT = resolve(WORKTREE, 'apps/questura/apps/client')
const REPO = resolve(process.cwd(), '../../../..')
const RUNS = resolve(process.cwd(), '../../docs/capacity/runs')

type Check = { ok: boolean; label: string; detail?: string }
const checks: Check[] = []
function check(ok: unknown, label: string, detail?: string): void {
  checks.push({ ok: Boolean(ok), label, detail })
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`)
}

function run(command: string, args: string[], options: { cwd: string; env?: NodeJS.ProcessEnv; log: string }): void {
  const result = spawnSync(command, args, { cwd: options.cwd, env: options.env ?? process.env, encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 })
  writeFileSync(options.log, (result.stdout ?? '') + (result.stderr ?? ''))
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed (exit ${result.status}). See ${options.log}.`)
}

function revision(cwd: string, ref: string): string {
  return spawnSync('git', ['rev-parse', ref], { cwd, encoding: 'utf8' }).stdout.trim()
}

function prepareWorktree(): string {
  mkdirSync(STATE_DIR, { recursive: true, mode: 0o700 })
  const gitLog = resolve(STATE_DIR, 'adapter-git.log')
  run('git', ['fetch', '-q', 'origin', 'main'], { cwd: REPO, log: gitLog })
  const target = revision(REPO, 'origin/main')
  let moved = false
  if (!existsSync(CLIENT)) {
    run('git', ['worktree', 'add', '-q', '--detach', WORKTREE, target], { cwd: REPO, log: gitLog })
    moved = true
  } else if (revision(WORKTREE, 'HEAD') !== target) {
    // A worktree left by an earlier run sits on the `origin/main` of that
    // day. Building it anyway checks an old client and reports it as today's
    // (found while upgrading the client to Next 15.5, #683).
    run('git', ['checkout', '-q', '--force', '--detach', target], { cwd: WORKTREE, log: gitLog })
    moved = true
  }
  if (moved) {
    // From the local store only: `--offline` refuses to download anything.
    run('pnpm', ['install', '--frozen-lockfile', '--offline', '--filter', '@questura/client...'], {
      cwd: WORKTREE,
      log: resolve(STATE_DIR, 'adapter-install.log'),
    })
  }
  const sha = revision(WORKTREE, 'HEAD')
  if (sha !== target) throw new Error(`Adapter worktree is at ${sha.slice(0, 8)}, not origin/main ${target.slice(0, 8)}. See ${gitLog}.`)
  return sha
}

async function main(): Promise<void> {
  assertPreflight(sandboxSettings())
  const stack = readStackState()
  if (!stack) throw new Error('No stack is running. Start one: pnpm readiness:stack -- up')
  await assertPortsFree([PREVIEW_PORT])
  const manifest = JSON.parse(readFileSync(LAUNCH_MANIFEST_PATH, 'utf8')) as LaunchManifest
  const piece = manifest.pieces.find((entry) => entry.type === 'articles' && entry.index === 18)!
  const settings = stackAppSettings(stack)

  // --- Remote bindings are off ------------------------------------------------
  const wrangler = readFileSync(resolve(REPO, 'apps/questura/apps/client/wrangler.jsonc'), 'utf8')
  check(!/"remote"\s*:\s*true/.test(wrangler), 'no binding in wrangler.jsonc is marked remote')

  const sha = prepareWorktree()
  check(true, 'isolated worktree ready', `origin/main ${sha.slice(0, 8)}, offline install`)

  // --- Build ------------------------------------------------------------------
  // This smoke has no browser, so the backend the Worker renders from is the
  // loopback address, inlined at build time. The stack's browser-facing name
  // (`api.readiness.localhost`) resolves for a browser, not for workerd: with
  // it, every page that needed a live render answered 500.
  const loopbackBackend = `http://127.0.0.1:${STACK_PORTS.backend}`
  const env: NodeJS.ProcessEnv = {
    ...clientEnv(settings, { build: true }),
    NEXT_PUBLIC_BACKEND_URL: loopbackBackend,
    BACKEND_URL_LOCAL: loopbackBackend,
    WRANGLER_SEND_METRICS: 'false',
    // Capped like the stack's own builds: the stack is up while this builds,
    // and an uncapped build has taken the desktop app down.
    NODE_OPTIONS: '--no-deprecation --max-old-space-size=3072',
  }
  delete env.NEXT_DIST_DIR
  for (const name of ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID', 'CF_API_TOKEN']) delete env[name]
  const buildStarted = Date.now()
  run('node_modules/.bin/opennextjs-cloudflare', ['build'], { cwd: CLIENT, env, log: resolve(STATE_DIR, 'adapter-build.log') })
  check(existsSync(resolve(CLIENT, '.open-next/worker.js')), 'the adapter builds the Worker', `${Math.round((Date.now() - buildStarted) / 1000)}s`)

  // --- Preview, local only ------------------------------------------------------
  writeFileSync(
    resolve(CLIENT, '.dev.vars'),
    [
      `QUESTURA_REVALIDATION_SECRET=${settings.revalidationSecret}`,
      `QUESTURA_RENDER_TOKEN=${settings.renderToken}`,
      // The front door's key (plan item 10): the Worker sends it on every call to the API.
      ...(settings.originAuthSecret ? [`ORIGIN_AUTH_SECRET=${settings.originAuthSecret}`] : []),
      `BACKEND_URL_LOCAL=http://127.0.0.1:${STACK_PORTS.backend}`,
    ].join('\n') + '\n',
    { mode: 0o600 },
  )
  const previewEnv: NodeJS.ProcessEnv = { ...clientEnv(settings), NEXT_PUBLIC_BACKEND_URL: loopbackBackend, BACKEND_URL_LOCAL: loopbackBackend }
  delete previewEnv.NEXT_DIST_DIR
  for (const name of ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID', 'CF_API_TOKEN']) delete previewEnv[name]
  const log = resolve(STATE_DIR, 'adapter-preview.log')
  const preview = spawn(
    'node_modules/.bin/opennextjs-cloudflare',
    ['preview', '--port', String(PREVIEW_PORT), '--ip', '127.0.0.1'],
    { cwd: CLIENT, env: { ...previewEnv, WRANGLER_SEND_METRICS: 'false' }, stdio: ['ignore', openSync(log, 'w'), openSync(log, 'a')], detached: true },
  )
  const base = `http://127.0.0.1:${PREVIEW_PORT}`
  const pool = new Pool({ connectionString: sandboxSettings().databaseUri, max: 2 })

  try {
    const ready = await waitForApp(`${base}${piece.path}`, 180_000)
    check(ready, 'the Worker preview serves on loopback', base)
    if (!ready) throw new Error(`Preview did not start. See ${log}.`)

    // Step from whatever revision the article is at now to the next one, so
    // the smoke can be rerun without reseeding.
    const login0 = await fetch(`http://127.0.0.1:${STACK_PORTS.backend}/api/users/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: STAFF_EMAIL, password: SYNTHETIC_PASSWORD }),
    })
    const token0 = ((await login0.json()) as { token?: string }).token
    const current0 = (await (await fetch(`http://127.0.0.1:${STACK_PORTS.backend}/api/articles/${piece.id}?depth=0`, {
      headers: { authorization: `JWT ${token0}` },
    })).json()) as { contentBlocks: unknown }
    const stem = piece.markers.body.replace(/-R\d+$/, '')
    const found = new RegExp(`${stem}-R(\\d+)`).exec(JSON.stringify(current0.contentBlocks))
    const revision = found ? Number(found[1]) : 1
    const before = `${stem}-R${revision}`
    const next = `${stem}-R${revision + 1}`

    const bodyOf = async () => {
      const response = await fetch(`${base}${piece.path}`)
      const html = await response.text()
      return { status: response.status, r1: html.includes(before), r2: html.includes(next), title: html.includes(piece.markers.title) }
    }

    const first = await bodyOf()
    check(first.status === 200 && first.title && first.r1 && !first.r2, `the Worker serves the article at its current revision (R${revision})`, JSON.stringify(first))

    // Change the body to R2 through Payload, as an editor would.
    const login = await fetch(`http://127.0.0.1:${STACK_PORTS.backend}/api/users/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: STAFF_EMAIL, password: SYNTHETIC_PASSWORD }),
    })
    const token = ((await login.json()) as { token?: string }).token
    const staff = { 'content-type': 'application/json', authorization: `JWT ${token}` }
    const doc = (await (await fetch(`http://127.0.0.1:${STACK_PORTS.backend}/api/articles/${piece.id}?depth=0`, { headers: staff })).json()) as {
      contentBlocks: unknown
    }
    const blocks = JSON.parse(JSON.stringify(doc.contentBlocks).split(before).join(next))
    const saved = await fetch(`http://127.0.0.1:${STACK_PORTS.backend}/api/articles/${piece.id}`, {
      method: 'PATCH',
      headers: staff,
      body: JSON.stringify({ contentBlocks: blocks }),
    })
    check(saved.ok, `the body is changed to R${revision + 1} through Payload`, `HTTP ${saved.status}`)

    // The exact invalidation the backend queued for that save.
    await new Promise((done) => setTimeout(done, 1_000))
    const job = await pool.query<{ target: { tags?: string[]; paths?: string[] } }>(
      `SELECT target FROM refresh_jobs WHERE kind = 'revalidate' AND target::text LIKE $1 ORDER BY updated_at DESC LIMIT 1`,
      [`%${piece.path}%`],
    )
    const target = job.rows[0]?.target
    check(Boolean(target?.paths?.includes(piece.path)), 'the save queued an invalidation naming the article’s path', `${target?.tags?.length ?? 0} tags, ${target?.paths?.length ?? 0} paths`)

    const cached = await bodyOf()
    check(cached.r1 && !cached.r2, 'before any purge, the Worker still serves its cached revision', JSON.stringify(cached))

    const purge = (secret: string) =>
      fetch(`${base}/api/revalidate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-revalidation-secret': secret },
        body: JSON.stringify({ tags: target?.tags ?? [], paths: target?.paths ?? [] }),
      })
    const wrong = await purge('not-the-secret')
    check(wrong.status === 401, 'a purge with the wrong secret is refused', `HTTP ${wrong.status}`)
    const stillCached = await bodyOf()
    check(stillCached.r1 && !stillCached.r2, 'and the refused purge changed nothing', JSON.stringify(stillCached))

    const right = await purge(settings.revalidationSecret)
    check(right.status === 200, 'a purge with the right secret is accepted', `HTTP ${right.status}`)

    let after = await bodyOf()
    const started = Date.now()
    while (!(after.r2 && !after.r1) && Date.now() - started < 30_000) {
      if (after.status !== 200 || !after.title) break
      await new Promise((done) => setTimeout(done, 500))
      after = await bodyOf()
    }
    check(after.status === 200 && after.title && after.r2 && !after.r1, 'after the purge the Worker serves the new revision, never both', JSON.stringify(after))

    // Wrangler's own Node process reaches out on its own: the `Request.cf`
    // lookup (workers.cloudflare.com) and an update check (registry.npmjs.org).
    // The socket guard refuses both; the check is that every attempt was a
    // refusal and none was to anything a run could be billed for.
    const lines = (existsSync(stack.outboundLog) ? readFileSync(stack.outboundLog, 'utf8') : '').trim().split('\n').filter(Boolean)
    const hosts = lines.map((line) => (JSON.parse(line) as { host: string; refused: boolean })).filter((entry) => entry.refused).map((entry) => entry.host)
    const unexpected = hosts.filter((host) => !['workers.cloudflare.com', 'registry.npmjs.org', 'telemetry.payloadcms.com'].includes(host))
    check(
      lines.length === hosts.length && unexpected.length === 0,
      'every outbound attempt was refused, and none was to a billable service',
      Object.entries(hosts.reduce<Record<string, number>>((all, host) => ({ ...all, [host]: (all[host] ?? 0) + 1 }), {}))
        .map(([host, count]) => `${host}×${count}`)
        .join(', '),
    )
  } finally {
    try {
      process.kill(-preview.pid!, 'SIGTERM')
    } catch {
      // gone
    }
    await pool.end()
  }

  const failed = checks.filter((entry) => !entry.ok)
  mkdirSync(RUNS, { recursive: true })
  writeFileSync(
    resolve(RUNS, `${new Date().toISOString().slice(0, 10)}-surge-L09-adapter.json`),
    JSON.stringify({ kind: 'surge-adapter-smoke', takenAt: new Date().toISOString(), source: sourceIdentity(), worktreeSha: sha, article: piece.path, result: { total: checks.length, passed: checks.length - failed.length }, checks }, null, 2) + '\n',
  )
  console.log(`\n${checks.length - failed.length}/${checks.length} adapter checks passed. One article moved to its next revision; the corpus is otherwise unchanged.`)
  process.exit(failed.length > 0 ? 1 : 0)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  process.exit(1)
})
