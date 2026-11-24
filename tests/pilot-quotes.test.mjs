import { test } from "node:test";
import assert from "node:assert/strict";
import {parseYahoo,parseFinnhub,selectQuote,isUsable,isRegularFresh} from "../src/lib/pilot-quotes.mjs";
const now=Date.parse("2026-11-24T14:02:00Z"),ts=Date.parse("2026-11-24T14:01:00Z")/1000;
const payload={chart:{result:[{meta:{symbol:"INTC",currency:"USD",regularMarketTime:Date.parse("2026-11-23T21:00:00Z")/1000,regularMarketPrice:59.66,chartPreviousClose:59.66},timestamp:[ts-60,ts],indicators:{quote:[{close:[58,58.12],open:[57.9,58]}]}}]}};
test("uses latest premarket minute, not prior regular close",()=>{const q=parseYahoo(payload,now);assert.equal(q.price,58.12);assert.equal(q.open,null);assert.equal(q.session,"PRE");assert.ok(isUsable(q,now));assert.ok(!isRegularFresh(q,now))});
test("stale quote never counts as current execution",()=>assert.ok(!isUsable(parseYahoo(payload,now),now+3600000)));
test("rejects wrong ticker and malformed quotes",()=>{assert.equal(parseYahoo({chart:{result:[{meta:{symbol:"AAPL",currency:"USD"}}]}},now),null);assert.equal(parseFinnhub({c:0,t:ts},now),null)});
test("select newest provider, keep its source",()=>{const q=selectQuote([parseFinnhub({c:59,o:60,pc:59,t:ts-3600},now),parseYahoo(payload,now)],now);assert.equal(q.source,"Yahoo Finance");assert.equal(q.price,58.12)});
