/**
 * pnpm launch:verify -- --client https://www.questurian.com --api https://api.questurian.com
 *
 * Launch harness A9/B6/C2/D4 in one command. Read-only by default; see
 * `checks.ts` for what each check does and does not touch.
 *
 * Options:
 *   --client <origin>          the site (required)
 *   --api <origin>             the API (required)
 *   --bypass <origin>          a platform-generated origin (e.g. the
 *                              *.up.railway.app host) that must NOT serve the API
 *   --origin-edge <origin>     where the API's DNS record sends Cloudflare
 *                              (Railway's edge for the custom domain; in the
 *                              sandbox the backend's own port). A request
 *                              there naming the API host, without the origin
 *                              secret, must be refused with 403 (ADR-0016)
 *   --monthly-cents <n>        advertised monthly price (default 1299)
 *   --yearly-cents <n>         advertised yearly price (default 7999)
 *   --rate-limit-probe         spend one caller's plans budget to prove forged
 *                              address headers are ignored (31 requests)
 *   --home <path>              page for the home check (default /, which must
 *                              redirect to a city that exists)
 *   --article <path>           article page for the host checks (default:
 *                              the first article in the sitemap)
 *   --author <path>            author page for the host checks (default: the
 *                              first author link on the article)
 *   --no-image-check           skip loading an image (readiness sandbox only,
 *                              until it serves real images; printed as skipped)
 *   --allow-http               for the readiness sandbox only
 *   --json                     print results as JSON
 *
 * Exit 0: every check passed. Exit 1: at least one failed.
 */
import { MANUAL_STEPS, runChecks, type Target } from './checks'

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? process.argv[index + 1] : undefined
}

function flag(name: string): boolean {
  return process.argv.includes(`--${name}`)
}

async function main(): Promise<void> {
  const client = arg('client')?.replace(/\/$/, '')
  const api = arg('api')?.replace(/\/$/, '')
  if (!client || !api) {
    console.error('usage: pnpm launch:verify -- --client <site origin> --api <api origin> [--bypass <origin>] [--origin-edge <origin>] [--rate-limit-probe]')
    process.exit(2)
  }

  const target: Target = {
    client,
    api,
    bypassOrigin: arg('bypass')?.replace(/\/$/, ''),
    originEdge: arg('origin-edge')?.replace(/\/$/, ''),
    expectPrices: {
      monthly: Number(arg('monthly-cents') ?? 1299),
      yearly: Number(arg('yearly-cents') ?? 7999),
    },
    allowHttp: flag('allow-http'),
    rateLimitProbe: flag('rate-limit-probe'),
    homePath: arg('home'),
    articlePath: arg('article'),
    authorPath: arg('author'),
    imageCheck: !flag('no-image-check'),
  }

  const results = await runChecks(target)
  const failed = results.filter((result) => !result.ok)

  if (flag('json')) {
    console.log(JSON.stringify({ target: { ...target }, results }, null, 2))
  } else {
    for (const result of results) {
      console.log(`${result.ok ? '  ok  ' : ' FAIL '} [${result.group}] ${result.name}${result.ok ? '' : ` — ${result.detail}`}`)
    }
    console.log(`\n${results.length - failed.length}/${results.length} launch checks passed.`)
    if (!target.imageCheck) console.log('Skipped: the image check (--no-image-check). Never skip it against the real site.')
    console.log('\nStill to do by hand (not anonymous HTTP):')
    for (const step of MANUAL_STEPS) console.log(`  - ${step}`)
  }

  if (failed.length > 0) process.exit(1)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(2)
})
