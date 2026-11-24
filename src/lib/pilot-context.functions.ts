import { createServerFn } from "@tanstack/react-start";
import { parseDailyContext, alignContext, type DailyContext } from "./pilot-context.mjs";
export interface ContextResponse {
  fetchedAt: number;
  observations: DailyContext[];
  aligned: ReturnType<typeof alignContext>;
  errors: string[];
  source: string;
}
let cached: ContextResponse | undefined;
let pending: Promise<ContextResponse> | undefined;
async function fetchSymbol(symbol: string): Promise<DailyContext> {
  for (const host of ["query1.finance.yahoo.com", "query2.finance.yahoo.com"]) {
    try {
      const r = await fetch(
        "https://" + host + "/v8/finance/chart/" + symbol + "?range=3mo&interval=1d",
        {
          headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
          signal: AbortSignal.timeout(8000),
        },
      );
      if (!r.ok) throw new Error("HTTP " + r.status);
      return parseDailyContext(await r.json(), symbol);
    } catch {
      /* Try the second fixed Yahoo endpoint; never invent missing bars. */
    }
  }
  throw new Error(symbol + ": denní historie není dostupná.");
}
export const getMarketContext = createServerFn({ method: "GET" }).handler(
  async (): Promise<ContextResponse> => {
    const now = Date.now();
    if (cached && now - cached.fetchedAt < (cached.observations.length ? 900000 : 60000))
      return cached;
    if (pending) return pending;
    pending = (async () => {
      const results = await Promise.allSettled(["INTC", "SOXX", "QQQ"].map(fetchSymbol));
      const observations: DailyContext[] = [],
        errors: string[] = [];
      for (const result of results) {
        if (result.status === "fulfilled") observations.push(result.value);
        else
          errors.push(result.reason instanceof Error ? result.reason.message : "Zdroj neodpovídá.");
      }
      for (const item of observations)
        if (item.stale)
          errors.push(
            item.symbol +
              ": poslední data " +
              item.date +
              " jsou starší než očekávaná předchozí seance " +
              (item.expectedDate ?? "(kalendář není ověřen)") +
              ".",
          );
      const aligned = alignContext(observations);
      if (observations.length !== aligned.items.length)
        errors.push("Rozdílná data posledních seancí; nesoučasné řady nesrovnáváme.");
      cached = {
        fetchedAt: Date.now(),
        observations,
        aligned,
        errors,
        source: "Yahoo Finance · denní OHLC · neoficiální rozhraní",
      };
      return cached;
    })();
    try {
      return await pending;
    } finally {
      pending = undefined;
    }
  },
);
