import type {
  ActionKind,
  AppState,
  PortfolioState,
  Quote,
  StrategyParams,
  StrategyStatus,
} from "./types";

export const DEFAULT_PARAMS: StrategyParams = {
  trancheCzk: 10000,
  maxExposureCzk: 300000,
  stopAddDropPct: 8,
  cooldownDays: 5,
  reboundPct: 3,
  constantTrancheOnDrawdown: true,
  preferredCurrency: "USD",
  sellMode: "C",
  sellTargetPct: 2,
  maxDrawdownPct: 20,
  maxConsecutiveLosses: 3,
  fxUsdCzk: 22.8,
};

export const PARAM_LIMITS = {
  trancheCzk: { min: 5000, max: 15000, step: 500 },
  maxExposureCzk: { min: 50000, max: 1000000, step: 10000 },
  stopAddDropPct: { min: 2, max: 20, step: 0.5 },
  cooldownDays: { min: 0, max: 30, step: 1 },
  reboundPct: { min: 0.5, max: 10, step: 0.5 },
  sellTargetPct: { min: 0.5, max: 5, step: 0.1 },
  maxDrawdownPct: { min: 5, max: 50, step: 1 },
  maxConsecutiveLosses: { min: 1, max: 10, step: 1 },
  fxUsdCzk: { min: 15, max: 30, step: 0.1 },
} as const;

export function daysBetween(fromIso: string, to: Date): number {
  const from = new Date(fromIso);
  return Math.floor((to.getTime() - from.getTime()) / 86400000);
}

export function totalShares(p: PortfolioState): number {
  return p.tranches.reduce((sum, t) => sum + t.shares, 0);
}

export function avgPriceUsd(p: PortfolioState): number {
  const shares = totalShares(p);
  if (shares <= 0) return 0;
  const cost = p.tranches.reduce((sum, t) => sum + t.shares * t.priceUsd, 0);
  return cost / shares;
}

export function exposureCzk(p: PortfolioState, priceUsd: number, fx: number): number {
  return totalShares(p) * priceUsd * fx;
}

export function unrealizedPnlCzk(
  p: PortfolioState,
  priceUsd: number,
  fx: number,
): number {
  return (priceUsd - avgPriceUsd(p)) * totalShares(p) * fx;
}

export function equityCzk(p: PortfolioState, priceUsd: number, fx: number): number {
  return p.cashCzk + exposureCzk(p, priceUsd, fx);
}

export function drawdownPct(p: PortfolioState, priceUsd: number, fx: number): number {
  const eq = equityCzk(p, priceUsd, fx);
  if (p.equityPeakCzk <= 0) return 0;
  return Math.max(0, ((p.equityPeakCzk - eq) / p.equityPeakCzk) * 100);
}

export function consecutiveLosses(p: PortfolioState): number {
  let count = 0;
  for (let i = p.realizedTrades.length - 1; i >= 0; i--) {
    const trade = p.realizedTrades[i];
    if (trade && trade.pnlCzk < 0) count++;
    else break;
  }
  return count;
}

export function realizedTodayCzk(p: PortfolioState): number {
  const today = new Date().toISOString().slice(0, 10);
  return p.realizedTrades
    .filter((t) => t.closedAt.slice(0, 10) === today)
    .reduce((sum, t) => sum + t.pnlCzk, 0);
}

export interface StrategySnapshot {
  status: StrategyStatus;
  action: ActionKind;
  reason: string;
  shares: number;
  avgPriceUsd: number;
  exposureCzk: number;
  unrealizedPnlCzk: number;
  unrealizedPnlPct: number;
  equityCzk: number;
  drawdownPct: number;
  dropFromReferencePct: number | null;
  distanceToStopAddPct: number | null;
  distanceToCapCzk: number;
  capUsedPct: number;
  reboundFromLowPct: number | null;
  cooldownDaysElapsed: number | null;
  cooldownDaysRemaining: number | null;
  gainVsAvgPct: number | null;
  suggestedShares: number;
  suggestedValueUsd: number;
  suggestedValueCzk: number;
  fxWarning: boolean;
  buyBlockedReasons: string[];
}

/**
 * Čistá deterministická evaluace strategie. Nemění stav — pouze popisuje,
 * co pravidla říkají pro daný stav portfolia a aktuální kotaci.
 */
