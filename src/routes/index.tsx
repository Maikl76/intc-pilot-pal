import { createFileRoute,Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { usePilot,usd,czk,pct,dateTime,getExit } from "@/lib/pilot-store";
import { ny,sessions } from "@/lib/pilot-engine.mjs";
import { useMemo } from "react";
import { LineChart,Line,XAxis,YAxis,Tooltip,ResponsiveContainer,ReferenceLine } from "recharts";
export const Route=createFileRoute("/")({component:Dashboard,head:()=>({meta:[{title:"Trading | INTC Pilot 2.0"}]})});
function Metric({label,value,detail}:{label:string;value:string;detail?:string|undefined}){return <Card className="space-y-1 p-4"><div className="text-xs text-muted-foreground">{label}</div><div className="num text-xl font-semibold">{value}</div>{detail&&<div className="text-xs text-muted-foreground">{detail}</div>}</Card>;}
function Dashboard(){
  const {settings:p,paper,core,quote,quoteLoading,entry,now,hydrated,storageError,buy,sell,toggleLock,markets}=usePilot();
  const market=ny(now),price=entry.fresh?quote?.price??null:null;
  const equity=price===null?(paper.positions.length?null:paper.cashUsd):paper.cashUsd+paper.positions.reduce((s,x)=>s+x.qty*(price-x.fee),0);
  const realized=paper.closed.reduce((s,x)=>s+x.pnlUsd,0);
  const lastSession=useMemo(()=>{const m=markets[0];return m?sessions(m.data).days.at(-1):undefined;},[markets]);
  const curve=lastSession?.bars.map(b=>({time:String(Math.floor(b.minute/60)).padStart(2,"0")+":"+String(b.minute%60).padStart(2,"0"),price:b.c}))??[];
  return <div className="mx-auto max-w-7xl space-y-5 px-4 py-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-semibold">Intel — intradenní obchodování</h1><p className="text-sm text-muted-foreground">Rozhodovací podpora · simulované obchody · New York {market.date} {String(Math.floor(market.minute/60)).padStart(2,"0")}:{String(market.minute%60).padStart(2,"0")}</p></div><Badge variant="outline">Žádné reálné pokyny</Badge></div>
    {storageError&&<Card className="border-destructive p-3 text-sm">Lokální uložení selhalo. Historie PAPER se může po obnovení ztratit.</Card>}
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Metric label="Dlouhodobá pozice · oddělená" value={core.qty>0&&price!==null?czk(core.qty*price*p.fx):czk(p.coreBudgetCzk)} detail={core.qty>0?core.qty.toFixed(4)+" ks · nákup "+usd(core.avg)+(price===null?" · zobrazena plánovaná hodnota":""):"Plánovaný rozpočet; zadej skutečný počet v Nastavení."}/>
      <Metric label="PAPER obchodní kapitál" value={czk(p.capitalCzk)} detail={"Rezerva "+czk(p.reserveCzk)+" · max. "+p.maxSlots+" pozice"}/>
      <Metric label="Volná PAPER hotovost" value={usd(paper.cashUsd)} detail={czk(paper.cashUsd*p.fx)+" při modelovém kurzu"}/>
      <Metric label="Realizovaný PAPER výsledek" value={usd(realized)} detail={czk(realized*p.fx)+" · "+paper.closed.length+" uzavřených obchodů"}/>
    </div>
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="space-y-4 p-5 lg:col-span-2">
        <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-xs text-muted-foreground">INTC · {quote?.source??"Finnhub"}</p><div className="num text-3xl font-semibold">{price!==null?usd(price):"—"}</div></div><Badge variant={entry.ready?"default":"secondary"}>{entry.ready?"NÁKUPNÍ ZÓNA":"VYČKAT"}</Badge></div>
        <p className="text-sm text-muted-foreground">{quoteLoading?"Načítám kotaci…":quote?.message??"Čekám na zdroj."}{quote?.timestamp!=null?" Poslední tržní čas: "+dateTime(quote.timestamp):""}</p>
        <div className="grid gap-3 sm:grid-cols-3"><Metric label="Otevírací cena" value={entry.fresh&&quote?.open!=null?usd(quote.open):"—"} detail={entry.fresh&&entry.gap!==null?"Gap "+pct(entry.gap):undefined}/><Metric label="Nákupní úroveň" value={entry.fresh&&entry.limit!==null?usd(entry.limit):"—"}/><Metric label="Cíl po nákupu" value={"+"+usd(p.targetUsd)} detail={p.stopUsd>0?"Stop −"+usd(p.stopUsd):"Stop vypnut"}/></div>
        <div className="space-y-1"><h3 className="text-sm font-semibold">Poslední importovaná úplná seance (není živý graf)</h3>
          {lastSession?<><p className="text-xs text-muted-foreground">{lastSession.date} · ET · uzavírací ceny svíček</p><div className="h-56"><ResponsiveContainer width="100%" height="100%"><LineChart data={curve}><XAxis dataKey="time" minTickGap={35}/><YAxis domain={["auto","auto"]} width={50}/><Tooltip/><ReferenceLine y={lastSession.open} stroke="#64748b" strokeDasharray="4 4"/><Line dataKey="price" name="Cena USD" type="linear" stroke="#34d399" dot={false} isAnimationActive={false}/></LineChart></ResponsiveContainer></div></>:<p className="text-sm text-muted-foreground">Nahraj 1min/5min CSV nebo ZIP v <Link to="/backtest" className="underline">Backtestu</Link>.</p>}
        </div>
      </Card>
      <Card className="space-y-4 p-5"><h2 className="font-semibold">PAPER obchodní příkaz</h2><div className="space-y-2 text-sm">
        <div className="flex justify-between"><span>Počet akcií</span><strong>{entry.qty}</strong></div><div className="flex justify-between"><span>Max. tranše</span><strong>{czk(p.slotCzk)}</strong></div><div className="flex justify-between"><span>Cílový prodej</span><strong>{price!==null?usd(price+p.targetUsd):"—"}</strong></div><div className="flex justify-between"><span>Stop-loss</span><strong>{price!==null&&p.stopUsd>0?usd(price-p.stopUsd):"—"}</strong></div><div className="flex justify-between"><span>Modelový čistý cíl</span><strong className="text-success">{usd(entry.qty*(p.targetUsd-2*p.fee))}</strong></div><div className="flex justify-between"><span>Ztráta na stopu (bez gapu)</span><strong className="text-destructive">{p.stopUsd>0?usd(-entry.qty*(p.stopUsd+2*p.fee)):"Neomezena stopem"}</strong></div>
      </div><Button className="w-full" disabled={!hydrated||!entry.ready} onClick={buy}>Simulovat nákup</Button><p className="text-xs text-muted-foreground">Simulace za poslední dostupnou cenu, nikoli garantované plnění limitního pokynu. Každý nákup a prodej vyžaduje kliknutí.</p>
      {entry.reasons.length>0&&<ul className="space-y-1 text-xs text-muted-foreground">{entry.reasons.map(s=><li key={s}>• {s}</li>)}</ul>}
      </Card>
    </div>
    <div className="grid gap-3 sm:grid-cols-3"><Metric label="PAPER equity" value={equity===null?"—":czk(equity*p.fx)} detail="Při čerstvé kotaci včetně likvidačních nákladů."/><Metric label="PAPER drawdown" value={equity===null?"—":czk(Math.max(0,paper.peakUsd-equity)*p.fx)} detail={"Limit "+czk(p.drawdownLimitCzk)}/><Metric label="Vázaný obchodní kapitál" value={czk(entry.committedUsd*p.fx)} detail={paper.positions.length+" otevřených obchodů"}/></div>
    <Card className="space-y-4 p-5"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">Otevřené krátkodobé PAPER pozice</h2><Button variant="outline" disabled={!hydrated} onClick={toggleLock}>{paper.locked?"Odemknout nákupy":"Pozastavit nákupy"}</Button></div>
      {paper.positions.length===0?<p className="text-sm text-muted-foreground">Žádné otevřené PAPER pozice.</p>:<div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left text-muted-foreground"><th>Datum</th><th>Ks</th><th>Nákup</th><th>Cíl / stop</th><th>P/L</th><th>Signál</th><th></th></tr></thead><tbody>{paper.positions.map(pos=><tr key={pos.id} className="border-t border-border"><td className="py-3">{dateTime(pos.at)}</td><td>{pos.qty}</td><td>{usd(pos.price)}</td><td>{usd(pos.target)} / {pos.stop===null?"—":usd(pos.stop)}</td><td>{price===null?"—":usd(pos.qty*(price-pos.price-2*pos.fee))}</td><td>{price===null?"BEZ DAT":getExit(pos,price,now)}</td><td><Button variant="outline" size="sm" disabled={!entry.fresh} onClick={()=>{if(window.confirm("Simulovat uzavření pouze této krátkodobé PAPER pozice?"))sell(pos.id);}}>Simulovat prodej</Button></td></tr>)}</tbody></table></div>}
      <p className="text-xs text-muted-foreground">Risk lock blokuje nové nákupy, nikoli bezpečné uzavření. Stop a časový výstup jsou signály pro ruční potvrzení; aplikace nesleduje trh, když je zavřená, a stop nezaručuje realizační cenu.</p>
    </Card>
  </div>;
}
