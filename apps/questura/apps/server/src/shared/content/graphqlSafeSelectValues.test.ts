import { describe, expect, it } from 'vitest'

import config from '@/payload.config'

/**
 * Guards the whole config against the bug that killed `/api/graphql`.
 *
 * Payload derives GraphQL enum *member* names from a select option's `value`,
 * running it through `formatName`, which patches leading digits, dots, dashes,
 * slashes, plus signs, commas, parens, apostrophes, spaces and brackets -- and
 * nothing else. A `$` survives it and is not a legal GraphQL name, so four
 * price-tick options took the entire schema build down and every GraphQL query
 * returned an empty 500. A unit test on one field would not have caught it;
 * this walks every field in the real config.
 */

const NUMBERS = new Set('0123456789'.split(''))

/** Mirrors @payloadcms/graphql's formatName (UTC-offset branch omitted: no such values here). */
function formatName(input: string): string {
  let sanitized = String(input)
  if (NUMBERS.has(sanitized.substring(0, 1))) sanitized = `_${sanitized}`
  return (
    sanitized
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/\./g, '_')
      .replace(/-|\//g, '_')
      .replace(/\+/g, '_')
      .replace(/,/g, '_')
      .replace(/\(/g, '_')
      .replace(/\)/g, '_')
      .replace(/'/g, '_')
      .replace(/ /g, '')
      .replace(/\[|\]/g, '_') || '_'
  )
}

const GRAPHQL_NAME = /^[_a-zA-Z][_a-zA-Z0-9]*$/

type AnyField = Record<string, unknown>

function collectSelectValues(fields: unknown, path: string, found: string[][]): void {
  if (!Array.isArray(fields)) return

  for (const raw of fields) {
    if (!raw || typeof raw !== 'object') continue
    const field = raw as AnyField
    const name = typeof field.name === 'string' ? field.name : (field.label as string) ?? '?'
    const here = `${path}.${name}`

    if (field.type === 'select' && Array.isArray(field.options)) {
      for (const option of field.options) {
        const value =
          typeof option === 'string'
            ? option
            : ((option as { value?: unknown })?.value as string | undefined)
        if (typeof value === 'string') found.push([here, value])
      }
    }

    collectSelectValues(field.fields, here, found)
    for (const tab of (field.tabs as unknown[]) ?? []) {
      const tabFields = (tab as AnyField)?.fields
      collectSelectValues(tabFields, here, found)
    }
    for (const block of (field.blocks as unknown[]) ?? []) {
      const blockFields = (block as AnyField)?.fields
      collectSelectValues(blockFields, `${here}.${(block as AnyField)?.slug ?? '?'}`, found)
    }
  }
}

describe('select option values', () => {
  it('are all legal GraphQL enum member names', async () => {
    const resolved = await config
    const found: string[][] = []

    for (const collection of resolved.collections ?? []) {
      collectSelectValues(collection.fields, collection.slug, found)
    }
    for (const global of resolved.globals ?? []) {
      collectSelectValues(global.fields, global.slug, found)
    }

    expect(found.length).toBeGreaterThan(0)

    const illegal = found
      .filter(([, value]) => !GRAPHQL_NAME.test(formatName(value)))
      .map(([where, value]) => `${where} = ${JSON.stringify(value)}`)

    expect(illegal).toEqual([])
  })
})
