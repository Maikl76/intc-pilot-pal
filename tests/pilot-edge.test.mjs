import test from "node:test";
import assert from "node:assert/strict";
import { ny } from "../src/lib/pilot-quotes.mjs";
import { gaussian, seededRandom } from "../src/lib/pilot-forecast.mjs";
import {
  averageTrueRange,
  averagingDown,
  dipStudy,
  edgeVerdict,
  hourlySessions,
  intradayMomentumStudy,
  openingRangeStudy,
  overnightIntradayStudy,
  positionPlan,
  trendStudy,
  volatilityRegime,
  volatilityScalingStudy,
} from "../src/lib/pilot-edge.mjs";

const close = (actual, expected, tolerance = 1e-9, label = "") =>
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${label} ${actual} se liší od ${expected} o více než ${tolerance}`,
  );

test("ATR: stálé rozpětí 2 USD bez mezer dává ATR 2", () => {
  const closes = Array.from({ length: 20 }, () => 50);
  assert.equal(
    averageTrueRange(
      closes.map((c) => c + 1),
      closes.map((c) => c - 1),
      closes,
      14,
    ),
    2,
  );
  // Mezera: předchozí close 50, dnes high 56, low 54 → TR = 6.
  close(averageTrueRange([51, 56], [49, 54], [50, 55], 1), 6);
  assert.throws(() => averageTrueRange([1], [1], [1], 14));
});

test("velikost pozice: 1 % z 200 000 Kč, stop o 2 USD níž, kurz 20", () => {
  const p = positionPlan({
    capitalCzk: 200000,
    riskPct: 1,
    entry: 50,
    stop: 48,
    fx: 20,
    fee: 0.02,
    targetR: 1.5,
  });
  // Riziko 2 000 Kč = 100 USD; ztráta na akcii 2 + 0,04 → 49 akcií.
  assert.equal(p.shares, 49);
  close(p.riskUsd, 100);
  close(p.maxLossUsd, 49 * 2.04);
  close(p.target, 53);
  close(p.winUsd, 49 * (3 - 0.04));
  close(p.breakEvenRate, 2.04 / (2.04 + 2.96));
  close(p.stopDistancePct, 4);
  assert.equal(p.limitedByCapital, false);
  assert.throws(() => positionPlan({ capitalCzk: 1, riskPct: 1, entry: 50, stop: 51, fx: 20 }));
  assert.throws(() => positionPlan({ capitalCzk: 1, riskPct: 20, entry: 50, stop: 49, fx: 20 }));
});

test("velikost pozice nepřekročí kapitál ani při velmi blízkém stopu", () => {
  const p = positionPlan({ capitalCzk: 10000, riskPct: 5, entry: 50, stop: 49.99, fx: 20 });
  assert.equal(p.shares, 10);
  assert.equal(p.limitedByCapital, true);
});

test("přikoupení ve ztrátě zvyšuje ztrátu ke stopu", () => {
  const r = averagingDown({ qty: 10, avgPrice: 60, addQty: 10, addPrice: 50, stop: 45 });
  assert.equal(r.newQty, 20);
  assert.equal(r.newAvg, 55);
  assert.equal(r.riskBefore, 150);
  assert.equal(r.riskAfter, 200);
});

test("kolísání: po klidném roce prudký nárůst zmenší doporučenou pozici", () => {
  const random = seededRandom(1),
    values = [50];
  for (let i = 0; i < 300; i++) values.push(values.at(-1) * Math.exp(0.01 * gaussian(random)));
  for (let i = 0; i < 25; i++) values.push(values.at(-1) * Math.exp(0.04 * gaussian(random)));
  const v = volatilityRegime(values);
  assert.ok(v.ratio > 2, "poměr " + v.ratio);
  assert.ok(v.multiplier < 0.5 && v.multiplier >= 0.25);
  const calm = volatilityRegime(values.slice(0, 300));
  assert.equal(calm.multiplier <= 1, true);
  assert.equal(volatilityRegime(values.slice(0, 100)), null);
});

test("zmenšování pozice při kolísání sníží volatilitu i propad na datech se dvěma režimy", () => {
  const random = seededRandom(2),
    values = [50];
  for (let block = 0; block < 6; block++) {
    const sigma = block % 2 ? 0.05 : 0.01;
    for (let i = 0; i < 200; i++) values.push(values.at(-1) * Math.exp(sigma * gaussian(random)));
  }
  const s = volatilityScalingStudy(values);
  assert.ok(s.scaled.volatilityPct < s.hold.volatilityPct);
  assert.ok(s.scaled.maxDrawdownPct >= s.hold.maxDrawdownPct);
});

test("krátkodobý návrat: po každém propadu 5 % přijde za 5 dní růst o 2 %", () => {
  // Opakovaný vzor: 10 klidných dní, propad −5 %, pak 5 dní celkem +2 %.
  const values = [100],
    dates = ["d0"];
  const step = (r) => {
    values.push(values.at(-1) * (1 + r));
    dates.push("d" + values.length);
  };
  for (let k = 0; k < 40; k++) {
    for (let i = 0; i < 10; i++) step(0);
    step(-0.05);
    for (let i = 0; i < 5; i++) step(Math.pow(1.02, 1 / 5) - 1);
  }
  const s = dipStudy(values, dates, { dropPct: 5, horizon: 5 });
  assert.equal(s.n, 40);
  close(s.meanPct, 2, 1e-9, "průměr po propadu");
  assert.ok(s.excessPct > 0);
  assert.equal(s.upShare, 1);
  assert.equal(edgeVerdict({ n: s.n, low: s.excessLowPct, high: s.excessHighPct }), "VYHODA");
  // Hranice −5 % se počítá jako propad; −4,9 % ne.
  assert.equal(dipStudy(values, dates, { dropPct: 6, horizon: 5 }).n, 0);
});

test("trendový filtr: stále rostoucí cena je vždy nad průměrem", () => {
  const values = Array.from({ length: 400 }, (_, i) => 50 * Math.exp(0.001 * i));
  const t = trendStudy(values, { window: 200 });
  assert.equal(t.todayAbove, true);
  assert.equal(t.below.days, 0);
  assert.equal(t.above.days, 399 - 199);
  close(t.above.meanBp, 10, 1e-6, "výnos nad průměrem");
  close(t.filter.annualPct, t.hold.annualPct, 1e-9, "filtr = držení");
  assert.equal(trendStudy(values.slice(0, 100)), null);
});

test("noc proti dni: přes noc +1 %, během dne −0,5 %", () => {
  const opens = [100],
    values = [100];
  for (let i = 1; i < 60; i++) {
    opens.push(values[i - 1] * Math.exp(0.01));
    values.push(opens[i] * Math.exp(-0.005));
  }
  const s = overnightIntradayStudy(opens, values);
  assert.equal(s.days, 59);
  close(s.overnight.meanBp, 100, 1e-6, "noc");
  close(s.intraday.meanBp, -50, 1e-6, "den");
});

// Hodinové seance v letním čase: začátky 13:30 UTC = 9:30 ET.
function hourDay(date, prices) {
  const start = Date.parse(date + "T13:30:00Z");
  return prices.map(([o, h, l, c], i) => {
    const ts = start + i * 3600000;
    return { ts, o, h, l, c, v: 1000, ...ny(ts) };
  });
}
const flat = (p) => [p, p + 0.01, p - 0.01, p];

test("hodinové seance: jen úplné dny se 7 svíčkami", () => {
  const full = hourDay(
    "2026-06-01",
    Array.from({ length: 7 }, () => flat(50)),
  );
  const partial = hourDay(
    "2026-06-02",
    Array.from({ length: 4 }, () => flat(50)),
  );
  const days = hourlySessions([...partial, ...full]);
  assert.equal(days.length, 1);
  assert.equal(days[0].date, "2026-06-01");
});

test("intradenní momentum: poslední půlhodina ve směru první hodiny dává kladný výsledek", () => {
  const bars = [];
  const dates = ["2026-06-01", "2026-06-02", "2026-06-03", "2026-06-04", "2026-06-05"];
  let previous = 50;
  dates.forEach((date, k) => {
    const up = k % 2 === 0;
    const firstClose = previous * (up ? 1.01 : 0.99);
    const prices = [[previous, firstClose + 0.1, Math.min(previous, firstClose) - 0.1, firstClose]];
    for (let i = 1; i < 6; i++) prices.push(flat(firstClose));
    const lastClose = firstClose * (up ? 1.001 : 0.999);
    prices.push([
      firstClose,
      Math.max(firstClose, lastClose) + 0.01,
      Math.min(firstClose, lastClose) - 0.01,
      lastClose,
    ]);
    bars.push(...hourDay(date, prices));
    previous = lastClose;
  });
  const s = intradayMomentumStudy(hourlySessions(bars));
  assert.equal(s.n, 4);
  close(s.meanBp, 10, 1e-6, "průměr strategie");
  assert.ok(s.correlation > 0.99);
  assert.equal(s.hitRate, 1);
});

test("průraz po první hodině: stop na minimu první hodiny a srovnání s každodenním nákupem", () => {
  const up = hourDay("2026-06-01", [
    [50, 51, 49.5, 51],
    [51, 52, 50.5, 52],
    flat(52),
    flat(52),
    flat(52),
    flat(52),
    [52, 52.1, 51.9, 52],
  ]);
  const stopped = hourDay("2026-06-02", [
    [50, 51, 49.5, 51],
    [51, 51.2, 49, 49.2],
    flat(49.2),
    flat(49.2),
    flat(49.2),
    flat(49.2),
    flat(49.2),
  ]);
  const down = hourDay("2026-06-03", [
    [50, 50.2, 49, 49.5],
    [49.5, 49.6, 49, 49],
    flat(49),
    flat(49),
    flat(49),
    flat(49),
    flat(49),
  ]);
  const s = openingRangeStudy(
    hourlySessions([
      ...up,
      ...stopped,
      ...down,
      ...up.map((b) => ({ ...b, ts: b.ts + 3 * 86400000, ...ny(b.ts + 3 * 86400000) })),
    ]),
  );
  // Obchody: +1/51, stop 49,5/51 − 1, +1/51 (třetí den bez nákupu).
  assert.equal(s.n, 3);
  close(s.meanBp, ((1 / 51 + (49.5 / 51 - 1) + 1 / 51) / 3) * 10000, 1e-6, "průměr");
  close(s.hitRate, 2 / 3, 1e-12, "úspěšnost");
});

test("verdikt podle intervalu a počtu případů", () => {
  assert.equal(edgeVerdict({ n: 10, low: 1, high: 2 }), "MALO_DAT");
  assert.equal(edgeVerdict({ n: 50, low: 0.1, high: 2 }), "VYHODA");
  assert.equal(edgeVerdict({ n: 50, low: -0.1, high: 2 }), "NEPROKAZANO");
  assert.equal(edgeVerdict({ n: 50, low: -2, high: -0.1 }), "NEVYHODA");
});
