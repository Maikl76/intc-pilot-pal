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
    // EXTERNAL adaptér: Finnhub quote endpoint (reálná data).
    try {
      const res = await fetch(
        `https://finnhub.io/api/v1/quote?symbol=INTC&token=${encodeURIComponent(external)}`,
      );
      if (res.ok) {
        const data = (await res.json()) as { c?: number; pc?: number };
        const priceUsd = Number(data.c ?? 0);
        const previousCloseUsd = Number(data.pc ?? 0);
        if (priceUsd > 0 && previousCloseUsd > 0) {
          return {
            symbol: "INTC",
            priceUsd,
            previousCloseUsd,
            changePct: Number((((priceUsd - previousCloseUsd) / previousCloseUsd) * 100).toFixed(2)),
            currency: "USD",
            timestamp: new Date().toISOString(),
            source: "EXTERNAL" as const,
            sourceLabel: "Finnhub (reálná data)",
            delayedMinutes: 0,
          };
        }
      }
      // Neúspěch nebo neplatná data → pokračujeme na fallback mockQuote().
    } catch {
      // Chyba sítě/API → fallback na mockQuote().
    }
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
