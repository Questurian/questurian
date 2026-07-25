import type { CliOptions } from './types'

export const parseOptions = (args = process.argv.slice(2)): CliOptions => {
  const optionNames = new Set(args)
  const limitArg = args.find((arg) => arg.startsWith('--limit='))
  const maxDocsArg = args.find((arg) => arg.startsWith('--max-docs='))
  const parsedLimit = limitArg ? Number(limitArg.split('=')[1]) : 100
  const parsedMaxDocs = maxDocsArg ? Number(maxDocsArg.split('=')[1]) : null

  return {
    help: optionNames.has('--help') || optionNames.has('-h'),
    write: optionNames.has('--write'),
    generateVariants: !optionNames.has('--skip-generate'),
    limit: Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.trunc(parsedLimit) : 100,
    maxDocs:
      parsedMaxDocs !== null && Number.isFinite(parsedMaxDocs) && parsedMaxDocs > 0
        ? Math.trunc(parsedMaxDocs)
        : null,
  }
}

export function printHelp() {
  console.log(`Usage:
  pnpm migrate:media-sets
  pnpm migrate:media-sets -- --max-docs=5
  pnpm migrate:media-sets -- --write

Options:
  --write           Apply DB changes. Default is dry-run.
  --skip-generate   Do not generate missing variant assets.
  --limit=N         Payload page size. Default 100.
  --max-docs=N      Stop after N docs per collection for smoke checks.
  --help            Print this help text.
`)
}
