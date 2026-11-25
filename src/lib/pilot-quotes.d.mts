export type Session = "PRE" | "REGULAR" | "POST" | "OVERNIGHT" | "CLOSED";
export interface Point {
  timestamp: number;
  price: number;
}
export interface QuoteSchedule {
  date: string;
  preStart: number;
  regularStart: number;
  regularEnd: number;
  postEnd: number;
  source: string;
}
export interface QuoteDiagnostic {
  source: string;
  status: "OK" | "ERROR" | "NOT_CONFIGURED";
  checkedAt: number;
  latencyMs?: number;
  message: string;
  timestamp?: number;
}
export interface PilotQuote {
  status: "OK" | "UNAVAILABLE";
  price: number | null;
  open: number | null;
  previousClose: number | null;
  timestamp: number | null;
  receivedAt: number;
  source: string;
  session: Session;
  points: Point[];
  message: string;
  symbol?: "INTC";
  currency?: "USD";
  checkedAt?: number;
  referenceDate?: string;
  chartSource?: string | null;
  timestampKind?: "provider" | "bar";
  expectedDelayMinutes?: number | null;
  cached?: boolean;
  sourceUrl?: string;
  schedule?: QuoteSchedule | null;
  conflict?: boolean;
  disagreementPct?: number | null;
  diagnostics?: QuoteDiagnostic[];
  dayHigh?: number | null;
  dayLow?: number | null;
  regularVolume?: number | null;
}
export function ny(t: number): { date: string; minute: number };
export function marketCalendar(t: number): {
  date: string;
  closed: boolean;
  openMinute: number;
  closeMinute: number;
  postEndMinute: number;
  verified: boolean;
  sourceUrl: string;
};
export function session(t: number): Session;
export function overnightTradingDate(t: number): string | null;
export function marketPhase(t: number): Session;
export function parseAlpacaTrade(payload: unknown, now: number, feed: string): PilotQuote | null;
export function synchronizedQuote(quote: PilotQuote, prior?: PilotQuote | null): PilotQuote;
export function parseYahoo(payload: unknown, now: number): PilotQuote | null;
export function parseFinnhub(payload: unknown, now: number): PilotQuote | null;
export function selectQuote(quotes: (PilotQuote | null)[], now: number): PilotQuote | null;
export function ageMinutes(q: PilotQuote | undefined, now: number): number | null;
export function isUsable(
  q: PilotQuote | undefined,
  now: number,
): q is PilotQuote & { status: "OK"; price: number; timestamp: number };
export function isRegularFresh(
  q: PilotQuote | undefined,
  now: number,
): q is PilotQuote & {
  status: "OK";
  price: number;
  timestamp: number;
  open: number;
  previousClose: number;
};
