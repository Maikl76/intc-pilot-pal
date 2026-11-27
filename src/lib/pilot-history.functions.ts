import { createServerFn } from "@tanstack/react-start";
import {
  parseDailyHistory,
  parseIntradayHistory,
  parseLiveMeta,
  type DailyHistory,
  type LiveMeta,
} from "./pilot-history.mjs";
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

export const SECTOR_SYMBOLS = ["SOXX", "QQQ", "NVDA", "AMD", "TSM", "MU", "AVGO"] as const;
export interface SectorSeries {
  symbol: string;
  dates: string[];
  values: number[];
}
export interface SectorResponse {
  fetchedAt: number;
  series: SectorSeries[];
  /** Poslední cena hlavní seance INTC a SOXX ze stejného zdroje (regularMarketPrice). */
  live: { INTC: LiveMeta | null; SOXX: LiveMeta | null };
  errors: string[];
  source: string;
}
// Denní historie srovnávacích titulů (10 let, obnova po 6 h) a aktuální cena INTC a SOXX (po 2 min).
const SECTOR_MS = 6 * 3600000,
  SECTOR_KEEP_MS = 3 * 86400000,
  LIVE_MS = 120000,
  LIVE_KEEP_MS = 15 * 60000;
const sector = new Map<string, { at: number; value: SectorSeries }>();
const LIVE_SYMBOLS = ["INTC", "SOXX"] as const;
const liveCache = new Map<string, { at: number; value: LiveMeta | null }>();
let sectorPending: Promise<SectorResponse> | undefined;

export const getSectorData = createServerFn({ method: "GET" }).handler(
  async (): Promise<SectorResponse> => {
    if (sectorPending) return sectorPending;
    sectorPending = (async () => {
      const now = Date.now(),
        errors: string[] = [];
      await Promise.all(
        SECTOR_SYMBOLS.map(async (symbol) => {
          const cached = sector.get(symbol);
          if (cached && now - cached.at < SECTOR_MS) return;
          try {
            const raw = await fetchYahoo(
              "/v8/finance/chart/" + symbol + "?range=10y&interval=1d&events=div%2Csplits",
            );
            const history = parseDailyHistory(raw, now, symbol);
            sector.set(symbol, {
              at: now,
              value: { symbol, dates: history.dates, values: history.values },
            });
          } catch (error) {
            errors.push(symbol + ": " + reason(error) + ".");
          }
        }),
      );
      await Promise.all(
        LIVE_SYMBOLS.map(async (symbol) => {
          const cached = liveCache.get(symbol);
          if (cached && now - cached.at < LIVE_MS) return;
          try {
            const raw = await fetchYahoo("/v8/finance/chart/" + symbol + "?range=1d&interval=1m");
            liveCache.set(symbol, { at: now, value: parseLiveMeta(raw, symbol, now) });
          } catch (error) {
            errors.push(symbol + " aktuální cena: " + reason(error) + ".");
          }
        }),
      );
      const liveOf = (symbol: string) => {
        const cached = liveCache.get(symbol);
        return cached && now - cached.at < LIVE_KEEP_MS ? cached.value : null;
      };
      const series = SECTOR_SYMBOLS.flatMap((symbol) => {
        const cached = sector.get(symbol);
        return cached && now - cached.at < SECTOR_KEEP_MS ? [cached.value] : [];
      });
      return {
        fetchedAt: now,
        series,
        live: { INTC: liveOf("INTC"), SOXX: liveOf("SOXX") },
        errors,
        source:
          "Yahoo Finance · denní data 10 let (SOXX, QQQ, NVDA, AMD, TSM, MU, AVGO) · neoficiální rozhraní",
      };
    })();
    try {
      return await sectorPending;
    } finally {
      sectorPending = undefined;
    }
  },
);
