import type { Transaction } from "./pilot-engine.mjs";

export function isRegularSession(minute: number): boolean;
export const HOLD_BUCKETS: readonly { key: string; label: string; maxHours: number }[];

export interface RoundTrip {
  qty: number;
  buyPrice: number;
  sellPrice: number;
  buyTs: number;
  sellTs: number;
  buyMinute: number;
  holdHours: number;
  grossUsd: number;
}
export interface OpenLot {
  qty: number;
  price: number;
  ts: number;
  minute: number;
  date: string;
}
export function matchLifo(transactions: Transaction[]): {
  trips: RoundTrip[];
  lots: OpenLot[];
  unmatchedQty: number;
};

export interface TradeReview {
  first: number;
  last: number;
  price: number;
  buys: number;
  sells: number;
  boughtUsd: number;
  soldUsd: number;
  startedFlat: boolean;
  unmatchedQty: number;
  openQty: number;
  openValueUsd: number;
  averageCostUsd: number | null;
  openLifoAverageUsd: number | null;
  realizedUsd: number;
  unrealizedUsd: number;
  totalUsd: number;
  holdAllUsd: number;
  peakCostUsd: number;
  firstBuyPrice: number | null;
  benchmarkUsd: number | null;
  fxFees: Record<string, number>;
  brokerResult: Record<string, number>;
  trips: number;
  buckets: {
    key: string;
    label: string;
    trips: number;
    qty: number;
    grossUsd: number;
    perShareUsd: number | null;
    winRate: number | null;
  }[];
  short: {
    trips: number;
    winRate: number | null;
    losers: number;
    medianGainUsd: number | null;
    medianGainPct: number | null;
    medianHoldHours: number | null;
    outsideRegularShare: number | null;
    grossUsd: number;
  };
  openLots: OpenLot[];
}
export function reviewTrades(transactions: Transaction[], price: number): TradeReview;
