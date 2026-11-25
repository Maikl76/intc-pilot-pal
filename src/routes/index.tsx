import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertCircle,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  Clock3,
  FlaskConical,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { TradeChart } from "@/components/TradeChart";
import {
  usePilot,
  usd,
  czk,
  pct,
  dateTime,
  getExit,
  type ActionResult,
  type PaperMode,
} from "@/lib/pilot-store";
import { ny, sessions } from "@/lib/pilot-engine.mjs";
import { ageMinutes, marketPhase, marketCalendar } from "@/lib/pilot-quotes.mjs";
import { paperSummary } from "@/lib/pilot-paper.mjs";

export const Route = createFileRoute("/")({
  component: Dashboard,
  head: () => ({ meta: [{ title: "Obchodní přehled | Intel Pilot" }] }),
});
const sessionLabel = {
  PRE: "Před otevřením",
  REGULAR: "Hlavní seance",
  POST: "Po uzavření",
  OVERNIGHT: "Noční obchodování · ATS",
  CLOSED: "Trh je zavřený",
};
const signalLabel: Record<string, string> = {
  STOP: "Stop dosažen",
  TARGET: "Cíl dosažen",
  TIME: "Časový limit",
  HOLD: "Bez výstupního signálu",
};
const notify = (result: ActionResult) =>
  result.ok ? toast.success(result.message) : toast.error(result.message);
function Metric({
  label,
  value,
  detail,
  tone = "",
}: {
  label: string;
  value: string;
  detail: string;
  tone?: string;
}) {
  return (
    <div className="surface p-4 sm:p-5">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={"num mt-2 text-xl font-semibold lg:text-2xl " + tone}>{value}</p>
      <p className="mt-2 text-sm text-muted-foreground">{detail}</p>
    </div>
  );
}

