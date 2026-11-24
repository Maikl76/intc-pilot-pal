import test from 'node:test';
import assert from 'node:assert/strict';
import { defaults } from '../src/lib/pilot-engine.mjs';
import {
  createPaper, buyPaper, sellPaper, paperSummary, validatePaper,
  updatePaperRisk, setPaperLock, maxPaperQuantity,
} from '../src/lib/pilot-paper.mjs';

const now = Date.parse('2026-11-24T16:00:00Z');
const settings = { ...defaults, slotCzk: 150000, reserveCzk: 50000, fee: 0, drawdownLimitCzk: 100000 };
const evidence = (price, kind = 'MARKET') => ({ price, timestamp: now, source: 'Test fixture', kind });
const closeTo = (actual, expected) => assert.ok(Math.abs(actual - expected) < 0.000001, `${actual} != ${expected}`);

test('80 shares bought at $57 and sold at $58 generate exactly $80 before costs', () => {
  const initial = createPaper(settings);
  const opened = buyPaper(initial, settings, evidence(57), 80, { now, id: 'buy-1' });
  const closed = sellPaper(opened, evidence(58), 'buy-1', undefined, { now: now + 60000, tradeId: 'sell-1' });
  closeTo(closed.cashUsd - initial.cashUsd, 80);
  assert.equal(closed.closed[0].pnlUsd, 80);
  assert.equal(closed.positions.length, 0);
  assert.deepEqual(validatePaper(closed, 'MARKET'), closed);
});

test('entry and exit costs count once each, including after a partial sale', () => {
  const config = { ...settings, fee: 0.02 };
  const initial = createPaper(config);
  const opened = buyPaper(initial, config, evidence(57), 80, { now, id: 'buy-1' });
  const partial = sellPaper(opened, evidence(58), 'buy-1', 30, { now: now + 60000, tradeId: 'sell-1' });
  assert.equal(partial.positions[0].qty, 50);
  closeTo(partial.closed[0].pnlUsd, 28.8);
  const summary = paperSummary(partial, 58);
  closeTo(summary.equityUsd - initial.startingUsd, summary.realizedUsd + summary.unrealizedUsd);
  closeTo(summary.totalUsd, 76.8);
  const closed = sellPaper(partial, evidence(58), 'buy-1', 50, { now: now + 120000, tradeId: 'sell-2' });
  closeTo(closed.cashUsd - initial.cashUsd, 76.8);
  assert.deepEqual(validatePaper(closed), closed);
});

test('a partial loss and later gain reconcile cash, cost basis, and realized P/L', () => {
  const config = { ...settings, fee: 0.07 };
  let account = buyPaper(createPaper(config), config, evidence(57), 80, { now, id: 'a' });
  account = sellPaper(account, evidence(52), 'a', 27, { now: now + 60000, tradeId: 's1' });
  account = sellPaper(account, evidence(62), 'a', 31, { now: now + 120000, tradeId: 's2' });
  const summary = paperSummary(account, 55);
  closeTo(summary.equityUsd - account.startingUsd, summary.totalUsd);
  assert.deepEqual(validatePaper(account), account);
});

test('cash reserve and global cost-basis cap both constrain purchases', () => {
  const config = { ...defaults, fee: 0.02 };
  const initial = createPaper(config);
  const maximum = maxPaperQuantity(initial, config, 57);
  assert.equal(maximum, Math.floor((config.slotCzk / config.fx) / 57.02));
  assert.throws(() => buyPaper(initial, config, evidence(57), maximum + 1, { now, id: 'too-large' }), /Limit kapitálu/);
  let account = initial;
  for (let i = 0; i < config.maxSlots; i++) account = buyPaper(account, config, evidence(57), maximum, { now, id: 'p' + i });
  assert.ok(account.cashUsd * config.fx >= config.reserveCzk);
  assert.throws(() => buyPaper(account, config, evidence(57), 1, { now, id: 'extra' }), /maximální počet/);
});

