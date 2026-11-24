// Small, bounded readers for Intel's published RSS 2.0 feeds and Finnhub news.
// Feed strings are never rendered as HTML and external entities are rejected.
export const TOPIC_LABELS = Object.freeze({
  financials: "Výsledky a výhled",
  technology: "18A / 14A",
  foundry: "Foundry a zákazníci",
  capital: "Kapitál a vlastnictví",
  filings: "Regulatorní podání",
  other: "Další zprávy",
});

const MAX_XML = 2_000_000;
const INTEL_LINK_HOSTS = new Set([
  "intc.com",
  "www.intc.com",
  "intel.com",
  "www.intel.com",
  "newsroom.intel.com",
  "www.sec.gov",
  "sec.gov",
]);

export function safeNewsUrl(value, allowedHosts = null) {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" || url.username || url.password) return null;
    if (allowedHosts && !allowedHosts.has(url.hostname.toLowerCase())) return null;
    if (
      url.hostname === "localhost" ||
      !url.hostname.includes(".") ||
      /^[\d.]+$/.test(url.hostname)
    )
      return null;
    url.hash = "";
    return url.href;
  } catch {
    return null;
  }
}

function text(value) {
  const named = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
    ndash: "–",
    mdash: "—",
  };
  return String(value ?? "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]*>/g, "")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, key) => {
      if (key.startsWith("#")) {
        const code =
          key[1]?.toLowerCase() === "x" ? parseInt(key.slice(2), 16) : Number(key.slice(1));
        return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff)
          ? String.fromCodePoint(code)
          : "";
      }
      return named[key.toLowerCase()] ?? whole;
    })
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tag(body, name) {
  return text(
    body.match(
      new RegExp("<" + name + "(?:\\s[^>]*)?>([\\s\\S]*?)<\\/" + name + "\\s*>", "i"),
    )?.[1] ?? "",
  );
}

export function newsTopic(title, kind) {
  if (/\b(18a(?:-p)?|14a)\b/i.test(title)) return "technology";
  if (/\b(10-[kq](?:\/a)?|financial results|earnings|guidance|cash flow)\b/i.test(title))
    return "financials";
  if (
    /\b(foundry|emib|packaging|fabrication|manufactur|customer|collaborat|partnership)/i.test(title)
  )
    return "foundry";
  if (
    /\b(offering|capital|debt|buyback|dividend|acquir|merger|beneficial|13[fdg]|ownership|form 4)/i.test(
      title,
    )
  )
    return "capital";
  return kind === "filing" ? "filings" : "other";
}

export function parseIntelRss(xml, kind = "issuer", now = Date.now()) {
  if (typeof xml !== "string" || xml.length > MAX_XML || /<!DOCTYPE|<!ENTITY/i.test(xml))
    throw Error("Nepodporovaný nebo příliš velký RSS dokument.");
  if (!/<rss\b/i.test(xml) || !/<\/rss\s*>/i.test(xml) || !/<channel\b/i.test(xml))
    throw Error("Zdroj nevrátil RSS 2.0.");
  if (kind !== "issuer" && kind !== "filing") throw Error("Neplatný typ zdroje.");
  const matches = [...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item\s*>/gi)];
  const items = [];
  for (const [, body] of matches.slice(0, 150)) {
    const title = tag(body, "title").slice(0, 500);
    const url = safeNewsUrl(tag(body, "link"), INTEL_LINK_HOSTS);
    const date = tag(body, "pubDate");
    // Time-zone evidence is required; never silently use the server's zone.
    const publishedAt = /(?:[+-]\d{4}|\b(?:GMT|UTC|EST|EDT))$/i.test(date) ? Date.parse(date) : NaN;
    if (
      !title ||
      !url ||
      !Number.isFinite(publishedAt) ||
      publishedAt <= 0 ||
      publishedAt > now + 300_000
    )
      continue;
    items.push({
      id: url,
      title,
      url,
      publishedAt,
      kind,
      source: kind === "filing" ? "Intel IR · podání SEC" : "Intel Investor Relations",
      topic: newsTopic(title, kind),
    });
  }
  if (matches.length && !items.length)
    throw Error("RSS obsahuje položky, ale žádná nemá platný odkaz a čas.");
  return dedupeNews(items);
}

export function parseFinnhubNews(raw, now = Date.now()) {
  if (!Array.isArray(raw)) throw Error("Neplatná odpověď zpravodajského zdroje.");
  const items = [];
  for (const row of raw.slice(0, 300)) {
    if (!row || typeof row !== "object") continue;
    // The endpoint is pinned to INTC; an explicit conflicting related list is rejected.
    if (
      typeof row.related === "string" &&
      row.related &&
      !row.related
        .split(",")
        .map((x) => x.trim().toUpperCase())
        .includes("INTC")
    )
      continue;
    const title = text(row.headline).slice(0, 500),
      url = safeNewsUrl(row.url),
      publishedAt = Number(row.datetime) * 1000;
    if (
      !title ||
      !url ||
      !Number.isFinite(publishedAt) ||
      publishedAt <= 0 ||
      publishedAt > now + 300_000
    )
      continue;
    items.push({
      id: url,
      title,
      url,
      publishedAt,
      kind: "news",
      source: text(row.source).slice(0, 100) || "Zpráva přes Finnhub",
      topic: newsTopic(title, "news"),
    });
  }
  return dedupeNews(items);
}

export function dedupeNews(items) {
  const map = new Map();
  // Primary sources win duplicate URLs even when a secondary source supplies a newer timestamp.
  for (const item of [...items].sort(
    (a, b) => Number(a.kind === "news") - Number(b.kind === "news"),
  )) {
    const url = safeNewsUrl(item.url);
    if (!url || !Number.isFinite(item.publishedAt)) continue;
    const key = url.replace(/\/$/, "");
    if (!map.has(key)) map.set(key, item);
  }
  return [...map.values()].sort((a, b) => b.publishedAt - a.publishedAt).slice(0, 60);
}
