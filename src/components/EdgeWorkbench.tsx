import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Crosshair, Landmark, ListChecks, Radar, Ruler } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Figure, Note, Section } from "@/components/InfoBlocks";
import { usePilot, usd, czk, pct } from "@/lib/pilot-store";
import { getIntelHistory, getIntelHourly } from "@/lib/pilot-history.functions";
import {
  averageTrueRange,
  averagingDown,
  dipStudy,
  edgeVerdict,
  hourlySessions,
  intradayMomentumStudy,
  openingRangeStudy,
  overnightIntradayStudy,
  positionPlan,
  trendStudy,
  volatilityRegime,
  volatilityScalingStudy,
  type DipStudy,
  type EdgeVerdict,
  type RiskStats,
} from "@/lib/pilot-edge.mjs";
import { reviewTrades } from "@/lib/pilot-review.mjs";
import { messageOf, number, plusCzk, share } from "@/lib/format";

const SOURCES = {
  barber: {
    label: "Barber, Lee, Liu, Odean (2014), Journal of Financial Markets",
    url: "https://faculty.haas.berkeley.edu/odean/papers/day%20traders/Day%20Trading%20Skill%20110523.pdf",
  },
  chague: {
    label: "Chague, De-Losso, Giovannetti (2020), Day Trading for a Living?",
    url: "https://econpapers.repec.org/RePEc:fgv:eesptd:525",
  },
  odean: {
    label: "Odean (1998), Are Investors Reluctant to Realize Their Losses?",
    url: "https://faculty.haas.berkeley.edu/odean/papers/disposition/disposition.html",
  },
  lehmann: {
    label: "Lehmann (1990), Fads, Martingales, and Market Efficiency",
    url: "https://www.nber.org/papers/w2533",
  },
  moreira: {
    label: "Moreira, Muir (2017), Volatility-Managed Portfolios",
    url: "https://www.nber.org/papers/w22208",
  },
  harvey: {
    label: "Harvey a kol. (2018), The Impact of Volatility Targeting",
    url: "https://people.duke.edu/~charvey/Research/Published_Papers/P135_The_impact_of.pdf",
  },
  gao: {
    label: "Gao, Han, Li, Zhou (2018), Market Intraday Momentum",
    url: "https://econpapers.repec.org/RePEc:eee:jfinec:v:129:y:2018:i:2:p:394-414",
  },
  zarattini: {
    label:
      "Zarattini, Barbon, Aziz (2024), A Profitable Day Trading Strategy for the U.S. Equity Market",
    url: "https://ideas.repec.org/p/chf/rpseri/rp2498.html",
  },
  lou: {
    label: "Lou, Polk, Skouras (2019), A Tug of War: Overnight Versus Intraday Expected Returns",
    url: "https://econpapers.repec.org/RePEc:eee:jfinec:v:134:y:2019:i:1:p:192-213",
  },
  faber: {
    label: "Faber (2007), A Quantitative Approach to Tactical Asset Allocation",
    url: "https://papers.ssrn.com/sol3/papers.cfm?abstract_id=962461",
  },
  martineau: {
    label: "Martineau (2022), Rest in Peace Post-Earnings Announcement Drift",
    url: "https://cfr.ivo-welch.info/published/papers/martineau2021rest.pdf",
  },
  investor: {
    label: "Investor.gov: Investor Bulletin – After-Hours Trading",
    url: "https://www.investor.gov/additional-resources/news-alerts/alerts-bulletins/investor-bulletin-after-hours-trading",
  },
  finra: {
    label: "FINRA: Extended-Hours Trading – Know the Risks",
    url: "https://finra.org/investors/insights/extended-hours-trading",
  },
  cohen: {
    label: "Cohen, Malloy, Pomorski (2012), Decoding Inside Information",
    url: "https://www.nber.org/papers/w16454",
  },
} as const;
type SourceKey = keyof typeof SOURCES;

