export type NewsKind = "issuer" | "filing" | "news";
export type NewsTopic = "financials" | "technology" | "foundry" | "capital" | "filings" | "other";
export type IntelNewsItem = {
  id: string;
  title: string;
  url: string;
  publishedAt: number;
  kind: NewsKind;
  source: string;
  topic: NewsTopic;
};
export const TOPIC_LABELS: Readonly<Record<NewsTopic, string>>;
export function safeNewsUrl(value: unknown, allowedHosts?: Set<string> | null): string | null;
export function newsTopic(title: string, kind: NewsKind): NewsTopic;
export function parseIntelRss(
  xml: string,
  kind?: "issuer" | "filing",
  now?: number,
): IntelNewsItem[];
export function parseFinnhubNews(raw: unknown, now?: number): IntelNewsItem[];
export function dedupeNews(items: IntelNewsItem[]): IntelNewsItem[];
