// Nástroje profesionálů: velikost pozice podle rizika a signály ověřené na historii INTC.
// Čisté deterministické funkce; bootstrap má pevné semínko. Ceny v USD.
import { bootstrapMean, logReturns, mean, quantile, sampleSd } from "./pilot-forecast.mjs";

const TRADING_DAYS = 252;
const finitePositive = (value, name) => {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0)
    throw new Error(`Hodnota ${name} musí být kladné číslo.`);
  return value;
};
const tStat = (values) => {
  const sd = sampleSd(values);
  return values.length > 2 && sd > 0 ? mean(values) / (sd / Math.sqrt(values.length)) : null;
};
function riskStats(logs) {
  let equity = 0,
    peak = 0,
    worst = 0;
  for (const r of logs) {
    equity += r;
    peak = Math.max(peak, equity);
    worst = Math.min(worst, equity - peak);
  }
  return {
    annualPct: mean(logs) * TRADING_DAYS * 100,
    volatilityPct: sampleSd(logs) * Math.sqrt(TRADING_DAYS) * 100,
    maxDrawdownPct: (Math.exp(worst) - 1) * 100,
  };
}

// ---------------------------------------------------------------------------
// Řízení rizika
// ---------------------------------------------------------------------------

/** Průměrný skutečný rozsah (ATR): průměr posledních n hodnot max(H−L, |H−C₋₁|, |L−C₋₁|). */
export function averageTrueRange(highs, lows, closes, n = 14) {
  if (highs.length !== closes.length || lows.length !== closes.length)
    throw new Error("Řady high, low a close musí mít stejnou délku.");
  if (!Number.isInteger(n) || n < 1 || closes.length < n + 1) throw new Error("Málo dat pro ATR.");
  const ranges = [];
  for (let i = closes.length - n; i < closes.length; i++) {
    const previous = closes[i - 1];
    ranges.push(
      Math.max(highs[i] - lows[i], Math.abs(highs[i] - previous), Math.abs(lows[i] - previous)),
    );
  }
  return mean(ranges);
}

/**
 * Velikost pozice podle rizika (postup obchodních firem): nejdřív stop, pak počet akcií.
 *   riziko v USD = kapitál × riziko % ÷ kurz,
 *   ztráta na akcii při stopu = vstup − stop + 2 × náklady,
 *   počet akcií = ⌊riziko ÷ ztráta na akcii⌋, nejvýše kolik dovolí kapitál.
 * Cíl = vstup + R × (vstup − stop). Potřebná úspěšnost = ztráta ÷ (ztráta + zisk na akcii).
 */
export function positionPlan({ capitalCzk, riskPct, entry, stop, fx, fee = 0, targetR = 1.5 }) {
  finitePositive(capitalCzk, "kapitál");
  finitePositive(entry, "vstupní cena");
  finitePositive(stop, "stop");
  finitePositive(fx, "kurz");
  finitePositive(targetR, "cíl v R");
  if (!(riskPct > 0 && riskPct <= 10)) throw new Error("Riziko na obchod musí být 0–10 %.");
  if (!(fee >= 0) || !Number.isFinite(fee)) throw new Error("Náklady musí být nezáporné.");
  if (stop >= entry) throw new Error("Stop musí být pod vstupní cenou.");
  const riskUsd = (capitalCzk * riskPct) / 100 / fx;
  const lossPerShare = entry - stop + 2 * fee;
  const target = entry + targetR * (entry - stop);
  const winPerShare = target - entry - 2 * fee;
  const byRisk = Math.floor(riskUsd / lossPerShare);
  const affordable = Math.floor(capitalCzk / fx / (entry + fee));
  const shares = Math.max(0, Math.min(byRisk, affordable));
  const positionUsd = shares * (entry + fee);
  return {
    shares,
    limitedByCapital: byRisk > affordable,
    riskUsd,
    riskCzk: riskUsd * fx,
    lossPerShare,
    maxLossUsd: shares * lossPerShare,
    maxLossCzk: shares * lossPerShare * fx,
    positionUsd,
    positionCzk: positionUsd * fx,
    capitalShare: (positionUsd * fx) / capitalCzk,
    target,
    winUsd: shares * winPerShare,
    winCzk: shares * winPerShare * fx,
    breakEvenRate: winPerShare > 0 ? lossPerShare / (lossPerShare + winPerShare) : null,
    stopDistancePct: ((entry - stop) / entry) * 100,
  };
}

