import test from "node:test";
import assert from "node:assert/strict";
import { ny } from "../src/lib/pilot-engine.mjs";
import { isRegularSession, matchLifo, reviewTrades } from "../src/lib/pilot-review.mjs";

const close = (actual, expected, tolerance = 1e-9) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} ≠ ${expected}`);
let counter = 0;
// Syntetická transakce ve formátu parseTransactions (žádná skutečná data).
function tx(side, qty, price, iso, extra = {}) {
  const ts = Date.parse(iso);
  counter++;
  return {
    id: "t" + counter,
    ts,
    side,
    qty,
    price,
    result: null,
    resultCurrency: "",
    fxFee: 0,
    feeCurrency: "",
    ...ny(ts),
    ...extra,
  };
}

test("hlavní seance 09:30–16:00 New York", () => {
  assert.equal(isRegularSession(570), true);
  assert.equal(isRegularSession(959), true);
  assert.equal(isRegularSession(960), false);
  assert.equal(isRegularSession(300), false);
});

test("jednoduchý denní obchod: zisk, úspěšnost a typický zisk v USD i %", () => {
  const r = reviewTrades(
    [
      tx("BUY", 10, 50, "2026-06-02T14:00:00Z"),
      tx("SELL", 10, 51, "2026-06-02T16:00:00Z", { result: 200, resultCurrency: "CZK" }),
    ],
    52,
  );
  assert.equal(r.trips, 1);
  close(r.realizedUsd, 10);
  close(r.totalUsd, 10);
  assert.equal(r.openQty, 0);
  assert.equal(r.averageCostUsd, null);
  assert.equal(r.short.winRate, 1);
  close(r.short.medianGainUsd, 1);
  close(r.short.medianGainPct, 2);
  close(r.short.medianHoldHours, 2);
  assert.equal(r.short.outsideRegularShare, 0);
  assert.deepEqual(r.brokerResult, { CZK: 200 });
  assert.equal(r.buckets[0].trips, 1);
});

test("LIFO: prodej uzavře nejnovější nákup, starší nákup zůstane otevřený se ztrátou", () => {
  const list = [
    tx("BUY", 10, 60, "2026-06-01T14:00:00Z", { fxFee: 5, feeCurrency: "CZK" }),
    tx("BUY", 10, 50, "2026-06-10T14:00:00Z", { fxFee: 4, feeCurrency: "CZK" }),
    tx("SELL", 10, 52, "2026-06-10T15:00:00Z"),
  ];
  const r = reviewTrades(list, 55);
  close(r.realizedUsd, 20);
  close(r.unrealizedUsd, -50);
  close(r.totalUsd, 520 - 1100 + 550);
  close(r.totalUsd, r.realizedUsd + r.unrealizedUsd);
  close(r.averageCostUsd, 55);
  close(r.openLifoAverageUsd, 60);
  close(r.holdAllUsd, 0);
  close(r.peakCostUsd, 1100);
  close(r.benchmarkUsd, 1100 * (55 / 60 - 1));
  assert.deepEqual(r.fxFees, { CZK: 9 });
  assert.equal(r.startedFlat, true);
  const { lots } = matchLifo(list);
  assert.equal(lots.length, 1);
  assert.equal(lots[0].price, 60);
});

test("celkový výsledek nezávisí na pořadí zadání ani na rozdělení prodeje", () => {
  const list = [
    tx("BUY", 4, 40, "2026-03-02T15:00:00Z"),
    tx("BUY", 6, 45, "2026-03-03T15:00:00Z"),
    tx("SELL", 3, 47, "2026-03-03T17:00:00Z"),
    tx("SELL", 5, 44, "2026-03-20T15:00:00Z"),
  ];
  const a = reviewTrades(list, 50),
    b = reviewTrades([...list].reverse(), 50);
  close(a.totalUsd, 3 * 47 + 5 * 44 - (4 * 40 + 6 * 45) + 2 * 50);
  close(a.totalUsd, b.totalUsd);
  close(a.openQty, 2);
  // Prodej 5 ks: 3 ks z lotu za 45 (zbytek) + 2 ks z lotu za 40.
  close(a.realizedUsd, 3 * 2 + 3 * -1 + 2 * 4);
  assert.equal(a.buckets[0].trips, 1);
  assert.equal(a.buckets[2].trips, 2);
});

test("vstup mimo hlavní seanci a výpis, který nezačíná nulovou pozicí", () => {
  const r = reviewTrades(
    [
      tx("SELL", 5, 50, "2026-01-05T15:00:00Z"),
      tx("BUY", 2, 48, "2026-01-06T13:00:00Z"),
      tx("SELL", 2, 49, "2026-01-06T14:00:00Z"),
    ],
    50,
  );
  assert.equal(r.startedFlat, false);
  close(r.unmatchedQty, 5);
  // 13:00 UTC v zimě = 08:00 New York (pre-market).
  assert.equal(r.short.outsideRegularShare, 1);
  assert.throws(() => reviewTrades([], 50));
  assert.throws(() => reviewTrades([tx("BUY", 1, 50, "2026-01-06T15:00:00Z")], 0));
});
