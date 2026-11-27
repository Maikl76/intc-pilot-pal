// Prognóza výdělku: rozpětí a pravděpodobnosti, nikoli slib výsledku.
// Čisté deterministické funkce bez sítě a bez Reactu. Náhodné převzorkování
// používá pevné semínko, takže stejná data dávají vždy stejný výsledek.

export const TRADING_DAYS = 252;

// ---------------------------------------------------------------------------
// Základní statistika
// ---------------------------------------------------------------------------

export function mean(values) {
  if (!values.length) return NaN;
  let sum = 0;
  for (const value of values) sum += value;
  return sum / values.length;
}

/** Výběrová směrodatná odchylka (dělí n − 1). */
export function sampleSd(values) {
  if (values.length < 2) return NaN;
  const avg = mean(values);
  let sum = 0;
  for (const value of values) sum += (value - avg) ** 2;
  return Math.sqrt(sum / (values.length - 1));
}

/** Kvantil seřazeného pole s lineární interpolací (typ 7, jako Excel PERCENTIL). */
export function quantile(sorted, p) {
  if (!sorted.length) return NaN;
  const position = (sorted.length - 1) * p;
  const low = Math.floor(position),
    high = Math.ceil(position);
  return sorted[low] + (sorted[high] - sorted[low]) * (position - low);
}