/**
 * Přikoupení ve ztrátě: nový průměr a ztráta celé pozice, kdyby cena došla ke stopu.
 * Ztráta ke stopu = počet × (průměr − stop); přikoupením roste o přikoupené × (cena − stop).
 */
export function averagingDown({ qty, avgPrice, addQty, addPrice, stop }) {
  if (![qty, avgPrice, addQty, addPrice, stop].every((x) => Number.isFinite(x) && x >= 0))
    throw new Error("Zadej nezáporná čísla.");
  const newQty = qty + addQty;
  const newAvg = newQty > 0 ? (qty * avgPrice + addQty * addPrice) / newQty : 0;
  return {
    newQty,
    newAvg,
    riskBefore: qty * Math.max(0, avgPrice - stop),
    riskAfter: newQty * Math.max(0, newAvg - stop),
  };
}

/** Klouzavá 20denní volatilita (roční, výběrová SD log výnosů × √252) končící u každého dne. */
function rollingVolatility(returns, window) {
  const out = new Array(returns.length).fill(null);
  for (let i = window; i <= returns.length; i++)
    out[i - 1] = sampleSd(returns.slice(i - window, i)) * Math.sqrt(TRADING_DAYS);
  return out;
}

/**
 * Kolísání teď proti obvyklému: 20denní volatilita proti mediánu 20denních volatilit
 * za poslední rok. Násobek velikosti pozice = obvyklá ÷ současná, v mezích 0,25–1
 * (pozice se při vyšším kolísání zmenšuje, nikdy nezvětšuje).
 */
export function volatilityRegime(values, { short = 20, long = TRADING_DAYS } = {}) {
  const returns = logReturns(values);
  if (returns.length < short + long) return null;
  const vols = rollingVolatility(returns, short).slice(-long);
  const current = vols[vols.length - 1];
  const normal = quantile(
    [...vols].sort((a, b) => a - b),
    0.5,
  );
  return {
    currentPct: current * 100,
    normalPct: normal * 100,
    ratio: current / normal,
    multiplier: Math.min(1, Math.max(0.25, normal / current)),
  };
}

/**
 * Zpětné srovnání: stálé držení proti pozici zmenšené podle kolísání. Velikost na další
 * den = min(1, medián 20denní volatility za předchozí rok ÷ současná), bez pohledu
 * do budoucnosti. Výsledek: roční log výnos, volatilita a největší propad obou variant.
 */
export function volatilityScalingStudy(values, { short = 20, long = TRADING_DAYS } = {}) {
  const returns = logReturns(values);
  if (returns.length < short + long + 60) return null;
  const vols = rollingVolatility(returns, short);
  const hold = [],
    scaled = [];
  for (let i = short + long - 1; i < returns.length - 1; i++) {
    const history = vols.slice(i - long + 1, i + 1).filter((v) => v !== null);
    const normal = quantile(
      history.sort((a, b) => a - b),
      0.5,
    );
    const size = Math.min(1, normal / vols[i]);
    hold.push(returns[i + 1]);
    scaled.push(size * returns[i + 1]);
  }
  return { days: hold.length, hold: riskStats(hold), scaled: riskStats(scaled) };
}

// ---------------------------------------------------------------------------
// Signály ověřené na historii
// ---------------------------------------------------------------------------

/**
 * Co následovalo po denním poklesu o `dropPct` % a víc (krátkodobý návrat ceny):
 * prostý výnos za dalších `horizon` dní z upravených závěrů. Události se nepřekrývají
 * (další nejdřív po skončení předchozí). Srovnání s průměrem všech období stejné délky;
 * interval výhody = bootstrap interval průměru po události minus běžný průměr.
 */
