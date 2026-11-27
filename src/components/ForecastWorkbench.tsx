import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  ChartSpline,
  CircleCheck,
  Dices,
  Info,
  RefreshCw,
  Scale,
  TriangleAlert,
  Upload,
  Wallet,
} from "lucide-react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePilot, usd, czk, pct, dateTime } from "@/lib/pilot-store";
import { getIntelHistory } from "@/lib/pilot-history.functions";
import { parseTransactions, run, sessions, type Settings } from "@/lib/pilot-engine.mjs";
import {
  calibrationBacktest,
  chanceTargetFirst,
  combinedForecast,
  dailyResults,
  positionForecast,
  priceForecast,
  randomEntryOutcomes,
  randomEntryTest,
  tailFacts,
  tradeStatistics,
  volatility,
} from "@/lib/pilot-forecast.mjs";
import { reviewTrades, type TradeReview } from "@/lib/pilot-review.mjs";

const HORIZONS = [
  { days: 5, label: "1 týden" },
  { days: 21, label: "1 měsíc" },
  { days: 63, label: "3 měsíce" },
  { days: 126, label: "6 měsíců" },
  { days: 252, label: "1 rok" },
];
const LOOKBACKS = [
  { days: 63, label: "Poslední 3 měsíce" },
  { days: 252, label: "Poslední rok (výchozí)" },
  { days: 756, label: "Poslední 3 roky" },
];
const COMBINED_HORIZONS = [
  { days: 21, label: "1 měsíc" },
  { days: 63, label: "3 měsíce" },
  { days: 252, label: "1 rok" },
];
const FAN_TICKS = [0, 21, 63, 126, 189, 252];
const fanLabel = (day: number) =>
  day === 0 ? "dnes" : day === 21 ? "1 měs." : day % 21 === 0 ? day / 21 + " měs." : day + " dní";
const BAND = "#44d7cf";

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));
const share = (value: number | null | undefined, digits = 0) =>
  value == null || !Number.isFinite(value)
    ? "—"
    : (value * 100).toLocaleString("cs-CZ", { maximumFractionDigits: digits }) + " %";
const plusUsd = (value: number) => (value > 0 ? "+" : "") + usd(value);
const plusCzk = (value: number) => (value > 0 ? "+" : "") + czk(value);
const toneOf = (value: number) =>
  value > 0 ? "text-success" : value < 0 ? "text-destructive" : "";
const number = (value: number, digits = 2) =>
  value.toLocaleString("cs-CZ", { maximumFractionDigits: digits });
const clock = (minute: number) =>
  String(Math.floor(minute / 60)).padStart(2, "0") + ":" + String(minute % 60).padStart(2, "0");

function describeRules(p: Settings) {
  const signal =
    p.signal === "open"
      ? "nákup při otevření"
      : p.signal === "dip2"
        ? "nákup po poklesu 2 USD od otevření"
        : p.signal === "dip1"
          ? "nákup po poklesu " + usd(p.dipUsd) + " od otevření"
          : p.signal === "dipPct"
            ? "nákup po poklesu " + pct(p.dipPct) + " od otevření"
            : "nákup po poklesu " + pct(p.dipPct) + " a odrazu " + usd(p.reboundUsd);
  const hold =
    p.holdDays < 0
      ? "bez časového limitu"
      : p.holdDays === 0
        ? "prodej nejpozději na konci seance"
        : "nejvýše " + p.holdDays + " dalších seancí";
  return [
    signal + " do " + clock(p.windowMinute) + " ET",
    "cíl +" + usd(p.targetUsd),
    p.stopUsd > 0 ? "stop −" + usd(p.stopUsd) : "bez stopu",
    hold,
    "náklady " + usd(p.fee) + " na akcii a stranu",
  ].join(" · ");
}

function Figure({
  label,
  value,
  detail,
  color = "",
}: {
  label: string;
  value: string;
  detail: ReactNode;
  color?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-background/35 p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={"num mt-2 text-2xl font-semibold " + color}>{value}</p>
      <div className="mt-2 text-sm text-muted-foreground">{detail}</div>
    </div>
  );
}

const NOTE_STYLE = {
  good: ["border-success/40 bg-success/5", "text-success"],
  warn: ["border-warning/40 bg-warning/5", "text-warning"],
  bad: ["border-destructive/40 bg-destructive/5", "text-destructive"],
  info: ["border-primary/30 bg-primary/5", "text-primary"],
} as const;
function Note({
  kind,
  title,
  children,
}: {
  kind: keyof typeof NOTE_STYLE;
  title: string;
  children: ReactNode;
}) {
  const [box, icon] = NOTE_STYLE[kind];
  const Icon = kind === "good" ? CircleCheck : kind === "info" ? Info : TriangleAlert;
  return (
    <div className={"flex gap-3 rounded-xl border p-4 text-sm " + box}>
      <Icon className={"mt-0.5 size-5 shrink-0 " + icon} />
      <div>
        <p className="font-semibold">{title}</p>
        <div className="mt-1 space-y-2 text-muted-foreground">{children}</div>
      </div>
    </div>
  );
}

function Section({
  icon,
  eyebrow,
  title,
  intro,
  children,
}: {
  icon: ReactNode;
  eyebrow: string;
  title: string;
  intro: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card className="overflow-hidden rounded-2xl">
      <div className="border-b border-border bg-primary/5 p-5 sm:p-6">
        <p className="eyebrow">{eyebrow}</p>
        <div className="mt-1 flex items-center gap-3">
          {icon}
          <h2 className="text-xl font-semibold">{title}</h2>
        </div>
        <div className="mt-2 max-w-4xl text-sm text-muted-foreground">{intro}</div>
      </div>
      <div className="space-y-6 p-5 sm:p-6">{children}</div>
    </Card>
  );
}

