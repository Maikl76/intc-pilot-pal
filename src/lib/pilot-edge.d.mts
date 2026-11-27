import type { Bar } from "./pilot-engine.mjs";

export interface RiskStats {
  annualPct: number;
  volatilityPct: number;
  maxDrawdownPct: number;
}
export function averageTrueRange(
  highs: number[],
  lows: number[],
  closes: number[],
  n?: number,
): number;
export interface PositionPlan {
  shares: number;
  limitedByCapital: boolean;
  riskUsd: number;
  riskCzk: number;
  lossPerShare: number;
  maxLossUsd: number;
  maxLossCzk: number;
  positionUsd: number;
  positionCzk: number;
  capitalShare: number;
  target: number;
  winUsd: number;
  winCzk: number;
  breakEvenRate: number | null;
  stopDistancePct: number;
}
export function positionPlan(input: {
  capitalCzk: number;
  riskPct: number;
  entry: number;
  stop: number;
  fx: number;
  fee?: number;
  targetR?: number;
}): PositionPlan;
export function averagingDown(input: {
  qty: number;
  avgPrice: number;
  addQty: number;
  addPrice: number;
  stop: number;
}): { newQty: number; newAvg: number; riskBefore: number; riskAfter: number };
export function volatilityRegime(
  values: number[],
  options?: { short?: number; long?: number },
): { currentPct: number; normalPct: number; ratio: number; multiplier: number } | null;
export function volatilityScalingStudy(
  values: number[],
  options?: { short?: number; long?: number },
): { days: number; hold: RiskStats; scaled: RiskStats } | null;
export interface DipStudy {
  dropPct: number;
  horizon: number;
  n: number;
  meanPct: number;
  baselinePct: number;
  excessPct: number;
  excessLowPct: number;
  excessHighPct: number;
  upShare: number | null;
  lastEvent: string | null;
  lastDayPct: number;
}
export function dipStudy(
  values: number[],
  dates: string[] | null,
  options?: { dropPct?: number; horizon?: number; seed?: number },
): DipStudy;
export interface TrendGroup {
  days: number;
  meanBp: number | null;
  volatilityPct: number | null;
}
export function trendStudy(
  values: number[],
  options?: { window?: number },
): {
  window: number;
  ma: number;
  last: number;
  todayAbove: boolean;
  above: TrendGroup;
  below: TrendGroup;
  hold: RiskStats;
  filter: RiskStats;
} | null;
export interface ReturnPart {
  meanBp: number;
  t: number | null;
  totalPct: number;
}
export function overnightIntradayStudy(
  opens: number[],
  values: number[],
): { days: number; overnight: ReturnPart; intraday: ReturnPart };
export interface HourlyDay {
  date: string;
  bars: Bar[];
}
export function hourlySessions(bars: Bar[]): HourlyDay[];
export function intradayMomentumStudy(
  days: HourlyDay[],
  options?: { seed?: number },
): {
  n: number;
  correlation: number;
  meanBp: number;
  lowBp: number;
  highBp: number;
  hitRate: number;
  todayFirstPct: number | null;
} | null;
export function openingRangeStudy(
  days: HourlyDay[],
  options?: { seed?: number },
): {
  n: number;
  meanBp: number;
  baselineBp: number;
  excessLowBp: number;
  excessHighBp: number;
  hitRate: number;
} | null;
export type EdgeVerdict = "MALO_DAT" | "VYHODA" | "NEVYHODA" | "NEPROKAZANO";
export function edgeVerdict(input: {
  n: number;
  low: number;
  high: number;
  minN?: number;
}): EdgeVerdict;
