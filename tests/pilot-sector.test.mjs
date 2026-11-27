import test from "node:test";
import assert from "node:assert/strict";
import { gaussian, seededRandom } from "../src/lib/pilot-forecast.mjs";
import {
  alignedReturns,
  betaFit,
  classifyMove,
  correlation,
  correlationTable,
  decomposeMove,
  sectorDipStudy,
  trailingBeta,
} from "../src/lib/pilot-sector.mjs";
import { parseDailyHistory, parseLiveMeta } from "../src/lib/pilot-history.mjs";

const close = (actual, expected, tolerance = 1e-9, label = "") =>
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${label} ${actual} se liší od ${expected} o více než ${tolerance}`,
  );
const days = (n) => Array.from({ length: n }, (_, i) => "d" + String(i).padStart(5, "0"));
// Řada cen z log výnosů.
const pricesFrom = (returns) => {
  const out = [100];
  for (const r of returns) out.push(out[out.length - 1] * Math.exp(r));
  return out;
};

test("zarovnání podle data: jen společné dny, výnosy mezi společnými dny", () => {
  const a = { dates: ["a", "b", "c", "d"], values: [10, 11, 12, 13] };
  const b = { dates: ["a", "c", "d"], values: [20, 22, 24] };
  const r = alignedReturns(a, b);
  assert.deepEqual(r.dates, ["c", "d"]);
  close(r.a[0], Math.log(12 / 10));
  close(r.b[0], Math.log(22 / 20));
  close(r.a[1], Math.log(13 / 12));
});

test("korelace, beta a R² na řadě se známým vztahem", () => {
  const x = [0.01, -0.02, 0.03, -0.01, 0.02];
  close(correlation(x, x), 1);
  close(
    correlation(
      x,
      x.map((v) => -v),
    ),
    -1,
  );
  const fit = betaFit(
    x,
    x.map((v) => 1.5 * v + 0.001),
  );
  close(fit.beta, 1.5);
  close(fit.r2, 1);
  assert.equal(correlation([1, 1, 1], [1, 2, 3]), null);
});

test("tabulka korelací: shodná řada má korelaci 1, nezávislá kolem 0", () => {
  const random = seededRandom(4),
    n = 600,
    dates = days(n + 1);
  const r1 = Array.from({ length: n }, () => 0.02 * gaussian(random));
  const r2 = Array.from({ length: n }, () => 0.02 * gaussian(random));
  const intc = { dates, values: pricesFrom(r1) };
  const table = correlationTable(intc, [
    { symbol: "SAME", dates, values: pricesFrom(r1) },
    { symbol: "OTHER", dates, values: pricesFrom(r2) },
  ]);
  close(table[0].full, 1, 1e-9, "shodná");
  close(table[0].recent, 1, 1e-9, "shodná poslední rok");
  assert.ok(Math.abs(table[1].full) < 0.1, "nezávislá " + table[1].full);
  assert.equal(table[1].days, n);
});

test("rozklad pohybu: Intel −4 % při sektoru −2 % a beta 1,5", () => {
  const d = decomposeMove({ intcPct: -4, sectorPct: -2, beta: 1.5 });
  close(d.sectorPartPct, (Math.exp(1.5 * Math.log(0.98)) - 1) * 100, 1e-9, "sektor");
  close(d.ownPartPct, (Math.exp(Math.log(0.96) - 1.5 * Math.log(0.98)) - 1) * 100, 1e-9, "vlastní");
  // Součin částí dává celkový pohyb.
  close((1 + d.sectorPartPct / 100) * (1 + d.ownPartPct / 100), 0.96, 1e-12, "součet");
  assert.equal(classifyMove({ intcPct: -4, ownPartPct: -0.5 }), "SECTOR");
  assert.equal(classifyMove({ intcPct: -4, ownPartPct: -3.5 }), "OWN");
  assert.equal(classifyMove({ intcPct: -4, ownPartPct: -2 }), "MIXED");
  assert.equal(classifyMove({ intcPct: -1, ownPartPct: -1 }), "NO_DROP");
});

test("beta z posledních dní nepoužívá den, pro který se počítá", () => {
  const random = seededRandom(8),
    n = 300;
  const sector = Array.from({ length: n }, () => 0.01 * gaussian(random));
  const intcR = sector.map((r) => 2 * r);
  intcR[n - 1] = 0.5; // extrémní poslední den nesmí betu ovlivnit
  const aligned = { dates: days(n), a: intcR, b: sector };
  close(trailingBeta(aligned, { window: 252, end: n - 1 }).beta, 2, 1e-9, "beta");
  assert.equal(trailingBeta(aligned, { window: 252, end: 100 }), null);
});

test("poklesy podle příčiny: po poklesu se sektorem návrat, po vlastním poklesu pokračování", () => {
  // Sektor náhodně, Intel = sektor + vlastní šum. Opakovaně vložené dva typy poklesu:
  // se sektorem (oba −5 %, pak 5 dní celkem +3 %) a vlastní (jen Intel −5 %, pak −2 %).
  const random = seededRandom(21),
    sector = [],
    intc = [];
  const day = (s, own) => {
    sector.push(s);
    intc.push(s + own);
  };
  for (let i = 0; i < 300; i++) day(0.005 * gaussian(random), 0.002 * gaussian(random));
  for (let k = 0; k < 30; k++) {
    for (let i = 0; i < 8; i++) day(0, 0);
    day(Math.log(0.95), 0);
    for (let i = 0; i < 5; i++) day(0, Math.log(1.03) / 5);
    for (let i = 0; i < 8; i++) day(0, 0);
    day(0, Math.log(0.95));
    for (let i = 0; i < 5; i++) day(0, Math.log(0.98) / 5);
  }
  const aligned = { dates: days(intc.length), a: intc, b: sector };
  const s = sectorDipStudy(aligned, { dropPct: 3, horizon: 5, window: 252 });
  assert.equal(s.sector.n, 30);
  assert.equal(s.own.n, 30);
  close(s.sector.meanPct, 3, 1e-6, "se sektorem");
  close(s.own.meanPct, -2, 1e-6, "vlastní");
  assert.ok(s.sector.excessLowPct > 0);
  assert.ok(s.own.excessHighPct < 0);
});

test("historie srovnávacího symbolu a aktuální cena z hlaviček", () => {
  const start = Date.parse("2025-06-02T13:30:00Z") / 1000;
  const timestamp = Array.from({ length: 320 }, (_, i) => start + i * 86400);
  const closes = timestamp.map((_, i) => 200 + (i % 5));
  const payload = (symbol, meta = {}) => ({
    chart: {
      result: [
        {
          meta: { symbol, currency: "USD", ...meta },
          timestamp,
          indicators: {
            quote: [
              {
                open: closes,
                high: closes.map((c) => c + 1),
                low: closes.map((c) => c - 1),
                close: closes,
              },
            ],
          },
        },
      ],
    },
  });
  const now = Date.parse("2026-11-27T18:00:00Z");
  const soxx = parseDailyHistory(payload("SOXX"), now, "SOXX");
  assert.equal(soxx.symbol, "SOXX");
  assert.equal(soxx.dates.length, 320);
  assert.throws(() => parseDailyHistory(payload("SOXX"), now, "INTC"));
  assert.throws(() => parseDailyHistory(payload("TSLA"), now, "TSLA"));
  const live = parseLiveMeta(
    payload("SOXX", {
      regularMarketPrice: 210,
      chartPreviousClose: 200,
      regularMarketTime: Date.parse("2026-11-27T17:00:00Z") / 1000,
    }),
    "SOXX",
    now,
  );
  assert.equal(live.price, 210);
  assert.equal(live.previousClose, 200);
  assert.equal(live.date, "2026-11-27");
  const future = parseLiveMeta(
    payload("SOXX", {
      regularMarketPrice: 210,
      chartPreviousClose: 200,
      regularMarketTime: Date.parse("2026-11-28T17:00:00Z") / 1000,
    }),
    "SOXX",
    now,
  );
  assert.equal(future, null);
});
