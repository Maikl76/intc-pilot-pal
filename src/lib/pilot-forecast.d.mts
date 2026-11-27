import type { Day, Settings } from "./pilot-engine.mjs";

export const TRADING_DAYS: number;
export function mean(values: ArrayLike<number> & Iterable<number>): number;
export function sampleSd(values: ArrayLike<number> & Iterable<number>): number;
export function quantile(sorted: ArrayLike<number>, p: number): number;
export function normalCdf(x: number): number;
export function normalQuantile(p: number): number;
export function seededRandom(seed: number): () => number;
export function gaussian(random: () => number): number;
export function wilsonInterval(
  successes: number,
  n: number,
  level?: number,
): { low: number; high: number };
export function bootstrapMean(
  values: number[],
  options?: { resamples?: number; level?: number; seed?: number },
): { low: number; high: number };

export function logReturns(closes: number[]): number[];
export function volatility(
  closes: number[],
  lookback?: number,
): { sigmaDaily: number; sigmaAnnual: number; returns: number };

export interface PriceBand {
  level: number;
  low: number;
  high: number;
}
export interface PriceForecast {
  price: number;
  days: number;
  logMean: number;
  logSd: number;
  median: number;
  bands: PriceBand[];
}
export function priceForecast(input: {
  price: number;
  sigmaAnnual: number;
  driftAnnual?: number;
  days: number;
  levels?: number[];
}): PriceForecast;
export function probabilityAbove(forecast: PriceForecast, threshold: number): number;

export interface PositionForecast extends PriceForecast {
  qty: number;
  avgPrice: number;
  fx: number;
  valueNowCzk: number;
  medianChangeCzk: number;
  medianResultCzk: number | null;
  bandsCzk: {
    level: number;
    changeLow: number;
    changeHigh: number;
    resultLow: number | null;
    resultHigh: number | null;
  }[];
  probabilityProfit: number | null;
  probabilityDrop20: number;
}
export function positionForecast(input: {
  qty: number;
  avgPrice: number;
  price: number;
  sigmaAnnual: number;
  driftAnnual?: number;
  days: number;
  fx: number;
  levels?: number[];
}): PositionForecast;

export interface Calibration {
  lookback: number;
  horizon: number;
  level: number;
  count: number;
  independent: number;
  coverage: number;
  below: number;
  above: number;
  directionCount: number;
  directionHitRate: number | null;
}
export function calibrationBacktest(
  closes: number[],
  options?: { lookback?: number; horizon?: number; level?: number },
): Calibration | null;
export function tailFacts(
  closes: number[],
  dates?: string[],
): {
  days: number;
  worstPct: number | null;
  worstDate: string | null;
  dropsAtLeast5: number;
  dropsAtLeast10: number;
};

export function chanceTargetFirst(targetUsd: number, stopUsd: number): number | null;

export interface TradeStatistics {
  n: number;
  mean: number;
  sd: number;
  ciLow: number;
  ciHigh: number;
  wins: number;
  winRate: number;
  winLow: number;
  winHigh: number;
  requiredTrades: number | null;
}
export function tradeStatistics(
  perShare: number[],
  options?: { level?: number; seed?: number },
): TradeStatistics;

export interface RandomOutcomes {
  days: number[][];
  count: number;
  mean: number;
  targetShare: number;
  stopShare: number;
  timeShare: number;
  openShare: number;
  step: number;
}
export function randomEntryOutcomes(
  days: Day[],
  settings: Settings,
  options?: { maxEntries?: number },
): RandomOutcomes;
export function randomEntryTest(
  outcomes: RandomOutcomes,
  tradeCount: number,
  observedMean: number,
  options?: { sets?: number; seed?: number },
): {
  sets: number;
  tradeCount: number;
  pValue: number;
  low: number;
  high: number;
  median: number;
} | null;
export function dailyResults(days: Day[], trades: { exitDate: string; pnlCzk: number }[]): number[];

export interface Spread {
  p05: number;
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  p95: number;
}
export function combinedForecast(input: {
  longTerm?: {
    qty: number;
    price: number;
    sigmaAnnual: number;
    driftAnnual?: number;
    fx: number;
  } | null;
  dayTrading?: { dailyCzk: number[] } | null;
  horizon: number;
  simulations?: number;
  seed?: number;
}): {
  horizon: number;
  simulations: number;
  longTerm: Spread | null;
  dayTrading: Spread | null;
  total: Spread;
  probabilityLoss: number;
};
