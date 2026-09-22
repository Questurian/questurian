// Local mock user function
const mockUser = (overrides = {}) => ({
  id: 'user_test123',
  email: 'test@example.com',
  hasLocalPassword: true,
  hasGoogleOAuth: false,
  authProvider: 'local' as const,
  stripeCustomerId: 'cus_test123',
  stripeSubscriptionId: 'sub_test123',
  subscriptionStatus: 'active' as const,
  cancelAtPeriodEnd: false,
  paidThroughAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  dunningGraceUntil: null,
  role: 'writer',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

/**
 * Creates a mock user with custom overrides
 */
export function createMockUserData(overrides = {}) {
  return mockUser(overrides);
}

/**
 * A `req` shaped like the one Payload hands a content hook inside a save's
 * transaction, recording every statement the refresh outbox writes.
 *
 * Tests need this because the publication contract is about the transaction:
 * an enqueue that lands anywhere other than the save's own session is not an
 * obligation attached to that save. A test req without a session now makes
 * the hooks throw, which is the point — so a test that means to exercise the
 * happy path has to supply one.
 */
export function fakeTransactionalReq(
  options: { transaction?: boolean; failInsert?: boolean; pool?: unknown } = {},
) {
  const inTransaction = options.transaction !== false
  const statements: string[] = []

  const full: string[] = []

  // Drizzle's `sql` template holds literal text as chunks with a string[]
  // `value` and bound parameters as chunks whose `value` is the parameter
  // itself. Rendering both is what lets a test assert on the target and the
  // dedupe key, not merely that an INSERT happened.
  const render = (chunk: unknown): string => {
    if (typeof chunk === 'string') return chunk
    if (chunk && typeof chunk === 'object' && 'value' in chunk) {
      const value = (chunk as { value: unknown }).value
      return Array.isArray(value) ? value.join('') : String(value)
    }
    return '?'
  }

  const execute = async (query: { queryChunks?: unknown[] }) => {
    const text = (query.queryChunks ?? []).map(render).join('')
    full.push(text)
    statements.push(text.trim().split(/\s+/).slice(0, 3).join(' '))
    if (options.failInsert && text.includes('INSERT INTO refresh_jobs')) {
      throw new Error('relation "refresh_jobs" does not exist')
    }
    return undefined
  }

  const session = { db: { execute } }
  const db = {
    drizzle: { execute },
    sessions: inTransaction ? { t1: session } : {},
    pool: options.pool ?? {},
  }

  return {
    statements,
    /** Every statement in full, joined — for `toContain` assertions. */
    sql: () => full.join('\n'),
    req: {
      transactionID: inTransaction ? 't1' : undefined,
      payload: { db },
    } as never,
  }
}
