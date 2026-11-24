const makeTools = function quoteTools(){
  const fmt=new Intl.DateTimeFormat("en-CA",{timeZone:"America/New_York",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"});
  function ny(t){const x=Object.fromEntries(fmt.formatToParts(new Date(t)).map(p=>[p.type,p.value]));return{date:x.year+"-"+x.month+"-"+x.day,minute:Number(x.hour)*60+Number(x.minute)}}
  function session(t){const x=ny(t),day=new Date(x.date+"T12:00:00Z").getUTCDay();if(day===0||day===6)return"CLOSED";return x.minute>=240&&x.minute<570?"PRE":x.minute>=570&&x.minute<960?"REGULAR":x.minute>=960&&x.minute<1200?"POST":"CLOSED"}
  const positive=x=>typeof x==="number"&&Number.isFinite(x)&&x>0;
  const validTime=(t,now)=>positive(t)&&t>946684800000&&t<=now+10000;
  function make(price,timestamp,now,source,open,previousClose,points=[]){if(!positive(price)||!validTime(timestamp,now))return null;return {status:"OK",price,open:positive(open)?open:null,previousClose:positive(previousClose)?previousClose:null,timestamp,receivedAt:now,source,session:session(timestamp),points,message:"Poslední dostupná tržní cena; skutečná prodleva závisí na poskytovateli."}}
  function parseYahoo(payload,now){const r=payload?.chart?.result?.[0],m=r?.meta;if(!r||m?.symbol!=="INTC"||m?.currency!=="USD")return null;const times=Array.isArray(r.timestamp)?r.timestamp:[],q=r.indicators?.quote?.[0]??{},points=[];for(let i=0;i<times.length;i++){const t=times[i]*1000,c=q.close?.[i];if(validTime(t,now)&&positive(c))points.push({timestamp:t,price:c,open:positive(q.open?.[i])?q.open[i]:null});}points.sort((a,b)=>a.timestamp-b.timestamp);
    const current=ny(now),today=points.filter(p=>ny(p.timestamp).date===current.date),todayOpen=today.find(p=>ny(p.timestamp).minute===570);
    const regularTs=m.regularMarketTime*1000,regularPrice=m.regularMarketPrice;let latest=points.at(-1);
    if(validTime(regularTs,now)&&positive(regularPrice)&&(!latest||regularTs>=latest.timestamp))latest={timestamp:regularTs,price:regularPrice,open:null};
    if(!latest)return null;
    const prev=points.filter(p=>ny(p.timestamp).date<current.date&&session(p.timestamp)==="REGULAR").at(-1);
    // Only use a regular open from today's session. Prior closes are not today's open.
    const open=todayOpen?.open??(validTime(regularTs,now)&&ny(regularTs).date===current.date&&session(regularTs)==="REGULAR"&&positive(m.regularMarketOpen)?m.regularMarketOpen:null);
    const prevClose=prev?.price??(positive(m.chartPreviousClose)?m.chartPreviousClose:positive(m.previousClose)?m.previousClose:null);
    const date=ny(latest.timestamp).date;const curve=points.filter(p=>ny(p.timestamp).date===date).map(({timestamp,price})=>({timestamp,price}));
    if(!curve.length||curve.at(-1).timestamp<latest.timestamp)curve.push({timestamp:latest.timestamp,price:latest.price});
    return make(latest.price,latest.timestamp,now,"Yahoo Finance",open,prevClose,curve);
  }
  function parseFinnhub(q,now){const t=q?.t*1000;if(!validTime(t,now)||!positive(q?.c))return null;const same=ny(t).date===ny(now).date;return make(q.c,t,now,"Finnhub",same&&session(t)==="REGULAR"?q.o:null,q.pc,[])}
  function selectQuote(quotes,now){const valid=quotes.filter(q=>q?.status==="OK"&&positive(q.price)&&validTime(q.timestamp,now)).sort((a,b)=>b.timestamp-a.timestamp);const latest=valid[0];if(!latest)return null;const chart=valid.find(q=>q.points?.length&&ny(q.timestamp).date===ny(latest.timestamp).date);return{...latest,points:chart?.points??[],open:latest.open??chart?.open??null,previousClose:latest.previousClose??chart?.previousClose??null}}
  function ageMinutes(q,now){return q?.status==="OK"&&validTime(q.timestamp,now)?Math.max(0,(now-q.timestamp)/60000):null}
  function isUsable(q,now){const age=ageMinutes(q,now);return age!==null&&age<=20&&positive(q.price)&&ny(q.timestamp).date===ny(now).date&&session(q.timestamp)!=="CLOSED"&&session(now)!=="CLOSED"}
  function isRegularFresh(q,now){const age=ageMinutes(q,now);return isUsable(q,now)&&age<=2&&session(now)==="REGULAR"&&session(q.timestamp)==="REGULAR"&&positive(q.open)&&positive(q.previousClose)}
  return {ny,session,parseYahoo,parseFinnhub,selectQuote,ageMinutes,isUsable,isRegularFresh};
};
const tools=makeTools();
export const {ny,session,parseYahoo,parseFinnhub,selectQuote,ageMinutes,isUsable,isRegularFresh}=tools;
