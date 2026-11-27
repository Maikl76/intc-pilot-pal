import test from "node:test";
import assert from "node:assert/strict";
import { parseDailyHistory, parseIntradayHistory } from "../src/lib/pilot-history.mjs";
import { sessions } from "../src/lib/pilot-engine.mjs";

const now = Date.parse("2026-11-27T18:00:00Z");
// Syntetická odpověď ve tvaru Yahoo chart API.
function payload({
  timestamps,
  open,
  high,
  low,
  close,
  adjclose,
  symbol = "INTC",
  granularity = "1d",
}) {
  return {
    chart: {
      result: [
        {
          meta: { symbol, currency: "USD", dataGranularity: granularity },
          timestamp: timestamps,
          indicators: {
            quote: [{ open, high, low, close, volume: timestamps.map(() => 1000) }],
            ...(adjclose ? { adjclose: [{ adjclose }] } : {}),
          },
        },
      ],
    },
  };
}
function dailyFixture(days = 400, withAdjusted = true) {
  const start = Date.parse("2025-06-02T13:30:00Z") / 1000;
  const timestamps = Array.from({ length: days }, (_, i) => start + i * 86400);
  const close = timestamps.map((_, i) => 40 + (i % 7));
  return payload({
    timestamps,
    open: close,
    high: close.map((c) => c + 1),
    low: close.map((c) => c - 1),
    close,
    adjclose: withAdjusted ? close.map((c) => c * 0.9) : undefined,
  });
}

test("denní historie: upravené závěry pro výnosy, bez dnešního dne a bez cizího symbolu", () => {
  const data = dailyFixture();
  // Poslední syntetický den je dnešní (New York) → musí být vynechán.
  data.chart.result[0].timestamp.push(Date.parse("2026-11-27T14:30:00Z") / 1000);
  for (const key of ["open", "high", "low", "close", "volume"])
    data.chart.result[0].indicators.quote[0][key].push(50);
  data.chart.result[0].indicators.adjclose[0].adjclose.push(50);
  const r = parseDailyHistory(data, now);
  assert.equal(r.adjusted, true);
  assert.equal(r.dates.length, 400);
  assert.ok(r.dates.every((date) => date < "2026-11-27"));
  assert.equal(r.values[0], Math.round(r.closes[0] * 0.9 * 10000) / 10000);
  const bad = dailyFixture();
  bad.chart.result[0].meta.symbol = "AMD";
  assert.throws(() => parseDailyHistory(bad, now));
});

test("denní historie bez upravených závěrů použije surové a málo dat odmítne", () => {
  const r = parseDailyHistory(dailyFixture(400, false), now);
  assert.equal(r.adjusted, false);
  assert.deepEqual(r.values, r.closes);
  assert.throws(() => parseDailyHistory(dailyFixture(100), now));
});

test("5min svíčky: formát enginu, vyřazení nekonzistentních a budoucích, úplné seance", () => {
  const start = Date.parse("2026-11-24T14:30:00Z") / 1000; // 09:30 New York
  const timestamps = Array.from({ length: 78 }, (_, i) => start + i * 300);
  const close = timestamps.map((_, i) => 50 + i * 0.01);
  const data = payload({
    timestamps: [...timestamps, start + 78 * 300, Date.parse("2026-11-28T15:00:00Z") / 1000],
    open: [...close, 51, 51],
    high: [...close.map((c) => c + 0.123456), 50, 52],
    low: [...close.map((c) => c - 0.1), 50.5, 50],
    close: [...close, 51, 51],
    granularity: "5m",
  });
  const r = parseIntradayHistory(data, now);
  assert.equal(r.interval, 5);
  assert.equal(r.rejected, 2);
  assert.equal(r.bars.length, 78);
  assert.equal(r.bars[0].minute, 570);
  assert.equal(r.bars[0].date, "2026-11-24");
  assert.equal(r.bars[0].h, Math.round((50 + 0.123456) * 10000) / 10000);
  const s = sessions(r);
  assert.equal(s.days.length, 1);
  const daily = payload({
    timestamps,
    open: close,
    high: close,
    low: close,
    close,
    granularity: "1d",
  });
  assert.throws(() => parseIntradayHistory(daily, now));
});
