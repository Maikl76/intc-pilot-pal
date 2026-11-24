import { marketCalendar } from "./pilot-quotes.mjs";
const fmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const day = (ts) => fmt.format(new Date(ts));
const positive = (x) => typeof x === "number" && Number.isFinite(x) && x > 0;
const mean = (values) => values.reduce((s, v) => s + v, 0) / values.length;
const sd = (values) => {
  const avg = mean(values);
  return Math.sqrt(values.reduce((s, v) => s + (v - avg) ** 2, 0) / (values.length - 1));
};
export function parseDailyContext(payload, symbol, now = Date.now()) {
  if (!["INTC", "SOXX", "QQQ"].includes(symbol)) throw new Error("Nepodporovaný symbol.");
  const chart = payload?.chart?.result?.[0],
    meta = chart?.meta,
    prices = chart?.indicators?.quote?.[0];
  if (
    meta?.symbol !== symbol ||
    meta?.currency !== "USD" ||
    !prices ||
    !Array.isArray(chart.timestamp)
  )
    throw new Error("Zdroj vrátil jiný symbol, měnu nebo neúplná data.");
  const today = day(now),
    unique = new Map();
  let expectedDate = null;
  for (let offset = 1; offset <= 14; offset++) {
    const candidate = Date.parse(today + "T17:00:00Z") - offset * 86400000;
    const calendar = marketCalendar(candidate);
    if (!calendar.verified) break;
    if (!calendar.closed) {
      expectedDate = calendar.date;
      break;
    }
  }
  chart.timestamp.forEach((sec, i) => {
    const ts = sec * 1000,
      date = positive(sec) ? day(ts) : "";
    const o = prices.open?.[i],
      h = prices.high?.[i],
      l = prices.low?.[i],
      c = prices.close?.[i],
      v = prices.volume?.[i];
    if (
      !date ||
      date >= today ||
      ![o, h, l, c].every(positive) ||
      l > Math.min(o, c) ||
      h < Math.max(o, c) ||
      h < l
    )
      return;
    unique.set(date, {
      date,
      ts,
      o,
      h,
      l,
      c,
      v: typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null,
    });
  });
  const bars = [...unique.values()].sort((a, b) => a.ts - b.ts);
  if (bars.length < 23) throw new Error("Méně než 23 úplných denních záznamů.");
  const last = bars.at(-1),
    previous = bars.at(-2);
  const returns = bars.slice(1).map((bar, i) => Math.log(bar.c / bars[i].c));
  const priorReturns = returns.slice(-21, -1),
    volatility = sd(returns.slice(-20));
  const trueRanges = bars
    .slice(1)
    .map((bar, i) =>
      Math.max(bar.h - bar.l, Math.abs(bar.h - bars[i].c), Math.abs(bar.l - bars[i].c)),
    );
  const priorVolumes = bars
    .slice(-21, -1)
    .map((b) => b.v)
    .filter((v) => v !== null && v > 0);
  const priorSD = sd(priorReturns);
  return {
    symbol,
    date: last.date,
    previousDate: previous.date,
    expectedDate,
    stale: expectedDate !== null ? last.date < expectedDate : now - last.ts > 7 * 86400000,
    close: last.c,
    changePct: (last.c / previous.c - 1) * 100,
    atr14: mean(trueRanges.slice(-14)),
    volatility20Pct: volatility * Math.sqrt(252) * 100,
    volumeRatio: last.v != null && priorVolumes.length === 20 ? last.v / mean(priorVolumes) : null,
    moveScore: priorSD > 0 ? (returns.at(-1) - mean(priorReturns)) / priorSD : null,
    from: bars.at(-21).date,
    count: bars.length,
    bars: bars.slice(-22).map((b) => ({ date: b.date, close: b.c })),
  };
}
export function alignContext(items) {
  const intel = items.find((x) => x.symbol === "INTC");
  if (!intel) return { date: null, items: [], sectorDifference: null };
  const aligned = items.filter(
      (x) => x.date === intel.date && x.previousDate === intel.previousDate,
    ),
    sector = aligned.find((x) => x.symbol === "SOXX");
  return {
    date: intel.date,
    items: aligned,
    sectorDifference: sector ? intel.changePct - sector.changePct : null,
  };
}
export function payoff({ qty, target, stop, fee, probability }) {
  if (
    ![qty, target, stop, fee, probability].every(Number.isFinite) ||
    qty < 1 ||
    !Number.isInteger(qty) ||
    target <= 0 ||
    stop <= 0 ||
    fee < 0 ||
    probability < 0 ||
    probability > 100
  )
    throw new Error("Zkontroluj počet, cíl, stop, náklady a pravděpodobnost.");
  const win = qty * (target - 2 * fee),
    loss = qty * (stop + 2 * fee);
  return {
    grossWin: qty * target,
    costs: qty * 2 * fee,
    win,
    loss,
    breakEvenPct: (100 * loss) / (loss + win),
    expected: (probability / 100) * win - (1 - probability / 100) * loss,
    winsToRecover: win > 0 ? loss / win : null,
  };
}
