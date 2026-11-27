// Intel a polovodičový sektor: souběh pohybů, rozklad pohybu na část sektoru
// a vlastní část Intelu a historie poklesů podle příčiny. Čisté funkce, pevné semínko.
import { bootstrapMean, mean } from "./pilot-forecast.mjs";

/**
 * Společné obchodní dny dvou řad (podle data) a jejich denní log výnosy.
 * Vstup: { dates, values } (upravené závěry). Výnos dne d = ln(cena d / cena předchozího
 * společného dne).
 */
export function alignedReturns(a, b) {
  const lookup = new Map(b.dates.map((date, i) => [date, b.values[i]]));
  const dates = [],
    va = [],
    vb = [];
  a.dates.forEach((date, i) => {
    const other = lookup.get(date),
      own = a.values[i];
    if (other > 0 && own > 0) {
      dates.push(date);
      va.push(own);
      vb.push(other);
    }
  });
  const ra = [],
    rb = [];
  for (let i = 1; i < va.length; i++) {
    ra.push(Math.log(va[i] / va[i - 1]));
    rb.push(Math.log(vb[i] / vb[i - 1]));
  }
  return { dates: dates.slice(1), a: ra, b: rb };
}

/** Pearsonova korelace dvou stejně dlouhých řad. */
export function correlation(x, y) {
  if (x.length !== y.length || x.length < 3) return null;
  const mx = mean(x),
    my = mean(y);
  let sxy = 0,
    sxx = 0,
    syy = 0;
  for (let i = 0; i < x.length; i++) {
    sxy += (x[i] - mx) * (y[i] - my);
    sxx += (x[i] - mx) ** 2;
    syy += (y[i] - my) ** 2;
  }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : null;
}

/**
 * Citlivost y na x (beta = kovariance ÷ rozptyl x) a podíl rozptylu y vysvětlený x (R² = korelace²).
 * Beta 1,3 = když sektor stoupne o 1 %, Intel v průměru o 1,3 %.
 */
export function betaFit(x, y) {
  const r = correlation(x, y);
  if (r === null) return null;
  const mx = mean(x),
    my = mean(y);
  let sxy = 0,
    sxx = 0;
  for (let i = 0; i < x.length; i++) {
    sxy += (x[i] - mx) * (y[i] - my);
    sxx += (x[i] - mx) ** 2;
  }
  return { beta: sxy / sxx, r2: r * r };
}

/** Korelace denních výnosů INTC s dalšími řadami za posledních `recent` dní a za celé období. */
export function correlationTable(intc, others, { recent = 252 } = {}) {
  return others.map((other) => {
    const aligned = alignedReturns(intc, other),
      n = aligned.a.length;
    return {
      symbol: other.symbol,
      days: n,
      recent: n >= recent ? correlation(aligned.a.slice(-recent), aligned.b.slice(-recent)) : null,
      full: correlation(aligned.a, aligned.b),
    };
  });
}

/**
 * Rozklad pohybu INTC (v %) na část sektoru a vlastní část:
 *   ln(1 + INTC) = beta × ln(1 + sektor) + vlastní část.
 * Vrací obě části převedené zpět na procenta.
 */
export function decomposeMove({ intcPct, sectorPct, beta }) {
  const total = Math.log(1 + intcPct / 100),
    sector = beta * Math.log(1 + sectorPct / 100);
  return {
    sectorPartPct: (Math.exp(sector) - 1) * 100,
    ownPartPct: (Math.exp(total - sector) - 1) * 100,
  };
}

/** Beta INTC na sektor z `window` výnosů končících před indexem `end` (bez dne `end`). */
export function trailingBeta(aligned, { window = 252, end = aligned.a.length } = {}) {
  if (end < window) return null;
  return betaFit(aligned.b.slice(end - window, end), aligned.a.slice(end - window, end));
}

/**
 * Poklesy INTC o `dropPct` % a víc rozdělené podle příčiny (Chan 2003: po zprávě cena spíš
 * pokračuje, po velkém pohybu bez zprávy se spíš vrací):
 *  - „se sektorem“: vlastní část nad −`sectorBand` %,
 *  - „vlastní“: vlastní část −`dropPct` % a horší (typicky zpráva o Intelu).
 * Beta vždy z předchozích `window` dní, bez pohledu do budoucnosti. Výnos INTC za dalších
 * `horizon` dní; v každé skupině se události nepřekrývají. Srovnání s průměrem všech období.
 */
export function sectorDipStudy(
  aligned,
  { dropPct = 3, horizon = 5, window = 252, sectorBand = 1, seed = 13 } = {},
) {
  const { a, b } = aligned,
    drop = Math.log(1 - dropPct / 100),
    band = Math.log(1 - sectorBand / 100);
  const groups = { sector: [], own: [] },
    next = { sector: 0, own: 0 },
    windows = [];
  const forward = (i) => {
    let sum = 0;
    for (let k = i + 1; k <= i + horizon; k++) sum += a[k];
    return Math.exp(sum) - 1;
  };
  for (let i = window; i + horizon < a.length; i++) {
    windows.push(forward(i));
    if (a[i] > drop + 1e-12) continue;
    const fit = betaFit(b.slice(i - window, i), a.slice(i - window, i));
    if (!fit) continue;
    const own = a[i] - fit.beta * b[i];
    const key = own > band ? "sector" : own <= drop + 1e-12 ? "own" : null;
    if (!key || i < next[key]) continue;
    groups[key].push(forward(i));
    next[key] = i + 1 + horizon;
  }
  const baseline = mean(windows);
  const summary = (values) => {
    const ci = bootstrapMean(values, { seed });
    return {
      n: values.length,
      meanPct: mean(values) * 100,
      excessPct: (mean(values) - baseline) * 100,
      excessLowPct: (ci.low - baseline) * 100,
      excessHighPct: (ci.high - baseline) * 100,
      lowPct: ci.low * 100,
      highPct: ci.high * 100,
    };
  };
  return {
    dropPct,
    horizon,
    baselinePct: baseline * 100,
    sector: summary(groups.sector),
    own: summary(groups.own),
  };
}

/** Typ pohybu podle rozkladu: pokles se sektorem, vlastní pokles, smíšený, nebo bez velkého poklesu. */
export function classifyMove({ intcPct, ownPartPct, dropPct = 3, sectorBand = 1 }) {
  if (intcPct > -dropPct) return "NO_DROP";
  if (ownPartPct > -sectorBand) return "SECTOR";
  if (ownPartPct <= -dropPct) return "OWN";
  return "MIXED";
}
