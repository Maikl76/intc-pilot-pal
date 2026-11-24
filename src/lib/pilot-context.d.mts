export interface DailyContext {
  symbol: string;
  date: string;
  previousDate: string;
  expectedDate: string | null;
  stale: boolean;
  close: number;
  changePct: number;
  atr14: number;
  volatility20Pct: number;
  volumeRatio: number | null;
  moveScore: number | null;
  from: string;
  count: number;
  bars: { date: string; close: number }[];
}
export function parseDailyContext(payload: unknown, symbol: string, now?: number): DailyContext;
export function alignContext(items: DailyContext[]): {
  date: string | null;
  items: DailyContext[];
  sectorDifference: number | null;
};
export function payoff(input: {
  qty: number;
  target: number;
  stop: number;
  fee: number;
  probability: number;
}): {
  grossWin: number;
  costs: number;
  win: number;
  loss: number;
  breakEvenPct: number;
  expected: number;
  winsToRecover: number | null;
};