export function dipStudy(values, dates, { dropPct = 3, horizon = 5, seed = 3 } = {}) {
  const returns = logReturns(values),
    threshold = Math.log(1 - dropPct / 100);
  const outcomes = [];
  let next = 0,
    lastEvent = null;
  for (let i = 0; i + horizon < returns.length; i++) {
    if (i < next || returns[i] > threshold + 1e-12) continue; // tolerance zaokrouhlení: přesně −X % se počítá
    let sum = 0;
    for (let k = i + 1; k <= i + horizon; k++) sum += returns[k];
    outcomes.push(Math.exp(sum) - 1);
    lastEvent = dates?.[i + 1] ?? null;
    next = i + 1 + horizon;
  }
  const windows = [];
  for (let i = 0; i + horizon <= returns.length; i++) {
    let sum = 0;
    for (let k = i; k < i + horizon; k++) sum += returns[k];
    windows.push(Math.exp(sum) - 1);
  }
  const baseline = mean(windows);
  const ci = bootstrapMean(outcomes, { seed });
  const avg = mean(outcomes);
  return {
    dropPct,
    horizon,
    n: outcomes.length,
    meanPct: avg * 100,
    baselinePct: baseline * 100,
    excessPct: (avg - baseline) * 100,
    excessLowPct: (ci.low - baseline) * 100,
    excessHighPct: (ci.high - baseline) * 100,
    upShare: outcomes.length ? outcomes.filter((x) => x > 0).length / outcomes.length : null,
    lastEvent,
    lastDayPct: (Math.exp(returns[returns.length - 1]) - 1) * 100,
  };
}

/**
 * Trendový filtr: dny nad / pod `window`denním průměrem upravených závěrů. Pro obě skupiny
 * průměrný výnos dalšího dne (bp) a roční volatilita; srovnání stálého držení s držením
 * jen nad průměrem (rozhodnutí na závěru dne, výnos následujícího dne).
 */
export function trendStudy(values, { window = 200 } = {}) {
  const returns = logReturns(values);
  if (values.length < window + 60) return null;
  const prefix = [0];
  for (const v of values) prefix.push(prefix[prefix.length - 1] + v);
  const average = (i) => (prefix[i + 1] - prefix[i + 1 - window]) / window;
  const above = [],
    below = [],
    hold = [],
    filtered = [];
  for (let i = window - 1; i < returns.length; i++) {
    const isAbove = values[i] > average(i);
    (isAbove ? above : below).push(returns[i]);
    hold.push(returns[i]);
    filtered.push(isAbove ? returns[i] : 0);
  }
  const group = (x) => ({
    days: x.length,
    meanBp: x.length ? mean(x) * 10000 : null,
    volatilityPct: x.length > 1 ? sampleSd(x) * Math.sqrt(TRADING_DAYS) * 100 : null,
  });
  const ma = average(values.length - 1);
  return {
    window,
    ma,
    last: values[values.length - 1],
    todayAbove: values[values.length - 1] > ma,
    above: group(above),
    below: group(below),
    hold: riskStats(hold),
    filter: riskStats(filtered),
  };
}

/** Výnos přes noc (open ÷ předchozí close) proti výnosu během dne (close ÷ open), log, bp/den. */
export function overnightIntradayStudy(opens, values) {
  if (opens.length !== values.length || values.length < 30)
    throw new Error("Málo dat pro srovnání noci a dne.");
  const overnight = [],
    intraday = [];
  for (let i = 1; i < values.length; i++) {
    overnight.push(Math.log(opens[i] / values[i - 1]));
    intraday.push(Math.log(values[i] / opens[i]));
  }
  const part = (x) => ({
    meanBp: mean(x) * 10000,
    t: tStat(x),
    totalPct: (Math.exp(x.reduce((s, v) => s + v, 0)) - 1) * 100,
  });
  return { days: overnight.length, overnight: part(overnight), intraday: part(intraday) };
}

const HOURLY_STARTS = [570, 630, 690, 750, 810, 870, 930];

