import { useQuery } from "@tanstack/react-query";
import { createContext,useContext,useState,useEffect,useMemo,type ReactNode } from "react";
import { defaults,ny,validate,type Settings,type Transaction } from "./pilot-engine.mjs";
import { getPilotQuote,type PilotQuote } from "./pilot-market.functions";
import type { NamedMarket } from "./pilot-import";

const KEY="intc-pilot-v2-private";
export const usd=(v:number)=>new Intl.NumberFormat("cs-CZ",{style:"currency",currency:"USD",minimumFractionDigits:2}).format(v);
export const czk=(v:number)=>new Intl.NumberFormat("cs-CZ",{style:"currency",currency:"CZK",maximumFractionDigits:0}).format(v);
export const pct=(v:number)=>v.toLocaleString("cs-CZ",{maximumFractionDigits:2})+" %";
export const dateTime=(t:number)=>new Date(t).toLocaleString("cs-CZ",{timeZone:"Europe/Prague",dateStyle:"short",timeStyle:"short"});
export interface PaperPosition {id:string;qty:number;price:number;at:number;date:string;target:number;stop:number|null;fee:number;holdDays:number}
export interface PaperTrade extends PaperPosition {exit:number;exitAt:number;reason:string;pnlUsd:number}
interface Paper {startingUsd:number;cashUsd:number;peakUsd:number;positions:PaperPosition[];closed:PaperTrade[];lastBuyDate:string|null;locked:boolean}
interface Persist {settings:Settings;paper:Paper;core:{qty:number;avg:number}}
function newPaper(p:Settings):Paper {const cash=p.capitalCzk/p.fx;return {startingUsd:cash,cashUsd:cash,peakUsd:cash,positions:[],closed:[],lastBuyDate:null,locked:false};}
function initial():Persist {return {settings:{...defaults},paper:newPaper({...defaults}),core:{qty:0,avg:0}};}
function load():Persist{try{const raw=localStorage.getItem(KEY);if(!raw)return initial();const x=JSON.parse(raw) as Persist;validate(x.settings);if(!Number.isFinite(x.paper.cashUsd)||x.paper.cashUsd<0||!Array.isArray(x.paper.positions)||!Array.isArray(x.paper.closed)||!Number.isFinite(x.paper.peakUsd)||!Number.isFinite(x.paper.startingUsd)||!Number.isFinite(x.core.qty)||!Number.isFinite(x.core.avg))throw new Error("Invalid state");return x;}catch{return initial();}}
function dayEnd(date:string){const d=new Date(date+"T12:00:00Z"),m=d.getUTCMonth()+1,day=d.getUTCDate(),w=d.getUTCDay();
  // Usual shortened sessions; unexpected exchange closures require an exchange calendar.
  const nov1=new Date(Date.UTC(d.getUTCFullYear(),10,1)).getUTCDay(),thanksgiving=1+(4-nov1+7)%7+21;
  return (m===11&&day===thanksgiving+1)||(m===12&&day===24&&w>=1&&w<=5)||(m===7&&day===3&&w>=1&&w<=5)?780:960;
}
export function quoteIsFresh(q:PilotQuote|undefined,now:number):q is PilotQuote & {status:"OK";price:number;open:number;previousClose:number;timestamp:number}{
  if(!q||q.status!=="OK"||q.price===null||q.open===null||q.previousClose===null||q.timestamp===null||!Number.isFinite(q.price)||q.price<=0||q.open<=0||q.previousClose<=0)return false;
  const clock=ny(now),market=ny(q.timestamp),weekday=new Date(clock.date+"T12:00:00Z").getUTCDay();
  return weekday>=1&&weekday<=5&&clock.date===market.date&&market.minute>=570&&market.minute<dayEnd(clock.date)&&clock.minute>=570&&clock.minute<dayEnd(clock.date)&&now-q.timestamp<=90000&&now-q.timestamp>=-10000;
}
export function getExit(pos:PaperPosition,price:number,now:number):string{
  if(pos.stop!==null&&price<=pos.stop)return "STOP";
  if(price>=pos.target)return "TARGET";
  const current=ny(now);
  if(pos.holdDays===0&&(current.date>pos.date||current.minute>=dayEnd(current.date)-5))return "TIME";
  // Multi-day time exits use full trading sessions in the backtest. A quote-only
  // panel deliberately does not infer a historical session count while offline.
  return "HOLD";
}
function mark(paper:Paper,price:number){return paper.cashUsd+paper.positions.reduce((sum,x)=>sum+x.qty*(price-x.fee),0);}
function plan(p:Persist,q:PilotQuote|undefined,now:number){
  const settings=p.settings,clock=ny(now);const fresh=quoteIsFresh(q,now);const open=q?.open??null,previous=q?.previousClose??null;
  const drop=settings.signal==="dip2"?2:settings.signal==="dipPct"&&open!==null?open*settings.dipPct/100:settings.dipUsd;
  const limit=open!==null?(settings.signal==="open"?open:open-drop):null;
  const gap=open!==null&&previous!==null&&previous>0?(open/previous-1)*100:null;
  const committed=p.paper.positions.reduce((s,x)=>s+x.qty*(x.price+x.fee),0);
  const available=Math.max(0,Math.min(p.paper.cashUsd-settings.reserveCzk/settings.fx,(settings.capitalCzk-settings.reserveCzk)/settings.fx-committed,settings.slotCzk/settings.fx));
  const qty=fresh?Math.floor(available/(q.price+settings.fee)):0;
  const reasons:string[]=[];
  if(!fresh)reasons.push("Čekám na čerstvou kotaci v hlavní seanci (stáří max. 90 s).");
  if(settings.signal==="rebound")reasons.push("Odraz vyžaduje uzavřené OHLC svíčky; v této verzi je dostupný pouze v backtestu.");
  if(settings.holdDays>0)reasons.push("Vícedenní časový limit je dostupný v backtestu; v PAPER použij denní výstup nebo ruční držení.");
  if(clock.minute>Math.min(settings.windowMinute,dayEnd(clock.date)-5))reasons.push("Nákupní okno skončilo.");
  if(settings.gapPct>0&&gap!==null&&gap<=-settings.gapPct)reasons.push("Filtr výprodeje: otevírací gap "+pct(gap)+".");
  if(p.paper.locked)reasons.push("Risk lock blokuje nové nákupy, nikoli uzavření pozic.");
  if(p.paper.lastBuyDate===clock.date)reasons.push("Dnes už byl proveden jeden simulovaný nákup.");
  if(p.paper.positions.length>=settings.maxSlots)reasons.push("Dosažen maximální počet pozic.");
  if(!qty)reasons.push("Nedostatečný volný kapitál nebo nedostupná kotace.");
  if(fresh&&settings.signal==="open"&&clock.minute>=575)reasons.push("Nákup při otevření je v PAPER povolen jen do 09:35 ET.");
  if(fresh&&settings.signal!=="open"&&limit!==null&&q.price>limit)reasons.push("Cena zatím nedosáhla nákupní úrovně.");
  if(fresh&&settings.stopUsd>0&&q.price<=settings.stopUsd)reasons.push("Stop je větší než cena akcie.");
  if(fresh&&Math.max(p.paper.peakUsd,mark(p.paper,q.price))-mark(p.paper,q.price)>=settings.drawdownLimitCzk/settings.fx)reasons.push("Překročen limit drawdownu.");
  return {fresh,limit,gap,qty,reasons,ready:reasons.length===0,availableUsd:available,committedUsd:committed};
}
interface Value {settings:Settings;paper:Paper;core:Persist["core"];hydrated:boolean;storageError:boolean;quote:PilotQuote|undefined;quoteLoading:boolean;now:number;entry:ReturnType<typeof plan>;markets:NamedMarket[];setMarkets:(x:NamedMarket[])=>void;transactions:Transaction[];setTransactions:(x:Transaction[])=>void;saveSettings:(x:Settings)=>void;saveCore:(qty:number,avg:number)=>void;buy:()=>void;sell:(id:string)=>void;resetPaper:()=>void;toggleLock:()=>void;}
const Context=createContext<Value|null>(null);
export function PilotProvider({children}:{children:ReactNode}){
  const [state,setState]=useState<Persist>(initial),[hydrated,setHydrated]=useState(false),[storageError,setStorageError]=useState(false);
  const [now,setNow]=useState(Date.now),[markets,setMarkets]=useState<NamedMarket[]>([]),[transactions,setTransactions]=useState<Transaction[]>([]);
  const query=useQuery({queryKey:["pilot-quote-v2"],queryFn:()=>getPilotQuote(),refetchInterval:15000,refetchIntervalInBackground:false,retry:1,staleTime:0});
  const quote=query.data as PilotQuote|undefined;
  useEffect(()=>{setState(load());setHydrated(true);const timer=setInterval(()=>setNow(Date.now()),5000);return ()=>clearInterval(timer);},[]);
  useEffect(()=>{if(!hydrated)return;try{localStorage.setItem(KEY,JSON.stringify(state));setStorageError(false);}catch{setStorageError(true);}},[state,hydrated]);
  useEffect(()=>{if(!hydrated||!quoteIsFresh(quote,now))return;const price=quote.price;setState(s=>{const value=mark(s.paper,price),peak=Math.max(s.paper.peakUsd,value),locked=s.paper.locked||(peak-value)*s.settings.fx>=s.settings.drawdownLimitCzk;return peak===s.paper.peakUsd&&locked===s.paper.locked?s:{...s,paper:{...s.paper,peakUsd:peak,locked}};});},[quote,now,hydrated]);
  const entry=useMemo(()=>plan(state,quote,now),[state,quote,now]);
  function buy(){if(!hydrated)return;setState(s=>{const time=Date.now(),check=plan(s,quote,time);if(!check.ready||!quoteIsFresh(quote,time))return s;const {price}=quote,p=s.settings,qty=check.qty,date=ny(time).date;const pos:PaperPosition={id:crypto.randomUUID(),qty,price,at:time,date,target:price+p.targetUsd,stop:p.stopUsd>0?price-p.stopUsd:null,fee:p.fee,holdDays:p.holdDays};return {...s,paper:{...s.paper,cashUsd:s.paper.cashUsd-qty*(price+p.fee),positions:[...s.paper.positions,pos],lastBuyDate:date}};});}
  function sell(id:string){if(!hydrated)return;setState(s=>{const time=Date.now();if(!quoteIsFresh(quote,time))return s;const pos=s.paper.positions.find(x=>x.id===id);if(!pos)return s;const exit=quote.price,reason=getExit(pos,exit,time),pnlUsd=pos.qty*(exit-pos.price-2*pos.fee);return {...s,paper:{...s.paper,cashUsd:s.paper.cashUsd+pos.qty*(exit-pos.fee),positions:s.paper.positions.filter(x=>x.id!==id),closed:[...s.paper.closed,{...pos,exit,exitAt:time,reason:reason==="HOLD"?"MANUAL":reason,pnlUsd}]}};});}
  const value:Value={...state,hydrated,storageError,quote,quoteLoading:query.isLoading,now,entry,markets,setMarkets,transactions,setTransactions,
    saveSettings:x=>{validate(x);setState(s=>({...s,settings:{...x}}));},
    saveCore:(qty,avg)=>{if(!Number.isFinite(qty)||!Number.isFinite(avg)||qty<0||avg<0||(qty>0&&avg===0))throw new Error("Neplatná dlouhodobá pozice.");setState(s=>({...s,core:{qty,avg}}));},
    buy,sell,resetPaper:()=>setState(s=>({...s,paper:newPaper(s.settings)})),toggleLock:()=>setState(s=>({...s,paper:{...s.paper,locked:!s.paper.locked}}))};
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function usePilot(){const x=useContext(Context);if(!x)throw new Error("PilotProvider chybí.");return x;}
