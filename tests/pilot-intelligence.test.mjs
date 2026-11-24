import test from "node:test";
import assert from "node:assert/strict";
import { parseIntelRss, parseFinnhubNews, newsTopic, safeNewsUrl, dedupeNews } from "../src/lib/pilot-intelligence.mjs";

const now = Date.parse("2026-11-24T18:00:00Z");
const rss = body => `<rss version="2.0"><channel><title>Intel</title>${body}</channel></rss>`;
const item = (title, url = "https://www.intc.com/news-events/press-releases/detail/100/test", date = "Mon, 23 Nov 26 16:30:00 -0500") => `<item><title>${title}</title><link>${url}</link><pubDate>${date}</pubDate></item>`;

test("Intel RSS preserves publisher timestamp and safely decodes CDATA/entities", () => {
  const [row] = parseIntelRss(rss(item("<![CDATA[Intel 18A &amp; 14A &#8212; update]]>")), "issuer", now);
  assert.equal(row.title, "Intel 18A & 14A — update");
  assert.equal(row.publishedAt, Date.parse("2026-11-23T21:30:00Z"));
  assert.equal(row.topic, "technology");
  assert.equal(row.kind, "issuer");
});

test("RSS rejects untrusted links, future events, missing time zones and invalid dates", () => {
  const xml = rss(item("Good") + item("Phishing", "https://intc.com.evil.test/release") + item("Future", "https://www.intc.com/future", "Wed, 25 Nov 26 16:30:00 -0500") + item("No zone", "https://www.intc.com/nozone", "2026-11-23 16:30:00") + item("Bad date", "https://www.intc.com/bad", "not a date -0500"));
  assert.deepEqual(parseIntelRss(xml, "issuer", now).map(row => row.title), ["Good"]);
  assert.throws(() => parseIntelRss("<!DOCTYPE rss [<!ENTITY x SYSTEM 'file:///etc/passwd'>]>" + rss(""), "issuer", now));
  assert.throws(() => parseIntelRss("<html>rate limit</html>", "issuer", now));
  assert.throws(() => parseIntelRss(rss(item("Bad", "javascript:alert(1)")), "issuer", now));
});

test("SEC mirror is labeled as a filing and does not become an interpreted insider signal", () => {
  const [row] = parseIntelRss(rss(item("4 - Statement of changes in beneficial ownership of securities", "https://www.intc.com/filings-reports/all-sec-filings/content/0000050863-26-000195/0000050863-26-000195.pdf")), "filing", now);
  assert.equal(row.kind, "filing");
  assert.equal(row.source, "Intel IR · podání SEC");
  assert.equal(row.topic, "capital");
  assert.equal(newsTopic("10-Q - Quarterly report", "filing"), "financials");
  assert.equal(newsTopic("13F-HR - Holdings", "filing"), "capital");
});

test("Finnhub news checks dates and related ticker; unknown content remains text", () => {
  const row = { headline: "Intel &amp; partner", url: "https://publisher.test/intel", datetime: now / 1000 - 100, source: "Publisher", related: "NVDA,INTC" };
  const result = parseFinnhubNews([row, { ...row, url: "https://publisher.test/nvda", related: "NVDA" }, { ...row, url: "javascript:alert(1)" }, { ...row, url: "https://publisher.test/future", datetime: now / 1000 + 1000 }], now);
  assert.equal(result.length, 1);
  assert.equal(result[0].title, "Intel & partner");
  assert.equal(result[0].kind, "news");
});

test("safe links and deduplication prefer primary sources without changing their dates", () => {
  assert.equal(safeNewsUrl("https://login:secret@example.com/foo"), null);
  assert.equal(safeNewsUrl("http://example.com/foo"), null);
  assert.equal(safeNewsUrl("https://localhost/foo"), null);
  assert.equal(safeNewsUrl("https://127.0.0.1/foo"), null);
  const [primary] = parseIntelRss(rss(item("Original")), "issuer", now);
  const result = dedupeNews([{ ...primary, kind: "news", title: "Syndication", publishedAt: now }, primary]);
  assert.equal(result.length, 1);
  assert.equal(result[0].title, "Original");
  assert.equal(result[0].publishedAt, primary.publishedAt);
});
