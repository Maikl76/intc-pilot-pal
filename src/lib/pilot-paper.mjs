import { ny, validate } from "./pilot-engine.mjs";

const EPSILON = 1e-7;
const finite = (value, name, min = 0) => {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min) {
    throw new Error(`Neplatná hodnota: ${name}.`);
  }
  return value;
};
const text = (value, name) => {
  if (typeof value !== "string" || !value || value.length > 500)
    throw new Error(`Neplatná hodnota: ${name}.`);
  return value;
};
const positive = (value, name) => {
  finite(value, name);
  if (value <= 0) throw new Error(`Hodnota ${name} musí být větší než nula.`);
  return value;
};
const quantity = (value) => {
  if (!Number.isSafeInteger(value) || value < 1)
    throw new Error("Počet akcií musí být kladné celé číslo.");
  return value;
};
const near = (a, b) => Math.abs(a - b) <= Math.max(0.000001, Math.abs(b) * 1e-10);

/** Pure accounting. All prices are explicitly supplied; this module never fabricates a quote. */
export function createPaper(settings) {
  validate(settings);
  const cash = settings.capitalCzk / settings.fx;
  return {
    startingUsd: cash,
    cashUsd: cash,
    peakUsd: cash,
    riskPeakUsd: cash,
    maxDrawdownUsd: 0,
    positions: [],
    closed: [],
    lastBuyDate: null,
    locked: false,
    lockReason: null,
    riskResetAt: null,
    riskResetCount: 0,
  };
}

export function paperCost(account) {
  return account.positions.reduce(
    (sum, position) => sum + position.qty * (position.price + position.fee),
    0,
  );
}

export function paperEquity(account, price) {
  positive(price, "cena ocenění");
  return (
    account.cashUsd +
    account.positions.reduce((sum, position) => sum + position.qty * (price - position.fee), 0)
  );
}

export function paperSummary(account, price) {
  const equityUsd = paperEquity(account, price);
  const realizedUsd = account.closed.reduce((sum, trade) => sum + trade.pnlUsd, 0);
  const unrealizedUsd = account.positions.reduce(
    (sum, position) => sum + position.qty * (price - position.price - 2 * position.fee),
    0,
  );
  return {
    equityUsd,
    realizedUsd,
    unrealizedUsd,
    totalUsd: realizedUsd + unrealizedUsd,
    committedUsd: paperCost(account),
    drawdownUsd: Math.max(0, account.peakUsd - equityUsd),
    riskDrawdownUsd: Math.max(0, account.riskPeakUsd - equityUsd),
  };
}

export function updatePaperRisk(account, price, limitUsd) {
  positive(limitUsd, "limit poklesu účtu");
  const equity = paperEquity(account, price);
  const peakUsd = Math.max(account.peakUsd, equity);
  const riskPeakUsd = Math.max(account.riskPeakUsd, equity);
  const maxDrawdownUsd = Math.max(account.maxDrawdownUsd, peakUsd - equity);
  const triggered = riskPeakUsd - equity + EPSILON >= limitUsd;
  const locked = account.locked || triggered;
  const lockReason = account.locked ? account.lockReason : triggered ? "DRAWDOWN" : null;
  if (
    peakUsd === account.peakUsd &&
    riskPeakUsd === account.riskPeakUsd &&
    maxDrawdownUsd === account.maxDrawdownUsd &&
    locked === account.locked &&
    lockReason === account.lockReason
  )
    return account;
  return { ...account, peakUsd, riskPeakUsd, maxDrawdownUsd, locked, lockReason };
}

export function setPaperLock(account, locked, price, now) {
  if (locked) return { ...account, locked: true, lockReason: "MANUAL" };
  const equity = paperEquity(account, price);
  return {
    ...account,
    locked: false,
    lockReason: null,
    riskPeakUsd: equity,
    peakUsd: Math.max(account.peakUsd, equity),
    maxDrawdownUsd: Math.max(account.maxDrawdownUsd, account.peakUsd - equity),
    riskResetAt: finite(now, "čas obnovení limitu"),
    riskResetCount: account.riskResetCount + 1,
  };
}

function evidenceOf(evidence, now) {
  const price = positive(evidence.price, "cena plnění");
  const timestamp = positive(evidence.timestamp, "čas kotace");
  text(evidence.source, "zdroj kotace");
  if (!["MARKET", "SCENARIO"].includes(evidence.kind))
    throw new Error("Chybí typ simulovaného plnění.");
  if (timestamp > now + 5000) throw new Error("Kotace má čas v budoucnosti.");
  return { price, timestamp, source: evidence.source, kind: evidence.kind };
}

export function maxPaperQuantity(account, settings, price) {
  if (!(price > 0) || !Number.isFinite(price)) return 0;
  const available = Math.min(
    account.cashUsd - settings.reserveCzk / settings.fx,
    (settings.capitalCzk - settings.reserveCzk) / settings.fx - paperCost(account),
    settings.slotCzk / settings.fx,
  );
  return Math.max(0, Math.floor((available + EPSILON) / (price + settings.fee)));
}