/** Distribuční funkce normovaného normálního rozdělení Φ(x); chyba < 1,2e-7. */
export function normalCdf(x) {
  if (!Number.isFinite(x)) return x > 0 ? 1 : 0;
  const z = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + 0.5 * z);
  // erfc podle Numerical Recipes (Čebyševova aproximace).
  const erfc =
    t *
    Math.exp(
      -z * z -
        1.26551223 +
        t *
          (1.00002368 +
            t *
              (0.37409196 +
                t *
                  (0.09678418 +
                    t *
                      (-0.18628806 +
                        t *
                          (0.27886807 +
                            t *
                              (-1.13520398 +
                                t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))),
    );
  return x >= 0 ? 1 - erfc / 2 : erfc / 2;
}

/** Kvantil normovaného normálního rozdělení (algoritmus P. J. Acklama, chyba < 1,2e-9). */
export function normalQuantile(p) {
  if (!(p > 0 && p < 1)) throw new Error("Pravděpodobnost musí být mezi 0 a 1.");
  const a = [
    -39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716,
    2.506628277459239,
  ];
  const b = [
    -54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972,
    -13.28068155288572,
  ];
  const c = [
    -0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734,
    4.374664141464968, 2.938163982698783,
  ];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const tail = (q) =>
    (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
    ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  if (p < 0.02425) return tail(Math.sqrt(-2 * Math.log(p)));
  if (p > 1 - 0.02425) return -tail(Math.sqrt(-2 * Math.log(1 - p)));
  const q = p - 0.5,
    r = q * q;
  return (
    ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) /
    (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
  );
}

/** Generátor náhodných čísel s pevným semínkem (mulberry32), hodnoty v [0, 1). */
export function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Normálně rozdělené číslo N(0, 1) z generátoru `random` (Boxova–Müllerova metoda). */
export function gaussian(random) {
  let u = 0;
  while (u <= 0) u = random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * random());
}

/** Wilsonův interval pro podíl úspěchů (správně funguje i u malého počtu obchodů). */
export function wilsonInterval(successes, n, level = 0.95) {
  if (!(n > 0)) return { low: NaN, high: NaN };
  const z = normalQuantile(0.5 + level / 2),
    z2 = z * z,
    p = successes / n;
  const denominator = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denominator;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denominator;
  return { low: Math.max(0, center - half), high: Math.min(1, center + half) };
}

/** Percentilový bootstrap intervalu spolehlivosti průměru (pevné semínko). */
export function bootstrapMean(values, { resamples = 2000, level = 0.95, seed = 1 } = {}) {
  const n = values.length;
  if (n < 2) return { low: NaN, high: NaN };
  const random = seededRandom(seed),
    means = new Float64Array(resamples);
  for (let k = 0; k < resamples; k++) {
    let sum = 0;
    for (let i = 0; i < n; i++) sum += values[Math.floor(random() * n)];
    means[k] = sum / n;
  }
  means.sort();
  return { low: quantile(means, (1 - level) / 2), high: quantile(means, (1 + level) / 2) };
}

function summarize(sorted) {
  return {
    p05: quantile(sorted, 0.05),
    p10: quantile(sorted, 0.1),
    p25: quantile(sorted, 0.25),
    p50: quantile(sorted, 0.5),
    p75: quantile(sorted, 0.75),
    p90: quantile(sorted, 0.9),
    p95: quantile(sorted, 0.95),
  };
}

const positive = (value, name) => {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0)
    throw new Error(`Hodnota ${name} musí být kladné číslo.`);
  return value;
};

// ---------------------------------------------------------------------------
// Dlouhodobá část: pásmo budoucí ceny a hodnoty pozice
// ---------------------------------------------------------------------------

/** Logaritmické denní výnosy r_i = ln(C_i / C_(i−1)). */
export function logReturns(closes) {
  const out = [];
  for (let i = 1; i < closes.length; i++) {
    const previous = closes[i - 1],
      current = closes[i];
    if (!(previous > 0 && current > 0) || !Number.isFinite(previous) || !Number.isFinite(current))
      throw new Error("Ceny musí být kladná čísla.");
    out.push(Math.log(current / previous));
  }
  return out;
}

/**
 * Volatilita: výběrová SD posledních `lookback` denních log výnosů.
 * Roční volatilita = denní × √252. Bez předpokladu, že se bude vracet k průměru.
 */
export function volatility(closes, lookback = TRADING_DAYS) {
  if (!Number.isInteger(lookback) || lookback < 20)
    throw new Error("Okno volatility musí mít alespoň 20 dní.");
  const returns = logReturns(closes);
  if (returns.length < lookback) throw new Error("Málo denních dat pro zvolené okno volatility.");
  const recent = returns.slice(-lookback);
  const sigmaDaily = sampleSd(recent);
  return { sigmaDaily, sigmaAnnual: sigmaDaily * Math.sqrt(TRADING_DAYS), returns: recent.length };
}

/**
 * Pásmo ceny za `days` obchodních dní (lognormální model):
 *   ln(S_T / S_0) ~ N(μ·t, σ²·t),  t = days / 252,
 * σ = roční volatilita, μ = roční trend log výnosu. Trend 0 = bez předpokladu směru
 * (medián = dnešní cena, růst i pokles stejně pravděpodobné).
 */
export function priceForecast({ price, sigmaAnnual, driftAnnual = 0, days, levels = [0.8] }) {
  positive(price, "cena");
  if (typeof sigmaAnnual !== "number" || !Number.isFinite(sigmaAnnual) || sigmaAnnual < 0)
    throw new Error("Volatilita musí být nezáporné číslo.");
  if (!Number.isFinite(driftAnnual)) throw new Error("Neplatný předpoklad trendu.");
  if (!Number.isInteger(days) || days < 1) throw new Error("Horizont musí být kladný počet dní.");
  const t = days / TRADING_DAYS,
    logSd = sigmaAnnual * Math.sqrt(t),
    logMean = driftAnnual * t;
  return {
    price,
    days,
    logMean,
    logSd,
    median: price * Math.exp(logMean),
    bands: levels.map((level) => {
      if (!(level > 0 && level < 1)) throw new Error("Hladina pásma musí být mezi 0 a 1.");
      const z = normalQuantile(0.5 + level / 2);
      return {
        level,
        low: price * Math.exp(logMean - z * logSd),
        high: price * Math.exp(logMean + z * logSd),
      };
    }),
  };
}

/** P(S_T > hranice) pro výsledek `priceForecast`. */
export function probabilityAbove(forecast, threshold) {
  positive(threshold, "hranice");
  const x = Math.log(threshold / forecast.price) - forecast.logMean;
  if (forecast.logSd === 0) return x < 0 ? 1 : 0;
  return 1 - normalCdf(x / forecast.logSd);
}

/**
 * Dlouhodobá pozice na konci horizontu. Kvantily výsledku jsou převedené kvantily ceny:
 *   změna hodnoty = qty × (S_T − S_0) × kurz,  výsledek proti nákupu = qty × (S_T − průměr) × kurz.
 * Kurz USD/CZK je pevný modelový; jeho kolísání se nemodeluje.
 */
export function positionForecast({
  qty,
  avgPrice,
  price,
  sigmaAnnual,
  driftAnnual = 0,
  days,
  fx,
  levels = [0.8],
}) {
  if (!(qty >= 0) || !Number.isFinite(qty)) throw new Error("Počet akcií musí být nezáporný.");
  if (!(avgPrice >= 0) || !Number.isFinite(avgPrice))
    throw new Error("Průměrná cena musí být nezáporná.");
  positive(fx, "kurz");
  const forecast = priceForecast({ price, sigmaAnnual, driftAnnual, days, levels });
  const change = (s) => qty * (s - price) * fx;
  const result = (s) => qty * (s - avgPrice) * fx;
  return {
    ...forecast,
    qty,
    avgPrice,
    fx,
    valueNowCzk: qty * price * fx,
    medianChangeCzk: change(forecast.median),
    medianResultCzk: avgPrice > 0 ? result(forecast.median) : null,
    bandsCzk: forecast.bands.map((band) => ({
      level: band.level,
      changeLow: change(band.low),
      changeHigh: change(band.high),
      resultLow: avgPrice > 0 ? result(band.low) : null,
      resultHigh: avgPrice > 0 ? result(band.high) : null,
    })),
    probabilityProfit: avgPrice > 0 ? probabilityAbove(forecast, avgPrice) : null,
    probabilityDrop20: 1 - probabilityAbove(forecast, price * 0.8),
  };
}

/**
 * Zpětná kontrola pásma na historii bez pohledu do budoucnosti: pro každý den t
 * se σ spočítá jen z `lookback` výnosů před t, pásmo (trend 0) pro výnos za `horizon`
 * dní se porovná se skutečností. Dobře kalibrované 80% pásmo zasáhne ≈ 80 % případů.
 * Současně se měří, zda směr minulého období (znaménko výnosu za `lookback` dní)
 * odhadl směr budoucího výnosu; ≈ 50 % znamená, že směr nepředpovídá.
 * Období se překrývají, nezávislých období je přibližně `independent`.
 */
export function calibrationBacktest(
  closes,
  { lookback = TRADING_DAYS, horizon = 21, level = 0.8 } = {},
) {
  if (!Number.isInteger(lookback) || lookback < 20) throw new Error("Neplatné okno volatility.");
  if (!Number.isInteger(horizon) || horizon < 1) throw new Error("Neplatný horizont.");
  const returns = logReturns(closes),
    n = returns.length;
  if (n < lookback + horizon) return null;
  const sum1 = new Float64Array(n + 1),
    sum2 = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) {
    sum1[i + 1] = sum1[i] + returns[i];
    sum2[i + 1] = sum2[i] + returns[i] * returns[i];
  }
  const z = normalQuantile(0.5 + level / 2);
  let count = 0,
    inside = 0,
    below = 0,
    above = 0,
    directionCount = 0,
    directionHits = 0;
  for (let t = lookback; t + horizon <= n; t++) {
    const past = sum1[t] - sum1[t - lookback],
      squares = sum2[t] - sum2[t - lookback];
    const variance = (squares - (past * past) / lookback) / (lookback - 1);
    const half = z * Math.sqrt(Math.max(0, variance)) * Math.sqrt(horizon);
    const actual = sum1[t + horizon] - sum1[t];
    count++;
    if (actual < -half) below++;
    else if (actual > half) above++;
    else inside++;
    if (past !== 0 && actual !== 0) {
      directionCount++;
      if (past > 0 === actual > 0) directionHits++;
    }
  }
  return {
    lookback,
    horizon,
    level,
    count,
    independent: Math.floor((n - lookback) / horizon),
    coverage: inside / count,
    below: below / count,
    above: above / count,
    directionCount,
    directionHitRate: directionCount ? directionHits / directionCount : null,
  };
}

