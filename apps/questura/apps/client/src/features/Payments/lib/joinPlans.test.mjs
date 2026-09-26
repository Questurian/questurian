import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { isLocalJoinPreview, readJoinPricing } from './joinPlans.ts';

test('preview is restricted to explicitly configured loopback frontend origins', () => {
  for (const url of ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://[::1]:3000']) {
    assert.equal(isLocalJoinPreview(url), true);
  }
  for (const url of ['', 'invalid', 'https://www.questurian.com', 'https://localhost.example.com']) {
    assert.equal(isLocalJoinPreview(url), false);
  }
});

test('local preview needs no backend and carries no checkout price IDs', async () => {
  const { plans, taxAtCheckout } = await readJoinPricing('http://localhost:4000', true, () => {
    assert.fail('local preview must never request payment availability');
  });
  assert.equal(taxAtCheckout, false);
  assert.deepEqual(plans.map(({ id, amount, priceId }) => ({ id, amount, priceId })), [
    { id: 'monthly', amount: 1299, priceId: '' },
    { id: 'yearly', amount: 7999, priceId: '' },
  ]);
});

test('deployed join preserves backend availability and bounds the public read', async () => {
  const offered = [{ id: 'monthly', amount: 1299 }];
  const { plans } = await readJoinPricing('https://api.example.com', false, async (url, options) => {
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
  ]) assert.deepEqual(await readJoinPricing('https://api.example.com', false, request), { plans: [], taxAtCheckout: false });
});

// Checkout adds tax only while Stripe Managed Payments is on, and the server
// says so. Anything short of an explicit true makes no tax promise.
test('the tax promise follows the server, and defaults to none', async () => {
  const offered = [{ id: 'monthly', amount: 1299 }];
  for (const [taxAtCheckout, expected] of [[true, true], [false, false], [undefined, false], ['true', false], [1, false]]) {
    const pricing = await readJoinPricing('https://api.example.com', false, async () =>
      Response.json({ plans: offered, taxAtCheckout }),
    );
    assert.deepEqual(pricing, { plans: offered, taxAtCheckout: expected }, String(taxAtCheckout));
  }
});

test('hero visibility no longer depends on image decode or hydration', () => {
  const css = readFileSync(new URL('../../../app/styles/global/membership.css', import.meta.url), 'utf8');
  const hero = readFileSync(new URL('../components/JoinHeroVisual.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(css, /data-join-hero-ready|join-hero-copy-reveal|join-hero-visual-enter/);
  assert.doesNotMatch(hero, /JoinHeroReady|heroReadyScript/);
});