/** Úplné seance z hodinových svíček (začátky 9:30, 10:30, …, 15:30 ET = 7 svíček). */
export function hourlySessions(bars) {
  const byDate = new Map();
  for (const bar of bars) {
    if (!byDate.has(bar.date)) byDate.set(bar.date, []);
    byDate.get(bar.date).push(bar);
  }
  const days = [];
  for (const [date, list] of byDate) {
    const sorted = list
      .filter((b) => b.minute >= 570 && b.minute < 960)
      .sort((a, b) => a.ts - b.ts);
    if (sorted.length === 7 && sorted.every((b, i) => b.minute === HOURLY_STARTS[i]))
      days.push({ date, bars: sorted });
  }
  return days.sort((a, b) => (a.date < b.date ? -1 : 1));
}

/**
 * Intradenní momentum (Gao, Han, Li, Zhou 2018) na hodinových svíčkách: výnos od
 * předchozího závěru do konce první hodiny proti výnosu poslední půlhodiny (15:30–16:00).
 * Strategie: v poslední půlhodině být ve směru první hodiny (výsledek v bp).
 */
export function intradayMomentumStudy(days, { seed = 5 } = {}) {
  const first = [],
    last = [],
    strategy = [];
  for (let k = 1; k < days.length; k++) {
    const previousClose = days[k - 1].bars[6].c,
      bars = days[k].bars;
    const a = bars[0].c / previousClose - 1,
      b = bars[6].c / bars[5].c - 1;
    first.push(a);
    last.push(b);
    strategy.push(Math.sign(a) * b);
  }
  if (strategy.length < 3) return null;
  const ma = mean(first),
    mb = mean(last);
  let cov = 0,
    va = 0,
    vb = 0;
  for (let i = 0; i < first.length; i++) {
    cov += (first[i] - ma) * (last[i] - mb);
    va += (first[i] - ma) ** 2;
    vb += (last[i] - mb) ** 2;
  }
  const ci = bootstrapMean(strategy, { seed });
  return {
    n: strategy.length,
    correlation: va > 0 && vb > 0 ? cov / Math.sqrt(va * vb) : 0,
    meanBp: mean(strategy) * 10000,
    lowBp: ci.low * 10000,
    highBp: ci.high * 10000,
    hitRate: strategy.filter((x) => x > 0).length / strategy.length,
    todayFirstPct:
      days.length >= 2
        ? (days[days.length - 1].bars[0].c / days[days.length - 2].bars[6].c - 1) * 100
        : null,
  };
}

/**
 * Průraz po první hodině (zjednodušené ORB, Zarattini, Barbon, Aziz 2024), jen nákup:
 * když první hodina skončí nad otevřením, nákup za open druhé svíčky, stop na minimu
 * první hodiny, prodej na závěru. Srovnání s nákupem ve stejný čas každý den.
 */
export function openingRangeStudy(days, { seed = 6 } = {}) {
  const trades = [],
    always = [];
  for (const { bars } of days) {
    const first = bars[0],
      entry = bars[1].o,
      close = bars[6].c;
    always.push(close / entry - 1);
    if (!(first.c > first.o)) continue;
    let exit = close;
    for (let i = 1; i < bars.length; i++)
      if (bars[i].l <= first.l) {
        exit = Math.min(bars[i].o, first.l);
        break;
      }
    trades.push(exit / entry - 1);
  }
  if (trades.length < 3) return null;
  const ci = bootstrapMean(trades, { seed });
  const baseline = mean(always);
  return {
    n: trades.length,
    meanBp: mean(trades) * 10000,
    baselineBp: baseline * 10000,
    excessLowBp: (ci.low - baseline) * 10000,
    excessHighBp: (ci.high - baseline) * 10000,
    hitRate: trades.filter((x) => x > 0).length / trades.length,
  };
}

/**
 * Verdikt signálu podle intervalu výhody: VYHODA jen při dostatku případů a celém
 * intervalu nad nulou; NEVYHODA při celém intervalu pod nulou; jinak NEPROKAZANO.
 */
export function edgeVerdict({ n, low, high, minN = 30 }) {
  if (!(n >= minN)) return "MALO_DAT";
  if (low > 0) return "VYHODA";
  if (high < 0) return "NEVYHODA";
  return "NEPROKAZANO";
}
