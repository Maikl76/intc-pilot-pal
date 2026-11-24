import { useEffect,useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { defaults,validate,type Settings } from "@/lib/pilot-engine.mjs";
import { czk,usePilot } from "@/lib/pilot-store";

export function SettingsFields({value,onChange}:{value:Settings;onChange:(p:Settings)=>void}){
  type NumKey=Exclude<keyof Settings,"signal">;
  const field=(key:NumKey,label:string,step=1,min=0,max?:number)=><label className="space-y-1 text-sm" key={key}><span className="text-muted-foreground">{label}</span><Input type="number" min={min} max={max} step={step} value={value[key]} onChange={e=>onChange({...value,[key]:Number(e.target.value)})}/></label>;
  return <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
    {field("capitalCzk","Obchodní kapitál (Kč)",1000,1000)}
    {field("slotCzk","Max. kapitál na nákup (Kč)",1000,1000)}
    {field("reserveCzk","Hotovostní rezerva (Kč)",1000)}
    {field("fx","Modelový kurz USD/CZK",.01,.01)}
    {field("maxSlots","Max. otevřené pozice",1,1,10)}
    <label className="space-y-1 text-sm"><span className="text-muted-foreground">Nákupní signál</span><select className="h-9 w-full rounded-md border border-input bg-background px-2" value={value.signal} onChange={e=>onChange({...value,signal:e.target.value as Settings["signal"]})}><option value="dip1">Pokles v USD</option><option value="dip2">Pokles o 2 USD</option><option value="open">Otevření seance</option><option value="dipPct">Procentuální pokles</option><option value="rebound">Pokles + odraz (jen backtest)</option></select></label>
    {field("dipUsd","Vstupní pokles (USD)",.05,.01)}
    {field("dipPct","Vstupní pokles (%)",.1,.1,99)}
    {field("reboundUsd","Potvrzení odrazu (USD)",.05,.01)}
    {field("targetUsd","Take-profit (USD na akcii)",.05,.01)}
    {field("stopUsd","Stop-loss (USD; 0 = vypnuto)",.05)}
    {field("holdDays","Max. další seance (−1 = čekat)",1,-1)}
    {field("gapPct","Filtr záporného gapu (%; 0 = vypnut)",.5)}
    <label className="space-y-1 text-sm"><span className="text-muted-foreground">Konec nákupního okna (New York)</span><Input type="time" min="09:30" max="15:55" step={300} value={String(Math.floor(value.windowMinute/60)).padStart(2,"0")+":"+String(value.windowMinute%60).padStart(2,"0")} onChange={e=>{const [h,m]=e.target.value.split(":").map(Number);if(h!==undefined&&m!==undefined&&Number.isFinite(h+m))onChange({...value,windowMinute:h*60+m});}}/></label>
    {field("fee","Náklady na akcii za jednu stranu (USD)",.01)}
    {field("drawdownLimitCzk","PAPER risk lock při drawdownu (Kč)",100,100)}
  </div>;
}
export function PilotSettings(){
  const {settings,saveSettings,core,saveCore,resetPaper,hydrated,paper}=usePilot();
  const [draft,setDraft]=useState(settings),[qty,setQty]=useState(core.qty),[avg,setAvg]=useState(core.avg),[message,setMessage]=useState("");
  useEffect(()=>{setDraft(settings);setQty(core.qty);setAvg(core.avg);},[settings,core]);
  function save(){try{validate(draft);if(!Number.isFinite(qty)||!Number.isFinite(avg)||qty<0||avg<0||(qty>0&&avg===0))throw new Error("Zkontroluj dlouhodobou pozici.");saveSettings(draft);saveCore(qty,avg);setMessage("Nastavení uloženo. Otevřené PAPER obchody zachovaly své původní cíle a stopy.");}catch(e){setMessage(e instanceof Error?e.message:String(e));}}
  return <div className="mx-auto max-w-6xl space-y-5 px-4 py-6"><h1 className="text-2xl font-semibold">Nastavení INTC Pilot 2.0</h1>
    <Card className="space-y-4 p-5"><h2 className="font-semibold">Chráněná dlouhodobá pozice (pouze evidence)</h2><p className="text-sm text-muted-foreground">Není součástí simulovaného obchodního účtu a žádný prodejní signál ji neovlivňuje. Zadej skutečný počet a průměr podle Trading 212; výchozí nula není odhad tvého účtu.</p>
      <div className="grid gap-4 sm:grid-cols-3"><label className="text-sm">Rozpočet (Kč)<Input type="number" min={0} step={1000} value={draft.coreBudgetCzk} onChange={e=>setDraft({...draft,coreBudgetCzk:Number(e.target.value)})}/></label><label className="text-sm">Počet akcií<Input type="number" min={0} step="any" value={qty} onChange={e=>setQty(Number(e.target.value))}/></label><label className="text-sm">Průměrný nákup (USD)<Input type="number" min={0} step=".01" value={avg} onChange={e=>setAvg(Number(e.target.value))}/></label></div></Card>
    <Card className="space-y-4 p-5"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">Intradenní pravidla</h2><Button variant="outline" onClick={()=>setDraft({...defaults})}>Výchozí experimentální parametry</Button></div><SettingsFields value={draft} onChange={setDraft}/><p className="text-xs text-muted-foreground">PAPER sleduje kotace, backtest pracuje s OHLC svíčkami. U PAPER je omezení na jeden nákup denně; vícedenní pevný limit a odraz jsou dostupné jen v backtestu. Risk lock v PAPER není součástí historické optimalizace.</p><Button disabled={!hydrated} onClick={save}>Uložit nastavení</Button><p role="status" className="text-sm text-muted-foreground">{message}</p></Card>
    <Card className="space-y-3 p-5"><h2 className="font-semibold">Oddělený PAPER účet</h2><p className="text-sm">Počáteční kapitál současného PAPER účtu: {czk(paper.startingUsd*settings.fx)} při zadaném kurzu. Změna rozpočtu nebo kurzu sama nepřidává hotovost. Nový účet vznikne pouze ručním resetem.</p><Button variant="outline" disabled={!hydrated} onClick={()=>{if(window.confirm("Smazat všechny PAPER pozice a historii a zahájit nový simulovaný účet? Skutečné portfolio se nezmění."))resetPaper();}}>Reset pouze PAPER účtu</Button></Card>
    <Card className="space-y-2 p-5"><h2 className="font-semibold">Datový zdroj a bezpečnost</h2><p className="text-sm text-muted-foreground">Pro kotace nastav na serveru MARKET_DATA_API_KEY (Finnhub). Nikdy klíč nevkládej do veřejného GitHubu. Aplikace v této větvi neposílá žádné broker objednávky. Importy CSV/ZIP se zpracovávají pouze v prohlížeči; po obnově stránky je načti znovu.</p></Card>
  </div>;
}
