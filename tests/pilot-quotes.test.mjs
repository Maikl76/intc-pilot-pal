import { test } from "node:test";
import assert from "node:assert/strict";
import {parseYahoo,parseFinnhub,selectQuote,isUsable,isRegularFresh,session,marketCalendar,overnightTradingDate,marketPhase,parseAlpacaTrade,synchronizedQuote} from "../src/lib/pilot-quotes.mjs";
const now=Date.parse("2026-11-24T14:02:00Z"),ts=Date.parse("2026-11-24T14:01:00Z")/1000;
const payload={chart:{result:[{meta:{symbol:"INTC",currency:"USD",regularMarketTime:Date.parse("2026-11-23T21:00:00Z")/1000,regularMarketPrice:59.66,chartPreviousClose:59.66},timestamp:[ts-60,ts],indicators:{quote:[{close:[58,58.12],open:[57.9,58]}]}}]}};
test("uses latest premarket minute, not prior regular close",()=>{const q=parseYahoo(payload,now);assert.equal(q.price,58.12);assert.equal(q.open,null);assert.equal(q.session,"PRE");assert.ok(isUsable(q,now));assert.ok(!isRegularFresh(q,now))});
test("stale quote never counts as current execution",()=>assert.ok(!isUsable(parseYahoo(payload,now),now+3600000)));
test("rejects wrong ticker and malformed quotes",()=>{assert.equal(parseYahoo({chart:{result:[{meta:{symbol:"AAPL",currency:"USD"}}]}},now),null);assert.equal(parseFinnhub({c:0,t:ts},now),null)});
test("select newest provider, keep its source",()=>{const q=selectQuote([parseFinnhub({c:59,o:60,pc:59,t:ts-3600},now),parseYahoo(payload,now)],now);assert.equal(q.source,"Yahoo Finance");assert.equal(q.price,58.12)});

test("previousClose is not the beginning of a multi-day chart", () => {
  const copy = structuredClone(payload);
  Object.assign(copy.chart.result[0].meta, { range: "5d", chartPreviousClose: 42, previousClose: 59.66, regularMarketTime: ts, regularMarketPrice: 58.12 });
  assert.equal(parseYahoo(copy, now).previousClose, 59.66);
  delete copy.chart.result[0].meta.previousClose;
  assert.equal(parseYahoo(copy, now).previousClose, null);
  copy.chart.result[0].meta.range = "1d";
  assert.equal(parseYahoo(copy, now).previousClose, 42);
});
test("chart metadata and displayed point agree at equal timestamps", () => {
  const copy = structuredClone(payload);
  Object.assign(copy.chart.result[0].meta, { regularMarketTime: ts, regularMarketPrice: 58.2 });
  const q = parseYahoo(copy, now);
  assert.equal(q.price, 58.2);
  assert.equal(q.points.at(-1).price, 58.2);
  assert.equal(q.timestampKind, "provider");
});
test("future, missing, and invalid provider timestamps never create a price", () => {
  assert.equal(parseFinnhub({ c: 50, t: (now + 60000) / 1000 }, now), null);
  assert.equal(parseFinnhub({ c: 50 }, now), null);
  assert.equal(parseFinnhub({ c: Infinity, t: ts }, now), null);
  assert.equal(parseYahoo({ chart: { error: { code: "Not Found" }, result: payload.chart.result } }, now), null);
});
test("quotes from another session cannot enable trading just after open", () => {
  const beforeOpen = Date.parse("2026-11-24T14:29:50Z");
  const q = parseFinnhub({ c: 50, o: 52, pc: 51, t: beforeOpen / 1000 }, beforeOpen);
  assert.ok(isUsable(q, beforeOpen));
  assert.equal(q.open, null);
  assert.ok(!isUsable(q, Date.parse("2026-11-24T14:30:01Z")));
});
test("Nasdaq holiday and shortened day disable regular strategy", () => {
  assert.equal(session(Date.parse("2026-11-26T16:00:00Z")), "CLOSED");
  assert.equal(session(Date.parse("2026-11-27T17:59:00Z")), "REGULAR");
  assert.equal(session(Date.parse("2026-11-27T18:00:00Z")), "POST");
  assert.equal(session(Date.parse("2026-11-27T22:00:00Z")), "CLOSED");
  assert.equal(marketCalendar(Date.parse("2026-12-24T18:00:00Z")).closeMinute, 780);
  const holiday = Date.parse("2026-11-26T16:00:00Z");
  assert.ok(!isUsable(parseFinnhub({ c: 50, o: 52, pc: 51, t: holiday / 1000 }, holiday), holiday));
});
test("provider conflicts are surfaced and do not enable virtual execution", () => {
  const q = selectQuote([parseYahoo(payload, now), parseFinnhub({ c: 70, o: 70, pc: 70, t: ts }, now)], now);
  assert.equal(q.conflict, true);
  assert.ok(q.disagreementPct > 1);
  assert.ok(!isUsable(q, now));
});
test("different-day references are not borrowed from another provider", () => {
  const current = parseFinnhub({ c: 50, t: ts }, now);
  const previous = parseYahoo(payload, now);
  previous.timestamp = Date.parse("2026-11-23T20:00:00Z");
  previous.referenceDate = "2026-11-23";
  previous.open = 60;
  previous.previousClose = 61;
  const q = selectQuote([current, previous], now);
  assert.equal(q.open, null);
  assert.equal(q.previousClose, null);
  assert.deepEqual(q.points, [{timestamp:current.timestamp,price:current.price}]);
});
test("normal daylight saving session boundaries use New York time", () => {
  assert.equal(session(Date.parse("2026-10-30T13:30:00Z")), "REGULAR");
  assert.equal(session(Date.parse("2026-11-02T13:30:00Z")), "PRE");
  assert.equal(session(Date.parse("2026-11-02T14:30:00Z")), "REGULAR");
});
test("the regular closing print is not an after-hours price", () => {
  const close = Date.parse("2026-11-24T21:00:00Z");
  const q = parseFinnhub({ c: 50, o: 52, pc: 51, t: close / 1000 }, close);
  assert.equal(q.session, "REGULAR");
  assert.ok(!isUsable(q, close + 1000));
});
test("a failed refresh cannot satisfy the strict strategy freshness rule", () => {
  const regular = Date.parse("2026-11-24T16:00:00Z");
  const q = parseFinnhub({ c: 50, o: 52, pc: 51, t: regular / 1000 }, regular);
  assert.ok(isRegularFresh(q, regular));
  assert.ok(!isRegularFresh({ ...q, cached: true }, regular));
});
test("premarket reference is the most recent regular close, not its previous day's close", () => {
  const copy = structuredClone(payload);
  copy.chart.result[0].meta.previousClose = 51.28;
  const q = parseYahoo(copy, now);
  assert.equal(q.previousClose, 59.66);
  assert.equal(q.price, 58.12);
  assert.equal(q.session, "PRE");
});
test("generic provider periods cannot override a published early close", () => {
  const now = Date.parse("2026-11-27T19:00:00Z");
  const sec = date => Date.parse(date) / 1000;
  const data = { chart: { result: [{
    meta: { symbol: "INTC", currency: "USD", regularMarketTime: now / 1000, regularMarketPrice: 50,
      currentTradingPeriod: {
        pre: { start: sec("2026-11-27T09:00:00Z") },
        regular: { start: sec("2026-11-27T14:30:00Z"), end: sec("2026-11-27T21:00:00Z") },
        post: { end: sec("2026-11-28T01:00:00Z") },
      },
    }, timestamp: [], indicators: { quote: [] },
  }] } };
  const q = parseYahoo(data, now);
  assert.equal(q.schedule.regularEnd, Date.parse("2026-11-27T18:00:00Z"));
  assert.equal(q.schedule.postEnd, Date.parse("2026-11-27T22:00:00Z"));
  assert.equal(q.session, "POST");
  assert.ok(!isRegularFresh(q, now));
});


