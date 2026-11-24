import { createServerFn } from "@tanstack/react-start";
import {
  dedupeNews,
  parseFinnhubNews,
  parseIntelRss,
  type IntelNewsItem,
} from "./pilot-intelligence.mjs";

export type NewsProviderStatus = {
  id: string;
  name: string;
  status: "OK" | "EMPTY" | "ERROR" | "NOT_CONFIGURED";
  attemptedAt: number;
  lastSuccessAt: number | null;
  message: string;
};
export type IntelIntelligence = {
  checkedAt: number;
  items: IntelNewsItem[];
  providers: NewsProviderStatus[];
};

const TTL = 5 * 60_000;
const USER_AGENT = "INTC-Pilot/3.0 (+https://github.com/Maikl76/intc-pilot-pal)";
const lastGood = new Map<string, { items: IntelNewsItem[]; at: number }>();
let resultCache: IntelIntelligence | null = null;
let pending: Promise<IntelIntelligence> | null = null;

async function getText(url: string, headers: Record<string, string> = {}): Promise<string> {
  const response = await fetch(url, {
    headers: {
      Accept: "application/rss+xml, application/xml, application/json, text/xml",
      "User-Agent": USER_AGENT,
      ...headers,
    },
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw Error("HTTP " + response.status);
  const reader = response.body?.getReader();
  if (!reader) throw Error("Prázdná odpověď");
  const decoder = new TextDecoder();
  let bytes = 0,
    output = "";
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.length;
      if (bytes > 2_000_000) {
        await reader.cancel();
        throw Error("Příliš velká odpověď");
      }
      output += decoder.decode(chunk.value, { stream: true });
    }
    return output + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

async function load(): Promise<IntelIntelligence> {
  const now = Date.now();
  const key = typeof process !== "undefined" ? process.env["MARKET_DATA_API_KEY"] : undefined;
  const definitions: {
    id: string;
    name: string;
    enabled: boolean;
    fetchItems: () => Promise<IntelNewsItem[]>;
  }[] = [
    {
      id: "intel-ir",
      name: "Tiskové zprávy Intel",
      enabled: true,
      fetchItems: async () =>
        parseIntelRss(
          await getText("https://www.intc.com/news-events/press-releases/rss"),
          "issuer",
          Date.now(),
        ),
    },
    {
      id: "intel-filings",
      name: "Podání SEC přes Intel IR",
      enabled: true,
      fetchItems: async () =>
        parseIntelRss(
          await getText("https://www.intc.com/filings-reports/all-sec-filings/rss"),
          "filing",
          Date.now(),
        ),
    },
    {
      id: "finnhub-news",
      name: "Média přes Finnhub",
      enabled: Boolean(key),
      fetchItems: async () => {
        const to = new Date(now).toISOString().slice(0, 10),
          from = new Date(now - 28 * 86_400_000).toISOString().slice(0, 10);
        return parseFinnhubNews(
          JSON.parse(
            await getText(
              "https://finnhub.io/api/v1/company-news?symbol=INTC&from=" + from + "&to=" + to,
              { "X-Finnhub-Token": key! },
            ),
          ),
          Date.now(),
        );
      },
    },
  ];
  const loaded = await Promise.all(
    definitions.map(async (definition) => {
      const old = lastGood.get(definition.id);
      const base = {
        id: definition.id,
        name: definition.name,
        attemptedAt: now,
        lastSuccessAt: old?.at ?? null,
      };
      if (!definition.enabled)
        return {
          items: [] as IntelNewsItem[],
          provider: {
            ...base,
            status: "NOT_CONFIGURED" as const,
            message: "Doplňkový zdroj médií není připojen. Primární zdroje fungují samostatně.",
          },
        };
      try {
        const items = await definition.fetchItems(),
          at = Date.now();
        lastGood.set(definition.id, { items, at });
        return {
          items,
          provider: {
            ...base,
            lastSuccessAt: at,
            status: items.length ? ("OK" as const) : ("EMPTY" as const),
            message: items.length ? "Zdroj načten" : "Zdroj nyní nevrátil žádné platné položky.",
          },
        };
      } catch (error) {
        const reason =
          error instanceof Error && /^HTTP \d{3}$/.test(error.message)
            ? error.message
            : "Zdroj neodpovídá nebo data nelze ověřit.";
        // Cached headlines retain their original date. Never advance a success timestamp on failure.
        const items = old && now - old.at < 86_400_000 ? old.items : [];
        return {
          items,
          provider: {
            ...base,
            status: "ERROR" as const,
            message:
              reason +
              (items.length ? " Zobrazen je poslední úspěšný obsah." : " Otevři zdroj přímo níže."),
          },
        };
      }
    }),
  );
  return {
    checkedAt: Date.now(),
    items: dedupeNews(loaded.flatMap((x) => x.items)),
    providers: loaded.map((x) => x.provider),
  };
}

// Fixed upstream URLs only; this public endpoint accepts no user-provided URLs or API keys.
export const getIntelIntelligence = createServerFn({ method: "GET" }).handler(
  async (): Promise<IntelIntelligence> => {
    if (pending) return pending;
    if (resultCache && Date.now() - resultCache.checkedAt < TTL) return resultCache;
    pending = load()
      .then((result) => {
        resultCache = result;
        return result;
      })
      .finally(() => {
        pending = null;
      });
    return pending;
  },
);
