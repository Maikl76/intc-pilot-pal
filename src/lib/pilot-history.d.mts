import type { MarketData } from "./pilot-engine.mjs";

export interface DailyHistory {
  adjusted: boolean;
  dates: string[];
  closes: number[];
  values: number[];
  opens: number[];
  highs: number[];
  lows: number[];
  first: string;
  last: string;
  stale: boolean;
}
export function parseDailyHistory(payload: unknown, now?: number): DailyHistory;
export function parseIntradayHistory(payload: unknown, now?: number): MarketData;