test("selected feed price exactly matches final chart point; no mixed venue line",()=>{
  const f=parseFinnhub({c:58.45,t:ts+10},now), y=parseYahoo(payload,now);
  const r=selectQuote([y,f],now);
  assert.equal(r.source,"Finnhub");assert.equal(r.chartSource,"Finnhub");
  assert.deepEqual(r.points,[{timestamp:f.timestamp,price:58.45}]);
  const merged=synchronizedQuote(r,{...f,timestamp:f.timestamp-1000,points:[{timestamp:f.timestamp-1000,price:58.41}]});
  assert.deepEqual(merged.points.map(x=>x.price),[58.41,58.45]);
  assert.equal(merged.points.at(-1).timestamp,r.timestamp);
});
test("overnight trade crosses midnight and never counts for strict regular strategy",()=>{
  const n=Date.parse("2026-11-25T05:54:00Z");
  const x=parseAlpacaTrade({trades:{INTC:{t:"2026-11-25T05:39:00Z",p:53.12}}},n,"overnight");
  assert.equal(marketPhase(n),"OVERNIGHT");assert.equal(x.referenceDate,"2026-11-25");
  assert.equal(x.expectedDelayMinutes,15);assert.equal(x.points.at(-1).price,x.price);
  assert.ok(isUsable(x,n));assert.ok(!isRegularFresh(x,n));assert.ok(!isUsable(x,n+6*60000));
  const cross=Date.parse("2026-11-25T05:05:00Z");
  const before=parseAlpacaTrade({trades:{INTC:{t:"2026-11-25T04:58:00Z",p:53}}},cross,"boats");
  assert.ok(isUsable(before,cross));assert.ok(!isUsable(before,Date.parse("2026-11-25T09:01:00Z")));
  const regular=parseFinnhub({c:53,t:Date.parse("2026-11-24T21:00:00Z")/1000},n);
  assert.equal(selectQuote([regular,x],n).price,53.12);
});
test("no overnight Friday or preceding holiday; reject malformed timestamps and regular prints",()=>{
  assert.equal(overnightTradingDate(Date.parse("2026-11-28T02:00:00Z")),null);
  assert.equal(overnightTradingDate(Date.parse("2026-11-26T02:00:00Z")),null);
  assert.equal(overnightTradingDate(Date.parse("2026-11-30T02:00:00Z")),"2026-11-30");
  const n=Date.parse("2026-11-25T05:54:00Z");
  assert.equal(parseAlpacaTrade({trades:{INTC:{t:"2026-11-24T21:00:00Z",p:53}}},n,"boats"),null);
  assert.equal(parseAlpacaTrade({trades:{INTC:{t:"2026-11-25T05:39:00",p:53}}},n,"boats"),null);
  assert.equal(parseAlpacaTrade({trades:{INTC:{t:"2026-11-25T05:39:00Z",p:0}}},n,"boats"),null);
});
