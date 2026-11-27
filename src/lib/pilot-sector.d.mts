export interface DatedSeries {
  dates: string[];
  values: number[];
}
export interface AlignedReturns {
  dates: string[];
  a: number[];
  b: number[];
}
export function alignedReturns(a: DatedSeries, b: DatedSeries): AlignedReturns;
export function correlation(x: number[], y: number[]): number | null;
export function betaFit(x: number[], y: number[]): { beta: number; r2: number } | null;
export function correlationTable(
  intc: DatedSeries,
  others: (DatedSeries & { symbol: string })[],
  options?: { recent?: number },
): { symbol: string; days: number; recent: number | null; full: number | null }[];
export function decomposeMove(input: { intcPct: number; sectorPct: number; beta: number }): {
  sectorPartPct: number;
  ownPartPct: number;
};
export function trailingBeta(
  aligned: AlignedReturns,
  options?: { window?: number; end?: number },
): { beta: number; r2: number } | null;
export interface DipGroup {
  n: number;
  meanPct: number;
  excessPct: number;
  excessLowPct: number;
  excessHighPct: number;
  lowPct: number;
  highPct: number;
}
export function sectorDipStudy(
  aligned: AlignedReturns,
  options?: {
    dropPct?: number;
    horizon?: number;
    window?: number;
    sectorBand?: number;
    seed?: number;
  },
): { dropPct: number; horizon: number; baselinePct: number; sector: DipGroup; own: DipGroup };
export type MoveKind = "NO_DROP" | "SECTOR" | "OWN" | "MIXED";
export function classifyMove(input: {
  intcPct: number;
  ownPartPct: number;
  dropPct?: number;
  sectorBand?: number;
}): MoveKind;