function Dashboard() {
  const pilot = usePilot();
  const {
    settings: p,
    paper,
    core,
    quote,
    executionQuote,
    quoteLoading,
    entry,
    now,
    hydrated,
    storageError,
    persistenceWarning,
    buy,
    sell,
    toggleLock,
    markets,
    refreshQuote,
    mode,
    setMode,
    scenarioPrice,
    setScenarioPrice,
  } = pilot;
  const [quantity, setQuantity] = useState(""),
    [strict, setStrict] = useState(false),
    [scenarioInput, setScenarioInput] = useState("57");
  const [sellingId, setSellingId] = useState<string | null>(null),
    [sellQuantity, setSellQuantity] = useState("");
  useEffect(() => {
    if (mode === "scenario") setStrict(false);
  }, [mode]);
  useEffect(() => {
    setScenarioInput(scenarioPrice == null ? "" : String(scenarioPrice));
  }, [scenarioPrice]);
  const clock = ny(now),
    marketPrice = quote?.status === "OK" ? quote.price : null;
  const price = executionQuote?.status === "OK" ? executionQuote.price : null;
  const age = ageMinutes(quote, now),
    qty = quantity === "" ? entry.qty : Number(quantity);
  const validQty = Number.isInteger(qty) && qty > 0 && qty <= entry.qty;
  const canBuy = hydrated && validQty && (strict ? entry.ready : entry.manualReady);
  const summary = price == null ? null : paperSummary(paper, price);
  const realized = paper.closed.reduce((s, x) => s + x.pnlUsd, 0);
  const previousClose = quote?.previousClose;
  const change =
    marketPrice != null && previousClose != null && previousClose > 0
      ? marketPrice - previousClose
      : null;
  const changePct = change != null && previousClose ? (change / previousClose) * 100 : null;
  const calendar = marketCalendar(now);
  const phase=marketPhase(now);
  const missingNight=phase==="OVERNIGHT" && quote?.session!=="OVERNIGHT";
  const staleQuote=age!==null && (age>20 || quote?.session!==phase);
  const lastSession = useMemo(() => {
    const market = markets[0];
    return market ? sessions(market.data).days.at(-1) : undefined;
  }, [markets]);
  const importedPoints = lastSession?.bars.map((b) => ({ timestamp: b.ts, price: b.c })) ?? [];
  const providerPoints = quote?.points ?? [],
    chartPoints = providerPoints.length ? providerPoints : importedPoints;
  const chartDate = chartPoints.length
    ? new Date(chartPoints[0]!.timestamp).toLocaleDateString("cs-CZ", {
        timeZone: "Europe/Prague",
      })
    : undefined;
  const selected = paper.positions.find((x) => x.id === sellingId),
    sellQty = Number(sellQuantity);
  const validSell = selected && Number.isInteger(sellQty) && sellQty > 0 && sellQty <= selected.qty;
  const accountName = mode === "scenario" ? "Vlastní scénář" : "Tržní cvičení";
  function switchMode(next: PaperMode) {
    const result = setMode(next);
    if (result.ok) {
      setStrict(false);
      setQuantity("");
      setSellingId(null);
    } else notify(result);
  }
  function applyPrice(value: number | null) {
    const result = setScenarioPrice(value);
    if (!result.ok) notify(result);
  }

  return (
    <div className="page-wrap space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="eyebrow">TVŮJ OBCHODNÍ PROSTOR</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
            Méně dojmů. Více přehledu.
          </h1>
          <p className="mt-3 max-w-2xl text-muted-foreground">
            Intel, tvůj plán a riziko na jednom místě. Každý cvičný obchod má dohledatelnou cenu a
            výsledek.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm text-muted-foreground">
          <Clock3 className="size-4" />
          <span>
            New York{" "}
            <span className="num text-foreground">
              {hydrated
                ? String(Math.floor(clock.minute / 60)).padStart(2, "0") +
                  ":" +
                  String(clock.minute % 60).padStart(2, "0")
                : "—"}
            </span>
          </span>
        </div>
      </div>
      {persistenceWarning || storageError ? (
        <div
          role="alert"
          className="flex gap-3 rounded-xl border border-warning/40 bg-warning/5 p-4 text-sm"
        >
          <AlertCircle className="size-5 shrink-0 text-warning" />
          <p>
            {persistenceWarning ?? "Uložení v prohlížeči selhalo. Před zavřením stáhni zálohu."}{" "}
            <Link to="/nastaveni" className="text-primary underline">
              Záloha a nastavení
            </Link>
          </p>
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card className="min-w-0 space-y-6 rounded-2xl p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex gap-3">
              <div className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-lg font-semibold text-primary">
                i
              </div>
              <div>
                <h2 className="text-lg font-semibold">Intel Corporation</h2>
                <p className="mt-0.5 text-sm text-muted-foreground">NASDAQ: INTC · USD</p>
              </div>
            </div>
            <Badge variant="outline" className="gap-2 py-1.5">
              <Clock3 className="size-3.5" />
              {hydrated ? sessionLabel[phase] : "Načítám seanci"}
            </Badge>
          </div>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="num text-4xl font-semibold tracking-tight sm:text-5xl">
                {marketPrice != null ? usd(marketPrice) : "—"}
              </p>
              {change != null && changePct != null ? (
                <p
                  className={
                    "num mt-3 text-base " + (change >= 0 ? "text-success" : "text-destructive")
                  }
                >
                  {change >= 0 ? "+" : ""}
                  {usd(change)}{" "}
                  <span className="ml-2">
                    ({changePct >= 0 ? "+" : ""}
                    {pct(changePct)})
                  </span>
                  <span className="ml-2 font-sans text-sm text-muted-foreground">
                    proti předchozímu závěru
                  </span>
                </p>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">
                  {marketPrice!=null ? "Změna proti předchozímu závěru není ověřená." : quoteLoading ? "Připojuji zdroj cen…" : "Tržní cena není dostupná."}
                </p>
              )}
            </div>
            <Button variant="outline" size="sm" onClick={refreshQuote} disabled={quoteLoading}>
              <RefreshCw className={"size-4 " + (quoteLoading ? "animate-spin" : "")} />
              Obnovit cenu
            </Button>
          </div>
          <div
            className={
              "flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border px-4 py-3 text-sm " +
              (quote?.conflict
                ? "border-destructive/40 bg-destructive/5"
                : "border-border bg-background/30")
            }
          >
            <span className="font-medium">{quote?.source ?? "Datový zdroj"}</span>
            <span className="text-muted-foreground">
              {quote?.timestamp != null
                ? dateTime(quote.timestamp) + " · Praha"
                : "Čas kotace chybí"}
            </span>
            <Badge variant="secondary">
              {age == null
                ? "Bez kotace"
                : age < 2
                  ? "Stáří " + Math.floor(age * 60) + " s"
                  : "Stáří " + Math.floor(age) + " min"}
            </Badge>
            {quote?.cached ? <span className="text-warning">Uchovaná starší odpověď</span> : null}
            {staleQuote ? <span className="text-warning font-medium">Poslední dostupná cena · nikoli aktuální seance</span> : null}
            {quote?.expectedDelayMinutes!=null?<span className="text-warning">Zpoždění zdroje cca {quote.expectedDelayMinutes} min</span>:null}
          </div>
          {missingNight?<div role="status" className="rounded-xl border border-warning/40 bg-warning/5 p-4 text-sm">Probíhá noční obchodování (Blue Ocean ATS). Zobrazená cena není z této seance. TradingView může mít novější data; pro synchronizovanou noční kotaci připoj Alpaca v serverovém nastavení. Do té doby lze použít oddělený Vlastní scénář.</div>:null}
          <TradeChart
            points={chartPoints}
            reference={providerPoints.length ? (quote?.open ?? null) : null}
            source={
              providerPoints.length
                ? (quote?.chartSource ?? quote?.source ?? "poskytovatel")
                : "importovaná historie"
            }
            date={chartDate}
            synchronized={providerPoints.length>0}
          />
          <div className="grid grid-cols-2 gap-4 border-t border-border pt-5 sm:grid-cols-4">
            {[
              { label: "Otevření hlavní seance", value: quote?.open },
              { label: "Předchozí závěr", value: quote?.previousClose },
              { label: "Denní maximum · regular", value: quote?.dayHigh },
              { label: "Denní minimum · regular", value: quote?.dayLow },
            ].map((item) => (
              <div key={item.label}>
                <p className="text-xs text-muted-foreground">{item.label}</p>
                <p className="num mt-1 text-sm font-medium">
                  {item.value == null ? "—" : usd(item.value)}
                </p>
              </div>
            ))}
          </div>
          <details className="text-sm">
            <summary className="flex cursor-pointer items-center gap-2 text-muted-foreground">
              <ChevronDown className="size-4" />
              Původ a dostupnost dat
            </summary>
            <div className="mt-3 space-y-3 rounded-xl bg-background/40 p-4">
              <p>{quote?.message ?? "První odpověď datového zdroje zatím nedorazila."}</p>
              {quote?.diagnostics?.map((d) => (
                <div
                  key={d.source}
                  className="flex flex-wrap justify-between gap-1 border-t border-border pt-2"
                >
                  <span className="font-medium">{d.source}</span>
                  <span className="text-muted-foreground">{d.message}</span>
                </div>
              ))}
              <p className="text-muted-foreground">
                Zdroj může mít zpoždění. Minutová svíčka ani poslední obchod nejsou aktuální
                nabídkou brokera. Kalendář nezachytí mimořádné přerušení obchodování.
              </p>
              {calendar.closed ? (
                <p className="text-warning">Podle kalendáře je dnes burza zavřená.</p>
              ) : calendar.closeMinute === 780 ? (
                <p className="text-warning">Zkrácená seance: hlavní trh končí ve 13:00 New York.</p>
              ) : null}
            </div>
          </details>
        </Card>

        <Card className="self-start overflow-hidden rounded-2xl xl:sticky xl:top-36">
          <div className="border-b border-border bg-primary/5 p-5">
            <div className="flex items-center gap-2">
              <FlaskConical className="size-5 text-primary" />
              <h2 className="text-lg font-semibold">Cvičný obchod</h2>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Virtuální kapitál. Skutečné peníze se nepohybují.
            </p>
          </div>
          <div className="space-y-5 p-5">
            <div className="grid grid-cols-2 rounded-xl border border-border bg-background/50 p-1">
              <button
                onClick={() => switchMode("market")}
                disabled={!hydrated}
                aria-pressed={mode === "market"}
                className={
                  "rounded-lg px-2 py-2.5 text-sm font-medium transition " +
                  (mode === "market" ? "bg-secondary text-foreground" : "text-muted-foreground")
                }
              >
                Tržní cvičení
              </button>
              <button
                onClick={() => switchMode("scenario")}
                disabled={!hydrated}
                aria-pressed={mode === "scenario"}
                className={
                  "rounded-lg px-2 py-2.5 text-sm font-medium transition " +
                  (mode === "scenario" ? "bg-warning/15 text-warning" : "text-muted-foreground")
                }
              >
                Vlastní scénář
              </button>
            </div>
            {mode === "scenario" ? (
              <div className="space-y-3 rounded-xl border border-warning/30 bg-warning/5 p-4">
                <p className="text-sm font-medium text-warning">Fiktivní cena · samostatný účet</p>
                <label>
                  <span className="field-label">Nastav cenu scénáře (USD)</span>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      step=".01"
                      min=".01"
                      value={scenarioInput}
                      onChange={(e) => setScenarioInput(e.target.value)}
                    />
                    <Button
                      variant="outline"
                      onClick={() =>
                        applyPrice(scenarioInput === "" ? null : Number(scenarioInput))
                      }
                    >
                      Použít
                    </Button>
                  </div>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={scenarioPrice == null || scenarioPrice <= 1}
                    onClick={() => applyPrice((scenarioPrice ?? 0) - 1)}
                  >
                    Cena −1 USD
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={scenarioPrice == null}
                    onClick={() => applyPrice((scenarioPrice ?? 0) + 1)}
                  >
                    Cena +1 USD
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Měníš jen tento scénář. Tržní graf a dlouhodobá pozice dál používají skutečný
                  zdroj.
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Simulované plnění podle poslední použitelné kotace. Každý obchod potvrdíš ručně.
              </p>
            )}
            <div className="flex justify-between gap-2 text-sm">
              <span className="text-muted-foreground">Cena pro tento obchod</span>
              <strong className="num">{price == null ? "—" : usd(price)}</strong>
            </div>
            <label className="block">
              <span className="field-label">Počet akcií</span>
              <Input
                className="h-12 text-lg"
                type="number"
                min="1"
                step="1"
                value={quantity === "" ? entry.qty || "" : quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="Počet"
              />
              <span className="mt-2 block text-xs text-muted-foreground">
                Do limitů se vejde nejvýše {entry.qty} ks · tranše {czk(p.slotCzk)}
              </span>
            </label>
            <div className="space-y-3 rounded-xl bg-background/40 p-4 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Potřebná hotovost</span>
                <span className="num">
                  {price != null && validQty ? usd(qty * (price + p.fee)) : "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  Cíl +{p.targetUsd.toLocaleString("cs-CZ")} USD
                </span>
                <span className="num text-success">
                  {price == null ? "—" : usd(price + p.targetUsd)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Výsledek při dosažení cíle</span>
                <strong
                  className={p.targetUsd >= 2 * p.fee ? "num text-success" : "num text-destructive"}
                >
                  {validQty ? usd(qty * (p.targetUsd - 2 * p.fee)) : "—"}
                </strong>
              </div>
              <div className="flex justify-between border-t border-border pt-3">
                <span className="text-muted-foreground">Ztráta na stopu, bez gapu</span>
                <span className="num text-destructive">
                  {p.stopUsd > 0
                    ? validQty
                      ? usd(-qty * (p.stopUsd + 2 * p.fee))
                      : "—"
                    : "Stop vypnut"}
                </span>
              </div>
            </div>
            {mode === "market" ? (
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1 accent-cyan-400"
                  checked={strict}
                  onChange={(e) => setStrict(e.target.checked)}
                />
                <span>
                  Vyžadovat splnění mé strategie
                  <span className="mt-1 block text-xs text-muted-foreground">
                    Čerstvá cena, nákupní okno, gap a jeden vstup za den.
                  </span>
                </span>
              </label>
            ) : null}
            <Button
              className="h-12 w-full text-base"
              disabled={!canBuy}
              onClick={() => {
                const result = buy(qty, strict);
                notify(result);
                if (result.ok) setQuantity("");
              }}
            >
              {mode === "scenario" ? "Cvičně nakoupit ve scénáři" : "Cvičně nakoupit INTC"}
            </Button>
            {!validQty && quantity !== "" ? (
              <p role="alert" className="text-sm text-warning">
                Zadej celý počet od 1 do {entry.qty}. Velikost tranše lze změnit v Nastavení.
              </p>
            ) : null}
            {(strict ? entry.reasons : entry.manualReasons).length ? (
              <div className="space-y-2 text-sm text-muted-foreground">
                {(strict ? entry.reasons : entry.manualReasons).map((reason) => (
                  <p key={reason} className="flex gap-2">
                    <AlertCircle className="mt-0.5 size-4 shrink-0" />
                    {reason}
                  </p>
                ))}
              </div>
            ) : (
              <p className="flex items-center gap-2 text-sm text-primary">
                <CheckCircle2 className="size-4" />
                {strict ? "Nastavené podmínky jsou splněné." : "Cvičný nákup se vejde do limitů."}
              </p>
            )}
            <Link
              to="/riziko"
              className="block border-t border-border pt-4 text-center text-sm text-primary"
            >
              Přepočítat riziko a úspěšnost
            </Link>
          </div>
        </Card>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-xl font-semibold">
          <Wallet className="size-5 text-primary" />
          {accountName}{" "}
          <span className="text-sm font-normal text-muted-foreground">· stav účtu</span>
        </h2>
        <span
          className={
            "rounded-full px-3 py-1 text-sm " +
            (mode === "scenario" ? "bg-warning/10 text-warning" : "bg-primary/10 text-primary")
          }
        >
          {mode === "scenario" ? "Fiktivní ceny, oddělené výsledky" : "Dostupné tržní kotace"}
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          label="Hodnota cvičného účtu"
          value={
            summary ? usd(summary.equityUsd) : paper.positions.length ? "—" : usd(paper.cashUsd)
          }
          detail={"Počáteční kapitál " + usd(paper.startingUsd)}
        />
        <Metric
          label="Volná hotovost"
          value={usd(paper.cashUsd)}
          detail={"Chráněná rezerva " + czk(p.reserveCzk)}
        />
        <Metric
          label="Uzavřený výsledek"
          value={usd(realized)}
          detail={paper.closed.length + " prodejů · včetně modelových nákladů"}
          tone={realized >= 0 ? "text-success" : "text-destructive"}
        />
        <Metric
          label="Otevřený výsledek"
          value={summary ? usd(summary.unrealizedUsd) : "—"}
          detail={paper.positions.length + " otevřených pozic · ocenění poslední dostupnou cenou"}
          tone={summary && summary.unrealizedUsd < 0 ? "text-destructive" : ""}
        />
      </div>

      <Card className="space-y-5 rounded-2xl p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">Otevřené cvičné pozice</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Cíl a stop jsou upozornění. Prodej provedeš kliknutím; při zavřené aplikaci nic
              automaticky neprobíhá.
            </p>
          </div>
          <Button
            variant="outline"
            disabled={!hydrated}
            onClick={() => {
              if (
                !paper.locked ||
                window.confirm(
                  "Obnovit nákupy a začít sledovat nový ochranný limit od současné hodnoty účtu? Historické ztráty a maximální propad zůstanou v evidenci.",
                )
              )
                notify(toggleLock());
            }}
          >
            <LockKeyhole className="size-4" />
            {paper.locked ? "Obnovit nákupy" : "Pozastavit nákupy"}
          </Button>
        </div>
        {paper.locked ? (
          <p
            role="status"
            className="rounded-xl border border-warning/40 bg-warning/5 p-4 text-sm text-warning"
          >
            Nákupy jsou pozastavené
            {paper.lockReason === "DRAWDOWN" ? " po dosažení limitu propadu" : " ručně"}. Otevřené
            pozice můžeš dále prodávat.
          </p>
        ) : null}
        {paper.positions.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[730px] text-left text-sm">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="pb-3">Nákup</th>
                  <th className="pb-3">Počet</th>
                  <th className="pb-3">Cena</th>
                  <th className="pb-3">Cíl / stop</th>
                  <th className="pb-3">Čisté P/L</th>
                  <th className="pb-3">Stav</th>
                  <th className="pb-3 text-right">Akce</th>
                </tr>
              </thead>
              <tbody>
                {paper.positions.map((position) => {
                  const pnl =
                      price == null
                        ? null
                        : position.qty * (price - position.price - 2 * position.fee),
                    exit = price == null ? "HOLD" : getExit(position, price, now);
                  return (
                    <tr key={position.id} className="border-t border-border">
                      <td className="py-4">
                        {dateTime(position.at)}
                        <span
                          className="mt-1 block max-w-[200px] truncate text-xs text-muted-foreground"
                          title={position.quoteSource}
                        >
                          {position.fillKind === "SCENARIO"
                            ? "Fiktivní scénář"
                            : position.quoteSource}
                        </span>
                      </td>
                      <td className="num">{position.qty}</td>
                      <td className="num">{usd(position.price)}</td>
                      <td className="num">
                        {usd(position.target)}
                        <span className="mt-1 block text-xs text-muted-foreground">
                          {position.stop == null ? "Bez stopu" : usd(position.stop)}
                        </span>
                      </td>
                      <td
                        className={
                          "num " + (pnl != null && pnl < 0 ? "text-destructive" : "text-success")
                        }
                      >
                        {pnl == null ? "—" : usd(pnl)}
                      </td>
                      <td>
                        <Badge
                          variant="outline"
                          className={
                            exit === "STOP"
                              ? "text-destructive"
                              : exit === "TARGET"
                                ? "text-success"
                                : ""
                          }
                        >
                          {price == null ? "Bez ceny" : (signalLabel[exit] ?? exit)}
                        </Badge>
                      </td>
                      <td className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={!entry.usable}
                          onClick={() => {
                            setSellingId(position.id);
                            setSellQuantity(String(position.qty));
                          }}
                        >
                          Cvičně prodat
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex flex-col items-center rounded-xl border border-dashed border-border py-9 text-center">
            <Activity className="mb-3 size-7 text-muted-foreground" />
            <p className="font-medium">Tady uvidíš své otevřené obchody</p>
            <p className="mt-2 max-w-md px-4 text-sm text-muted-foreground">
              Vyber množství v obchodním formuláři. V režimu Vlastní scénář si můžeš průběh ceny
              nastavit sám.
            </p>
          </div>
        )}
        <div className="grid gap-4 border-t border-border pt-5 text-sm sm:grid-cols-3">
          <div>
            <span className="text-muted-foreground">Vázaný kapitál</span>
            <p className="num mt-1 font-medium">{czk(entry.committedUsd * p.fx)}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Největší zaznamenaný propad</span>
            <p className="num mt-1 font-medium">{czk(paper.maxDrawdownUsd * p.fx)}</p>
          </div>
          <div>
            <span className="text-muted-foreground">
              Limit dalšího propadu od ochranného maxima
            </span>
            <p className="num mt-1 font-medium">
              {czk(p.drawdownLimitCzk)}{" "}
              <span className="font-sans text-xs text-muted-foreground">
                · modelový kurz {p.fx}
              </span>
            </p>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-4 rounded-2xl p-5 sm:p-6">
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-5 text-primary" />
            <h2 className="text-lg font-semibold">Dlouhodobá pozice</h2>
            <Badge variant="outline">Samostatná evidence</Badge>
          </div>
          <p className="num text-2xl font-semibold">
            {core.qty > 0
              ? marketPrice == null
                ? "Hodnota bez kotace není známá"
                : czk(core.qty * marketPrice * p.fx)
              : czk(p.coreBudgetCzk)}
          </p>
          <p className="text-sm text-muted-foreground">
            {core.qty > 0
              ? core.qty.toLocaleString("cs-CZ", { maximumFractionDigits: 4 }) +
                " akcií · průměr " +
                usd(core.avg) +
                " · přepočet kurzem " +
                p.fx +
                " CZK/USD."
              : "Plánovaný rozpočet. Skutečný počet a nákupní průměr doplň z Trading 212; aplikace si je nedomýšlí."}
          </p>
          <Link to="/nastaveni" className="inline-block text-sm font-medium text-primary">
            Upravit dlouhodobou evidenci
          </Link>
        </Card>
        <Card className="space-y-4 rounded-2xl p-5 sm:p-6">
          <div className="flex items-center gap-2">
            <BookOpen className="size-5 text-primary" />
            <h2 className="text-lg font-semibold">Co stojí za pohybem ceny?</h2>
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Prověř výsledky, 18A a 14A, externí zákazníky Foundry a podání SEC. Ve zprávách
            rozlišujeme vyjádření firmy, dokumenty a média. U neobvyklého pohybu neodhadujeme úmysl
            účastníků trhu.
          </p>
          <div className="flex flex-wrap gap-4">
            <Link to="/zpravy" className="text-sm font-medium text-primary">
              Otevřít zprávy a důkazy
            </Link>
            <Link to="/riziko" className="text-sm font-medium text-primary">
              Porovnat Intel s trhem
            </Link>
          </div>
        </Card>
      </div>

      <Dialog
        open={sellingId !== null}
        onOpenChange={(open) => {
          if (!open) setSellingId(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Potvrdit cvičný prodej</DialogTitle>
            <DialogDescription>
              {accountName}. Prodáváš pouze z vybrané cvičné pozice; dlouhodobá evidence se nemění.
            </DialogDescription>
          </DialogHeader>
          {selected ? (
            <div className="space-y-5">
              <label>
                <span className="field-label">Počet akcií k prodeji (max. {selected.qty})</span>
                <Input
                  type="number"
                  min="1"
                  max={selected.qty}
                  step="1"
                  value={sellQuantity}
                  onChange={(e) => setSellQuantity(e.target.value)}
                />
              </label>
              <div className="space-y-2 rounded-xl bg-secondary/50 p-4 text-sm">
                <div className="flex justify-between">
                  <span>Poslední cena pro simulaci</span>
                  <strong className="num">{price == null ? "—" : usd(price)}</strong>
                </div>
                <div className="flex justify-between">
                  <span>Výsledek po nákladech</span>
                  <strong className="num">
                    {price != null && validSell
                      ? usd(sellQty * (price - selected.price - 2 * selected.fee))
                      : "—"}
                  </strong>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                Prodej používá cenu dostupnou při potvrzení. Stop cenu ani likviditu brokera
                nesimuluje.
              </p>
              <Button
                className="w-full"
                disabled={!validSell || !entry.usable}
                onClick={() => {
                  const result = sell(selected.id, sellQty);
                  notify(result);
                  if (result.ok) setSellingId(null);
                }}
              >
                Potvrdit cvičný prodej
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Tato pozice už není otevřená.</p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