/** Největší denní propady (v %, z log výnosů) a počty dní pod hranicemi. */
export function tailFacts(closes, dates) {
  const returns = logReturns(closes).map((r) => (Math.exp(r) - 1) * 100);
  let worst = 0,
    worstIndex = -1;
  returns.forEach((value, i) => {
    if (value < worst) {
      worst = value;
      worstIndex = i;
    }
  });
  return {
    days: returns.length,
    worstPct: worstIndex >= 0 ? worst : null,
    worstDate: worstIndex >= 0 && dates ? (dates[worstIndex + 1] ?? null) : null,
    dropsAtLeast5: returns.filter((value) => value <= -5).length,
    dropsAtLeast10: returns.filter((value) => value <= -10).length,
  };
}

// ---------------------------------------------------------------------------
// Denní obchodování: náhoda, statistika obchodů a srovnání s náhodným nákupem
// ---------------------------------------------------------------------------

/**
 * Pravděpodobnost, že cena bez jakéhokoli trendu (náhodná procházka) dosáhne cíle
 * dřív než stopu: stop / (cíl + stop). Bez stopu (0) nelze určit → null.
 * Bez výhody je očekávaný výsledek každého obchodu přesně minus náklady.
 */
export function chanceTargetFirst(targetUsd, stopUsd) {
  if (!(targetUsd > 0) || !(stopUsd > 0)) return null;
  return stopUsd / (targetUsd + stopUsd);
}

