// Převod historie INTC z Yahoo Finance chart API (neoficiální rozhraní) do formátů
// pro prognózu. Chybějící hodnoty se nikdy nedopočítávají; neúplné řádky se vynechají.
import { ny } from "./pilot-quotes.mjs";

const positive = (x) => typeof x === "number" && Number.isFinite(x) && x > 0;
// Zaokrouhlení na 0,0001 USD zmenší přenos a nemění pořadí cen (zachová high ≥ open/close ≥ low).
const round4 = (x) => Math.round(x * 10000) / 10000;

function chartOf(payload) {
  const chart = payload?.chart?.result?.[0],
    meta = chart?.meta,
    quote = chart?.indicators?.quote?.[0];
  if (
    meta?.symbol !== "INTC" ||
    meta?.currency !== "USD" ||
    !quote ||
    !Array.isArray(chart.timestamp)
  )
    throw new Error("Zdroj vrátil jiný symbol, měnu nebo neúplná data.");
  return { chart, meta, quote };
}

/**
 * Denní OHLC. Pro výnosy se používá upravený závěr (adjclose: dividendy, splity),
 * pokud ho zdroj dodá; jinak surový závěr a `adjusted: false`. Open/high/low se
 * upravují stejným poměrem (upravený / surový závěr), aby řady byly souměřitelné.
 * Dnešní (neukončený) den se vynechává i po uzavření trhu, stejně jako v Kontextu pohybu.
 * Řádky s neúplným nebo nekonzistentním OHLC se vynechají.
 */
export function parseDailyHistory(payload, now = Date.now()) {
  const { chart, quote } = chartOf(payload);
  const adj = chart.indicators?.adjclose?.[0]?.adjclose;
  const adjusted = Array.isArray(adj) && adj.length === chart.timestamp.length;
  const today = ny(now).date,
    byDate = new Map();
  chart.timestamp.forEach((seconds, i) => {
    if (!positive(seconds)) return;
    const date = ny(seconds * 1000).date,
      open = quote.open?.[i],
      high = quote.high?.[i],
      low = quote.low?.[i],
      close = quote.close?.[i],
      value = adjusted ? adj[i] : close;
    if (
      date >= today ||
      ![open, high, low, close, value].every(positive) ||
      low > Math.min(open, close) ||
      high < Math.max(open, close)
    )
      return;
    const factor = value / close;
    byDate.set(date, {
      date,
      close: round4(close),
      value: round4(value),
      open: round4(open * factor),
      high: round4(high * factor),
      low: round4(low * factor),
    });
  });
  const rows = [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
  if (rows.length < 300) throw new Error("Méně než 300 denních záznamů; na prognózu to nestačí.");
  return {
    adjusted,
    dates: rows.map((row) => row.date),
    closes: rows.map((row) => row.close),
    values: rows.map((row) => row.value),
    opens: rows.map((row) => row.open),
    highs: rows.map((row) => row.high),
    lows: rows.map((row) => row.low),
    first: rows[0].date,
    last: rows[rows.length - 1].date,
    stale: now - Date.parse(rows[rows.length - 1].date + "T21:00:00Z") > 7 * 86400000,
  };
}

const INTERVALS = Object.freeze({ "1m": 1, "5m": 5, "60m": 60, "1h": 60 });

/**
 * Svíčky 1, 5 nebo 60 min ve formátu enginu (ts, o, h, l, c, v, date, minute ET).
 * Nekonzistentní OHLC, duplicitní časy a budoucí svíčky se vyřadí (počet v `rejected`).
 * Neúplné seance (např. dnešní) vyřadí až `sessions()` v enginu (1 a 5 min)
 * nebo `hourlySessions()` v pilot-edge.mjs (60 min).
 */
export function parseIntradayHistory(payload, now = Date.now()) {
  const { chart, meta, quote } = chartOf(payload);
  const interval = INTERVALS[meta.dataGranularity] ?? null;
  if (interval === null) throw new Error("Zdroj nevrátil 1min, 5min ani hodinové svíčky.");
  const seen = new Set(),
    bars = [];
  let rejected = 0;
  chart.timestamp.forEach((seconds, i) => {
    const ts = seconds * 1000,
      o = quote.open?.[i],
      h = quote.high?.[i],
      l = quote.low?.[i],
      c = quote.close?.[i],
      v = quote.volume?.[i];
    if (
      !positive(seconds) ||
      ts > now ||
      seen.has(ts) ||
      ![o, h, l, c].every(positive) ||
      l > Math.min(o, c) ||
      h < Math.max(o, c)
    ) {
      rejected++;
      return;
    }
    seen.add(ts);
    bars.push({
      ts,
      o: round4(o),
      h: round4(h),
      l: round4(l),
      c: round4(c),
      v: typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0,
      ...ny(ts),
    });
  });
  bars.sort((a, b) => a.ts - b.ts);
  if (bars.length < 2) throw new Error("Zdroj nevrátil použitelné svíčky.");
  return { bars, interval, rejected };
}
