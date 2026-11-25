import { createServerFn } from "@tanstack/react-start";
import {
  parseYahoo,
  parseFinnhub,
  selectQuote,
  synchronizedQuote,
  overnightTradingDate,
  parseAlpacaTrade,
  type PilotQuote,
  type QuoteDiagnostic,
} from "./pilot-quotes.mjs";
export type { PilotQuote } from "./pilot-quotes.mjs";

const CACHE_MS = 15_000;
const TIMEOUT_MS = 6_500;
let lastGood: PilotQuote | null = null;
let lastResponse: PilotQuote | null = null;
let fetchedAt = 0;
let pending: Promise<PilotQuote> | null = null;

async function json(url: string, headers: Record<string, string> = {}): Promise<unknown> {
  const response = await fetch(url, {
    cache: "no-store",
    headers: { Accept: "application/json", ...headers },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}
function safeError(error: unknown): string {
  if (error instanceof Error && /^HTTP \d{3}$/.test(error.message)) return error.message;
  if (error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name))
    return "Vypršel čas spojení";
  return "Zdroj není dostupný nebo vrátil neplatná data";
}
async function loadQuote(): Promise<PilotQuote> {
  const diagnostics: QuoteDiagnostic[] = [];
  const yahoo = async (): Promise<PilotQuote | null> => {
    // Fixed symbol/hosts; no user-controlled URL. This public endpoint is unofficial.
    for (const host of ["query1.finance.yahoo.com", "query2.finance.yahoo.com"]) {
      const start = Date.now();
      try {
        const raw = await json(
          `https://${host}/v8/finance/chart/INTC?range=1d&interval=1m&includePrePost=true`,
          {
            "User-Agent": "Mozilla/5.0",
            Referer: "https://finance.yahoo.com/",
          },
        );
        const result = parseYahoo(raw, Date.now());
        if (!result || result.timestamp === null) throw new Error("Invalid quote");
        diagnostics.push({
          source: `Yahoo Finance (${host})`,
          status: "OK",
          checkedAt: Date.now(),
          latencyMs: Date.now() - start,
          timestamp: result.timestamp,
          message: "INTC / USD; čas převzatý od poskytovatele",
        });
        return result;
      } catch (error) {
        diagnostics.push({
          source: `Yahoo Finance (${host})`,
          status: "ERROR",
          checkedAt: Date.now(),
          latencyMs: Date.now() - start,
          message: safeError(error),
        });
      }
    }
    return null;
  };
  const finnhub = async (): Promise<PilotQuote | null> => {
    const key = typeof process !== "undefined" ? process.env["MARKET_DATA_API_KEY"] : undefined;
    if (!key) {
      diagnostics.push({
        source: "Finnhub",
        status: "NOT_CONFIGURED",
        checkedAt: Date.now(),
        message: "Volitelný záložní zdroj není nastavený",
      });
      return null;
    }
    const start = Date.now();
    try {
      const raw = await json("https://finnhub.io/api/v1/quote?symbol=INTC", {
        "X-Finnhub-Token": key,
      });
      const result = parseFinnhub(raw, Date.now());
      if (!result || result.timestamp === null) throw new Error("Invalid quote");
      diagnostics.push({
        source: "Finnhub",
        status: "OK",
        checkedAt: Date.now(),
        latencyMs: Date.now() - start,
        timestamp: result.timestamp,
        message: "Pevný dotaz INTC; čas převzatý od poskytovatele",
      });
      return result;
    } catch (error) {
      diagnostics.push({
        source: "Finnhub",
        status: "ERROR",
        checkedAt: Date.now(),
        latencyMs: Date.now() - start,
        message: safeError(error),
      });
      return null;
    }
  };
  const overnight = async (): Promise<PilotQuote | null> => {
    if(!overnightTradingDate(Date.now())) return null;
    const key=typeof process!=="undefined" ? process.env["APCA_API_KEY_ID"] : undefined;
    const secret=typeof process!=="undefined" ? process.env["APCA_API_SECRET_KEY"] : undefined;
    const feed=typeof process!=="undefined" && process.env["ALPACA_OVERNIGHT_FEED"]==="boats" ? "boats" : "overnight";
    const source="Alpaca · "+feed;
    const start=Date.now();
    if(!key || !secret) {
      diagnostics.push({source,status:"NOT_CONFIGURED",checkedAt:start,message:"Pro noční cenu připoj serverové klíče APCA_API_KEY_ID a APCA_API_SECRET_KEY. Yahoo/Finnhub nenahrazují noční obchod."});
      return null;
    }
    try {
      const raw=await json("https://data.alpaca.markets/v2/stocks/trades/latest?symbols=INTC&feed="+feed,{
        "APCA-API-KEY-ID":key,"APCA-API-SECRET-KEY":secret,
      });
      const result=parseAlpacaTrade(raw,Date.now(),feed);
      if(!result || result.timestamp===null) throw Error("Invalid quote");
      diagnostics.push({source,status:"OK",checkedAt:Date.now(),latencyMs:Date.now()-start,timestamp:result.timestamp,message:feed==="overnight"?"Poslední obchod; tarif uvádí 15min zpoždění.":"Poslední obchod Blue Ocean ATS."});
      return result;
    }catch(error){
      diagnostics.push({source,status:"ERROR",checkedAt:Date.now(),latencyMs:Date.now()-start,message:safeError(error)});
      return null;
    }
  };
  const candidates = await Promise.all([yahoo(), finnhub(), overnight()]);
  const checkedAt = Date.now();
  const best = selectQuote(candidates, checkedAt);
  if (
    best &&
    best.timestamp !== null &&
    (!lastGood || lastGood.timestamp === null || best.timestamp >= lastGood.timestamp)
  ) {
    lastGood = { ...synchronizedQuote(best,lastGood), diagnostics, checkedAt, cached: false };
    return lastGood;
  }
  if (lastGood)
    return {
      ...lastGood,
      diagnostics,
      checkedAt,
      cached: true,
      message:
        "Zobrazuji poslední úspěšně načtenou cenu. Novější data se nepodařilo ověřit; původní tržní čas zůstává zachovaný.",
    };
  return {
    status: "UNAVAILABLE",
    symbol: "INTC",
    currency: "USD",
    price: null,
    open: null,
    previousClose: null,
    timestamp: null,
    receivedAt: checkedAt,
    checkedAt,
    source: "Yahoo Finance / Finnhub / Alpaca",
    session: "CLOSED",
    points: [],
    diagnostics,
    cached: false,
    message:
      "Cena INTC není dostupná. Obnov načtení nebo zkontroluj stav zdrojů; aplikace nevytváří náhradní cenu.",
  };
}
export const getPilotQuote = createServerFn({ method: "GET" }).handler(
  async (): Promise<PilotQuote> => {
    if (pending) return pending;
    // Cache failures too, retaining their diagnostics on every response.
    if (lastResponse && Date.now() - fetchedAt < CACHE_MS) return lastResponse;
    pending = loadQuote()
      .then((result) => {
        lastResponse = result;
        return result;
      })
      .finally(() => {
        fetchedAt = Date.now();
        pending = null;
      });
    return pending;
  },
);