/**
 * Statistika výsledků obchodů na akcii (USD po nákladech): průměr, SD, interval
 * spolehlivosti průměru (bootstrap), úspěšnost s Wilsonovým intervalem a orientační
 * počet obchodů, při kterém by se tento průměr dal odlišit od nuly: ⌈(z·SD/průměr)²⌉.
 */
export function tradeStatistics(perShare, { level = 0.95, seed = 7 } = {}) {
  const n = perShare.length;
  const wins = perShare.filter((value) => value > 0).length;
  const avg = mean(perShare),
    sd = sampleSd(perShare);
  const ci = bootstrapMean(perShare, { level, seed });
  const win = wilsonInterval(wins, n, level);
  const z = normalQuantile(0.5 + level / 2);
  return {
    n,
    mean: avg,
    sd,
    ciLow: ci.low,
    ciHigh: ci.high,
    wins,
    winRate: n ? wins / n : NaN,
    winLow: win.low,
    winHigh: win.high,
    requiredTrades: avg > 0 && sd > 0 ? Math.ceil(((z * sd) / avg) ** 2) : null,
  };
}

/**
 * Výstup jedné pozice podle stejných pravidel jako `run` v pilot-engine.mjs:
 * stop má přednost před cílem, cíl nelze vybrat ve vstupní svíčce, časový výstup
 * na close posledního dne držení (holdDays ≥ 0); u −1 ocenění posledním close dat.
 */
function simulateExit(days, highs, lows, dayIndex, barIndex, entry, p) {
  const stopLevel = p.stopUsd > 0 ? entry - p.stopUsd : -Infinity,
    targetLevel = entry + p.targetUsd;
  for (let j = dayIndex; j < days.length; j++) {
    const bars = days[j].bars,
      timeDay = p.holdDays >= 0 && j - dayIndex >= p.holdDays;
    if (j !== dayIndex && lows[j] > stopLevel && highs[j] < targetLevel) {
      if (timeDay) return { price: bars[bars.length - 1].c, reason: "TIME" };
      continue;
    }
    for (let i = j === dayIndex ? barIndex : 0; i < bars.length; i++) {
      const bar = bars[i],
        fresh = j === dayIndex && i === barIndex;
      if (bar.l <= stopLevel)
        return { price: fresh ? stopLevel : Math.min(bar.o, stopLevel), reason: "STOP" };
      if (!fresh && bar.h >= targetLevel) return { price: targetLevel, reason: "TARGET" };
      if (timeDay && i === bars.length - 1) return { price: bar.c, reason: "TIME" };
    }
  }
  const last = days[days.length - 1].bars;
  return { price: last[last.length - 1].c, reason: "OPEN" };
}

/**
 * Výsledky náhodného nákupu se stejnými výstupy jako pravidla: v každém dni, který
 * propustí gap filtr, se „nakoupí" za open každé svíčky do `windowMinute` ET.
 * Vrací pole po dnech; každý prvek je výsledek na akcii po nákladech obou stran.
 * `maxEntries` omezuje výpočet u velmi dlouhých dat (rovnoměrný výběr svíček).
 */
export function randomEntryOutcomes(days, settings, { maxEntries = 40000 } = {}) {
  const p = settings;
  const highs = days.map((d) => Math.max(...d.bars.map((b) => b.h))),
    lows = days.map((d) => Math.min(...d.bars.map((b) => b.l)));
  const eligible = [];
  days.forEach((d, j) => {
    const allowed = p.gapPct === 0 || d.gap === null || d.gap > -p.gapPct;
    if (!allowed) return;
    for (let i = 0; i < d.bars.length && d.bars[i].minute <= p.windowMinute; i++)
      eligible.push([j, i]);
  });
  const step = Math.max(1, Math.ceil(eligible.length / maxEntries));
  const byDay = new Map();
  let targets = 0,
    stops = 0,
    times = 0,
    open = 0,
    total = 0;
  for (let k = 0; k < eligible.length; k += step) {
    const [j, i] = eligible[k];
    const entry = days[j].bars[i].o;
    if (p.stopUsd > 0 && p.stopUsd >= entry) continue;
    const exit = simulateExit(days, highs, lows, j, i, entry, p);
    const perShare = exit.price - entry - 2 * p.fee;
    if (!byDay.has(j)) byDay.set(j, []);
    byDay.get(j).push(perShare);
    total++;
    if (exit.reason === "TARGET") targets++;
    else if (exit.reason === "STOP") stops++;
    else if (exit.reason === "TIME") times++;
    else open++;
  }
  const all = [...byDay.values()].flat();
  return {
    days: [...byDay.values()],
    count: total,
    mean: mean(all),
    targetShare: total ? targets / total : NaN,
    stopShare: total ? stops / total : NaN,
    timeShare: total ? times / total : NaN,
    openShare: total ? open / total : NaN,
    step,
  };
}

