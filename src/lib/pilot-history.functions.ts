import { createServerFn } from "@tanstack/react-start";
import { parseDailyHistory, parseIntradayHistory, type DailyHistory } from "./pilot-history.mjs";
import type { MarketData } from "./pilot-engine.mjs";

export interface HistoryResponse {
  fetchedAt: number;
  daily: DailyHistory | null;
  dailyFetchedAt: number | null;
  intraday: MarketData | null;
  intradayFetchedAt: number | null;
  errors: string[];
  source: string;
}

// Denní řada se mění jednou denně, 5min svíčky průběžně. Při výpadku se použije
// poslední úspěšná odpověď (nejvýše 3 dny / 1 den stará) s viditelnou chybou zdroje.
const DAILY_MS = 6 * 3600000,
  INTRADAY_MS = 15 * 60000,
  DAILY_KEEP_MS = 3 * 86400000,
  INTRADAY_KEEP_MS = 86400000;
let daily: { at: number; value: DailyHistory } | undefined;
let intraday: { at: number; value: MarketData } | undefined;
let pending: Promise<HistoryResponse> | undefined;

async function fetchYahoo(path: string): Promise<unknown> {
  // Pevné hosty a symbol; žádná adresa od uživatele. Rozhraní je neoficiální.
  let failure: unknown;
  for (const host of ["query1.finance.yahoo.com", "query2.finance.yahoo.com"]) {
    try {
      const response = await fetch("https://" + host + path, {
        headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error("HTTP " + response.status);
      return await response.json();
    } catch (error) {
      failure = error;
    }
  }
  throw failure instanceof Error ? failure : new Error("Zdroj neodpovídá.");
}
const reason = (error: unknown) =>
  error instanceof Error && /^(HTTP \d{3}|Zdroj|Méně|Málo)/.test(error.message)
    ? error.message
    : "Zdroj není dostupný nebo vrátil neplatná data";

export const getIntelHistory = createServerFn({ method: "GET" }).handler(
  async (): Promise<HistoryResponse> => {
    if (pending) return pending;
    pending = (async () => {
      const now = Date.now(),
        errors: string[] = [];
      const [dailyResult, intradayResult] = await Promise.allSettled([
        daily && now - daily.at < DAILY_MS
          ? Promise.resolve(daily.value)
          : fetchYahoo("/v8/finance/chart/INTC?range=10y&interval=1d&events=div%2Csplits").then(
              (raw) => parseDailyHistory(raw, now),
            ),
        intraday && now - intraday.at < INTRADAY_MS
          ? Promise.resolve(intraday.value)
          : fetchYahoo("/v8/finance/chart/INTC?range=60d&interval=5m").then((raw) =>
              parseIntradayHistory(raw, now),
            ),
      ]);
      if (dailyResult.status === "fulfilled") {
        if (!daily || daily.value !== dailyResult.value)
          daily = { at: now, value: dailyResult.value };
      } else errors.push("Denní historie: " + reason(dailyResult.reason) + ".");
      if (intradayResult.status === "fulfilled") {
        if (!intraday || intraday.value !== intradayResult.value)
          intraday = { at: now, value: intradayResult.value };
      } else errors.push("5min svíčky: " + reason(intradayResult.reason) + ".");
      const dailyUsable = daily && now - daily.at < DAILY_KEEP_MS ? daily : undefined;
      const intradayUsable =
        intraday && now - intraday.at < INTRADAY_KEEP_MS ? intraday : undefined;
      return {
        fetchedAt: now,
        daily: dailyUsable?.value ?? null,
        dailyFetchedAt: dailyUsable?.at ?? null,
        intraday: intradayUsable?.value ?? null,
        intradayFetchedAt: intradayUsable?.at ?? null,
        errors,
        source: "Yahoo Finance · denní OHLC 10 let a 5min svíčky 60 dní · neoficiální rozhraní",
      };
    })();
    try {
      return await pending;
    } finally {
      pending = undefined;
    }
  },
);

export interface HourlyResponse {
  fetchedAt: number;
  hourly: MarketData | null;
  hourlyFetchedAt: number | null;
  errors: string[];
  source: string;
}
// Hodinové svíčky za 2 roky pro ověření intradenních signálů; obnova po hodině.
const HOURLY_MS = 3600000,
  HOURLY_KEEP_MS = 86400000;
let hourly: { at: number; value: MarketData } | undefined;
let hourlyPending: Promise<HourlyResponse> | undefined;

export const getIntelHourly = createServerFn({ method: "GET" }).handler(
  async (): Promise<HourlyResponse> => {
    if (hourlyPending) return hourlyPending;
    hourlyPending = (async () => {
      const now = Date.now(),
        errors: string[] = [];
      if (!hourly || now - hourly.at >= HOURLY_MS) {
        try {
          const raw = await fetchYahoo("/v8/finance/chart/INTC?range=730d&interval=60m");
          hourly = { at: now, value: parseIntradayHistory(raw, now) };
        } catch (error) {
          errors.push("Hodinové svíčky: " + reason(error) + ".");
        }
      }
      const usable = hourly && now - hourly.at < HOURLY_KEEP_MS ? hourly : undefined;
      return {
        fetchedAt: now,
        hourly: usable?.value ?? null,
        hourlyFetchedAt: usable?.at ?? null,
        errors,
        source: "Yahoo Finance · hodinové svíčky 2 roky · neoficiální rozhraní",
      };
    })();
    try {
      return await hourlyPending;
    } finally {
      hourlyPending = undefined;
    }
  },
);
