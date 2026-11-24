import { createFileRoute,Link } from "@tanstack/react-router";
import { useState,useMemo,useEffect,useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SettingsFields } from "@/components/PilotSettings";
import { usePilot,czk,usd,pct,dateTime } from "@/lib/pilot-store";
import { sessions,validate,defaults,type Settings,type Result,type Optimization } from "@/lib/pilot-engine.mjs";
import { loadMarketFile,downloadCsv } from "@/lib/pilot-import";
import type { Request,Reply } from "@/lib/pilot-worker";
import { LineChart,Line,XAxis,YAxis,Tooltip,ResponsiveContainer,ReferenceLine,Legend } from "recharts";
export const Route=createFileRoute("/backtest")({component:Backtest,head:()=>({meta:[{title:"Backtest | INTC Pilot 2.0"}]})});

const signalName=(p:Settings)=>p.signal==="open"?"Otevření":p.signal==="dip2"?"Pokles 2 USD":p.signal==="dip1"?"Pokles "+usd(p.dipUsd):p.signal==="dipPct"?"Pokles "+pct(p.dipPct):"Pokles "+pct(p.dipPct)+" + odraz "+usd(p.reboundUsd);
const clock=(n:number)=>String(Math.floor(n/60)).padStart(2,"0")+":"+String(n%60).padStart(2,"0");
const desc=(p:Settings)=>signalName(p)+" · TP "+usd(p.targetUsd)+" · SL "+(p.stopUsd?usd(p.stopUsd):"bez stopu")+" · "+(p.holdDays<0?"bez časového limitu":p.holdDays===0?"do konce seance":p.holdDays+" dalších seancí")+" · gap "+pct(p.gapPct)+" · do "+clock(p.windowMinute)+" ET";
const moneyClass=(n:number)=>n>0?"text-success":n<0?"text-destructive":"";
function Stat({name,value,sub}:{name:string;value:string;sub?:string}){return <div className="rounded-lg border border-border bg-background/30 p-3"><div className="text-xs text-muted-foreground">{name}</div><div className="num text-lg font-semibold">{value}</div>{sub&&<div className="mt-1 text-xs text-muted-foreground">{sub}</div>}</div>;}
function ResultPanel({result:r,title}:{result:Result;title:string}){
 const [expanded,setExpanded]=useState(false);
 const pf=r.profitFactor===null?"∞ (bez ztrát)":r.profitFactor.toFixed(2);
 function exportTrades(){downloadCsv("INTC-backtest-obchody.csv",[["stav","vstup UTC","výstup UTC","ks","nákup USD","prodej / ocenění USD","důvod","P/L Kč","držení min"],...r.trades.map(t=>["UZAVŘENÝ",new Date(t.entryTs).toISOString(),new Date(t.exitTs).toISOString(),t.qty,t.entry,t.exit,t.reason,t.pnlCzk,t.holdMinutes]),...r.open.map(t=>["OTEVŘENÝ",new Date(t.entryTs).toISOString(),"",t.qty,t.entry,t.mark,"MTM",t.pnlCzk,""])]);}
 return <Card className="space-y-5 p-5">
  <div><h2 className="text-xl font-semibold">{title}</h2><p className="mt-1 text-xs text-muted-foreground">{r.days} úplných seancí · {desc(r.settings)} · náklady {usd(r.settings.fee)} za akcii na každé straně · modelový kurz {r.settings.fx}</p></div>
  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
    <Stat name="Celkový výsledek" value={czk(r.totalCzk)} sub={pct(r.returnPct)+" počátečního kapitálu"}/>
    <Stat name="Realizováno" value={czk(r.realizedCzk)} sub={r.closed+" uzavřených obchodů"}/>
    <Stat name="Nerealizováno po nákladech" value={czk(r.unrealizedCzk)} sub={r.open.length+" otevřených pozic"}/>
    <Stat name="Max. drawdown" value={czk(r.maxDrawdownCzk)} sub={"Denní závěry: "+czk(r.dailyDrawdownCzk)}/>
    <Stat name="Ziskové uzavřené obchody" value={r.winRate===null?"—":pct(r.winRate)} sub={r.wins+" / "+r.closed}/>
    <Stat name="Profit factor" value={r.closed?pf:"—"}/>
    <Stat name="Cíl / stop / čas" value={r.targets+" / "+r.stops+" / "+r.times}/>
    <Stat name="Medián držení" value={r.medianHoldMinutes===null?"—":r.medianHoldMinutes.toFixed(0)+" min"} sub={"Průměr "+(r.meanHoldMinutes?.toFixed(0)??"—")+" min · max. "+(r.maxHoldMinutes?.toFixed(0)??"—")+" min"}/>
    <Stat name="Vstupy" value={String(r.entries)} sub={r.blocked+" blokováno kapitálem, "+r.blockedGap+" gap filtrem"}/>
    <Stat name="Konečná hotovost" value={czk(r.finalCashCzk)}/>
    <Stat name="Max. vázaný kapitál na konci dne" value={czk(Math.max(0,...r.curve.map(x=>x.committedCzk)))}/>
    <Stat name="Výchozí rozpočet" value={czk(r.settings.capitalCzk)} sub={"Rezerva "+czk(r.settings.reserveCzk)}/>
  </div>
  <div className="h-72 min-w-0"><ResponsiveContainer width="100%" height="100%"><LineChart data={r.curve}><XAxis dataKey="date" minTickGap={35}/><YAxis width={82} domain={["auto","auto"]} tickFormatter={v=>Math.round(Number(v)).toLocaleString("cs-CZ")}/><Tooltip formatter={v=>czk(Number(v))}/><Legend/><ReferenceLine y={r.settings.capitalCzk} stroke="#64748b" strokeDasharray="4 4"/><Line name="Equity (Kč)" dataKey="equityCzk" stroke="#34d399" dot={false} isAnimationActive={false}/><Line name="Hotovost (Kč)" dataKey="cashCzk" stroke="#60a5fa" dot={false} isAnimationActive={false}/></LineChart></ResponsiveContainer></div>
  <div className="flex flex-wrap items-center gap-2"><Button variant="outline" onClick={exportTrades}>Export obchodů CSV</Button><Button variant="outline" onClick={()=>downloadCsv("INTC-backtest-equity.csv",[["datum ET","equity Kč","hotovost Kč","otevřené pozice","vázaný kapitál Kč"],...r.curve.map(x=>[x.date,x.equityCzk,x.cashCzk,x.open,x.committedCzk])])}>Export equity CSV</Button><Button variant="ghost" onClick={()=>setExpanded(!expanded)}>{expanded?"Skrýt":"Zobrazit"} jednotlivé obchody ({r.closed+r.open.length})</Button></div>
  {expanded&&<div className="max-h-96 overflow-auto"><table className="w-full text-sm"><thead className="sticky top-0 bg-card text-left text-muted-foreground"><tr><th>Vstup Praha</th><th>Výstup Praha</th><th>Ks</th><th>Nákup</th><th>Výstup / ocenění</th><th>Důvod</th><th>Čistý P/L</th></tr></thead><tbody>{r.trades.map(t=><tr className="border-t border-border" key={t.id}><td className="py-2">{dateTime(t.entryTs)}</td><td>{dateTime(t.exitTs)}</td><td>{t.qty}</td><td>{usd(t.entry)}</td><td>{usd(t.exit)}</td><td>{t.reason}</td><td className={moneyClass(t.pnlCzk)}>{czk(t.pnlCzk)}</td></tr>)}{r.open.map(t=><tr className="border-t border-border" key={t.id}><td className="py-2">{dateTime(t.entryTs)}</td><td>Otevřeno</td><td>{t.qty}</td><td>{usd(t.entry)}</td><td>{usd(t.mark)}</td><td>MTM</td><td className={moneyClass(t.pnlCzk)}>{czk(t.pnlCzk)}</td></tr>)}</tbody></table></div>}
 </Card>;
}
function Backtest(){
 const {settings,markets,setMarkets,saveSettings,hydrated}=usePilot();
 const [draft,setDraft]=useState<Settings>({...settings}),[dataset,setDataset]=useState(0),[from,setFrom]=useState(""),[to,setTo]=useState(""),[cut,setCut]=useState(""),[result,setResult]=useState<Result|null>(null),[opt,setOpt]=useState<Optimization|null>(null),[error,setError]=useState(""),[note,setNote]=useState(""),[busy,setBusy]=useState(false),[loading,setLoading]=useState(false);
 const worker=useRef<Worker|null>(null);
 useEffect(()=>{setDraft({...settings});},[settings]);
 useEffect(()=>()=>worker.current?.terminate(),[]);
 const selected=markets[dataset]??markets[0];
 const grouped=useMemo(()=>selected?sessions(selected.data):{days:[],excluded:[]},[selected]);
 const days=useMemo(()=>grouped.days.filter(d=>(!from||d.date>=from)&&(!to||d.date<=to)),[grouped,from,to]);
 const proposed=days[Math.floor(days.length*.7)]?.date??"";
 const splitDate=cut||proposed,split=days.filter(d=>d.date<splitDate).length;
 const range=days.length?days[0]!.date+" – "+days.at(-1)!.date:"—";
 function clear(){setResult(null);setOpt(null);setError("");setNote("");}
 function change(p:Settings){setDraft(p);clear();}
 async function importFile(file:File){setLoading(true);clear();try{const data=await loadMarketFile(file);setMarkets(data);setDataset(0);setFrom("");setTo("");setCut("");setNote("Načteno "+data.length+" datových řad. Zvol jednu, nebudou smíchány.");}catch(e){setError(e instanceof Error?e.message:String(e));}finally{setLoading(false);}}
 function launch(kind:"run"|"optimize"){clear();try{validate(draft);if(!days.length)throw Error("Nahraj data a vyber úplné seance.");if(kind==="optimize"&&(split<5||days.length-split<5))throw Error("Pro optimalizaci vyber nejméně 5 tréninkových a 5 následných testovacích seancí.");if(kind==="optimize"&&days.length>250)throw Error("Pro optimalizaci vyber nejvýše 250 seancí; jeden backtest lze provést i na delší historii.");
   worker.current?.terminate();const w=new Worker(new URL("../lib/pilot-worker.ts",import.meta.url),{type:"module"});worker.current=w;setBusy(true);
   w.onmessage=(e:MessageEvent<Reply>)=>{if(worker.current!==w)return;const data=e.data;if(data.kind==="error")setError(data.message);else if(data.kind==="run")setResult(data.result);else setOpt(data.result);setBusy(false);w.terminate();worker.current=null;};
   w.onerror=()=>{if(worker.current!==w)return;setError("Výpočet se nezdařil. Zkontroluj prohlížeč a velikost dat.");setBusy(false);w.terminate();worker.current=null;};
   const message:Request=kind==="run"?{kind,days,settings:{...draft}}:{kind,days,settings:{...draft},split};w.postMessage(message);
 }catch(e){setError(e instanceof Error?e.message:String(e));setBusy(false);}}
 function cancel(){worker.current?.terminate();worker.current=null;setBusy(false);setNote("Výpočet ukončen.");}
 return <div className="mx-auto max-w-7xl space-y-5 px-4 py-6">
  <div><h1 className="text-2xl font-semibold">Backtest — výpočet na importovaných datech</h1><p className="text-sm text-muted-foreground">Pouze historická simulace. Žádné výsledky nejsou předvyplněné a nic se neodesílá brokerovi.</p></div>
  <Card className="space-y-4 p-5"><h2 className="font-semibold">1. Cenová data Intel (INTC)</h2><Input type="file" accept=".csv,.zip" disabled={busy||loading} onChange={e=>{const f=e.target.files?.[0];if(f)void importFile(f);e.target.value="";}}/>
   <p className="text-xs text-muted-foreground">Podporovány 1min a 5min OHLC CSV a ZIP do 30 MB, např. INTEL_DATA.zip. Čas musí obsahovat UTC/offset. Data zůstávají pouze v paměti prohlížeče. Aplikace neověřuje ticker u OHLC souborů bez sloupce symbolu; nahraj výhradně INTC.</p>
   {loading&&<p role="status">Načítám data…</p>}
   {markets.length>0&&<><div className="grid gap-3 sm:grid-cols-3"><label className="text-sm">Datová řada<select disabled={busy} className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2" value={dataset} onChange={e=>{setDataset(Number(e.target.value));setFrom("");setTo("");setCut("");clear();}}>{markets.map((m,i)=><option key={i} value={i}>{m.name} · {m.data.interval} min</option>)}</select></label><label className="text-sm">Od (ET)<Input type="date" disabled={busy} value={from} onChange={e=>{setFrom(e.target.value);setCut("");clear();}}/></label><label className="text-sm">Do (ET)<Input type="date" disabled={busy} value={to} onChange={e=>{setTo(e.target.value);setCut("");clear();}}/></label></div>
   <div className="grid gap-2 sm:grid-cols-4"><Stat name="Svíčky v souboru" value={String(selected?.data.bars.length??0)}/><Stat name="Úplné vybrané seance" value={String(days.length)} sub={range}/><Stat name="Neúplné seance mimo test" value={String(grouped.excluded.length)} sub={grouped.excluded.slice(0,4).join(", ")||"Žádná z detekovaných"}/><Stat name="Neplatné řádky" value={String(selected?.data.rejected??0)}/></div>
   <Button variant="ghost" disabled={busy} onClick={()=>{setMarkets([]);setFrom("");setTo("");setCut("");clear();}}>Odstranit importovaná data</Button></>}
  </Card>
  <Card className="space-y-4 p-5"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">2. Parametry nezávislé na PAPER účtu</h2><div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy} onClick={()=>change({...settings})}>Převzít aktuální nastavení</Button><Button variant="outline" disabled={busy} onClick={()=>change({...defaults})}>Experimentální výchozí</Button></div></div>
   <fieldset disabled={busy||loading} className="min-w-0"><SettingsFields value={draft} onChange={change}/></fieldset>
   <p className="text-xs text-muted-foreground">Risk lock z živého PAPER panelu není v historickém modelu simulován. Časový limit 0 znamená uzavření do konce stejné seance. −1 znamená neomezené držení. Jeden nový vstup denně.</p>
  </Card>
  <Card className="space-y-4 p-5"><h2 className="font-semibold">3. Výpočet a chronologický out-of-sample test</h2><div className="flex flex-wrap items-end gap-3"><label className="text-sm">První den testu (před ním trénink)<Input type="date" disabled={busy} value={splitDate} onChange={e=>{setCut(e.target.value);clear();}}/></label><p className="text-sm text-muted-foreground">{split} tréninkových / {days.length-split} testovacích seancí</p></div>
   <div className="flex flex-wrap gap-2"><Button disabled={busy||loading||!days.length} onClick={()=>launch("run")}>Spustit pevnou strategii</Button><Button variant="outline" disabled={busy||loading||days.length<10} onClick={()=>launch("optimize")}>Optimalizovat 1 728 variant</Button>{busy&&<Button variant="destructive" onClick={cancel}>Ukončit výpočet</Button>}</div>
   {busy&&<p role="status" className="text-sm">Počítám lokálně ve Web Workeru…</p>}{error&&<p role="alert" className="text-sm text-destructive">{error}</p>}{note&&<p role="status" className="text-sm text-muted-foreground">{note}</p>}
   <p className="text-xs text-muted-foreground">Optimalizace vybírá pouze na tréninku podle výsledku v Kč minus 0,5 × max. drawdown; vyžaduje nejméně pět vstupů. Parametry jsou potom jednou aplikovány na pozdější testovací období se stejným výchozím kapitálem. Opakované ladění podle testu jeho nezávislost ruší.</p><p className="rounded-md border border-warning/40 bg-warning/5 p-3 text-sm text-warning">Výběr z 1 728 variant může zachytit náhodu. Pět vstupů je technické minimum výpočtu, nikoli důkaz obchodní výhody. Zvlášť krátké období a malý počet obchodů nestačí pro spolehlivý odhad; vybranou strategii sleduj na dalších datech bez úprav pravidel.</p>
  </Card>
  {result&&<ResultPanel result={result} title={"Pevná strategie · "+range}/>}
  {opt&&<>
   <Card className="space-y-4 p-5"><h2 className="text-xl font-semibold">Výběr strategie na tréninku</h2><p className="text-sm text-muted-foreground">{opt.count} variant · trénink {opt.trainStart} – {opt.trainEnd} · test {opt.testStart} – {opt.testEnd}. Tento výpočet vybírá variantu pouze na tréninku; opakované ladění podle testu z něj ale dělá součást výběru.</p>
    <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="text-left text-muted-foreground"><tr><th>Parametry</th><th>Vstupy</th><th>P/L</th><th>Drawdown</th><th>Skóre</th></tr></thead><tbody>{opt.rank.map((x,i)=><tr key={i} className="border-t border-border"><td className="py-2">{desc(x.settings)}</td><td>{x.entries}</td><td className={moneyClass(x.totalCzk)}>{czk(x.totalCzk)}</td><td>{czk(x.drawdownCzk)}</td><td>{czk(x.score)}</td></tr>)}</tbody></table></div>
    <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={()=>{setDraft({...opt.train.settings});setNote("Vítězné tréninkové parametry načteny do formuláře; další výpočet bude nový experiment.");}}>Načíst parametry do formuláře</Button><Button variant="outline" disabled={!hydrated} onClick={()=>{if(window.confirm("Převzít vybrané parametry do PAPER nastavení? Nejde o doporučení k reálnému obchodu.")){saveSettings({...opt.train.settings});setNote("Parametry uloženy do PAPER nastavení. U otevřených obchodů zůstává původní cíl a stop.");}}}>Uložit do PAPER nastavení</Button></div>
   </Card>
   <Card className="space-y-3 p-5"><h2 className="font-semibold">Srovnání na stejném pozdějším období</h2><div className="grid gap-3 sm:grid-cols-2"><Stat name="Vybraná strategie · test" value={czk(opt.test.totalCzk)} sub={pct(opt.test.returnPct)+" · DD "+czk(opt.test.maxDrawdownCzk)}/><Stat name="Původní pevná pravidla · test" value={czk(opt.baselineTest.totalCzk)} sub={pct(opt.baselineTest.returnPct)+" · DD "+czk(opt.baselineTest.maxDrawdownCzk)}/></div><p className="text-xs text-muted-foreground">Trénink: {czk(opt.train.totalCzk)}. Celé období od čistého startu: {czk(opt.full.totalCzk)}; obsahuje trénink, nejde o nezávislý výsledek ani nutně o součet obou oddělených testů.</p></Card>
   <ResultPanel title={"Out-of-sample · "+opt.testStart+" – "+opt.testEnd} result={opt.test}/><ResultPanel title="Trénink vybrané strategie" result={opt.train}/><ResultPanel title="Celá historická řada (popisný výsledek)" result={opt.full}/>
  </>}
  <Card className="space-y-2 p-5 text-sm"><h2 className="font-semibold">Předpoklady a omezení</h2><p className="text-muted-foreground">Pouze úplné seance 09:30–16:00 ET; zkrácené seance a chybějící bary se vynechají. Pokud nejsou všechny obchodní dny přítomné, může být podhodnoceno riziko mezidenního držení. Při nákupu z limitu se model používá limit nebo lepší open; při stop gapu horší open. Při současném zásahu stopu a cíle v jedné svíčce má přednost stop. Ziskový cíl nelze uzavřít ve vstupní svíčce. Uvedené časy označují začátky svíček, ne přesný okamžik plnění; délka držení je tedy přibližná. Model neověřuje hloubku trhu, pořadí ticků, skutečné plnění ani spread; náklady jsou uživatelský odhad. Drawdown se měří na zavíracích cenách svíček, ne z jejich extrémů. Otevřené pozice jsou oceněny posledním close po předpokládaných likvidačních nákladech. Dlouhodobá pozice není v testu.</p><p className="text-muted-foreground">Skutečné exporty Trading 212 můžeš porovnat v <Link to="/historie" className="underline">Historii / importu</Link>.</p></Card>
 </div>;
}
