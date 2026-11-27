// Rozbor skutečných obchodů INTC z výpisu brokera (Trading 212).
// Počítá se jen v prohlížeči; výpis se nikam neposílá. Ceny jsou v USD, bez poplatků
// brokera (ty se uvádějí zvlášť podle výpisu).

const EPSILON = 1e-9;
const HOUR = 3600000;

/** Hlavní seance 09:30–16:00 New York; ostatní čas = pre-market, after-hours, noc. */
export const isRegularSession = (minute) => minute >= 570 && minute < 960;

export const HOLD_BUCKETS = Object.freeze([
  { key: "day", label: "Do 1 dne", maxHours: 24 },
  { key: "week", label: "1–5 dní", maxHours: 120 },
  { key: "month", label: "5–30 dní", maxHours: 720 },
  { key: "long", label: "Nad 30 dní", maxHours: Infinity },
]);

const medianOf = (values) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b),
    middle = (sorted.length - 1) / 2;
  return (sorted[Math.floor(middle)] + sorted[Math.ceil(middle)]) / 2;
};

/**
 * Párování LIFO: každý prodej uzavře nejdřív nejnovější nákupy. Odpovídá tomu, jak
 * obchodník vnímá krátký obchod („koupil – prodal"); starší nákupy zůstávají otevřené.
 * Celkový výsledek (prodeje − nákupy + hodnota držených akcií) na párování nezávisí.
 * Vrací uzavřené dvojice, otevřené loty a množství prodejů bez nákupu ve výpisu.
 */
export function matchLifo(transactions) {
  const ordered = [...transactions].sort((a, b) => a.ts - b.ts);
  const lots = [],
    trips = [];
  let unmatchedQty = 0;
  for (const t of ordered) {
    if (t.side === "BUY") {
      lots.push({ qty: t.qty, price: t.price, ts: t.ts, minute: t.minute, date: t.date });
      continue;
    }
    let need = t.qty;
    while (need > EPSILON && lots.length) {
      const lot = lots[lots.length - 1],
        take = Math.min(lot.qty, need);
      trips.push({
        qty: take,
        buyPrice: lot.price,
        sellPrice: t.price,
        buyTs: lot.ts,
        sellTs: t.ts,
        buyMinute: lot.minute,
        holdHours: (t.ts - lot.ts) / HOUR,
        grossUsd: take * (t.price - lot.price),
      });
      lot.qty -= take;
      need -= take;
      if (lot.qty <= EPSILON) lots.pop();
    }
    if (need > EPSILON) unmatchedQty += need;
  }
  return { trips, lots, unmatchedQty };
}

/**
 * Rozbor výpisu za období. `price` = aktuální cena pro ocenění držených akcií.
 * - total: prodeje − nákupy + držené akcie × cena (hrubě, bez poplatků),
 * - realized/unrealized podle LIFO (uzavřené dvojice / otevřené loty),
 * - averageCost: průměrná nákupní cena držené pozice metodou průměru (jako broker),
 * - benchmark: nejvyšší kapitál vázaný v INTC jednou koupený za cenu prvního nákupu a držený,
 * - short: obchody do 1 dne (úspěšnost, typický zisk, podíl vstupů mimo hlavní seanci).
 */