export function buyPaper(account, settings, evidence, qty, { now, id }) {
  validate(settings);
  quantity(qty);
  finite(now, "čas nákupu");
  text(id, "identifikátor nákupu");
  const fill = evidenceOf(evidence, now);
  if (
    [...account.positions, ...account.closed].some(
      (item) => item.fillKind !== "LEGACY" && item.fillKind !== fill.kind,
    )
  )
    throw new Error("Tržní cvičení a vlastní scénář musí mít oddělené účty.");
  if (
    account.positions.some((position) => position.id === id) ||
    account.closed.some((trade) => trade.positionId === id || trade.id === id)
  )
    throw new Error("Tento nákup už byl zpracován.");
  const checked = updatePaperRisk(account, fill.price, settings.drawdownLimitCzk / settings.fx);
  if (checked.locked)
    throw new Error("Ochrana účtu blokuje nové nákupy. Otevřené pozice lze prodat.");
  if (settings.fee >= fill.price)
    throw new Error("Náklady na jednu stranu musí být menší než cena akcie.");
  if (checked.positions.length >= settings.maxSlots)
    throw new Error("Dosažen maximální počet otevřených pozic.");
  const allowed = maxPaperQuantity(checked, settings, fill.price);
  if (qty > allowed)
    throw new Error(`Limit kapitálu, nákupu nebo rezervy dovoluje nejvýše ${allowed} akcií.`);
  if (settings.stopUsd >= fill.price)
    throw new Error("Stop musí být menší než nákupní cena akcie.");
  const date = ny(now).date;
  const position = {
    id,
    qty,
    price: fill.price,
    at: now,
    date,
    target: fill.price + settings.targetUsd,
    stop: settings.stopUsd > 0 ? fill.price - settings.stopUsd : null,
    fee: settings.fee,
    holdDays: settings.holdDays,
    quoteAt: fill.timestamp,
    quoteSource: fill.source,
    fillKind: fill.kind,
  };
  const next = {
    ...checked,
    cashUsd: checked.cashUsd - qty * (fill.price + settings.fee),
    positions: [...checked.positions, position],
    lastBuyDate: date,
  };
  return updatePaperRisk(next, fill.price, settings.drawdownLimitCzk / settings.fx);
}

export function sellPaper(
  account,
  evidence,
  id,
  qty,
  { now, tradeId, reason = "MANUAL", limitUsd },
) {
  finite(now, "čas prodeje");
  text(tradeId, "identifikátor prodeje");
  const fill = evidenceOf(evidence, now);
  const position = account.positions.find((item) => item.id === id);
  if (!position) throw new Error("Pozice už není otevřená. Obnov přehled.");
  if (now < position.at)
    throw new Error("Čas prodeje předchází nákupu. Zkontroluj hodiny zařízení.");
  const soldQty = quantity(qty ?? position.qty);
  if (soldQty > position.qty) throw new Error(`V pozici zbývá pouze ${position.qty} akcií.`);
  if (account.closed.some((trade) => trade.id === tradeId))
    throw new Error("Tento prodej už byl zpracován.");
  if (position.fillKind !== "LEGACY" && position.fillKind !== fill.kind)
    throw new Error("Tržní cvičení a vlastní scénář nelze sloučit.");
  const trade = {
    ...position,
    id: tradeId,
    positionId: position.id,
    qty: soldQty,
    exit: fill.price,
    exitAt: now,
    reason: text(reason, "důvod prodeje"),
    pnlUsd: soldQty * (fill.price - position.price - 2 * position.fee),
    exitQuoteAt: fill.timestamp,
    exitQuoteSource: fill.source,
  };
  const next = {
    ...account,
    cashUsd: account.cashUsd + soldQty * (fill.price - position.fee),
    positions: account.positions.flatMap((item) =>
      item.id !== id ? [item] : soldQty === item.qty ? [] : [{ ...item, qty: item.qty - soldQty }],
    ),
    closed: [...account.closed, trade],
  };
  return limitUsd ? updatePaperRisk(next, fill.price, limitUsd) : next;
}

