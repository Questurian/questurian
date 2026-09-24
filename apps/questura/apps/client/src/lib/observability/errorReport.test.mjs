import assert from 'node:assert/strict'
import test from 'node:test'

import {
  CLIENT_ERRORS_PATH,
  MAX_BROWSER_REPORTS,
  buildErrorReport,
  createBrowserReporter,
  pathOnly,
  pickRequestId,
  redactText,
  reportUrl,
  sendWorkerReport,
  workerLogLine,
} from './errorReport.ts'

// Launch fix plan item 3: the website's errors reach the API's beacon, and
// from there Sentry. Nothing personal leaves in a report.

const FAKE_KEY = ['sk', 'live', 'abcdefgh1234'].join('_')

test('redactText removes emails, tokens, keys, session cookies and query strings', () => {
  const input = [
    'no account for reader@example.com',
    'Authorization: Bearer abcdefghijkl',
    `key ${FAKE_KEY}`,
    'better-auth.session_token=abc.def;',
    'GET https://api.questurian.com/api/visitor-auth/reset?token=secret-reset-token failed',
  ].join(' | ')

  const out = redactText(input)
  for (const needle of ['reader@example.com', 'abcdefghijkl', FAKE_KEY, 'abc.def', 'secret-reset-token']) {
    assert.ok(!out.includes(needle), `${needle} leaked: ${out}`)
  }
  assert.match(out, /\[email\]/)
  assert.match(out, /https:\/\/api\.questurian\.com\/api\/visitor-auth\/reset failed/)
})

test('pathOnly keeps the pathname and nothing else', () => {
  assert.equal(pathOnly('/account?email=reader@example.com#x'), '/account')
  assert.equal(pathOnly('https://evil.example/x'), undefined)
  assert.equal(pathOnly(undefined), undefined)
})

test('pickRequestId prefers x-request-id, falls back to cf-ray, refuses junk', () => {
  assert.equal(pickRequestId({ 'x-request-id': 'req-12345678', 'cf-ray': '8b3c1f2a9d0e1f23-LHR' }), 'req-12345678')
  assert.equal(pickRequestId({ 'cf-ray': '8b3c1f2a9d0e1f23-LHR' }), '8b3c1f2a9d0e1f23-LHR')
  assert.equal(pickRequestId(new Headers({ 'cf-ray': '8b3c1f2a9d0e1f23-LHR' })), '8b3c1f2a9d0e1f23-LHR')
  assert.equal(pickRequestId({ 'x-request-id': 'bad id\n' }), undefined)
  assert.equal(pickRequestId(undefined), undefined)
})

test('buildErrorReport is redacted, capped and carries the digest and request id', () => {
  const error = Object.assign(new Error('failed for reader@example.com'), { digest: '4242' })
  const report = buildErrorReport({
    source: 'worker',
    boundary: 'request',
    error,
    path: '/account?email=reader@example.com',
    requestId: '8b3c1f2a9d0e1f23-LHR',
    release: 'abc1234',
  })

  assert.equal(report.message, 'failed for [email]')
  assert.equal(report.path, '/account')
  assert.equal(report.digest, '4242')
  assert.equal(report.requestId, '8b3c1f2a9d0e1f23-LHR')
  assert.equal(report.release, 'abc1234')
  assert.ok(!JSON.stringify(report).includes('reader@example.com'))

  const long = buildErrorReport({ source: 'browser', boundary: 'error', error: new Error('x'.repeat(5000)) })
  assert.ok(long.message.length <= 500)
  assert.equal(buildErrorReport({ source: 'browser', boundary: 'error', error: 'plain string' }).message, 'plain string')
})

test('reportUrl joins the backend and the beacon path', () => {
  assert.equal(reportUrl('https://api.questurian.com/'), `https://api.questurian.com${CLIENT_ERRORS_PATH}`)
})

test('the browser reporter posts without credentials, once per error, and stops at its cap', () => {
  const calls = []
  const send = createBrowserReporter({
    backendUrl: 'https://api.questurian.com',
    fetch: async (url, init) => calls.push({ url, init }),
  })
  const report = buildErrorReport({ source: 'browser', boundary: 'global-error', error: new Error('Boom') })

  assert.equal(send(report), true)
  assert.equal(send(report), false, 'the same error twice is one report')
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, 'https://api.questurian.com/api/client-errors')
  assert.equal(calls[0].init.credentials, 'omit')
  assert.equal(calls[0].init.keepalive, true)
  assert.match(calls[0].init.headers['content-type'], /^text\/plain/)
  assert.deepEqual(JSON.parse(calls[0].init.body), report)

  for (let i = 0; i < MAX_BROWSER_REPORTS + 3; i++) {
    send(buildErrorReport({ source: 'browser', boundary: 'error', error: new Error(`Boom ${i}`) }))
  }
  assert.equal(calls.length, MAX_BROWSER_REPORTS)
})

test('the browser reporter never throws when fetch does', () => {
  const send = createBrowserReporter({
    backendUrl: 'https://api.questurian.com',
    fetch: () => {
      throw new Error('offline')
    },
  })
  assert.equal(send(buildErrorReport({ source: 'browser', boundary: 'error', error: new Error('x') })), false)
})

test('the Worker report gives up at its timeout instead of holding the request', async () => {
  const report = buildErrorReport({ source: 'worker', boundary: 'request', error: new Error('x') })
  const ok = await sendWorkerReport(report, {
    backendUrl: 'https://api.questurian.com',
    timeoutMs: 10,
    fetch: (_url, init) =>
      new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted')))),
  })
  assert.equal(ok, false)

  let posted
  assert.equal(
    await sendWorkerReport(report, { backendUrl: 'https://api.questurian.com', fetch: async (url, init) => (posted = { url, init }) }),
    true,
  )
  assert.equal(posted.init.method, 'POST')
  assert.deepEqual(JSON.parse(posted.init.body), report)
})

test('a forced Worker error is exactly one JSON log line with the request id, redacted', () => {
  const report = buildErrorReport({
    source: 'worker',
    boundary: 'request',
    error: new Error('failed for reader@example.com'),
    path: '/rome?x=1',
    requestId: '8b3c1f2a9d0e1f23-LHR',
  })
  const line = workerLogLine(report, { method: 'GET', routePath: '/[country]/[city]', routeType: 'render' })

  assert.equal(line.split('\n').length, 1)
  const parsed = JSON.parse(line)
  assert.equal(parsed.level, 'error')
  assert.equal(parsed.message, 'Request failed')
  assert.equal(parsed.errorMessage, 'failed for [email]')
  assert.equal(parsed.requestId, '8b3c1f2a9d0e1f23-LHR')
  assert.equal(parsed.path, '/rome')
  assert.equal(parsed.routePath, '/[country]/[city]')
  assert.ok(!line.includes('reader@example.com'))
})
