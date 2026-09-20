import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { isLocalJoinPreview, readJoinPlans } from './joinPlans.ts';

test('preview is restricted to explicitly configured loopback frontend origins', () => {
  for (const url of ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://[::1]:3000']) {
    assert.equal(isLocalJoinPreview(url), true);
  }
  for (const url of ['', 'invalid', 'https://www.questurian.com', 'https://localhost.example.com']) {
    assert.equal(isLocalJoinPreview(url), false);
  }
});

test('local preview needs no backend and carries no checkout price IDs', async () => {
  const plans = await readJoinPlans('http://localhost:4000', true, () => {
    assert.fail('local preview must never request payment availability');
  });
  assert.deepEqual(plans.map(({ id, amount, priceId }) => ({ id, amount, priceId })), [
    { id: 'monthly', amount: 1299, priceId: '' },
    { id: 'yearly', amount: 7999, priceId: '' },
  ]);
});

test('deployed join preserves backend availability and bounds the public read', async () => {
  const offered = [{ id: 'monthly', amount: 1299 }];
  const plans = await readJoinPlans('https://api.example.com', false, async (url, options) => {
    assert.equal(url, 'https://api.example.com/api/payments/plans');
    assert.equal(options.credentials, undefined);
    assert.equal(options.next.revalidate, 60);
    assert.ok(options.signal instanceof AbortSignal);
    return Response.json({ plans: offered });
  });
  assert.deepEqual(plans, offered);
});

test('empty, unavailable and malformed live results never invent purchasable plans', async () => {
  for (const request of [
    async () => Response.json({ plans: [] }),
    async () => Response.json({}, { status: 503 }),
    async () => Response.json({ plans: null }),
    async () => { throw new Error('offline'); },
  ]) assert.deepEqual(await readJoinPlans('https://api.example.com', false, request), []);
});

test('hero visibility no longer depends on image decode or hydration', () => {
  const css = readFileSync(new URL('../../../app/styles/global/membership.css', import.meta.url), 'utf8');
  const hero = readFileSync(new URL('../components/JoinHeroVisual.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(css, /data-join-hero-ready|join-hero-copy-reveal|join-hero-visual-enter/);
  assert.doesNotMatch(hero, /JoinHeroReady|heroReadyScript/);
});