function readPosition(value, closed = false) {
  if (!value || typeof value !== "object") throw new Error("Neplatná uložená pozice.");
  const id = text(value.id, "ID pozice");
  const qty = quantity(value.qty);
  const price = positive(value.price, "cena nákupu");
  const at = positive(value.at, "čas nákupu");
  const date = text(value.date, "datum nákupu");
  if (date !== ny(at).date) throw new Error("Datum pozice neodpovídá času nákupu.");
  const target = positive(value.target, "cenový cíl");
  if (target <= price) throw new Error("Cíl musí být nad nákupní cenou.");
  const stop = value.stop === null ? null : positive(value.stop, "stop");
  if (stop !== null && stop >= price) throw new Error("Stop musí být pod nákupní cenou.");
  const fee = finite(value.fee, "náklady");
  if (fee >= price) throw new Error("Náklady musí být menší než nákupní cena.");
  const holdDays = finite(value.holdDays, "limit držení", -1);
  if (!Number.isInteger(holdDays)) throw new Error("Neplatný limit držení.");
  const legacy = value.fillKind === undefined;
  const fillKind = legacy ? "LEGACY" : value.fillKind;
  if (!["MARKET", "SCENARIO", "LEGACY"].includes(fillKind))
    throw new Error("Neplatný typ simulovaného plnění.");
  const quoteAt = legacy ? at : positive(value.quoteAt, "čas původní kotace");
  const quoteSource = legacy
    ? "Starší záznam bez uloženého zdroje"
    : text(value.quoteSource, "zdroj nákupu");
  const result = {
    id,
    qty,
    price,
    at,
    date,
    target,
    stop,
    fee,
    holdDays,
    quoteAt,
    quoteSource,
    fillKind,
  };
  if (!closed) return result;
  const exit = positive(value.exit, "prodejní cena");
  const exitAt = positive(value.exitAt, "čas prodeje");
  if (exitAt < at) throw new Error("Prodej předchází nákupu.");
  const pnlUsd = finite(value.pnlUsd, "realizovaný výsledek", -Number.MAX_VALUE);
  if (!near(pnlUsd, qty * (exit - price - 2 * fee)))
    throw new Error("Výsledek obchodu nesouhlasí s cenami a náklady.");
  return {
    ...result,
    positionId: value.positionId === undefined ? id : text(value.positionId, "ID původní pozice"),
    exit,
    exitAt,
    reason: text(value.reason, "důvod prodeje"),
    pnlUsd,
    exitQuoteAt:
      value.exitQuoteAt === undefined ? exitAt : positive(value.exitQuoteAt, "čas prodejní kotace"),
    exitQuoteSource:
      value.exitQuoteSource === undefined
        ? "Starší záznam bez uloženého zdroje"
        : text(value.exitQuoteSource, "zdroj prodeje"),
  };
}

/** Validates both persisted v2 accounts and v3 backups, retaining legacy history. */
export function validatePaper(value, expectedKind) {
  if (!value || typeof value !== "object") throw new Error("V záloze chybí cvičný účet.");
  const startingUsd = positive(value.startingUsd, "počáteční kapitál");
  const cashUsd = finite(value.cashUsd, "hotovost");
  const peakUsd = positive(value.peakUsd, "historické maximum");
  if (peakUsd + EPSILON < startingUsd)
    throw new Error("Historické maximum je nižší než počáteční kapitál.");
  const riskPeakUsd =
    value.riskPeakUsd === undefined
      ? peakUsd
      : finite(value.riskPeakUsd, "reference ochrany účtu", -Number.MAX_VALUE);
  if (riskPeakUsd > peakUsd + EPSILON)
    throw new Error("Reference ochrany přesahuje historické maximum účtu.");
  const maxDrawdownUsd =
    value.maxDrawdownUsd === undefined ? 0 : finite(value.maxDrawdownUsd, "historický pokles");
  if (
    !Array.isArray(value.positions) ||
    value.positions.length > 100 ||
    !Array.isArray(value.closed) ||
    value.closed.length > 100000
  )
    throw new Error("Neplatný seznam obchodů v záloze.");
  const positions = value.positions.map((item) => readPosition(item));
  const closed = value.closed.map((item) => readPosition(item, true));
  if (
    new Set(positions.map((item) => item.id)).size !== positions.length ||
    new Set(closed.map((item) => item.id)).size !== closed.length
  )
    throw new Error("Duplicitní identifikátory obchodů.");
  if (
    expectedKind &&
    [...positions, ...closed].some(
      (item) => item.fillKind !== "LEGACY" && item.fillKind !== expectedKind,
    )
  )
    throw new Error("Záloha míchá tržní cvičení s vlastním scénářem.");
  if (typeof value.locked !== "boolean") throw new Error("Neplatný stav ochrany účtu.");
  const lockReason = value.locked
    ? value.lockReason === "DRAWDOWN"
      ? "DRAWDOWN"
      : "MANUAL"
    : null;
  const lastBuyDate =
    value.lastBuyDate === null ? null : text(value.lastBuyDate, "den posledního nákupu");
  if (lastBuyDate !== null && !/^\d{4}-\d{2}-\d{2}$/.test(lastBuyDate))
    throw new Error("Neplatný den posledního nákupu.");
  const riskResetAt =
    value.riskResetAt === undefined || value.riskResetAt === null
      ? null
      : finite(value.riskResetAt, "obnovení ochrany");
  const riskResetCount =
    value.riskResetCount === undefined ? 0 : finite(value.riskResetCount, "počet obnovení ochrany");
  if (!Number.isSafeInteger(riskResetCount)) throw new Error("Neplatný počet obnovení ochrany.");
  const account = {
    startingUsd,
    cashUsd,
    peakUsd,
    riskPeakUsd,
    maxDrawdownUsd,
    positions,
    closed,
    lastBuyDate,
    locked: value.locked,
    lockReason,
    riskResetAt,
    riskResetCount,
  };
  const realized = closed.reduce((sum, trade) => sum + trade.pnlUsd, 0);
  if (!near(cashUsd + paperCost(account), startingUsd + realized))
    throw new Error("Hotovost, otevřené pozice a historie v záloze účetně nesouhlasí.");
  return account;
}