const VERDICT_STYLE: Record<EdgeVerdict | "RIZIKO", [string, string]> = {
  VYHODA: ["Výhoda na datech INTC", "border-success/40 bg-success/10 text-success"],
  NEPROKAZANO: ["Výhoda neprokázána", "border-warning/40 bg-warning/10 text-warning"],
  NEVYHODA: ["Na INTC spíš škodí", "border-destructive/40 bg-destructive/10 text-destructive"],
  MALO_DAT: ["Málo dat", "border-border bg-muted/30 text-muted-foreground"],
  RIZIKO: ["Snižuje riziko", "border-primary/40 bg-primary/10 text-primary"],
};
const round2 = (value: number) => Math.round(value * 100) / 100;
const signedPct = (value: number, digits = 2) =>
  (value > 0 ? "+" : "") + value.toLocaleString("cs-CZ", { maximumFractionDigits: digits }) + " %";
const bp = (value: number) =>
  (value > 0 ? "+" : "") + value.toLocaleString("cs-CZ", { maximumFractionDigits: 1 }) + " bp";
const riskVerdict = (hold: RiskStats, overlay: RiskStats): EdgeVerdict | "RIZIKO" =>
  overlay.maxDrawdownPct > hold.maxDrawdownPct && overlay.volatilityPct < hold.volatilityPct
    ? "RIZIKO"
    : "NEPROKAZANO";

function SourceLink({ id }: { id: SourceKey }) {
  const source = SOURCES[id];
  return (
    <a href={source.url} target="_blank" rel="noreferrer" className="underline">
      {source.label}
    </a>
  );
}

function SignalCard({
  title,
  source,
  verdict,
  today,
  children,
}: {
  title: string;
  source: SourceKey;
  verdict: EdgeVerdict | "RIZIKO";
  today: ReactNode;
  children: ReactNode;
}) {
  const [label, style] = VERDICT_STYLE[verdict];
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-background/35 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="font-semibold">{title}</h3>
        <span className={"rounded-full border px-2.5 py-1 text-xs font-medium " + style}>
          {label}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">
        Myšlenka: <SourceLink id={source} />
      </p>
      <div className="rounded-lg bg-background/50 p-3 text-sm">
        <span className="text-muted-foreground">Dnes: </span>
        {today}
      </div>
      <div className="space-y-1 text-sm text-muted-foreground">{children}</div>
    </div>
  );
}

function dipText(study: DipStudy) {
  return (
    <>
      <p>
        Na historii INTC {study.n}× (události se nepřekrývají). Za dalších {study.horizon} dní
        průměrně <strong className="text-foreground">{signedPct(study.meanPct)}</strong>, běžný
        týden {signedPct(study.baselinePct)}; ziskových {share(study.upShare)}.
      </p>
      <p>
        Rozdíl proti běžnému týdnu {signedPct(study.excessPct)}, 95% interval{" "}
        {signedPct(study.excessLowPct)} až {signedPct(study.excessHighPct)}.
      </p>
    </>
  );
}

function RiskCompare({
  hold,
  overlay,
  label,
}: {
  hold: RiskStats;
  overlay: RiskStats;
  label: string;
}) {
  const row = (name: string, s: RiskStats) => (
    <tr className="border-t border-border">
      <td className="py-1.5">{name}</td>
      <td className="num">{signedPct(s.annualPct, 1)}</td>
      <td className="num">{pct(s.volatilityPct)}</td>
      <td className="num">{signedPct(s.maxDrawdownPct, 0)}</td>
    </tr>
  );
  return (
    <table className="w-full text-xs">
      <thead className="text-left">
        <tr>
          <th className="py-1 font-normal">10 let</th>
          <th className="font-normal">Výnos/rok*</th>
          <th className="font-normal">Kolísání</th>
          <th className="font-normal">Max. propad</th>
        </tr>
      </thead>
      <tbody>
        {row("Stále držet", hold)}
        {row(label, overlay)}
      </tbody>
    </table>
  );
}

