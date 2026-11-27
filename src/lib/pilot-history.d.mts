import type { MarketData } from "./pilot-engine.mjs";

export const HISTORY_SYMBOLS: readonly string[];
export interface DailyHistory {
  symbol: string;
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
export function parseDailyHistory(payload: unknown, now?: number, symbol?: string): DailyHistory;
export interface LiveMeta {
  symbol: string;
  price: number;
  previousClose: number;
  time: number;
  date: string;
}
export function parseLiveMeta(payload: unknown, symbol: string, now?: number): LiveMeta | null;
export function parseIntradayHistory(payload: unknown, now?: number): MarketData;
