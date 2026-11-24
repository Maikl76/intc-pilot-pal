import type { Settings } from "./pilot-engine.mjs";
export type FillKind = "MARKET" | "SCENARIO" | "LEGACY";
export interface FillEvidence {
  price: number;
  timestamp: number;
  source: string;
  kind: "MARKET" | "SCENARIO";
}
export interface PaperPosition {
  id: string;
  qty: number;
  price: number;
  at: number;
  date: string;
  target: number;
  stop: number | null;
  fee: number;
  holdDays: number;
  quoteAt: number;
  quoteSource: string;
  fillKind: FillKind;
}
export interface PaperTrade extends PaperPosition {
  positionId: string;
  exit: number;
  exitAt: number;
  reason: string;
  pnlUsd: number;
  exitQuoteAt: number;
  exitQuoteSource: string;
}
export interface PaperAccount {
  startingUsd: number;
  cashUsd: number;
  peakUsd: number;
  riskPeakUsd: number;
  maxDrawdownUsd: number;
  positions: PaperPosition[];
  closed: PaperTrade[];
  lastBuyDate: string | null;
  locked: boolean;
  lockReason: "MANUAL" | "DRAWDOWN" | null;
  riskResetAt: number | null;
  riskResetCount: number;
}
export function createPaper(settings: Settings): PaperAccount;
export function paperCost(account: PaperAccount): number;
export function paperEquity(account: PaperAccount, price: number): number;
export function paperSummary(
  account: PaperAccount,
  price: number,
): {
  equityUsd: number;
  realizedUsd: number;
  unrealizedUsd: number;
  totalUsd: number;
  committedUsd: number;
  drawdownUsd: number;
  riskDrawdownUsd: number;
};
export function updatePaperRisk(
  account: PaperAccount,
  price: number,
  limitUsd: number,
): PaperAccount;
export function setPaperLock(
  account: PaperAccount,
  locked: boolean,
  price: number,
  now: number,
): PaperAccount;
export function maxPaperQuantity(account: PaperAccount, settings: Settings, price: number): number;
export function buyPaper(
  account: PaperAccount,
  settings: Settings,
  evidence: FillEvidence,
  qty: number,
  options: { now: number; id: string },
): PaperAccount;
export function sellPaper(
  account: PaperAccount,
  evidence: FillEvidence,
  id: string,
  qty: number | undefined,
  options: { now: number; tradeId: string; reason?: string; limitUsd?: number },
): PaperAccount;
export function validatePaper(value: unknown, expectedKind?: "MARKET" | "SCENARIO"): PaperAccount;