export function EdgeWorkbench() {
  const { settings, core, quote, transactions } = usePilot();
  const history = useQuery({
    queryKey: ["intel-history-v1"],
    queryFn: () => getIntelHistory(),
    staleTime: 900000,
    refetchInterval: 900000,
    retry: 1,
  });
  const hourlyQuery = useQuery({
    queryKey: ["intel-hourly-v1"],
    queryFn: () => getIntelHourly(),
    staleTime: 3600000,
    retry: 1,
  });
  const daily = history.data?.daily ?? null;
  const marketPrice = quote?.status === "OK" && quote.price != null ? quote.price : null;
  const lastClose = daily ? (daily.closes[daily.closes.length - 1] ?? null) : null;
  const price = marketPrice ?? lastClose;
  const todayChange =
    marketPrice != null && quote?.previousClose
      ? (marketPrice / quote.previousClose - 1) * 100
      : null;

  const studies = useMemo(() => {
    if (!daily) return null;
    try {
      return {
        ok: true as const,
        atr: averageTrueRange(daily.highs, daily.lows, daily.values, 14),
        regime: volatilityRegime(daily.values),
        scaling: volatilityScalingStudy(daily.values),
        dip3: dipStudy(daily.values, daily.dates, { dropPct: 3, horizon: 5 }),
        dip5: dipStudy(daily.values, daily.dates, { dropPct: 5, horizon: 5 }),
        trend: trendStudy(daily.values),
        night: overnightIntradayStudy(daily.opens, daily.values),
      };
    } catch (error) {
      return { ok: false as const, error: messageOf(error) };
    }
  }, [daily]);
  const hourlyBars = hourlyQuery.data?.hourly?.bars ?? null;
  const intraday = useMemo(() => {
    if (!hourlyBars) return null;
    const days = hourlySessions(hourlyBars);
    return {
      days: days.length,
      first: days[0]?.date ?? null,
      last: days[days.length - 1]?.date ?? null,
      momentum: intradayMomentumStudy(days),
      orb: openingRangeStudy(days),
    };
  }, [hourlyBars]);

  // Plán obchodu: prázdné pole = výchozí hodnota (aktuální cena, stop podle ATR).
  const [capitalInput, setCapitalInput] = useState(""),
    [riskPct, setRiskPct] = useState(1),
    [entryInput, setEntryInput] = useState(""),
    [stopInput, setStopInput] = useState(""),
    [atrMultiple, setAtrMultiple] = useState(1),
    [targetR, setTargetR] = useState(1.5),
    [addInput, setAddInput] = useState("");
  const capitalCzk = capitalInput === "" ? settings.capitalCzk : Number(capitalInput);
  const entry = entryInput === "" ? price : Number(entryInput);
  const atr = studies?.ok ? studies.atr : null;
  const stop =
    stopInput === ""
      ? entry != null && atr != null
        ? round2(entry - atrMultiple * atr)
        : null
      : Number(stopInput);
  const plan = useMemo(() => {
    if (entry == null || stop == null) return null;
    try {
      return {
        ok: true as const,
        value: positionPlan({
          capitalCzk,
          riskPct,
          entry,
          stop,
          fx: settings.fx,
          fee: settings.fee,
          targetR,
        }),
      };
    } catch (error) {
      return { ok: false as const, error: messageOf(error) };
    }
  }, [capitalCzk, riskPct, entry, stop, settings.fx, settings.fee, targetR]);
  const multiplier = studies?.ok ? (studies.regime?.multiplier ?? 1) : 1;
  const fixedStopPlan = useMemo(() => {
    if (entry == null || settings.stopUsd <= 0 || settings.stopUsd >= entry) return null;
    try {
      return positionPlan({
        capitalCzk,
        riskPct,
        entry,
        stop: entry - settings.stopUsd,
        fx: settings.fx,
        fee: settings.fee,
        targetR,
      });
    } catch {
      return null;
    }
  }, [capitalCzk, riskPct, entry, settings.stopUsd, settings.fx, settings.fee, targetR]);
  const addQty =
    addInput === ""
      ? plan?.ok
        ? plan.value.shares
        : 0
      : Math.max(0, Math.floor(Number(addInput)));
  const averaging =
    core.qty > 0 && entry != null && stop != null && Number.isFinite(addQty)
      ? averagingDown({ qty: core.qty, avgPrice: core.avg, addQty, addPrice: entry, stop })
      : null;

  const review = useMemo(() => {
    if (!transactions.length || !price) return null;
    try {
      return reviewTrades(transactions, price);
    } catch {
      return null;
    }
  }, [transactions, price]);

  const s = studies?.ok ? studies : null;
  const dailyLimitCzk = (capitalCzk * riskPct * 3) / 100;

  return (
    <div className="space-y-6">
      <Section
        icon={<Landmark className="size-5 text-primary" />}
        eyebrow="CO MAJÍ PROFESIONÁLOVÉ"
        title="Kde berou výhodu a co z toho můžete mít i vy"
        intro="Shrnutí výzkumu: velké firmy nevydělávají hlavně tím, že by lépe hádaly směr ceny. Jejich výhoda je v technice, v toku objednávek a hlavně v disciplíně a řízení rizika. To poslední je dostupné i vám."
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-border bg-background/35 p-4">
            <h3 className="font-semibold">Co drobný investor nezíská</h3>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
              <li>
                Rychlost: servery přímo u burzy a vlastní datové linky (vysokofrekvenční
                obchodování).
              </li>
              <li>
                Tok objednávek: tvůrci trhu vidí a obsluhují objednávky drobných investorů a
                vydělávají na rozpětí mezi nákupní a prodejní cenou.
              </li>
              <li>Velikost: nízké poplatky, levné financování, drahá data a týmy analytiků.</li>
            </ul>
          </div>
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
            <h3 className="font-semibold">Co můžete dělat stejně jako oni</h3>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
              <li>
                <strong className="text-foreground">Velikost pozice podle rizika</strong>: nejdřív
                stop, pak počet akcií; malá ztráta na jeden obchod a denní limit.
              </li>
              <li>
                <strong className="text-foreground">Pravidla ověřená na datech</strong>, ne podle
                nálady; co se na historii neosvědčilo, nepoužívat.
              </li>
              <li>
                <strong className="text-foreground">Menší pozice při velkém kolísání</strong>, které
                omezuje extrémní ztráty.
              </li>
              <li>
                <strong className="text-foreground">Nízké náklady provedení</strong>: limitní
                pokyny, hlavní seance, bez zbytečné směny měn.
              </li>
              <li>
                <strong className="text-foreground">Disciplína</strong>: nedržet ztrátové pozice jen
                proto, že se nechce realizovat ztráta.
              </li>
            </ul>
          </div>
        </div>
        <div className="grid gap-3 lg:grid-cols-3">
          <Note kind="warn" title="Méně než 1 % trvale ziskových">
            <p>
              Mezi denními obchodníky na Tchaj-wanu dosahovalo spolehlivě kladných výsledků méně než
              1 % (<SourceLink id="barber" />
              ).
            </p>
          </Note>
          <Note kind="warn" title="97 % ztrátových">
            <p>
              Z Brazilců, kteří denně obchodovali přes 300 dní, prodělalo 97 % (
              <SourceLink id="chague" />
              ).
            </p>
          </Note>
          <Note kind="warn" title="Držení ztrát stojí výnos">
            <p>
              Investoři prodávají ziskové pozice příliš brzy a ztrátové drží; prodané výherce přitom
              pak vedly lépe než ponechané ztráty (<SourceLink id="odean" />
              ).
            </p>
          </Note>
        </div>
      </Section>

      <Section
        icon={<Ruler className="size-5 text-primary" />}
        eyebrow="PLÁN OBCHODU"
        title="Velikost pozice podle rizika"
        intro="Postup obchodních firem: rozhodněte, kde je stop (kde se mýlíte), kolik z kapitálu jste ochotni ztratit (obvykle 0,5–1 %), a teprve z toho vyjde počet akcií. Velký denní rozsah ceny tak automaticky znamená menší pozici."
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <label>
            <span className="field-label">Kapitál pro obchodování (Kč)</span>
            <Input
              type="number"
              min="1000"
              step="1000"
              value={capitalInput}
              placeholder={String(settings.capitalCzk)}
              onChange={(e) => setCapitalInput(e.target.value)}
            />
          </label>
          <label>
            <span className="field-label">Riziko na jeden obchod (% kapitálu)</span>
            <Input
              type="number"
              min="0.1"
              max="10"
              step="0.1"
              value={riskPct}
              onChange={(e) => setRiskPct(Number(e.target.value))}
            />
          </label>
          <label>
            <span className="field-label">Cíl v násobcích rizika (R)</span>
            <Input
              type="number"
              min="0.5"
              max="10"
              step="0.5"
              value={targetR}
              onChange={(e) => setTargetR(Number(e.target.value))}
            />
          </label>
          <label>
            <span className="field-label">Vstupní cena (USD)</span>
            <Input
              type="number"
              min="0.01"
              step="0.01"
              value={entryInput}
              placeholder={price ? price.toFixed(2) : "čekám na cenu"}
              onChange={(e) => setEntryInput(e.target.value)}
            />
          </label>
          <label>
            <span className="field-label">Stop (USD)</span>
            <Input
              type="number"
              min="0.01"
              step="0.01"
              value={stopInput}
              placeholder={stop != null ? stop.toFixed(2) : "—"}
              onChange={(e) => setStopInput(e.target.value)}
            />
          </label>
          <div>
            <span className="field-label">Stop podle denního rozsahu (ATR 14 dní)</span>
            <div className="flex flex-wrap gap-2">
              {[0.5, 1, 2].map((m) => (
                <Button
                  key={m}
                  size="sm"
                  variant={stopInput === "" && atrMultiple === m ? "secondary" : "outline"}
                  onClick={() => {
                    setAtrMultiple(m);
                    setStopInput("");
                  }}
                >
                  {number(m, 1)}× ATR
                </Button>
              ))}
            </div>
            <span className="mt-2 block text-xs text-muted-foreground">
              ATR = průměrný denní rozsah: {atr != null ? usd(atr) : "—"}
              {atr != null && price ? " (" + pct((atr / price) * 100) + " ceny)" : ""}. U obchodu v
              rámci dne bývá stop menší, kolem 0,25–0,5× ATR.
            </span>
          </div>
        </div>
        {plan && !plan.ok ? (
          <p role="alert" className="text-sm text-destructive">
            {plan.error}
          </p>
        ) : null}
        {plan?.ok ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Figure
                label="Počet akcií"
                value={String(plan.value.shares)}
                detail={
                  "Hodnota " +
                  czk(plan.value.positionCzk) +
                  " (" +
                  share(plan.value.capitalShare) +
                  " kapitálu)" +
                  (plan.value.limitedByCapital ? ". Omezeno kapitálem." : ".")
                }
              />
              <Figure
                label="Ztráta při stopu"
                value={czk(-plan.value.maxLossCzk)}
                color="text-destructive"
                detail={
                  "Stop " +
                  pct(plan.value.stopDistancePct) +
                  " pod vstupem; limit " +
                  czk(plan.value.riskCzk) +
                  ". Při mezeře přes noc může být vyšší."
                }
              />
              <Figure
                label="Cíl"
                value={usd(plan.value.target)}
                color="text-success"
                detail={"Zisk " + plusCzk(plan.value.winCzk) + " po nákladech."}
              />
              <Figure
                label="Potřebná úspěšnost"
                value={share(plan.value.breakEvenRate, 1)}
                detail="Při poměru zisku a ztráty z plánu stačí, aby vyšla menšina obchodů."
              />
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              <Note kind="info" title="Denní limit ztráty">
                <p>
                  Obvyklé pravidlo: po ztrátě zhruba 3 obchodů za den ({czk(dailyLimitCzk)}) už ten
                  den neobchodovat a po ztrátě velikost nezvyšovat. Ochrana účtu v{" "}
                  <Link to="/nastaveni" className="underline">
                    Nastavení
                  </Link>{" "}
                  blokuje nákupy po propadu {czk(settings.drawdownLimitCzk)}.
                </p>
              </Note>
              {fixedStopPlan && s?.regime ? (
                <Note
                  kind={multiplier < 0.75 ? "warn" : "info"}
                  title={"Pevný stop " + usd(settings.stopUsd) + " z Nastavení"}
                >
                  <p>
                    Se stejným rizikem by dovolil {fixedStopPlan.shares} akcií. Kolísání je teď{" "}
                    {number(s.regime.ratio, 1)}× vyšší než obvykle, proto profesionálové pevný stop
                    při takovém kolísání nepoužívají, nebo pozici zmenší zhruba na ×
                    {number(multiplier)} ({Math.floor(fixedStopPlan.shares * multiplier)} akcií).
                    Stop podle ATR to dělá sám.
                  </p>
                </Note>
              ) : null}
            </div>
            {averaging ? (
              <div className="rounded-xl border border-warning/40 bg-warning/5 p-4 text-sm">
                <p className="font-semibold">Co udělá přikoupení ve ztrátě</p>
                <div className="mt-2 flex flex-wrap items-end gap-3">
                  <label className="w-40">
                    <span className="field-label">Přikoupit akcií</span>
                    <Input
                      type="number"
                      min="0"
                      step="1"
                      value={addInput}
                      placeholder={String(addQty)}
                      onChange={(e) => setAddInput(e.target.value)}
                    />
                  </label>
                  <p className="text-muted-foreground">
                    Dlouhodobá pozice {number(core.qty, 4)} ks za {usd(core.avg)}. Po přikoupení{" "}
                    {addQty} ks za {usd(entry ?? 0)} bude průměr {usd(averaging.newAvg)} a ztráta
                    při poklesu na stop {usd(stop ?? 0)} vzroste z{" "}
                    <strong className="text-foreground">
                      {czk(averaging.riskBefore * settings.fx)}
                    </strong>{" "}
                    na{" "}
                    <strong className="text-destructive">
                      {czk(averaging.riskAfter * settings.fx)}
                    </strong>
                    . Nižší průměr neznamená menší riziko.
                  </p>
                </div>
              </div>
            ) : null}
          </>
        ) : null}
      </Section>

      <Section
        icon={<Radar className="size-5 text-primary" />}
        eyebrow="SIGNÁLY OVĚŘENÉ NA INTC"
        title="Co z doporučovaných postupů funguje u Intelu"
        intro={
          <>
            Známé obchodní postupy z odborné literatury, každý přepočítaný živě na historii INTC
            (denní data 10 let{intraday ? ", hodinové svíčky " + intraday.days + " seancí" : ""}).
            Verdikt „Výhoda“ jen tehdy, když celý 95% interval leží nad nulou. Pozor: čím víc
            variant člověk vyzkouší, tím spíš najde náhodnou „výhodu“; proto tu jsou pevné.
          </>
        }
      >
        {history.isError ? (
          <p role="alert" className="text-sm text-destructive">
            Historii se nepodařilo načíst.
          </p>
        ) : null}
        {studies && !studies.ok ? (
          <p role="alert" className="text-sm text-destructive">
            {studies.error}
          </p>
        ) : null}
        {!s ? (
          <p role="status" className="text-sm text-muted-foreground">
            Načítám historii…
          </p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            <SignalCard
              title="Nákup po propadu o 3 % a víc, držet 5 dní"
              source="lehmann"
              verdict={edgeVerdict({
                n: s.dip3.n,
                low: s.dip3.excessLowPct,
                high: s.dip3.excessHighPct,
              })}
              today={
                todayChange != null && todayChange <= -3
                  ? "INTC je dnes zatím " +
                    signedPct(todayChange) +
                    "; signál by platil při takovém závěru."
                  : "Poslední seance " +
                    signedPct(s.dip3.lastDayPct) +
                    (todayChange != null ? ", dnes zatím " + signedPct(todayChange) : "") +
                    "; signál neplatí."
              }
            >
              {dipText(s.dip3)}
            </SignalCard>
            <SignalCard
              title="Nákup po propadu o 5 % a víc, držet 5 dní"
              source="lehmann"
              verdict={edgeVerdict({
                n: s.dip5.n,
                low: s.dip5.excessLowPct,
                high: s.dip5.excessHighPct,
              })}
              today={
                todayChange != null && todayChange <= -5
                  ? "INTC je dnes zatím " +
                    signedPct(todayChange) +
                    "; signál by platil při takovém závěru."
                  : "Signál neplatí."
              }
            >
              {dipText(s.dip5)}
              {s.dip5.excessPct < 0 ? (
                <p className="text-warning">
                  Po velkých propadech (často po výsledcích hospodaření) cena INTC v průměru dál
                  klesala: přikupování „levněji“ se tu nevyplácelo.
                </p>
              ) : null}
            </SignalCard>
            {s.regime && s.scaling ? (
              <SignalCard
                title="Menší pozice při vysokém kolísání"
                source="harvey"
                verdict={riskVerdict(s.scaling.hold, s.scaling.scaled)}
                today={
                  "Kolísání posledních 20 dní " +
                  number(s.regime.currentPct, 0) +
                  " %" +
                  " ročně, obvykle " +
                  number(s.regime.normalPct, 0) +
                  " %" +
                  " → velikost pozice ×" +
                  number(s.regime.multiplier) +
                  "."
                }
              >
                <p>
                  Velikost pozice = obvyklé ÷ současné kolísání (nejvýše 1×). Snižuje extrémní
                  ztráty; vyšší výnos neslibuje (viz <SourceLink id="moreira" /> a jeho kritiky).
                </p>
                <RiskCompare
                  hold={s.scaling.hold}
                  overlay={s.scaling.scaled}
                  label="Podle kolísání"
                />
              </SignalCard>
            ) : null}
            {s.trend ? (
              <SignalCard
                title="Držet jen nad 200denním průměrem"
                source="faber"
                verdict={riskVerdict(s.trend.hold, s.trend.filter)}
                today={
                  "Cena " +
                  usd(s.trend.last) +
                  " je " +
                  (s.trend.todayAbove ? "nad" : "pod") +
                  " 200denním průměrem (" +
                  usd(s.trend.ma) +
                  "); filtr by pozici " +
                  (s.trend.todayAbove ? "držel." : "nedržel.")
                }
              >
                <p>
                  Nad průměrem kolísání {pct(s.trend.above.volatilityPct ?? 0)}, pod ním{" "}
                  {pct(s.trend.below.volatilityPct ?? 0)}. Studie používá měsíční obdobu (10měsíční
                  průměr). Trendový filtr je nástroj na omezení propadů, ne na předpověď.
                </p>
                <RiskCompare
                  hold={s.trend.hold}
                  overlay={s.trend.filter}
                  label="Jen nad průměrem"
                />
              </SignalCard>
            ) : null}
            {intraday?.momentum ? (
              <SignalCard
                title="Intradenní momentum (první hodina → poslední půlhodina)"
                source="gao"
                verdict={edgeVerdict({
                  n: intraday.momentum.n,
                  low: intraday.momentum.lowBp,
                  high: intraday.momentum.highBp,
                })}
                today={
                  intraday.momentum.todayFirstPct != null
                    ? "Poslední úplná seance: první hodina " +
                      signedPct(intraday.momentum.todayFirstPct) +
                      "."
                    : "—"
                }
              >
                <p>
                  Na indexových fondech funguje: směr první půlhodiny předpovídá poslední půlhodinu.
                  Na INTC ({intraday.momentum.n} seancí, {intraday.first} – {intraday.last}):
                  korelace{" "}
                  {(Math.abs(intraday.momentum.correlation) < 0.0005
                    ? 0
                    : intraday.momentum.correlation
                  ).toLocaleString("cs-CZ", { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
                  , výsledek strategie {bp(intraday.momentum.meanBp)} (95% interval{" "}
                  {bp(intraday.momentum.lowBp)} až {bp(intraday.momentum.highBp)}). 1 bp = 0,01 %.
                </p>
              </SignalCard>
            ) : null}
            {intraday?.orb ? (
              <SignalCard
                title="Průraz po první hodině (opening range breakout)"
                source="zarattini"
                verdict={edgeVerdict({
                  n: intraday.orb.n,
                  low: intraday.orb.excessLowBp,
                  high: intraday.orb.excessHighBp,
                })}
                today="Počítá se až po první hodině obchodování."
              >
                <p>
                  Studie vybírá každý den 20 akcií s neobvykle velkým objemem z tisíců. Na samotném
                  INTC: nákup po rostoucí první hodině se stopem na jejím minimu {intraday.orb.n}×,
                  průměr {bp(intraday.orb.meanBp)} proti {bp(intraday.orb.baselineBp)} při nákupu
                  každý den; rozdíl 95% interval {bp(intraday.orb.excessLowBp)} až{" "}
                  {bp(intraday.orb.excessHighBp)}.
                </p>
              </SignalCard>
            ) : hourlyQuery.isLoading ? (
              <p role="status" className="text-sm text-muted-foreground">
                Načítám hodinové svíčky…
              </p>
            ) : null}
            <SignalCard
              title="Výnos přes noc proti výnosu během dne"
              source="lou"
              verdict={
                Math.abs(s.night.overnight.t ?? 0) >= 2 || Math.abs(s.night.intraday.t ?? 0) >= 2
                  ? "VYHODA"
                  : "NEPROKAZANO"
              }
              today="Obecná vlastnost akcie, ne denní signál."
            >
              <p>
                U akcií obecně přichází velká část výnosu přes noc. INTC za {s.night.days} dní: přes
                noc {bp(s.night.overnight.meanBp)}/den (t = {number(s.night.overnight.t ?? 0)}),
                během dne {bp(s.night.intraday.meanBp)}/den (t = {number(s.night.intraday.t ?? 0)}).
                Rozdíl je malý vůči kolísání; t pod 2 = neprůkazné.
              </p>
            </SignalCard>
          </div>
        )}
        <Note kind="info" title="Co jsme do aplikace záměrně nedali">
          <p>
            Posun ceny po výsledcích hospodaření (post-earnings drift) u velkých firem v posledních
            letech vymizel (<SourceLink id="martineau" />
            ). Obchody vedení firmy podle hlášení SEC mají ve studiích hodnotu jen u „neobvyklých“
            nákupů (<SourceLink id="cohen" />
            ), na jednu firmu je jich málo. Očekávaný pohyb z cen opcí by vyžadoval placený zdroj
            dat.
          </p>
        </Note>
        {hourlyQuery.data?.errors.map((error) => (
          <p key={error} role="alert" className="text-sm text-warning">
            {error}
          </p>
        ))}
      </Section>

      <Section
        icon={<ListChecks className="size-5 text-primary" />}
        eyebrow="PROVEDENÍ OBCHODU"
        title="Náklady, které rozhodují"
        intro="Profesionálové měří a snižují náklady každého obchodu. U drobného investora jde hlavně o rozpětí mezi nákupní a prodejní cenou, o směnu měn a o špatné načasování pokynů."
      >
        <div className="grid gap-3 lg:grid-cols-2">
          <Note kind="info" title="Limitní pokyn místo tržního">
            <p>
              Tržní pokyn se vyplní za jakoukoli dostupnou cenu. Mimo hlavní seanci jsou rozpětí
              širší, likvidita menší a neplatí ochrana nejlepší ceny na trhu (
              <SourceLink id="investor" />, <SourceLink id="finra" />
              ).
            </p>
          </Note>
          <Note kind="info" title="Obchodovat v hlavní seanci">
            <p>
              9:30–16:00 v New Yorku, u nás obvykle 15:30–22:00. Tehdy je rozpětí nejužší.
              {review?.short.outsideRegularShare != null
                ? " Ve vašem výpisu začalo mimo ni " +
                  share(review.short.outsideRegularShare) +
                  " krátkých obchodů."
                : ""}
            </p>
          </Note>
          <Note kind="info" title="Obchodovat z USD zůstatku">
            <p>
              Při nákupu i prodeji za koruny se platí poplatek za směnu (u Trading 212 0,15 % z
              hodnoty, tedy asi 0,3 % za nákup a prodej).
              {review && (review.fxFees["CZK"] ?? 0) > 0
                ? " Ve vašem výpisu: " + number(review.fxFees["CZK"] ?? 0, 0) + " Kč."
                : ""}
            </p>
          </Note>
          <Note kind="info" title="Plán před obchodem, deník po něm">
            <p>
              Vstup, stop a cíl si zapsat předem; po obchodu vyhodnocovat výsledek v násobcích
              rizika. Cvičný účet v{" "}
              <Link to="/" className="underline">
                Obchodním přehledu
              </Link>{" "}
              to dělá za vás.
            </p>
          </Note>
        </div>
      </Section>

      <Card className="space-y-2 rounded-2xl p-5 text-sm sm:p-6">
        <h2 className="flex items-center gap-2 font-semibold">
          <Crosshair className="size-4 text-primary" />
          Metodika a zdroje
        </h2>
        <p className="text-muted-foreground">
          Propady: denní pokles z upravených závěrů, nákup na závěru dne propadu, výnos za dalších 5
          dní; události se nepřekrývají; interval je bootstrap (2 000 převzorkování). Kolísání:
          20denní volatilita proti mediánu za předchozí rok, bez pohledu do budoucnosti. Trend:
          rozhodnutí na závěru dne, výnos následujícího dne. * Výnos/rok je průměrný logaritmický
          výnos × 252. Intradenní studie na hodinových svíčkách Yahoo za 2 roky (jen úplné seance).
          Všechny výsledky jsou hrubé, bez poplatků a daní.
        </p>
        <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
          {(Object.keys(SOURCES) as SourceKey[]).map((key) => (
            <li key={key}>
              <SourceLink id={key} />
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