export function reviewTrades(transactions, price) {
  if (!Array.isArray(transactions) || !transactions.length)
    throw new Error("Výpis neobsahuje obchody INTC.");
  if (!(price > 0) || !Number.isFinite(price)) throw new Error("Chybí cena pro ocenění pozice.");
  const ordered = [...transactions].sort((a, b) => a.ts - b.ts);
  const { trips, lots, unmatchedQty } = matchLifo(ordered);

  let boughtUsd = 0,
    soldUsd = 0,
    buys = 0,
    sells = 0,
    position = 0,
    cost = 0,
    peakCostUsd = 0,
    holdAllUsd = 0;
  const fxFees = {},
    brokerResult = {};
  for (const t of ordered) {
    if (t.side === "BUY") {
      buys++;
      boughtUsd += t.qty * t.price;
      holdAllUsd += t.qty * (price - t.price);
      position += t.qty;
      cost += t.qty * t.price;
    } else {
      sells++;
      soldUsd += t.qty * t.price;
      const average = position > EPSILON ? cost / position : 0,
        sold = Math.min(t.qty, Math.max(0, position));
      position -= sold;
      cost -= sold * average;
      if (position <= EPSILON) {
        position = 0;
        cost = 0;
      }
    }
    peakCostUsd = Math.max(peakCostUsd, cost);
    if (t.fxFee && t.feeCurrency) fxFees[t.feeCurrency] = (fxFees[t.feeCurrency] ?? 0) + t.fxFee;
    if (t.side === "SELL" && t.result !== null && t.resultCurrency)
      brokerResult[t.resultCurrency] = (brokerResult[t.resultCurrency] ?? 0) + t.result;
  }
  const openQty = lots.reduce((sum, lot) => sum + lot.qty, 0);
  const openLifoCostUsd = lots.reduce((sum, lot) => sum + lot.qty * lot.price, 0);
  const realizedUsd = trips.reduce((sum, trip) => sum + trip.grossUsd, 0);
  const unrealizedUsd = openQty * price - openLifoCostUsd;
  const firstBuy = ordered.find((t) => t.side === "BUY") ?? null;

  const buckets = HOLD_BUCKETS.map((bucket, i) => {
    const min = i ? HOLD_BUCKETS[i - 1].maxHours : 0;
    const items = trips.filter((trip) => trip.holdHours >= min && trip.holdHours < bucket.maxHours);
    const qty = items.reduce((sum, trip) => sum + trip.qty, 0);
    const grossUsd = items.reduce((sum, trip) => sum + trip.grossUsd, 0);
    return {
      key: bucket.key,
      label: bucket.label,
      trips: items.length,
      qty,
      grossUsd,
      perShareUsd: qty > EPSILON ? grossUsd / qty : null,
      winRate: items.length
        ? items.filter((trip) => trip.grossUsd > 0).length / items.length
        : null,
    };
  });

  const short = trips.filter((trip) => trip.holdHours < 24);
  const wins = short.filter((trip) => trip.sellPrice > trip.buyPrice);
  const losers = short.filter((trip) => trip.sellPrice <= trip.buyPrice);

  return {
    first: ordered[0].ts,
    last: ordered[ordered.length - 1].ts,
    price,
    buys,
    sells,
    boughtUsd,
    soldUsd,
    startedFlat: unmatchedQty <= EPSILON,
    unmatchedQty,
    openQty,
    openValueUsd: openQty * price,
    averageCostUsd: openQty > EPSILON && cost > 0 ? cost / position : null,
    openLifoAverageUsd: openQty > EPSILON ? openLifoCostUsd / openQty : null,
    realizedUsd,
    unrealizedUsd,
    totalUsd: soldUsd - boughtUsd + openQty * price,
    holdAllUsd,
    peakCostUsd,
    firstBuyPrice: firstBuy?.price ?? null,
    benchmarkUsd: firstBuy ? peakCostUsd * (price / firstBuy.price - 1) : null,
    fxFees,
    brokerResult,
    trips: trips.length,
    buckets,
    short: {
      trips: short.length,
      winRate: short.length ? wins.length / short.length : null,
      losers: losers.length,
      medianGainUsd: medianOf(wins.map((trip) => trip.sellPrice - trip.buyPrice)),
      medianGainPct: medianOf(wins.map((trip) => (trip.sellPrice / trip.buyPrice - 1) * 100)),
      medianHoldHours: medianOf(short.map((trip) => trip.holdHours)),
      outsideRegularShare: short.length
        ? short.filter((trip) => !isRegularSession(trip.buyMinute)).length / short.length
        : null,
      grossUsd: short.reduce((sum, trip) => sum + trip.grossUsd, 0),
    },
    openLots: lots.map((lot) => ({ ...lot })),
  };
}
