/** Market observations, not executable broker quotes. Timestamps are milliseconds. */
const formatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const CALENDAR_SOURCE = "https://www.nasdaq.com/market-activity/stock-market-holiday-schedule";
// Nasdaq's published 2026 calendar. Later years are not silently called verified.
const holidays2026 = new Set([
  "2026-01-01",
  "2026-01-19",
  "2026-02-16",
  "2026-04-03",
  "2026-05-25",
  "2026-06-19",
  "2026-07-03",
  "2026-09-07",
  "2026-11-26",
  "2026-12-25",
]);
const earlyCloses2026 = new Set(["2026-11-27", "2026-12-24"]);
const positive = (x) => typeof x === "number" && Number.isFinite(x) && x > 0;
const validTime = (t, now) => positive(t) && t > 946684800000 && t <= now + 10000;

export function ny(t) {
  const x = Object.fromEntries(formatter.formatToParts(new Date(t)).map((p) => [p.type, p.value]));
  return {
    date: x.year + "-" + x.month + "-" + x.day,
    minute: Number(x.hour) * 60 + Number(x.minute),
  };
}
export function marketCalendar(t) {
  const { date } = ny(t),
    day = new Date(date + "T12:00:00Z").getUTCDay();
  const closed = day === 0 || day === 6 || holidays2026.has(date);
  return {
    date,
    closed,
    openMinute: 570,
    closeMinute: earlyCloses2026.has(date) ? 780 : 960,
    postEndMinute: earlyCloses2026.has(date) ? 1020 : 1200,
    verified: date.startsWith("2026-"),
    sourceUrl: CALENDAR_SOURCE,
  };
}
export function session(t) {
  if (!Number.isFinite(t)) return "CLOSED";
  const { minute } = ny(t),
    calendar = marketCalendar(t);
  if (calendar.closed) return "CLOSED";
  if (minute >= 240 && minute < calendar.openMinute) return "PRE";
  if (minute >= calendar.openMinute && minute < calendar.closeMinute) return "REGULAR";
  if (minute >= calendar.closeMinute && minute < calendar.postEndMinute) return "POST";
  return "CLOSED";
}
// Separate overnight venue. Do not relabel a closing print from another feed.
export function overnightTradingDate(t) {
  if (!Number.isFinite(t)) return null;
  const {date,minute}=ny(t);
  if (minute>=240 && minute<1200) return null;
  const next=new Date(date+"T12:00:00Z");
  if(minute>=1200)next.setUTCDate(next.getUTCDate()+1);
  const cal=marketCalendar(next.getTime());
  return cal.verified && !cal.closed ? cal.date : null;
}
export function marketPhase(t) {
  return overnightTradingDate(t) ? "OVERNIGHT" : session(t);
}
export function parseAlpacaTrade(payload, now, feed) {
  if (!["boats","overnight"].includes(feed)) return null;
  const trade=payload?.trades?.INTC;
  if(typeof trade?.t!=="string" || !/(Z|[+-]\d{2}:\d{2})$/i.test(trade.t))return null;
  const t=Date.parse(trade.t), date=overnightTradingDate(t);
  if(!date || !validTime(t,now) || !positive(trade?.p))return null;
  const source=feed==="boats"?"Alpaca · Blue Ocean ATS":"Alpaca · overnight (zpožděná)";
  return make(trade.p,t,now,source,null,null,[{timestamp:t,price:trade.p}],{
    session:"OVERNIGHT",referenceDate:date,chartSource:source,
    expectedDelayMinutes:feed==="overnight"?15:null,
    sourceUrl:"https://docs.alpaca.markets/us/docs/245-trading-for-trading-api",
    message:feed==="overnight"
      ?"Odvozený noční feed Alpaca; poslední obchod je podle tarifu zpožděný o 15 min a může se lišit od Blue Ocean."
      :"Poslední obchod Blue Ocean ATS přes Alpaca; nejde o garantovanou cenu brokera.",
  });
}
export function synchronizedQuote(quote, prior=null) {
  if(!quote || quote.status!=="OK" || !positive(quote.price) || !positive(quote.timestamp))return quote;
  const previous=prior?.status==="OK" && prior.source===quote.source &&
    prior.referenceDate===quote.referenceDate ? prior.points??[] : [];
  const points=new Map();
  for(const p of [...previous,...(quote.points??[])]) {
    if(positive(p?.timestamp) && positive(p?.price) && p.timestamp<=quote.timestamp &&
      (quote.session==="OVERNIGHT" ? overnightTradingDate(p.timestamp)===quote.referenceDate : ny(p.timestamp).date===ny(quote.timestamp).date))
      points.set(p.timestamp,{timestamp:p.timestamp,price:p.price});
  }
  points.set(quote.timestamp,{timestamp:quote.timestamp,price:quote.price});
  return {...quote,points:[...points.values()].sort((a,b)=>a.timestamp-b.timestamp).slice(-1500),chartSource:quote.source};
}
function parseSchedule(periods) {
  const pre = periods?.pre,
    regular = periods?.regular,
    post = periods?.post;
  if (![pre?.start, regular?.start, regular?.end, post?.end].every(positive)) return null;
  const values = [pre.start, regular.start, regular.end, post.end].map((x) => x * 1000);
  if (!values.every((x, i) => i === 0 || x > values[i - 1])) return null;
  const date = ny(values[1]).date;
  if (values.some((x) => ny(x).date !== date)) return null;
  const calendar = marketCalendar(values[1]);
  if (calendar.closed) return null;
  if (calendar.verified) {
    // A provider's generic period must not extend Nasdaq's published short day.
    const offset = ny(values[1]).minute;
    values[2] = Math.min(values[2], values[1] + (calendar.closeMinute - offset) * 60000);
    values[3] = Math.min(values[3], values[1] + (calendar.postEndMinute - offset) * 60000);
    if (values[2] <= values[1] || values[3] <= values[2]) return null;
  }
  return {
    date,
    preStart: values[0],
    regularStart: values[1],
    regularEnd: values[2],
    postEnd: values[3],
    source: calendar.verified ? "Yahoo Finance / Nasdaq kalendář" : "Yahoo Finance",
  };
}
function observationSession(t, schedule, closingPrint = false) {
  if (marketCalendar(t).closed) return "CLOSED";
  if (!schedule || schedule.date !== ny(t).date) return session(t);
  if (closingPrint && t === schedule.regularEnd) return "REGULAR";
  if (t >= schedule.preStart && t < schedule.regularStart) return "PRE";
  if (t >= schedule.regularStart && t < schedule.regularEnd) return "REGULAR";
  if (t >= schedule.regularEnd && t < schedule.postEnd) return "POST";
  return "CLOSED";
}
function make(price, timestamp, now, source, open, previousClose, points = [], extra = {}) {
  if (!positive(price) || !validTime(timestamp, now)) return null;
  return {
    status: "OK",
    symbol: "INTC",
    currency: "USD",
    price,
    open: positive(open) ? open : null,
    previousClose: positive(previousClose) ? previousClose : null,
    timestamp,
    receivedAt: now,
    checkedAt: now,
    source,
    session: session(timestamp),
    points,
    referenceDate: ny(timestamp).date,
    chartSource: points.length ? source : null,
    timestampKind: "provider",
    expectedDelayMinutes: null,
    conflict: false,
    cached: false,
    message:
      "Poslední cena poskytovatele. Nejde o kotaci brokera; prodleva ani cena plnění nejsou zaručené.",
    ...extra,
  };
}
export function parseYahoo(payload, now) {
  const result = payload?.chart?.result?.[0],
    meta = result?.meta;
  if (payload?.chart?.error || !result || meta?.symbol !== "INTC" || meta?.currency !== "USD")
    return null;
  if (meta.instrumentType && meta.instrumentType !== "EQUITY") return null;
  const schedule = parseSchedule(meta.currentTradingPeriod);
  const times = Array.isArray(result.timestamp) ? result.timestamp : [];
  const values = result.indicators?.quote?.[0] ?? {},
    byTime = new Map();
  for (let i = 0; i < times.length; i++) {
    const t = times[i] * 1000,
      c = values.close?.[i];
    if (validTime(t, now) && positive(c)) {
      byTime.set(t, {
        timestamp: t,
        price: c,
        open: positive(values.open?.[i]) ? values.open[i] : null,
      });
    }
  }
  const observations = [...byTime.values()].sort((a, b) => a.timestamp - b.timestamp);
  const regularTs = meta.regularMarketTime * 1000,
    regularPrice = meta.regularMarketPrice;
  let latest = observations.at(-1),
    timestampKind = "bar";
  if (
    validTime(regularTs, now) &&
    positive(regularPrice) &&
    (!latest || regularTs >= latest.timestamp)
  ) {
    latest = { timestamp: regularTs, price: regularPrice, open: null };
    timestampKind = "provider";
  }
  if (!latest) return null;
  const date = ny(latest.timestamp).date;
  const day = observations.filter((p) => ny(p.timestamp).date === date);
  const opening = day.find((p) =>
    schedule?.date === date
      ? p.timestamp === schedule.regularStart
      : ny(p.timestamp).minute === 570,
  );
  const metaSameDay = validTime(regularTs, now) && ny(regularTs).date === date;
  const open =
    opening?.open ??
    (metaSameDay && positive(meta.regularMarketOpen) ? meta.regularMarketOpen : null);
  // previousClose is the previous regular close; chartPreviousClose is the start
  // of the requested window and is WRONG for a 5d/1mo chart.
  // During the next premarket, regularMarketPrice still holds the last completed
  // regular session. previousClose can still refer to the day before THAT session.
  const priorRegular =
    validTime(regularTs, now) && positive(regularPrice) && ny(regularTs).date < date;
  const previousClose = priorRegular
    ? regularPrice
    : positive(meta.previousClose)
      ? meta.previousClose
      : meta.range === "1d" && positive(meta.chartPreviousClose)
        ? meta.chartPreviousClose
        : null;
  const points = day.map(({ timestamp, price }) => ({ timestamp, price }));
  const last = points.at(-1);
  if (!last || last.timestamp < latest.timestamp)
    points.push({ timestamp: latest.timestamp, price: latest.price });
  else if (last.timestamp === latest.timestamp) last.price = latest.price;
  return make(latest.price, latest.timestamp, now, "Yahoo Finance", open, previousClose, points, {
    schedule,
    timestampKind,
    dayHigh: metaSameDay && positive(meta.regularMarketDayHigh) ? meta.regularMarketDayHigh : null,
    dayLow: metaSameDay && positive(meta.regularMarketDayLow) ? meta.regularMarketDayLow : null,
    regularVolume:
      metaSameDay && Number.isFinite(meta.regularMarketVolume) && meta.regularMarketVolume >= 0
        ? meta.regularMarketVolume
        : null,
    session: observationSession(latest.timestamp, schedule, timestampKind === "provider"),
    sourceUrl: "https://finance.yahoo.com/quote/INTC/",
    // Yahoo's chart API is unofficial; no delay field is not a realtime promise.
    message:
      timestampKind === "bar"
        ? "Minutová cena Yahoo Finance; čas označuje začátek svíčky. Není to kotace pro zaručené plnění."
        : "Poslední cena Yahoo Finance s časem poskytovatele. Prodleva a budoucí dostupnost veřejného zdroje nejsou zaručené.",
  });
}
export function parseFinnhub(payload, now) {
  const t = payload?.t * 1000;
  if (!validTime(t, now) || !positive(payload?.c)) return null;
  if (
    (payload.symbol && payload.symbol !== "INTC") ||
    (payload.currency && payload.currency !== "USD")
  )
    return null;
  // Finnhub /quote does not echo symbol/currency. Server uses a fixed INTC endpoint.
  return make(
    payload.c,
    t,
    now,
    "Finnhub",
    session(t) === "PRE" ? null : payload.o,
    payload.pc,
    [],
    {
      sourceUrl: "https://finnhub.io/docs/api/quote",
      schedule: null,
      session:
        ny(t).minute === marketCalendar(t).closeMinute &&
        t % 60000 === 0 &&
        !marketCalendar(t).closed
          ? "REGULAR"
          : session(t),
    },
  );
}
export function selectQuote(quotes, now) {
  const valid = quotes
    .filter((q) => q?.status === "OK" && positive(q.price) && validTime(q.timestamp, now))
    .sort((a, b) => b.timestamp - a.timestamp);
  const nightDate=overnightTradingDate(now);
  const latest=(nightDate ? valid.find(q=>q.session==="OVERNIGHT" && q.referenceDate===nightDate) : null) ?? valid[0];
  if (!latest) return null;
  const chart = latest.session==="OVERNIGHT" ? null : valid.find((q) => q.points?.length && q.referenceDate === latest.referenceDate);
  const peer = valid.find(
    (q) => q.source !== latest.source && q.session===latest.session && Math.abs(q.timestamp - latest.timestamp) <= 120000,
  );
  const disagreementPct = peer ? (Math.abs(peer.price - latest.price) / latest.price) * 100 : null;
  const conflict = disagreementPct !== null && disagreementPct > 1;
  return synchronizedQuote({
    ...latest,
    points: latest.points ?? [],
    chartSource: latest.source,
    open: latest.open ?? chart?.open ?? null,
    previousClose: latest.previousClose ?? chart?.previousClose ?? null,
    schedule: latest.schedule ?? chart?.schedule ?? null,
    conflict,
    disagreementPct,
    ...(conflict
      ? {
          message:
            "Poskytovatelé uvádějí ceny odlišné o více než 1 %. Cvičné obchody z těchto dat jsou pozastavené; ověř kotaci u brokera.",
        }
      : {}),
  });
}
export function ageMinutes(q, now) {
  return q?.status === "OK" && validTime(q.timestamp, now)
    ? Math.max(0, (now - q.timestamp) / 60000)
    : null;
}
export function isUsable(q, now) {
  const age = ageMinutes(q, now);
  if (
    age === null ||
    age > 20 ||
    !positive(q.price) ||
    q.conflict
  )
    return false;
  if(q.session==="OVERNIGHT") {
    const date=overnightTradingDate(now);
    return date!==null && overnightTradingDate(q.timestamp)===date && q.referenceDate===date;
  }
  if(ny(q.timestamp).date !== ny(now).date)return false;
  const current = observationSession(now, q.schedule);
  // A premarket or closing observation must not masquerade as a new session price.
  return current !== "CLOSED" && q.session === current;
}
export function isRegularFresh(q, now) {
  const age = ageMinutes(q, now);
  const calendarKnown = marketCalendar(now).verified || q?.schedule?.date === ny(now).date;
  return (
    isUsable(q, now) &&
    !q.cached &&
    age <= 2 &&
    calendarKnown &&
    observationSession(now, q.schedule) === "REGULAR" &&
    q.session === "REGULAR" &&
    positive(q.open) &&
    positive(q.previousClose)
  );
}
