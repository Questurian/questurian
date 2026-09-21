import { describe, expect, it } from 'vitest'

import { looksTransactionPooled } from './pooled-uri'

describe('looksTransactionPooled', () => {
  it('recognises the pooled endpoints the managed providers ship', () => {
    for (const uri of [
      'postgres://u:p@ep-cool-name-123456-pooler.us-east-2.aws.neon.tech/db',
      'postgres://u:p@aws-0-us-east-1.pooler.supabase.com:5432/postgres',
      'postgres://u:p@db.example.com:6543/postgres',
      'postgres://u:p@pgbouncer.internal:5432/questura',
      'postgres://u:p@db.example.com:5432/questura?pgbouncer=true',
    ]) {
      expect(looksTransactionPooled(uri), uri).toBe(true)
    }
  })

  it('leaves a direct connection alone', () => {
    for (const uri of [
      'postgres://u:p@127.0.0.1:5432/questura',
      'postgres://u:p@ep-cool-name-123456.us-east-2.aws.neon.tech/db',
      'postgres://u:p@db.example.com:5432/questura?sslmode=require',
    ]) {
      expect(looksTransactionPooled(uri), uri).toBe(false)
    }
  })

  it('says nothing about an empty or unparseable value', () => {
    expect(looksTransactionPooled('')).toBe(false)
    expect(looksTransactionPooled('not a url')).toBe(false)
  })
})