interface FanPoint {
  day: number;
  median: number;
  band50: [number, number];
  band80: [number, number];
}
function FanTooltip({ active, payload }: { active?: boolean; payload?: { payload: FanPoint }[] }) {
  const point = active ? payload?.[0]?.payload : undefined;
  if (!point) return null;
  return (
    <div className="rounded-lg border border-border bg-card p-3 text-sm shadow-lg">
      <p className="font-semibold">
        {point.day === 0 ? "Dnes" : "Za " + point.day + " obchodních dní"}
      </p>
      <p className="num mt-1">Medián {usd(point.median)}</p>
      <p className="num text-muted-foreground">
        50 % pásmo {usd(point.band50[0])} – {usd(point.band50[1])}
      </p>
      <p className="num text-muted-foreground">
        80 % pásmo {usd(point.band80[0])} – {usd(point.band80[1])}
      </p>
    </div>
  );
}

export function ForecastWorkbench() {
  const { settings, core, quote, markets, transactions, setTransactions, saveCore, hydrated } =
    usePilot();
  const history = useQuery({
    queryKey: ["intel-history-v1"],
    queryFn: () => getIntelHistory(),
    staleTime: 900000,
    refetchInterval: 900000,
    retry: 1,
  });
  const data = history.data;
  const daily = data?.daily ?? null;
  const [trendPct, setTrendPct] = useState(0),
    [lookback, setLookback] = useState(252),
    [source, setSource] = useState("yahoo"),
    [horizon, setHorizon] = useState(21),
    [importError, setImportError] = useState("");

  const marketPrice = quote?.status === "OK" && quote.price != null ? quote.price : null;
  const lastClose = daily ? (daily.closes[daily.closes.length - 1] ?? null) : null;
  const price = marketPrice ?? lastClose;
  const priceNote =
    marketPrice != null && quote?.timestamp != null
      ? "Poslední dostupná cena " + dateTime(quote.timestamp) + " · " + quote.source
      : lastClose != null && daily
        ? "Denní závěr " + daily.last + " · tržní cena teď není dostupná"
        : "Cena zatím není dostupná";

  // Dlouhodobá část: evidence z Nastavení, jinak rozpočet dlouhodobé části.
  const fromRecord = core.qty > 0;
  const positionQty = fromRecord
    ? core.qty
    : price
      ? Math.floor(settings.coreBudgetCzk / settings.fx / price)
      : 0;
  const positionAvg = fromRecord ? core.avg : 0;
  const validTrend = Number.isFinite(trendPct) && trendPct > -90 && trendPct <= 300;

  const longTerm = useMemo(() => {
    if (!daily || !price || !validTrend) return null;
    try {
      const vol = volatility(daily.values, lookback);
      const driftAnnual = Math.log(1 + trendPct / 100);
      const rows = HORIZONS.map((h) => ({
        ...h,
        forecast: positionForecast({
          qty: positionQty,
          avgPrice: positionAvg,
          price,
          sigmaAnnual: vol.sigmaAnnual,
          driftAnnual,
          days: h.days,
          fx: settings.fx,
          levels: [0.5, 0.8],
        }),
        calibration: calibrationBacktest(daily.values, { lookback, horizon: h.days, level: 0.8 }),
      }));
      const fan: FanPoint[] = [];
      for (let day = 0; day <= 252; day += 3) {
        if (day === 0) {
          fan.push({ day, median: price, band50: [price, price], band80: [price, price] });
          continue;
        }
        const f = priceForecast({
          price,
          sigmaAnnual: vol.sigmaAnnual,
          driftAnnual,
          days: day,
          levels: [0.5, 0.8],
        });
        const [b50, b80] = f.bands;
        if (b50 && b80)
          fan.push({
            day,
            median: f.median,
            band50: [b50.low, b50.high],
            band80: [b80.low, b80.high],
          });
      }
      return {
        ok: true as const,
        vol,
        driftAnnual,
        rows,
        fan,
        tail: tailFacts(daily.values, daily.dates),
      };
    } catch (error) {
      return { ok: false as const, error: messageOf(error) };
    }
  }, [daily, price, lookback, trendPct, validTrend, positionQty, positionAvg, settings.fx]);

  // Denní obchodování: pravidla z Nastavení na 5min datech Yahoo nebo na importu z Backtestu.
  const options = [
    ...(data?.intraday
      ? [{ key: "yahoo", label: "Yahoo · 5 min · posledních 60 dní", data: data.intraday }]
      : []),
    ...markets.map((m, i) => ({
      key: "import-" + i,
      label: "Import z Backtestu · " + m.name + " · " + m.data.interval + " min",
      data: m.data,
    })),
  ];
  const selected = options.find((o) => o.key === source) ?? options[0] ?? null;
  const intradayData = selected?.data ?? null;
  const dayTrading = useMemo(() => {
    if (!intradayData) return null;
    try {
      const days = sessions(intradayData).days;
      const first = days[0],
        last = days[days.length - 1];
      if (!first || !last) throw new Error("V datech nejsou úplné seance 9:30–16:00 ET.");
      const result = run(days, settings, true);
      const perShare = result.trades.map((t) => t.pnlUsd / t.qty);
      const stats = tradeStatistics(perShare);
      const outcomes = randomEntryOutcomes(days, settings);
      const test = stats.n ? randomEntryTest(outcomes, stats.n, stats.mean) : null;
      const dailyCzk = dailyResults(days, result.trades);
      const month = combinedForecast({ dayTrading: { dailyCzk }, horizon: 21 }).dayTrading;
      const ranges = days
        .map((d) => {
          let high = -Infinity,
            low = Infinity;
          for (const bar of d.bars) {
            high = Math.max(high, bar.h);
            low = Math.min(low, bar.l);
          }
          return { usd: high - low, pct: ((high - low) / d.open) * 100 };
        })
        .sort((a, b) => a.usd - b.usd);
      const middle = ranges[Math.floor(ranges.length / 2)];
      return {
        ok: true as const,
        days: days.length,
        first: first.date,
        last: last.date,
        result,
        stats,
        outcomes,
        test,
        dailyCzk,
        month,
        tradesPerMonth: (stats.n / days.length) * 21,
        medianRange: middle ?? null,
      };
    } catch (error) {
      return { ok: false as const, error: messageOf(error) };
    }
  }, [intradayData, settings]);

  const combined = useMemo(() => {
    const lt = longTerm?.ok && price && positionQty > 0 ? longTerm : null;
    const dt = dayTrading?.ok ? dayTrading : null;
    if (!lt && !dt) return null;
    return combinedForecast({
      longTerm: lt
        ? {
            qty: positionQty,
            price: price as number,
            sigmaAnnual: lt.vol.sigmaAnnual,
            driftAnnual: lt.driftAnnual,
            fx: settings.fx,
          }
        : null,
      dayTrading: dt ? { dailyCzk: dt.dailyCzk } : null,
      horizon,
    });
  }, [longTerm, dayTrading, price, positionQty, settings.fx, horizon]);

  const review = useMemo(() => {
    if (!transactions.length || !price) return null;
    try {
      return { ok: true as const, value: reviewTrades(transactions, price) };
    } catch (error) {
      return { ok: false as const, error: messageOf(error) };
    }
  }, [transactions, price]);

  async function importStatement(file: File) {
    try {
      if (file.size <= 0 || file.size > 30 * 1024 * 1024) throw new Error("Vyber CSV do 30 MB.");
      const parsed = parseTransactions(await file.text());
      setTransactions(parsed.transactions);
      setImportError("");
      toast.success("Načteno " + parsed.transactions.length + " obchodů INTC. Rozbor je níže.");
    } catch (error) {
      setImportError(messageOf(error));
    }
  }
  function adoptPosition(r: TradeReview) {
    if (r.averageCostUsd == null || r.openQty <= 0) return;
    const qty = Math.round(r.openQty * 10000) / 10000,
      avg = Math.round(r.averageCostUsd * 10000) / 10000;
    if (
      !window.confirm(
        "Zapsat do dlouhodobé evidence " +
          number(qty, 4) +
          " akcií za průměrnou cenu " +
          usd(avg) +
          "? Nahradí to současnou evidenci (" +
          number(core.qty, 4) +
          " ks). Nic se neposílá brokerovi.",
      )
    )
      return;
    try {
      saveCore(qty, avg);
      toast.success("Dlouhodobá evidence aktualizována.");
    } catch (error) {
      toast.error(messageOf(error));
    }
  }

  const chance = chanceTargetFirst(settings.targetUsd, settings.stopUsd);
  const breakEven =
    settings.stopUsd > 0
      ? (settings.stopUsd + 2 * settings.fee) / (settings.targetUsd + settings.stopUsd)
      : null;
  const monthRow = longTerm?.ok ? longTerm.rows.find((r) => r.days === 21) : undefined;
  const monthCalibration = monthRow?.calibration ?? null;

  return (
    <div className="space-y-6">
      <Card className="space-y-4 rounded-2xl p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="eyebrow">JAK ČÍST PROGNÓZU</p>
            <h2 className="mt-1 text-xl font-semibold">Co lze předpovědět a co ne</h2>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={history.isFetching}
            onClick={() => void history.refetch()}
          >
            <RefreshCw className={"size-4 " + (history.isFetching ? "animate-spin" : "")} />
            Obnovit data
          </Button>
        </div>
        <div className="grid gap-3 lg:grid-cols-3">
          <Note kind="good" title="Rozpětí ceny odhadnout jde">
            <p>
              Pásmo spočítané z kolísání ceny za poslední rok obsáhlo za posledních 10 let skutečnou
              cenu INTC za měsíc v <strong>{share(monthCalibration?.coverage ?? null)}</strong>{" "}
              případů (slibuje 80 %).
            </p>
          </Note>
          <Note kind="warn" title="Směr ceny odhadnout nejde">
            <p>
              Podle toho, zda cena za poslední rok rostla, se směr příštího měsíce trefil v{" "}
              <strong>{share(monthCalibration?.directionHitRate ?? null)}</strong> případů, tedy
              jako hod mincí. Proto je výchozí trend 0 %.
            </p>
          </Note>
          <Note kind="info" title="Denní obchodování musí porazit náhodu">
            <p>
              Bez výhody končí každý obchod v průměru ztrátou ve výši nákladů. Aplikace proto
              srovnává vaše pravidla s náhodnými nákupy se stejným cílem a stopem.
            </p>
          </Note>
        </div>
        <p className="text-sm text-muted-foreground">
          Výchozí cena: <span className="num text-foreground">{price ? usd(price) : "—"}</span> ·{" "}
          {priceNote}. {data?.source ?? "Načítám historii…"}
          {daily ? " Denní data " + daily.first + " – " + daily.last + "." : ""} Prognóza není
          investiční doporučení ani slib výsledku.
        </p>
        {history.isError ? (
          <p role="alert" className="text-sm text-destructive">
            Historii se nepodařilo načíst. Zkus obnovit data.
          </p>
        ) : null}
        {data?.errors.map((error) => (
          <p key={error} role="alert" className="text-sm text-warning">
            {error}
          </p>
        ))}
      </Card>

      <Section
        icon={<ChartSpline className="size-5 text-primary" />}
        eyebrow="DLOUHODOBÁ ČÁST"
        title="Kde může být cena a hodnota pozice"
        intro={
          <>
            Lognormální model: kolísání (volatilita) z historie, trend podle vašeho předpokladu.
            {fromRecord ? (
              <>
                {" "}
                Pozice z dlouhodobé evidence: <strong>{number(core.qty, 4)} akcií</strong> za
                průměrně {usd(core.avg)}.
              </>
            ) : (
              <>
                {" "}
                Dlouhodobá evidence není vyplněná, počítám s rozpočtem {czk(
                  settings.coreBudgetCzk,
                )}{" "}
                ({positionQty} akcií). Vyplň ji v{" "}
                <Link to="/nastaveni" className="underline">
                  Nastavení
                </Link>{" "}
                nebo ji převezmi z výpisu níže.
              </>
            )}
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <label>
            <span className="field-label">Předpoklad trendu (% za rok)</span>
            <Input
              type="number"
              step="5"
              min="-89"
              max="300"
              value={trendPct}
              onChange={(e) => setTrendPct(Number(e.target.value))}
            />
            <span className="mt-2 block text-xs text-muted-foreground">
              0 = bez předpokladu směru (medián = dnešní cena). Zkus +20 nebo −20 a uvidíš, jak málo
              trend mění rozpětí.
            </span>
          </label>
          <label>
            <span className="field-label">Kolísání podle období</span>
            <select
              className="h-9 w-full rounded-md border border-input bg-background px-2"
              value={lookback}
              onChange={(e) => setLookback(Number(e.target.value))}
            >
              {LOOKBACKS.map((l) => (
                <option key={l.days} value={l.days}>
                  {l.label}
                </option>
              ))}
            </select>
            <span className="mt-2 block text-xs text-muted-foreground">
              Na historii INTC vychází nejlépe poslední rok; kratší okno víc podléhá náhodě.
            </span>
          </label>
          <Figure
            label="Roční volatilita"
            value={longTerm?.ok ? pct(longTerm.vol.sigmaAnnual * 100) : "—"}
            detail="Směrodatná odchylka denních výnosů × √252. Kolem 30 % je u velkých firem běžné."
          />
        </div>
        {!validTrend ? (
          <p role="alert" className="text-sm text-destructive">
            Trend musí být mezi −89 % a +300 % ročně.
          </p>
        ) : null}
        {longTerm && !longTerm.ok ? (
          <p role="alert" className="text-sm text-destructive">
            {longTerm.error}
          </p>
        ) : null}
        {!longTerm && !history.isError ? (
          <p role="status" className="text-sm text-muted-foreground">
            Načítám historii cen…
          </p>
        ) : null}
        {longTerm?.ok ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-sm">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    <th className="py-2">Horizont</th>
                    <th>Medián ceny</th>
                    <th>80% pásmo ceny</th>
                    <th>Změna hodnoty pozice (80 %)</th>
                    <th>Šance na zisk proti nákupu</th>
                    <th>Pásmo v minulosti sedělo</th>
                    <th>Směr podle minulého roku</th>
                  </tr>
                </thead>
                <tbody>
                  {longTerm.rows.map((row) => {
                    const band = row.forecast.bands[1],
                      money = row.forecast.bandsCzk[1],
                      cal = row.calibration;
                    const off = cal ? Math.abs(cal.coverage - 0.8) > 0.05 : true;
                    return (
                      <tr key={row.days} className="border-t border-border">
                        <td className="py-2 font-medium">{row.label}</td>
                        <td className="num">{usd(row.forecast.median)}</td>
                        <td className="num">
                          {band ? usd(band.low) + " – " + usd(band.high) : "—"}
                        </td>
                        <td className="num">
                          {money
                            ? plusCzk(money.changeLow) + " až " + plusCzk(money.changeHigh)
                            : "—"}
                        </td>
                        <td className="num">
                          {row.forecast.probabilityProfit == null
                            ? "—"
                            : share(row.forecast.probabilityProfit)}
                        </td>
                        <td className={"num " + (off ? "text-warning" : "text-success")}>
                          {cal ? share(cal.coverage) + " z 80 %" : "málo dat"}
                          {cal ? (
                            <span className="block text-xs text-muted-foreground">
                              ≈ {cal.independent} nezávislých období
                            </span>
                          ) : null}
                        </td>
                        <td className="num">{cal ? share(cal.directionHitRate) : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div>
              <div className="h-80 min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={longTerm.fan}
                    margin={{ top: 10, right: 16, left: 4, bottom: 0 }}
                  >
                    <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 5" />
                    <XAxis
                      dataKey="day"
                      type="number"
                      domain={[0, 252]}
                      ticks={FAN_TICKS}
                      tickFormatter={fanLabel}
                      stroke="var(--muted-foreground)"
                      fontSize={12}
                    />
                    <YAxis
                      width={64}
                      domain={["auto", "auto"]}
                      tickFormatter={(v) => "$" + Math.round(Number(v))}
                      stroke="var(--muted-foreground)"
                      fontSize={12}
                    />
                    <Tooltip content={<FanTooltip />} />
                    <Area
                      dataKey="band80"
                      stroke="none"
                      fill={BAND}
                      fillOpacity={0.14}
                      isAnimationActive={false}
                    />
                    <Area
                      dataKey="band50"
                      stroke="none"
                      fill={BAND}
                      fillOpacity={0.3}
                      isAnimationActive={false}
                    />
                    <Line
                      dataKey="median"
                      stroke={BAND}
                      strokeWidth={2}
                      dot={false}
                      isAnimationActive={false}
                    />
                    {positionAvg > 0 ? (
                      <ReferenceLine
                        y={positionAvg}
                        stroke="#8291aa"
                        strokeDasharray="4 5"
                        label={{
                          value: "průměrná nákupní cena",
                          fill: "var(--muted-foreground)",
                          fontSize: 12,
                          position: "insideTopRight",
                        }}
                      />
                    ) : null}
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <p className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
                <span>
                  <span
                    className="mr-1 inline-block h-0.5 w-4 align-middle"
                    style={{ background: BAND }}
                  />
                  medián
                </span>
                <span>
                  <span
                    className="mr-1 inline-block size-3 rounded-sm align-middle"
                    style={{ background: BAND, opacity: 0.45 }}
                  />
                  50% pásmo (polovina případů)
                </span>
                <span>
                  <span
                    className="mr-1 inline-block size-3 rounded-sm align-middle"
                    style={{ background: BAND, opacity: 0.2 }}
                  />
                  80% pásmo (8 z 10 případů)
                </span>
                <span>Osa X: obchodní dny (21 ≈ 1 měsíc)</span>
              </p>
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              <Note kind="info" title="Jak číst tabulku">
                <p>
                  80% pásmo znamená, že v 8 z 10 případů by cena měla skončit uvnitř a ve 2 z 10
                  mimo, nahoře nebo dole. Sloupec „Pásmo v minulosti sedělo“ ukazuje, jak často to
                  platilo na skutečné historii INTC, když se počítalo jen z dat dostupných v daný
                  den.
                </p>
                <p>
                  Šance na zisk porovnává cenu na konci horizontu s vaší průměrnou nákupní cenou. U
                  delších horizontů je nezávislých období málo, proto berte jejich kontrolu jen
                  orientačně.
                </p>
              </Note>
              <Note kind="warn" title="Výjimečné dny">
                <p>
                  Za {longTerm.tail.days} obchodních dní v datech klesla cena o 10 % a více za
                  jediný den <strong>{longTerm.tail.dropsAtLeast10}×</strong>, o 5 % a více{" "}
                  {longTerm.tail.dropsAtLeast5}×. Největší pokles:{" "}
                  {longTerm.tail.worstPct == null ? "—" : pct(longTerm.tail.worstPct)}
                  {longTerm.tail.worstDate ? " (" + longTerm.tail.worstDate + ")" : ""}. Takové
                  skoky přicházejí hlavně po výsledcích hospodaření a model je zachycuje jen
                  průměrně.
                </p>
                <p>
                  Hodnota v Kč používá modelový kurz {number(settings.fx)} CZK/USD; pohyb kurzu
                  výsledek dál mění.
                </p>
              </Note>
            </div>
          </>
        ) : null}
      </Section>

      <Section
        icon={<Dices className="size-5 text-primary" />}
        eyebrow="DENNÍ OBCHODOVÁNÍ"
        title="Mají pravidla výhodu proti náhodě?"
        intro={
          <>
            Pravidla z{" "}
            <Link to="/nastaveni" className="underline">
              Nastavení
            </Link>
            : {describeRules(settings)}. Výpočet používá stejný engine jako Backtest, jen úplné
            seance 9:30–16:00 ET.
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <label>
            <span className="field-label">Data</span>
            <select
              className="h-9 w-full rounded-md border border-input bg-background px-2"
              value={selected?.key ?? ""}
              onChange={(e) => setSource(e.target.value)}
              disabled={!options.length}
            >
              {options.length ? null : <option value="">Načítám…</option>}
              {options.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </select>
            <span className="mt-2 block text-xs text-muted-foreground">
              Delší historii (např. INTEL_DATA.zip) nahraj v{" "}
              <Link to="/backtest" className="underline">
                Backtestu
              </Link>
              ; čím víc obchodů, tím užší interval.
            </span>
          </label>
          {dayTrading?.ok ? (
            <Figure
              label="Vybraná data"
              value={dayTrading.days + " seancí"}
              detail={
                <>
                  {dayTrading.first} – {dayTrading.last}
                  {dayTrading.medianRange
                    ? " · typické denní rozpětí " +
                      usd(dayTrading.medianRange.usd) +
                      " (" +
                      pct(dayTrading.medianRange.pct) +
                      ")"
                    : ""}
                </>
              }
            />
          ) : null}
        </div>
        {dayTrading && !dayTrading.ok ? (
          <p role="alert" className="text-sm text-destructive">
            {dayTrading.error}
          </p>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <Figure
            label="Náhoda: cíl dřív než stop"
            value={chance == null ? "—" : share(chance)}
            detail={
              chance == null
                ? "Bez stopu nelze určit; ztráta pak není omezena."
                : "Kdyby se cena pohybovala zcela náhodně, dosáhla by +" +
                  usd(settings.targetUsd) +
                  " dřív než −" +
                  usd(settings.stopUsd) +
                  " v tolika případech. Vysoká úspěšnost tedy sama o sobě nic nedokazuje."
            }
          />
          <Figure
            label="Potřebná úspěšnost"
            value={breakEven == null ? "—" : share(breakEven, 1)}
            detail="Teprve nad touto úspěšností je obchod v průměru ziskový (počítá s náklady)."
          />
        </div>
        {dayTrading?.ok ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Figure
                label="Úspěšnost pravidel na datech"
                value={dayTrading.stats.n ? share(dayTrading.stats.winRate) : "—"}
                detail={
                  dayTrading.stats.n
                    ? "95% interval " +
                      share(dayTrading.stats.winLow) +
                      " – " +
                      share(dayTrading.stats.winHigh) +
                      " · " +
                      dayTrading.stats.n +
                      " obchodů"
                    : "Pravidla nevytvořila žádný obchod."
                }
              />
              <Figure
                label="Průměr na akcii po nákladech"
                value={dayTrading.stats.n ? plusUsd(dayTrading.stats.mean) : "—"}
                color={dayTrading.stats.n ? toneOf(dayTrading.stats.mean) : ""}
                detail={
                  dayTrading.stats.n >= 2
                    ? "95% interval " +
                      plusUsd(dayTrading.stats.ciLow) +
                      " až " +
                      plusUsd(dayTrading.stats.ciHigh)
                    : "Málo obchodů pro interval."
                }
              />
              <Figure
                label="Náhodný nákup se stejnými výstupy"
                value={plusUsd(dayTrading.outcomes.mean)}
                color={toneOf(dayTrading.outcomes.mean)}
                detail={
                  dayTrading.test
                    ? "Stejný nebo lepší průměr než pravidla mělo " +
                      share(dayTrading.test.pValue) +
                      " náhodných pokusů."
                    : number(dayTrading.outcomes.count, 0) + " náhodných vstupů."
                }
              />
              <Figure
                label="Potřebný počet obchodů"
                value={
                  dayTrading.stats.requiredTrades == null
                    ? "—"
                    : "≈ " + number(dayTrading.stats.requiredTrades, 0)
                }
                detail={
                  dayTrading.stats.requiredTrades == null
                    ? "Průměr není kladný; výhodu nelze prokazovat."
                    : "Tolik obchodů by bylo třeba, aby se průměr dal odlišit od nuly (máte " +
                      dayTrading.stats.n +
                      ")."
                }
              />
            </div>
            {(() => {
              const { stats, test } = dayTrading;
              if (!stats.n)
                return (
                  <Note kind="info" title="Žádné obchody">
                    <p>
                      Na těchto datech by pravidla nenakoupila. Zkus delší data nebo jiný signál.
                    </p>
                  </Note>
                );
              if (stats.n < 20)
                return (
                  <Note kind="warn" title={"Jen " + stats.n + " obchodů"}>
                    <p>Výsledek je čistě orientační, interval je velmi široký.</p>
                  </Note>
                );
              if (stats.ciLow > 0 && test && test.pValue < 0.05)
                return (
                  <Note kind="good" title="Data naznačují výhodu proti náhodě">
                    <p>
                      Průměr je kladný i na dolní hranici intervalu a náhodné nákupy takový výsledek
                      dosahují zřídka. Ověřuj dál na nových datech bez úprav pravidel; pravidla
                      vybraná optimalizací na stejných datech vycházejí příliš dobře.
                    </p>
                  </Note>
                );
              if (stats.ciHigh < 0)
                return (
                  <Note kind="bad" title="Pravidla na těchto datech prodělávají">
                    <p>
                      Ztráta je větší, než by vysvětlila náhoda. Pravidla v této podobě nepoužívej.
                    </p>
                  </Note>
                );
              return (
                <Note kind="warn" title="Výhodu zatím nelze odlišit od náhody">
                  <p>
                    Průměr {plusUsd(stats.mean)} na akcii může být štěstí: interval sahá od{" "}
                    {plusUsd(stats.ciLow)} do {plusUsd(stats.ciHigh)}
                    {test
                      ? " a náhodné nákupy byly stejně dobré nebo lepší v " +
                        share(test.pValue) +
                        " pokusů"
                      : ""}
                    . Na rozhodnutí je potřeba víc obchodů (viz výše) nebo delší data.
                  </p>
                </Note>
              );
            })()}
            <div className="grid gap-3 sm:grid-cols-3">
              <Figure
                label="Obchodů za měsíc (podle dat)"
                value={number(dayTrading.tradesPerMonth, 1)}
                detail={"Z " + dayTrading.stats.n + " obchodů za " + dayTrading.days + " seancí."}
              />
              <Figure
                label="Měsíc: střední výsledek"
                value={dayTrading.month ? plusCzk(dayTrading.month.p50) : "—"}
                color={dayTrading.month ? toneOf(dayTrading.month.p50) : ""}
                detail="Pokud bude příští měsíc podobný vybraným datům. Při velikosti obchodu podle Nastavení."
              />
              <Figure
                label="Měsíc: 80% rozpětí"
                value={
                  dayTrading.month
                    ? plusCzk(dayTrading.month.p10) + " až " + plusCzk(dayTrading.month.p90)
                    : "—"
                }
                detail="Zahrnuje i nejistotu, jak dobrá pravidla doopravdy jsou."
              />
            </div>
            {dayTrading.result.open.length ? (
              <p className="text-sm text-warning">
                Na konci dat zůstává {dayTrading.result.open.length} otevřených pozic (
                {plusCzk(dayTrading.result.unrealizedCzk)}); do statistiky obchodů nejsou zahrnuty.
              </p>
            ) : null}
          </>
        ) : null}
      </Section>

      <Section
        icon={<Scale className="size-5 text-primary" />}
        eyebrow="OBA DÍLY KAPITÁLU"
        title="Co čekat celkem"
        intro="Dlouhodobá část (změna hodnoty pozice) a denní obchodování (výsledek obchodů) v jedné simulaci 4 000 možných budoucností. Obě části se berou jako nezávislé; výsledek je bez daní a poplatků brokera."
      >
        <div className="flex flex-wrap gap-2">
          {COMBINED_HORIZONS.map((h) => (
            <Button
              key={h.days}
              variant={horizon === h.days ? "secondary" : "outline"}
              aria-pressed={horizon === h.days}
              onClick={() => setHorizon(h.days)}
            >
              {h.label}
            </Button>
          ))}
        </div>
        {combined ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] text-sm">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    <th className="py-2">Část</th>
                    <th>Nepříznivý (1 z 10)</th>
                    <th>Střední</th>
                    <th>Příznivý (1 z 10)</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { label: "Dlouhodobá část · změna hodnoty", spread: combined.longTerm },
                    { label: "Denní obchodování · výsledek", spread: combined.dayTrading },
                    { label: "Celkem", spread: combined.total },
                  ].map((row) => (
                    <tr
                      key={row.label}
                      className={
                        "border-t border-border " + (row.label === "Celkem" ? "font-semibold" : "")
                      }
                    >
                      <td className="py-2">{row.label}</td>
                      {row.spread ? (
                        [row.spread.p10, row.spread.p50, row.spread.p90].map((v, i) => (
                          <td key={i} className={"num " + toneOf(v)}>
                            {plusCzk(v)}
                          </td>
                        ))
                      ) : (
                        <td colSpan={3} className="text-muted-foreground">
                          Bez dat
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-sm text-muted-foreground">
              Pravděpodobnost, že celek za zvolené období skončí ve ztrátě:{" "}
              <strong className="text-foreground">{share(combined.probabilityLoss)}</strong>. U
              dlouhodobé části rozhoduje rozpětí ceny; denní obchodování mění celek mnohem méně,
              pokud nemá prokázanou výhodu.
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Čekám na data obou částí…</p>
        )}
      </Section>

      <Section
        icon={<Wallet className="size-5 text-primary" />}
        eyebrow="VAŠE SKUTEČNÉ OBCHODY"
        title="Jak dopadly vaše strategie"
        intro="Rozbor výpisu Trading 212 (CSV). Soubor zůstává jen v paměti tohoto prohlížeče; neodesílá se na server ani na GitHub a po obnovení stránky ho nahrajte znovu. Počítají se jen nákupy a prodeje INTC v USD."
      >
        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-input px-3 py-2 text-sm hover:bg-accent">
            <Upload className="size-4" />
            {transactions.length ? "Nahrát jiný výpis" : "Nahrát výpis CSV"}
            <input
              type="file"
              accept=".csv"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void importStatement(file);
                e.target.value = "";
              }}
            />
          </label>
          {transactions.length ? (
            <span className="text-sm text-muted-foreground">
              Načteno {transactions.length} obchodů INTC (sdíleno se stránkou{" "}
              <Link to="/historie" className="underline">
                Historie
              </Link>
              ).
            </span>
          ) : null}
        </div>
        {importError ? (
          <p role="alert" className="text-sm text-destructive">
            {importError}
          </p>
        ) : null}
        {review && !review.ok ? (
          <p role="alert" className="text-sm text-destructive">
            {review.error}
          </p>
        ) : null}
        {review?.ok ? (
          <ReviewView
            review={review.value}
            fx={settings.fx}
            rules={settings}
            onAdopt={hydrated ? adoptPosition : null}
          />
        ) : null}
      </Section>

      <Card className="space-y-2 rounded-2xl p-5 text-sm sm:p-6">
        <h2 className="font-semibold">Metodika ve zkratce</h2>
        <p className="text-muted-foreground">
          Dlouhodobá část: ln(cena za t / dnešní cena) má normální rozdělení se směrodatnou
          odchylkou σ·√t (σ z denních log výnosů zvoleného období, upravené závěry včetně dividend)
          a středem podle zvoleného trendu. Zpětná kontrola počítá pro každý den historie pásmo jen
          z dat před ním a porovná je se skutečností; období se překrývají.
        </p>
        <p className="text-muted-foreground">
          Denní obchodování: pravidla z Nastavení se přehrají enginem Backtestu. Interval průměru je
          bootstrap (2 000 převzorkování), interval úspěšnosti Wilsonův. Test proti náhodě vybírá
          stejný počet různých dní a v každém náhodnou svíčku do konce vstupního okna, se stejným
          cílem, stopem, časovým limitem i náklady. Měsíční rozpětí vzniká dvojím převzorkováním
          skutečných seancí.
        </p>
        <p className="text-muted-foreground">
          Výsledky se stejnými daty jsou vždy stejné (pevné semínko). Model nezná budoucí zprávy,
          výsledky hospodaření ani rozhodnutí vedení; nic z toho nejde z ceny spolehlivě vyčíst.
        </p>
      </Card>
    </div>
  );
}

function ReviewView({
  review: r,
  fx,
  rules,
  onAdopt,
}: {
  review: TradeReview;
  fx: number;
  rules: Settings;
  onAdopt: ((r: TradeReview) => void) | null;
}) {
  const feeEntries = Object.entries(r.fxFees);
  const czkFees = r.fxFees["CZK"] ?? 0;
  const feeShare = r.realizedUsd > 0 && czkFees > 0 ? czkFees / fx / r.realizedUsd : null;
  const short = r.short;
  return (
    <div className="space-y-6">
      {!r.startedFlat ? (
        <Note kind="warn" title="Výpis nezačíná nulovou pozicí">
          <p>
            Prodeje {number(r.unmatchedQty, 4)} akcií nemají ve výpisu nákup. Nahrajte výpis od
            prvního nákupu, jinak celkový výsledek není přesný.
          </p>
        </Note>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Figure
          label="Celkový výsledek za období"
          value={plusUsd(r.totalUsd)}
          color={toneOf(r.totalUsd)}
          detail={
            <>
              ≈ {plusCzk(r.totalUsd * fx)} · prodeje − nákupy + hodnota {number(r.openQty, 2)}{" "}
              držených akcií za {usd(r.price)}. Bez poplatků. {dateTime(r.first)} –{" "}
              {dateTime(r.last)}.
            </>
          }
        />
        <Figure
          label="Prodané obchody"
          value={plusUsd(r.realizedUsd)}
          color={toneOf(r.realizedUsd)}
          detail={r.trips + " párů nákup → prodej (párování od nejnovějšího nákupu)."}
        />
        <Figure
          label="Neprodané nákupy"
          value={plusUsd(r.unrealizedUsd)}
          color={toneOf(r.unrealizedUsd)}
          detail={
            <>
              {number(r.openQty, 2)} akcií · nákupy v průměru za{" "}
              {r.openLifoAverageUsd == null ? "—" : usd(r.openLifoAverageUsd)}; průměrná cena podle
              brokera {r.averageCostUsd == null ? "—" : usd(r.averageCostUsd)}.
            </>
          }
        />
        <Figure
          label="Stejný kapitál jednou koupený a držený"
          value={r.benchmarkUsd == null ? "—" : plusUsd(r.benchmarkUsd)}
          color={r.benchmarkUsd == null ? "" : toneOf(r.benchmarkUsd)}
          detail={
            "Nejvíc vázaný kapitál (" +
            usd(r.peakCostUsd) +
            ") koupený za cenu prvního nákupu " +
            (r.firstBuyPrice == null ? "—" : usd(r.firstBuyPrice)) +
            " a držený do dneška."
          }
        />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="text-left text-muted-foreground">
            <tr>
              <th className="py-2">Doba držení</th>
              <th>Párů</th>
              <th>Akcií</th>
              <th>Hrubý výsledek</th>
              <th>Na akcii</th>
              <th>Ziskových</th>
            </tr>
          </thead>
          <tbody>
            {r.buckets.map((b) => (
              <tr key={b.key} className="border-t border-border">
                <td className="py-2">{b.label}</td>
                <td className="num">{b.trips}</td>
                <td className="num">{number(b.qty, 1)}</td>
                <td className={"num " + toneOf(b.grossUsd)}>{plusUsd(b.grossUsd)}</td>
                <td className="num">{b.perShareUsd == null ? "—" : plusUsd(b.perShareUsd)}</td>
                <td className="num">{share(b.winRate)}</td>
              </tr>
            ))}
            <tr className="border-t border-border">
              <td className="py-2">Dosud neprodáno</td>
              <td className="num">—</td>
              <td className="num">{number(r.openQty, 1)}</td>
              <td className={"num " + toneOf(r.unrealizedUsd)}>{plusUsd(r.unrealizedUsd)}</td>
              <td className="num">{r.openQty > 0 ? plusUsd(r.unrealizedUsd / r.openQty) : "—"}</td>
              <td className="num">—</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {short.trips && short.winRate != null && short.winRate >= 0.8 && r.unrealizedUsd < 0 ? (
          <Note kind="warn" title={"Úspěšnost " + share(short.winRate) + " je zdánlivá"}>
            <p>
              Krátké obchody (do 1 dne) končí ziskem, protože se prodávají hlavně ty, které vyšly.
              Ztrátové prodáno jen {short.losers}×; nákupy, které nevyšly, zůstaly otevřené se
              ztrátou {plusUsd(r.unrealizedUsd)}. Prognózu takového stylu je proto nutné počítat i s
              neprodanými nákupy, jinak vychází příliš dobře.
            </p>
          </Note>
        ) : null}
        {short.trips ? (
          <Note kind="info" title="Váš typický krátký obchod">
            <p>
              Zisk {short.medianGainUsd == null ? "—" : plusUsd(short.medianGainUsd)} na akcii (
              {short.medianGainPct == null ? "—" : pct(short.medianGainPct)}), držení{" "}
              {short.medianHoldHours == null ? "—" : number(short.medianHoldHours, 1) + " h"}.
              Pravidla aplikace: cíl +{usd(rules.targetUsd)},{" "}
              {rules.stopUsd > 0 ? "stop −" + usd(rules.stopUsd) : "bez stopu"}. Pro simulaci
              vlastního stylu bez stopu nastavte v Nastavení stop 0 a limit držení −1.
            </p>
          </Note>
        ) : null}
        {short.outsideRegularShare != null && short.outsideRegularShare > 0.2 ? (
          <Note kind="info" title="Obchody mimo hlavní seanci">
            <p>
              {share(short.outsideRegularShare)} krátkých obchodů začalo mimo 9:30–16:00 ET
              (pre-market, after-hours, noc). Backtest i prognóza denního obchodování v aplikaci
              počítají jen s hlavní seancí, kde je spread nejmenší.
            </p>
          </Note>
        ) : null}
        {feeEntries.length ? (
          <Note kind="warn" title="Poplatky za směnu měn">
            <p>
              {feeEntries.map(([currency, value]) => number(value, 0) + " " + currency).join(", ")}
              {feeShare != null
                ? ", tj. asi " + share(feeShare) + " hrubého zisku prodaných obchodů"
                : ""}
              . Broker účtuje směnu při obchodu v Kč; obchody hrazené z USD zůstatku ji nemají.
              Modelové náklady v Nastavení ({usd(rules.fee)} na akcii a stranu) tento poplatek
              nezahrnují.
            </p>
          </Note>
        ) : null}
      </div>
      {onAdopt && r.openQty > 0 && r.averageCostUsd != null ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" onClick={() => onAdopt(r)}>
            Převzít držené akcie do dlouhodobé evidence
          </Button>
          <span className="text-xs text-muted-foreground">
            {number(r.openQty, 4)} akcií za průměrnou cenu brokera {usd(r.averageCostUsd)}. Prognóza
            dlouhodobé části nahoře pak počítá s vaší skutečnou pozicí.
          </span>
        </div>
      ) : null}
      <p className="text-xs text-muted-foreground">
        Párování od nejnovějšího nákupu (LIFO) odpovídá tomu, jak vnímáte krátký obchod; broker
        počítá průměrnou cenou, proto se jeho „Result“ liší. Celkový výsledek na párování nezávisí.
        Výsledek je hrubý, bez daní; kurz {number(fx)} CZK/USD je modelový.
      </p>
    </div>
  );
}
