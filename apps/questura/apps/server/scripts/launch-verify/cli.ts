/**
 * pnpm launch:verify -- --client https://www.questurian.com --api https://api.questurian.com \
 *   --bypass https://<service>.up.railway.app --edge-ip <Railway edge IP> --rate-limit-probe
 *
 * Launch harness A9/B6/C2/D4 in one command. Read-only by default; see
 * `checks.ts` for what each check does and does not touch.
 *
 * Required against the real site (launch fix plan item 6): leaving one out
 * is refused, because it would drop those checks from an all-green result.
 *   --client <origin>          the site
 *   --api <origin>             the API
 *   --bypass <origin>          a platform-generated origin (the *.up.railway.app
 *                              host) that must NOT serve the API. Only a 4xx
 *                              passes; a DNS, TLS or connection error is
 *                              "unknown" and fails
 *   --edge-ip <ip[:port]>      Railway's edge address for the custom domain
 *                              (`dig +short <the CNAME target api.questurian.com
 *                              points Cloudflare at>`). The probe connects
 *                              there naming the API host (Host and TLS SNI),
 *                              with a forged CF-Connecting-IP and no origin
 *                              secret, and must get 403 (ADR-0016)
 *   --origin-edge <origin>     the same probe given as an origin instead of an
 *                              IP (e.g. https://<target>.up.railway.app, or
 *                              http://127.0.0.1:4110 in the sandbox). Give one
 *                              of --edge-ip / --origin-edge, not both
 *   --rate-limit-probe         spend one caller's plans budget to prove forged
 *                              address headers are ignored (31 requests)
 *
 * Optional:
 *   --local                    readiness sandbox only (refused unless both
 *                              origins are this machine): the three flags
 *                              above become optional, and whatever is left
 *                              out is printed as NOT RUN
 *   --monthly-cents <n>        advertised monthly price (default 1299)
 *   --yearly-cents <n>         advertised yearly price (default 7999)
 *   --home <path>              page for the home check (default /, which must
 *                              redirect to a city that exists)
 *   --article <path>           article page for the host checks (default:
 *                              the first article in the sitemap)
 *   --author <path>            author page for the host checks (default: the
 *                              first author link on the article)
 *   --no-image-check           skip loading an image (readiness sandbox only,
 *                              until it serves real images; printed as NOT RUN)
 *   --allow-http               for the readiness sandbox only
 *   --json                     print results as JSON
 *
 * Environment (never on the command line, so it stays out of shell history):
 *   LAUNCH_VERIFY_COOKIE         a dedicated test account's session cookie
 *                                (the value DevTools shows for
 *                                __Secure-questura_visitor.session_token)
 *   LAUNCH_VERIFY_COOKIE_MEMBER  yes | no: whether that account is a member
 *
 * Exit 0: every check passed. Exit 1: at least one failed. Exit 2: refused
 * to run (bad or missing options).
 */
import { MANUAL_STEPS, notRun, runChecks } from './checks'
import { parseOptions } from './options'

async function main(): Promise<void> {
  const parsed = parseOptions(process.argv.slice(2), process.env)
  if ('error' in parsed) {
    console.error(parsed.error)
    process.exit(2)
  }
  const { target } = parsed

  const results = await runChecks(target)
  const failed = results.filter((result) => !result.ok)
  const skipped = notRun(target)

  if (parsed.json) {
    const printable = { ...target, cookie: target.cookie ? { header: '[redacted]', member: target.cookie.member } : undefined }
    console.log(JSON.stringify({ target: printable, results, notRun: skipped }, null, 2))
  } else {
    for (const result of results) {
      console.log(`${result.ok ? '  ok  ' : ' FAIL '} [${result.group}] ${result.name}${result.ok ? '' : ` — ${result.detail}`}`)
    }
    console.log(`\n${results.length - failed.length}/${results.length} launch checks passed.`)
    for (const missing of skipped) console.log(`NOT RUN: ${missing}`)
    console.log('\nStill to do by hand (not anonymous HTTP):')
    for (const step of MANUAL_STEPS) console.log(`  - ${step}`)
  }

  if (failed.length > 0) process.exit(1)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(2)
})
