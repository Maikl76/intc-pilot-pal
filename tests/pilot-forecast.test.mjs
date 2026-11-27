import test from "node:test";
import assert from "node:assert/strict";
import { defaults, ny, run, sessions } from "../src/lib/pilot-engine.mjs";
import {
  bootstrapMean,
  calibrationBacktest,
  chanceTargetFirst,
  combinedForecast,
  dailyResults,
  gaussian,
  logReturns,
  normalCdf,
  normalQuantile,
  positionForecast,
  priceForecast,
  probabilityAbove,
  randomEntryOutcomes,
  randomEntryTest,
  seededRandom,
  tailFacts,
  tradeStatistics,
  volatility,
  wilsonInterval,
} from "../src/lib/pilot-forecast.mjs";

const close = (actual, expected, tolerance, label = "") =>
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${label} ${actual} se liší od ${expected} o více než ${tolerance}`,
  );

// Pracovní dny od data `from` (svátky se v syntetických datech neřeší).
function weekdays(from, count) {
  const out = [];
  for (let t = Date.parse(from + "T12:00:00Z"); out.length < count; t += 86400000) {
    const day = new Date(t).getUTCDay();
    if (day !== 0 && day !== 6) out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}
// Začátek seance 09:30 New York v UTC (13:30 v letním, 14:30 v zimním čase).
function sessionStart(date) {
  const summer = Date.parse(date + "T13:30:00Z");
  return ny(summer).minute === 570 ? summer : summer + 3600000;
}
// Jedna úplná 5min seance z řady závěrů svíček; open svíčky = předchozí close.
function sessionBars(date, open, closes, wick = 0.03) {
  let previous = open;
  return closes.map((c, i) => {
    const ts = sessionStart(date) + i * 300000;
    const bar = {
      ts,
      o: previous,
      h: Math.max(previous, c) + wick,
      l: Math.min(previous, c) - wick,
      c,
      v: 1000,
      ...ny(ts),
    };
    previous = c;
    return bar;
  });
}
const linear = (from, to, n = 78) =>
  Array.from({ length: n }, (_, i) => from + ((to - from) * (i + 1)) / n);

test("normální rozdělení: známé kvantily a inverze", () => {
  close(normalQuantile(0.975), 1.959963985, 1e-8, "z 97,5 %");
  close(normalQuantile(0.9), 1.2815515655, 1e-8, "z 90 %");
  assert.equal(normalQuantile(0.5), 0);
  close(normalCdf(1), 0.8413447461, 2e-7, "Φ(1)");
  close(normalCdf(-1), 0.1586552539, 2e-7, "Φ(−1)");
  for (const p of [0.001, 0.02, 0.1, 0.5, 0.9, 0.98, 0.999])
    close(normalCdf(normalQuantile(p)), p, 3e-7, "Φ(Φ⁻¹)");
  assert.throws(() => normalQuantile(0));
  assert.throws(() => normalQuantile(1));
});

test("generátor se semínkem je opakovatelný a normální čísla mají správný průměr a SD", () => {
  const a = seededRandom(5),
    b = seededRandom(5);
  for (let i = 0; i < 5; i++) assert.equal(a(), b());
  const random = seededRandom(9),
    values = Array.from({ length: 20000 }, () => gaussian(random));
  const avg = values.reduce((s, x) => s + x, 0) / values.length;
  const sd = Math.sqrt(values.reduce((s, x) => s + (x - avg) ** 2, 0) / (values.length - 1));
  close(avg, 0, 0.03, "průměr");
  close(sd, 1, 0.03, "SD");
});

test("Wilsonův interval odpovídá tabulkové hodnotě pro 7 z 10", () => {
  const w = wilsonInterval(7, 10);
  close(w.low, 0.3968, 5e-4, "dolní");
  close(w.high, 0.8922, 5e-4, "horní");
});

test("log výnosy a volatilita z výnosů ±1 %", () => {
  assert.deepEqual(logReturns([100, 110]), [Math.log(1.1)]);
  assert.throws(() => logReturns([100, 0]));
  const closes = [100];
  for (let i = 0; i < 252; i++) closes.push(closes.at(-1) * Math.exp(i % 2 ? -0.01 : 0.01));
  const v = volatility(closes, 252);
  close(v.sigmaDaily, 0.01 * Math.sqrt(252 / 251), 1e-12, "denní σ");
  close(v.sigmaAnnual, v.sigmaDaily * Math.sqrt(252), 1e-12, "roční σ");
  assert.throws(() => volatility(closes.slice(0, 100), 252));
});

test("pásmo ceny: bez trendu je medián dnešní cena, s trendem 10 % ročně o 10 % výš", () => {
  const f = priceForecast({ price: 100, sigmaAnnual: 0.4, days: 252, levels: [0.8] });
  assert.equal(f.median, 100);
  const z = 1.2815515655446004;
  close(f.bands[0].low, 100 * Math.exp(-z * 0.4), 1e-7, "dolní hranice");
  close(f.bands[0].high, 100 * Math.exp(z * 0.4), 1e-7, "horní hranice");
  close(probabilityAbove(f, 100), 0.5, 1e-6, "P(nad dnešní cenou)");
  const trend = priceForecast({
    price: 100,
    sigmaAnnual: 0.4,
    driftAnnual: Math.log(1.1),
    days: 252,
  });
  close(trend.median, 110, 1e-9, "medián s trendem");
  const half = priceForecast({ price: 100, sigmaAnnual: 0.4, days: 63 });
  close(half.logSd, 0.2, 1e-12, "σ roste s odmocninou času");
});

test("dlouhodobá pozice: změna hodnoty, výsledek proti nákupu a pravděpodobnosti", () => {
  const f = positionForecast({
    qty: 10,
    avgPrice: 50,
    price: 100,
    sigmaAnnual: 0.4,
    days: 252,
    fx: 20,
  });
  assert.equal(f.valueNowCzk, 20000);
  assert.equal(f.medianChangeCzk, 0);
  assert.equal(f.medianResultCzk, 10000);
  const z = 1.2815515655446004;
  close(f.bandsCzk[0].changeLow, 10 * (100 * Math.exp(-z * 0.4) - 100) * 20, 1e-3, "dolní změna");
  close(f.bandsCzk[0].resultHigh, 10 * (100 * Math.exp(z * 0.4) - 50) * 20, 1e-3, "horní výsledek");
  // P(S > 50) = Φ(ln 2 / 0,4); P(S < 80) = Φ(ln 0,8 / 0,4)
  close(f.probabilityProfit, 0.9584404, 1e-6, "P(zisk)");
  close(f.probabilityDrop20, 0.2884704, 1e-6, "P(pokles o 20 %)");
  const empty = positionForecast({
    qty: 0,
    avgPrice: 0,
    price: 100,
    sigmaAnnual: 0.4,
    days: 21,
    fx: 20,
  });
  assert.equal(empty.probabilityProfit, null);
  assert.equal(empty.medianResultCzk, null);
});

test("zpětná kontrola pásma: náhodná data s danou σ jsou kalibrovaná, směr je náhoda", () => {
  const random = seededRandom(3),
    closes = [50];
  for (let i = 0; i < 10000; i++) closes.push(closes.at(-1) * Math.exp(0.02 * gaussian(random)));
  for (const horizon of [5, 21, 63]) {
    const c = calibrationBacktest(closes, { lookback: 252, horizon, level: 0.8 });
    close(c.coverage, 0.8, 0.04, "pokrytí h=" + horizon);
    close(c.directionHitRate, 0.5, 0.05, "směr h=" + horizon);
    close(c.below + c.above + c.coverage, 1, 1e-12, "součet");
  }
});

test("zpětná kontrola nepoužívá budoucí data: stálý růst leží vždy nad pásmem nulové šíře", () => {
  const closes = Array.from({ length: 400 }, (_, i) => 100 * Math.exp(0.01 * i));
  const c = calibrationBacktest(closes, { lookback: 252, horizon: 21 });
  assert.equal(c.count, 399 - 252 - 21 + 1);
  assert.equal(c.coverage, 0);
  assert.equal(c.above, 1);
  assert.equal(c.directionHitRate, 1);
  assert.equal(calibrationBacktest(closes.slice(0, 200), { lookback: 252, horizon: 21 }), null);
});

test("extrémní dny: nejhorší propad a jeho datum", () => {
  const t = tailFacts([100, 85, 93.5, 74.8], ["a", "b", "c", "d"]);
  close(t.worstPct, -20, 1e-9, "nejhorší den");
  assert.equal(t.worstDate, "d");
  assert.equal(t.dropsAtLeast10, 2);
  assert.equal(t.dropsAtLeast5, 2);
});

test("náhoda: cíl +1 dřív než stop −1,5 v 60 % případů", () => {
  close(chanceTargetFirst(1, 1.5), 0.6, 1e-12, "náhoda");
  close(chanceTargetFirst(2, 1), 1 / 3, 1e-12, "náhoda 2:1");
  assert.equal(chanceTargetFirst(1, 0), null);
});

test("statistika obchodů: průměr, SD, počet potřebných obchodů a opakovatelný bootstrap", () => {
  const s = tradeStatistics([1, -1, 1, -1, 1]);
  assert.equal(s.n, 5);
  close(s.mean, 0.2, 1e-12, "průměr");
  close(s.sd, Math.sqrt(1.2), 1e-12, "SD");
  assert.equal(s.wins, 3);
  assert.equal(s.requiredTrades, 116);
  assert.ok(s.ciLow < 0.2 && s.ciHigh > 0.2);
  assert.deepEqual(bootstrapMean([1, 2, 3, 4]), bootstrapMean([1, 2, 3, 4]));
  assert.equal(tradeStatistics([-1, -1]).requiredTrades, null);
});

test("náhodný nákup používá stejné výstupy jako engine (cíl, stop, časový výstup)", () => {
  const dates = weekdays("2026-06-01", 3);
  const paths = [linear(50, 52), linear(50, 48), linear(50, 50.4)];
  const bars = dates.flatMap((date, i) => sessionBars(date, 50, paths[i]));
  const { days, excluded } = sessions({ bars, interval: 5, rejected: 0 });
  assert.equal(days.length, 3);
  assert.equal(excluded.length, 0);
  const settings = {
    ...defaults,
    signal: "open",
    gapPct: 0,
    holdDays: 0,
    targetUsd: 1,
    stopUsd: 1.5,
    fee: 0.02,
  };
  const engine = run(days, settings);
  assert.deepEqual(
    engine.trades.map((t) => t.reason),
    ["TARGET", "STOP", "TIME"],
  );
  const outcomes = randomEntryOutcomes(days, settings);
  assert.equal(outcomes.days.length, 3);
  engine.trades.forEach((trade, j) =>
    close(outcomes.days[j][0], trade.pnlUsd / trade.qty, 1e-9, "den " + j),
  );
  close(outcomes.days[0][0], 1 - 0.04, 1e-9, "cíl");
  close(outcomes.days[1][0], -1.5 - 0.04, 1e-9, "stop");
  // Vstupní okno do 11:30 ET = svíčky 09:30–11:30, tedy 25 svíček po 5 min.
  assert.equal(outcomes.days[0].length, 25);
});

test("bez výhody je průměrný výsledek náhodného nákupu přibližně minus náklady", () => {
  // Kroky po 0,25 USD bez knotů: cíl (+4 kroky) i stop (−6 kroků) leží přesně na mřížce,
  // takže výstup = hodnota procházky a očekávaný výsledek je přesně −2 × náklady.
  const random = seededRandom(17),
    dates = weekdays("2026-03-16", 800);
  const bars = dates.flatMap((date) => {
    let price = 50;
    const closes = Array.from({ length: 78 }, () => (price += random() < 0.5 ? 0.25 : -0.25));
    return sessionBars(date, 50, closes, 0);
  });
  const { days } = sessions({ bars, interval: 5, rejected: 0 });
  assert.equal(days.length, 800);
  const settings = { ...defaults, gapPct: 0, holdDays: 0, targetUsd: 1, stopUsd: 1.5, fee: 0.02 };
  const outcomes = randomEntryOutcomes(days, settings);
  assert.equal(outcomes.count, 800 * 25);
  close(outcomes.mean, -0.04, 0.06, "průměr bez výhody");
  // Bez trendu dosáhne cena +1 dřív než −1,5 asi v 60 % vyřešených obchodů.
  close(outcomes.targetShare / (outcomes.targetShare + outcomes.stopShare), 0.6, 0.04, "náhoda");
  close(
    outcomes.targetShare + outcomes.stopShare + outcomes.timeShare + outcomes.openShare,
    1,
    1e-12,
  );
  // Pravidla se stejným průměrem jako náhoda: p-hodnota kolem poloviny.
  const t = randomEntryTest(outcomes, 40, outcomes.mean);
  close(t.pValue, 0.5, 0.1, "p-hodnota");
  assert.ok(t.low < outcomes.mean && t.high > outcomes.mean);
});

test("test proti náhodě: hranice p-hodnoty", () => {
  const outcomes = {
    days: [
      [-0.04, -0.04, -0.04],
      [-0.04, -0.04],
    ],
  };
  assert.equal(randomEntryTest(outcomes, 2, -0.04, { sets: 99 }).pValue, 1);
  assert.equal(randomEntryTest(outcomes, 2, 0, { sets: 99 }).pValue, 0.01);
  assert.equal(randomEntryTest({ days: [] }, 2, 0), null);
});

test("výsledky po seancích a součet obou částí kapitálu", () => {
  const days = [{ date: "a" }, { date: "b" }, { date: "c" }];
  assert.deepEqual(
    dailyResults(days, [
      { exitDate: "b", pnlCzk: 10 },
      { exitDate: "b", pnlCzk: -4 },
    ]),
    [0, 6, 0],
  );
  const f = combinedForecast({
    longTerm: { qty: 10, price: 100, sigmaAnnual: 0, driftAnnual: Math.log(1.1), fx: 20 },
    dayTrading: { dailyCzk: [100, 100, 100] },
    horizon: 252,
    simulations: 200,
  });
  close(f.longTerm.p05, 10 * 10 * 20, 1e-6, "dlouhodobá část");
  close(f.longTerm.p95, 10 * 10 * 20, 1e-6, "dlouhodobá část");
  close(f.dayTrading.p50, 252 * 100, 1e-6, "denní obchodování");
  close(f.total.p10, 2000 + 25200, 1e-6, "celkem");
  assert.equal(f.probabilityLoss, 0);
  const none = combinedForecast({ longTerm: null, dayTrading: null, horizon: 21, simulations: 10 });
  assert.equal(none.longTerm, null);
  assert.equal(none.dayTrading, null);
  assert.equal(none.total.p50, 0);
});