/**
 * Test proti náhodě: `sets`× se vybere `tradeCount` různých dní (jako jeden vstup
 * denně u pravidel) a v každém náhodná vstupní svíčka. Vrací podíl pokusů, kdy náhodné
 * nákupy dosáhly stejného nebo lepšího průměru na akcii než pravidla (p-hodnota
 * s korekcí +1). Malé číslo = výsledek pravidel by náhodou vznikal zřídka.
 */
export function randomEntryTest(
  outcomes,
  tradeCount,
  observedMean,
  { sets = 2000, seed = 11 } = {},
) {
  const pool = outcomes.days.filter((day) => day.length > 0);
  if (!pool.length || !(tradeCount >= 1) || !Number.isFinite(observedMean)) return null;
  const random = seededRandom(seed),
    means = new Float64Array(sets),
    order = pool.map((_, i) => i);
  let atLeast = 0;
  for (let k = 0; k < sets; k++) {
    let sum = 0;
    for (let i = 0; i < tradeCount; i++) {
      let dayIndex;
      if (tradeCount <= pool.length) {
        // Částečné zamíchání: každý den nejvýše jednou, jako jeden vstup denně.
        const swap = i + Math.floor(random() * (pool.length - i));
        [order[i], order[swap]] = [order[swap], order[i]];
        dayIndex = order[i];
      } else dayIndex = Math.floor(random() * pool.length);
      const day = pool[dayIndex];
      sum += day[Math.floor(random() * day.length)];
    }
    means[k] = sum / tradeCount;
    if (means[k] >= observedMean - 1e-12) atLeast++;
  }
  means.sort();
  return {
    sets,
    tradeCount,
    pValue: (atLeast + 1) / (sets + 1),
    low: quantile(means, 0.05),
    high: quantile(means, 0.95),
    median: quantile(means, 0.5),
  };
}

/** Výsledek pravidel po seancích (Kč); seance bez uzavřeného obchodu = 0. */
export function dailyResults(days, trades) {
  const byDate = new Map();
  for (const trade of trades)
    byDate.set(trade.exitDate, (byDate.get(trade.exitDate) ?? 0) + trade.pnlCzk);
  return days.map((day) => byDate.get(day.date) ?? 0);
}

/**
 * Rozpětí výsledku za `horizon` budoucích seancí. Dlouhodobá část: lognormální model
 * (změna hodnoty pozice). Denní obchodování: dvojí převzorkování skutečných seancí –
 * nejdřív se převzorkuje celý vzorek (nejistota, jak dobrá pravidla doopravdy jsou),
 * z něj se pak poskládá budoucí období. Obě části se berou jako nezávislé.
 */
export function combinedForecast({
  longTerm = null,
  dayTrading = null,
  horizon,
  simulations = 4000,
  seed = 21,
}) {
  if (!Number.isInteger(horizon) || horizon < 1) throw new Error("Neplatný horizont.");
  const random = seededRandom(seed);
  const lt = new Float64Array(simulations),
    dt = new Float64Array(simulations),
    total = new Float64Array(simulations);
  let losses = 0;
  const daily = dayTrading?.dailyCzk ?? [];
  const world = new Float64Array(daily.length);
  const t = horizon / TRADING_DAYS;
  for (let k = 0; k < simulations; k++) {
    let a = 0,
      b = 0;
    if (longTerm && longTerm.qty > 0) {
      const s = longTerm.sigmaAnnual * Math.sqrt(t),
        m = (longTerm.driftAnnual ?? 0) * t;
      const future = longTerm.price * Math.exp(m + s * gaussian(random));
      a = longTerm.qty * (future - longTerm.price) * longTerm.fx;
    }
    if (daily.length) {
      for (let i = 0; i < daily.length; i++) world[i] = daily[Math.floor(random() * daily.length)];
      for (let i = 0; i < horizon; i++) b += world[Math.floor(random() * daily.length)];
    }
    lt[k] = a;
    dt[k] = b;
    total[k] = a + b;
    if (a + b < 0) losses++;
  }
  lt.sort();
  dt.sort();
  total.sort();
  return {
    horizon,
    simulations,
    longTerm: longTerm && longTerm.qty > 0 ? summarize(lt) : null,
    dayTrading: daily.length ? summarize(dt) : null,
    total: summarize(total),
    probabilityLoss: losses / simulations,
  };
}
