import { createServerFn } from "@tanstack/react-start";

/**
 * Datový provider abstraction pro kotace.
 *
 * Trading 212 beta API nemusí umět dodat quote bez otevřené pozice, proto je
 * zde rozhraní s více adaptéry: MOCK (default, demo data), TRADING212 a
 * EXTERNAL (Finnhub / Twelve Data — připraveno k doplnění klíče na serveru).
 * Aktivní zdroj se vždy vrací v poli `source` a UI ho zobrazuje.
 */
export const getQuote = createServerFn({ method: "GET" }).handler(async () => {
  const t212 = process.env["TRADING212_API_KEY"];
  const external = process.env["MARKET_DATA_API_KEY"];

  if (external) {
    // TODO: napojit Finnhub / Twelve Data adaptér:
    // const res = await fetch(`https://finnhub.io/api/v1/quote?symbol=INTC&token=${external}`)
    // Do té doby padáme na mock, ale hlásíme, že klíč existuje.
  }
  if (t212) {
    // TODO: GET /api/v0/equity/portfolio → cena je dostupná jen s otevřenou pozicí.
  }

  return mockQuote();
});

function mockQuote() {
  // Deterministický „živý" pohyb kolem demo báze — generováno až za běhu
  // (nikdy na module scope kvůli edge runtime).
  const base = 34.4;
  const t = Date.now() / 1000;
  const wave = Math.sin(t / 900) * 0.42 + Math.sin(t / 137) * 0.11;
  const price = Number((base + wave).toFixed(2));
  const previousClose = 34.86;
  return {
    symbol: "INTC",
    priceUsd: price,
    previousCloseUsd: previousClose,
    changePct: Number((((price - previousClose) / previousClose) * 100).toFixed(2)),
    currency: "USD",
    timestamp: new Date().toISOString(),
    source: "MOCK" as const,
    sourceLabel: "Demo mock adaptér (bez API klíče)",
    delayedMinutes: 0,
  };
}

/** Stav napojení na Trading 212 — pouze maskované informace, nikdy secrety. */
export const getConnectionStatus = createServerFn({ method: "GET" }).handler(async () => {
  const key = process.env["TRADING212_API_KEY"] ?? "";
  const secret = process.env["TRADING212_API_SECRET"] ?? "";
  const market = process.env["MARKET_DATA_API_KEY"] ?? "";
  const mask = (v: string) => (v ? `${v.slice(0, 3)}••••••${v.slice(-2)}` : "—");
  return {
    trading212Configured: Boolean(key),
    trading212KeyMasked: mask(key),
    trading212SecretConfigured: Boolean(secret),
    trading212SecretMasked: mask(secret),
    baseUrl: process.env["TRADING212_BASE_URL"] ?? "https://demo.trading212.com",
    marketDataConfigured: Boolean(market),
    marketDataKeyMasked: mask(market),
  };
});