test('risk lock prevents entry but allows a partial or complete exit', () => {
  const config = { ...settings, drawdownLimitCzk: 1000 };
  const opened = buyPaper(createPaper(config), config, evidence(57), 80, { now, id: 'a' });
  const locked = updatePaperRisk(opened, 56, config.drawdownLimitCzk / config.fx);
  assert.equal(locked.locked, true);
  assert.equal(locked.lockReason, 'DRAWDOWN');
  assert.throws(() => buyPaper(locked, config, evidence(56), 1, { now, id: 'b' }), /Ochrana účtu/);
  const exited = sellPaper(locked, evidence(56), 'a', undefined, { now: now + 60000, tradeId: 's' });
  assert.equal(exited.positions.length, 0);
  assert.equal(exited.locked, true);
});

test('explicit unlock starts a new risk reference without erasing lifetime drawdown', () => {
  const config = { ...settings, drawdownLimitCzk: 1000 };
  const opened = buyPaper(createPaper(config), config, evidence(57), 80, { now, id: 'a' });
  const locked = updatePaperRisk(opened, 55, config.drawdownLimitCzk / config.fx);
  const unlocked = setPaperLock(locked, false, 55, now + 100000);
  const samePrice = updatePaperRisk(unlocked, 55, config.drawdownLimitCzk / config.fx);
  assert.equal(samePrice.locked, false);
  assert.equal(samePrice.peakUsd, locked.peakUsd);
  assert.equal(samePrice.maxDrawdownUsd, locked.maxDrawdownUsd);
  assert.equal(samePrice.riskResetCount, 1);
  assert.equal(updatePaperRisk(samePrice, 54, config.drawdownLimitCzk / config.fx).locked, true);
});

test('scenario evidence cannot close a market position', () => {
  const account = buyPaper(createPaper(settings), settings, evidence(57), 80, { now, id: 'a' });
  assert.throws(() => sellPaper(account, evidence(58, 'SCENARIO'), 'a', undefined, { now: now + 60000, tradeId: 's' }), /nelze sloučit/);
  assert.throws(() => validatePaper(account, 'SCENARIO'), /míchá/);
});

test('duplicate IDs, fractional quantities, oversells, and future evidence are rejected', () => {
  const account = buyPaper(createPaper(settings), settings, evidence(57), 80, { now, id: 'a' });
  assert.throws(() => buyPaper(account, settings, evidence(57), 1, { now, id: 'a' }), /už byl/);
  assert.throws(() => sellPaper(account, evidence(58), 'a', 81, { now, tradeId: 's' }), /zbývá/);
  assert.throws(() => sellPaper(account, evidence(58), 'a', 0.5, { now, tradeId: 's' }), /celé číslo/);
  assert.throws(() => buyPaper(createPaper(settings), settings, { ...evidence(57), timestamp: now + 60000 }, 1, { now, id: 'x' }), /budoucnosti/);
});

test('legacy v2 trades retain exact cash and realized result during validation', () => {
  const old = {
    startingUsd: 10000, cashUsd: 5496.8, peakUsd: 10000, locked: false, lastBuyDate: '2026-11-24',
    positions: [{ id: 'p', qty: 80, price: 56.25, at: now, date: '2026-11-24', target: 57.25, stop: 54.75, fee: 0.02, holdDays: 0 }],
    closed: [{ id: 'old', qty: 10, price: 60, at: now - 60000, date: '2026-11-24', target: 61, stop: 58.5, fee: 0.02, holdDays: 0, exit: 59.88, exitAt: now, reason: 'MANUAL', pnlUsd: -1.6 }],
  };
  const restored = validatePaper(old, 'MARKET');
  assert.equal(restored.cashUsd, old.cashUsd);
  assert.equal(restored.closed[0].pnlUsd, -1.6);
  assert.equal(restored.positions[0].fillKind, 'LEGACY');
  assert.equal(restored.riskPeakUsd, old.peakUsd);
});

test('corrupted backups cannot silently change capital or P/L', () => {
  const account = buyPaper(createPaper(settings), settings, evidence(57), 80, { now, id: 'a' });
  assert.throws(() => validatePaper({ ...account, cashUsd: account.cashUsd + 100 }), /účetně nesouhlasí/);
  assert.throws(() => validatePaper({ ...account, positions: [{ ...account.positions[0], qty: -1 }] }), /kladné celé/);
  const closed = sellPaper(account, evidence(58), 'a', 80, { now: now + 60000, tradeId: 's' });
  assert.throws(() => validatePaper({ ...closed, closed: [{ ...closed.closed[0], pnlUsd: 8000 }] }), /nesouhlasí/);
});