export function evaluateStrategy(
  state: AppState,
  quote: Quote,
  now: Date = new Date(),
): StrategySnapshot {
  const { params, portfolio: p } = state;
  const price = quote.priceUsd;
  const fx = params.fxUsdCzk;

  const shares = totalShares(p);
  const avg = avgPriceUsd(p);
  const exposure = exposureCzk(p, price, fx);
  const upl = unrealizedPnlCzk(p, price, fx);
  const uplPct = shares > 0 && avg > 0 ? ((price - avg) / avg) * 100 : 0;
  const equity = equityCzk(p, price, fx);
  const dd = drawdownPct(p, price, fx);

  const dropFromRef = p.cycleReferencePriceUsd
    ? ((p.cycleReferencePriceUsd - price) / p.cycleReferencePriceUsd) * 100
    : null;
  const distanceToStopAdd = dropFromRef === null ? null : params.stopAddDropPct - dropFromRef;

  const distanceToCap = Math.max(0, params.maxExposureCzk - exposure);
  const capUsedPct = params.maxExposureCzk > 0 ? (exposure / params.maxExposureCzk) * 100 : 0;

  const low = p.cycleLowUsd;
  const rebound = low && low > 0 ? ((price - low) / low) * 100 : null;

  const cooldownElapsed = p.cooldownStartedAt ? daysBetween(p.cooldownStartedAt, now) : null;
  const cooldownRemaining =
    cooldownElapsed === null ? null : Math.max(0, params.cooldownDays - cooldownElapsed);

  const sinceLastBuy = p.lastBuyAt ? daysBetween(p.lastBuyAt, now) : null;

  // Návrh velikosti nákupu — konstantní tranše, nikdy nenavyšovaná při poklesu.
  const trancheCzk = Math.min(params.trancheCzk, distanceToCap);
  const suggestedShares = price > 0 ? Math.floor((trancheCzk / fx / price) * 100) / 100 : 0;
  const suggestedValueUsd = suggestedShares * price;
  const suggestedValueCzk = suggestedValueUsd * fx;

  const blocked: string[] = [];

  if (state.riskLocked) blocked.push("Risk lock je aktivní (překročen limit v risk panelu).");
  if (p.manualPause) blocked.push("Strategie je ručně pozastavena (PAUSED).");
  if (distanceToCap < 100)
    blocked.push(
      `Dosažen cap expozice ${fmtCzk(params.maxExposureCzk)} (aktuálně ${fmtCzk(exposure)}).`,
    );
  if (dropFromRef !== null && dropFromRef >= params.stopAddDropPct)
    blocked.push(
      `Pokles ${dropFromRef.toFixed(2)} % od referenční ceny cyklu ${fmtUsd(
        p.cycleReferencePriceUsd ?? 0,
      )} překročil hranici ${params.stopAddDropPct} % → stop-add.`,
    );
  if (cooldownRemaining !== null && cooldownRemaining > 0)
    blocked.push(
      `Cooldown: uplynulo ${cooldownElapsed} z ${params.cooldownDays} kalendářních dní.`,
    );
  if (
    p.cooldownStartedAt &&
    cooldownRemaining === 0 &&
    rebound !== null &&
    rebound < params.reboundPct
  )
    blocked.push(
      `Rebound od minima ${fmtUsd(low ?? 0)} je ${rebound.toFixed(2)} %, požadováno ≥ ${
        params.reboundPct
      } %.`,
    );
  if (sinceLastBuy !== null && sinceLastBuy < params.cooldownDays && !p.cooldownStartedAt)
    blocked.push(
      `Od posledního nákupu uplynulo ${sinceLastBuy} dní, minimální odstup je ${params.cooldownDays} dní.`,
    );
  if (p.cashCzk < suggestedValueCzk)
    blocked.push(`Nedostatek volné hotovosti (${fmtCzk(p.cashCzk)}).`);

  let status: StrategyStatus = "ACTIVE";
  if (p.manualPause || state.riskLocked) status = "PAUSED";
  else if (
    (cooldownRemaining !== null && cooldownRemaining > 0) ||
    (dropFromRef !== null && dropFromRef >= params.stopAddDropPct) ||
    (p.cooldownStartedAt !== null && rebound !== null && rebound < params.reboundPct)
  )
    status = "COOLDOWN";

  // Prodejní modul
  const gainVsAvg = shares > 0 && avg > 0 ? ((price - avg) / avg) * 100 : null;
  const bestTranche = [...p.tranches].sort((a, b) => a.priceUsd - b.priceUsd)[0];
  const gainVsTranche =
    bestTranche && bestTranche.priceUsd > 0
      ? ((price - bestTranche.priceUsd) / bestTranche.priceUsd) * 100
      : null;

  let sellSignal = false;
  let sellReason = "";
  if (shares > 0) {
    if (params.sellMode === "A" && gainVsAvg !== null && gainVsAvg >= params.sellTargetPct) {
      sellSignal = true;
      sellReason = `Režim A: zisk ${gainVsAvg.toFixed(2)} % nad průměrnou cenou pozice ${fmtUsd(
        avg,
      )} dosáhl targetu ${params.sellTargetPct} %.`;
    } else if (
      params.sellMode === "B" &&
      gainVsTranche !== null &&
      gainVsTranche >= params.sellTargetPct
    ) {
      sellSignal = true;
      sellReason = `Režim B: tranše z ${fmtUsd(
        bestTranche?.priceUsd ?? 0,
      )} je v zisku ${gainVsTranche.toFixed(2)} % ≥ target ${params.sellTargetPct} %.`;
    } else if (params.sellMode === "C" && gainVsAvg !== null && gainVsAvg >= params.sellTargetPct) {
      sellSignal = true;
      sellReason = `Režim C (ruční potvrzení): cena je ${gainVsAvg.toFixed(
        2,
      )} % nad průměrem — signál k prodeji musíš potvrdit ručně, systém nic neodesílá sám.`;
    }
  }

  let action: ActionKind;
  let reason: string;

  if (p.manualPause || state.riskLocked) {
    action = "PAUZA";
    reason = state.riskLocked
      ? "Risk lock: byl překročen limit v risk panelu. Strategie neobchoduje, dokud lock ručně neodemkneš."
      : "Strategie je ručně pozastavena. Odemkni ji v risk panelu nebo na dashboardu.";
  } else if (sellSignal) {
    action = "PRODAT_CAST";
    reason = sellReason;
  } else if (blocked.length === 0) {
    action = "KUP";
    reason =
      p.cycleReferencePriceUsd === null
        ? `Žádný otevřený cyklus — první nákup nastaví referenční cenu na ${fmtUsd(
            price,
          )}. Tranše ${fmtCzk(params.trancheCzk)}.`
        : `Všechny podmínky splněny: pokles od reference ${dropFromRef?.toFixed(
            2,
          )} % < ${params.stopAddDropPct} %, cooldown vyčerpán, rebound ${
            rebound !== null ? rebound.toFixed(2) + " %" : "n/a"
          }, do capu zbývá ${fmtCzk(distanceToCap)}.`;
  } else if (shares > 0) {
    action = "DRZET";
    reason = `Nová tranše se neotevírá: ${blocked[0]} Pozice zůstává otevřená, prodejní target ${params.sellTargetPct} % zatím nedosažen.`;
  } else {
    action = "NEKUPOVAT";
    reason = blocked[0] ?? "Podmínky pro nákup nejsou splněny.";
  }

  return {
    status,
    action,
    reason,
    shares,
    avgPriceUsd: avg,
    exposureCzk: exposure,
    unrealizedPnlCzk: upl,
    unrealizedPnlPct: uplPct,
    equityCzk: equity,
    drawdownPct: dd,
    dropFromReferencePct: dropFromRef,
    distanceToStopAddPct: distanceToStopAdd,
    distanceToCapCzk: distanceToCap,
    capUsedPct,
    reboundFromLowPct: rebound,
    cooldownDaysElapsed: cooldownElapsed,
    cooldownDaysRemaining: cooldownRemaining,
    gainVsAvgPct: gainVsAvg,
    suggestedShares,
    suggestedValueUsd,
    suggestedValueCzk,
    fxWarning: params.preferredCurrency !== "USD" || quote.currency !== "USD",
    buyBlockedReasons: blocked,
  };
}

export function fmtCzk(value: number): string {
  return `${new Intl.NumberFormat("cs-CZ", { maximumFractionDigits: 0 }).format(value)} Kč`;
}

export function fmtUsd(value: number): string {
  return `$${new Intl.NumberFormat("cs-CZ", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)}`;
}

export function fmtPct(value: number, digits = 2): string {
  return `${value > 0 ? "+" : ""}${value.toFixed(digits)} %`;
}

export function fmtNum(value: number, digits = 2): string {
  return new Intl.NumberFormat("cs-CZ", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

export function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("cs-CZ", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export const ACTION_LABEL: Record<ActionKind, string> = {
  KUP: "KUP",
  NEKUPOVAT: "NEKUPOVAT",
  PRODAT_CAST: "PRODAT ČÁST",
  DRZET: "DRŽET",
  PAUZA: "PAUZA",
};
