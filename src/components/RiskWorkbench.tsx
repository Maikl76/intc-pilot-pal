import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  Calculator,
  CircleHelp,
  ExternalLink,
  RefreshCw,
  Shield,
  TrendingDown,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePilot, usd, czk, pct, dateTime } from "@/lib/pilot-store";
import { getMarketContext } from "@/lib/pilot-context.functions";
import { payoff } from "@/lib/pilot-context.mjs";

const signed = (v: number) => (v > 0 ? "+" : "") + pct(v);
function Figure({
  label,
  value,
  detail,
  color = "",
}: {
  label: string;
  value: string;
  detail: string;
  color?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-background/35 p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={"num mt-2 text-2xl font-semibold " + color}>{value}</p>
      <p className="mt-2 text-sm text-muted-foreground">{detail}</p>
    </div>
  );
}
export function MarketContext() {
  const query = useQuery({
    queryKey: ["intel-daily-context-v1"],
    queryFn: () => getMarketContext(),
    staleTime: 900000,
    refetchInterval: 900000,
    retry: 1,
  });
  const data = query.data,
    intel = data?.observations.find((x) => x.symbol === "INTC");
  return (
    <Card className="space-y-5 rounded-2xl p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow">KONTEXT POHYBU</p>
          <h2 className="mt-1 text-xl font-semibold">Intel, čipy a širší trh</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Historie do předchozího dne · společná seance: {data?.aligned.date ?? "načítám…"}.
            Dnešní datum se do této statistiky nezahrnuje ani po uzavření trhu.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void query.refetch()}
          disabled={query.isFetching}
        >
          <RefreshCw className={"size-4 " + (query.isFetching ? "animate-spin" : "")} />
          Obnovit
        </Button>
      </div>
      {query.isLoading ? (
        <div
          className="h-32 animate-pulse rounded-xl bg-secondary/50"
          aria-label="Načítání historie trhu"
        />
      ) : data?.aligned.items.length ? (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            {data.aligned.items.map((item) => (
              <div key={item.symbol} className="rounded-xl border border-border p-4">
                <p className="text-sm text-muted-foreground">
                  {item.symbol === "INTC"
                    ? "Intel"
                    : item.symbol === "SOXX"
                      ? "SOXX · polovodiče"
                      : "QQQ · Nasdaq 100"}
                </p>
                <p
                  className={
                    "num mt-2 text-2xl font-semibold " +
                    (item.changePct >= 0 ? "text-success" : "text-destructive")
                  }
                >
                  {signed(item.changePct)}
                </p>
                <p className="num mt-1 text-sm text-muted-foreground">Závěr {usd(item.close)}</p>
              </div>
            ))}
          </div>
          {data.aligned.sectorDifference != null ? (
            <p className="text-sm">
              Intel se od polovodičového ETF odchýlil o{" "}
              <strong className="num">
                {data.aligned.sectorDifference > 0 ? "+" : ""}
                {data.aligned.sectorDifference.toFixed(2)} procentního bodu
              </strong>
              . Rozdíl popisuje vývoj cen, sám nevysvětluje příčinu.
            </p>
          ) : null}
        </>
      ) : (
        <p className="rounded-xl border border-warning/30 bg-warning/5 p-4 text-sm">
          Srovnání teď není dostupné. Bez současných dat nezobrazujeme odhad změny.
        </p>
      )}
      {data?.observations.some((x) => x.stale) ? (
        <p
          role="alert"
          className="rounded-xl border border-warning/40 bg-warning/5 p-4 text-sm text-warning"
        >
          Zdroj neposkytl očekávanou poslední seanci. Následující hodnoty jsou starší historie; ověř
          datum před rozhodnutím.
        </p>
      ) : null}
      {intel ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <Figure
            label="Průměr true range · 14 seancí"
            value={usd(intel.atr14)}
            detail="Aritmetický průměr včetně gapů, bez Wilderova vyhlazení. Není to očekávaný zisk."
          />
          <Figure
            label="Kolísání výnosů · 20 seancí"
            value={pct(intel.volatility20Pct)}
            detail="Historická anualizovaná volatilita, 252 seancí za rok."
          />
          <Figure
            label="Objem poslední seance"
            value={intel.volumeRatio == null ? "—" : intel.volumeRatio.toFixed(2) + "×"}
            detail="Proti průměru předchozích 20 úplných seancí."
          />
        </div>
      ) : null}
      {intel?.moveScore != null && Math.abs(intel.moveScore) >= 2 ? (
        <div className="flex gap-3 rounded-xl border border-warning/30 bg-warning/5 p-4">
          <CircleHelp className="mt-0.5 size-5 shrink-0 text-warning" />
          <p className="text-sm">
            Pohyb poslední seance je vzdálený{" "}
            <strong>{Math.abs(intel.moveScore).toFixed(1)} směrodatné odchylky</strong> od průměru
            předchozích 20 denních logaritmických výnosů. To je podnět k ověření zpráv, nikoli důkaz
            manipulace ani signál obratu.
          </p>
        </div>
      ) : null}
      {data?.errors.length ? (
        <details className="text-sm text-muted-foreground">
          <summary className="cursor-pointer">Dostupnost dat</summary>
          <ul className="mt-2 space-y-1">
            {data.errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </details>
      ) : null}
      <div className="flex flex-wrap justify-between gap-3 border-t border-border pt-4 text-sm text-muted-foreground">
        <span>
          Zdroj: Yahoo Finance · {data ? "ověřeno " + dateTime(data.fetchedAt) : "denní OHLC"} ·
          historické statistiky, bez dividend
        </span>
        <a
          className="inline-flex items-center gap-1 text-primary"
          href="https://finance.yahoo.com/quote/INTC/history/"
          target="_blank"
          rel="noopener noreferrer"
        >
          Zdrojová historie <ExternalLink className="size-3.5" />
        </a>
      </div>
    </Card>
  );
}

export function RiskWorkbench() {
  const { settings, core, quote } = usePilot();
  const [qty, setQty] = useState(80),
    [target, setTarget] = useState(settings.targetUsd),
    [stop, setStop] = useState(settings.stopUsd),
    [fee, setFee] = useState(settings.fee),
    [probability, setProbability] = useState(60),
    [buyPrice, setBuyPrice] = useState("");
  const price = buyPrice === "" ? (quote?.price ?? 57) : Number(buyPrice);
  const priceLabel =
    buyPrice !== ""
      ? "Vlastní zadaná cena"
      : quote?.price != null
        ? "Poslední dostupná tržní cena"
        : "Modelová cena 57 USD; tržní data chybí";
  const result = useMemo(() => {
    try {
      return payoff({ qty, target, stop, fee, probability });
    } catch {
      return null;
    }
  }, [qty, target, stop, fee, probability]);
  const validPrice = Number.isFinite(price) && price > 0;
  const controls = [
    { key: "qty", label: "Počet akcií", value: qty, change: setQty, min: 1, step: 1 },
    {
      key: "target",
      label: "Cíl na akcii (USD)",
      value: target,
      change: setTarget,
      min: 0.01,
      step: 0.1,
    },
    {
      key: "stop",
      label: "Ztráta na stopu / akcie (USD)",
      value: stop,
      change: setStop,
      min: 0.01,
      step: 0.1,
    },
    {
      key: "fee",
      label: "Náklady / akcie / strana (USD)",
      value: fee,
      change: setFee,
      min: 0,
      step: 0.01,
    },
  ];
  return (
    <div className="space-y-6">
      <Card className="overflow-hidden rounded-2xl">
        <div className="border-b border-border bg-primary/5 p-5 sm:p-6">
          <div className="flex items-center gap-3">
            <Calculator className="size-5 text-primary" />
            <h2 className="text-xl font-semibold">Co skutečně znamená cíl +1 USD</h2>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Počítej výnos a možné ztráty ze stejného množství akcií. Parametry této kalkulačky
            nemění tvůj obchodní účet.
          </p>
        </div>
        <div className="space-y-6 p-5 sm:p-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <label>
              <span className="field-label">Nákupní cena (USD)</span>
              <Input
                type="number"
                step=".01"
                min=".01"
                value={buyPrice === "" ? price : buyPrice}
                onChange={(e) => setBuyPrice(e.target.value)}
              />
              <span className="mt-2 block text-xs text-muted-foreground">{priceLabel}</span>
            </label>
            {controls.map((c) => (
              <label key={c.key}>
                <span className="field-label">{c.label}</span>
                <Input
                  type="number"
                  value={c.value}
                  min={c.min}
                  step={c.step}
                  onChange={(e) => c.change(Number(e.target.value))}
                />
              </label>
            ))}
          </div>
          {result && validPrice ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Figure
                  label="Potřebný kapitál"
                  value={usd(qty * (price + fee))}
                  detail={czk(qty * (price + fee) * settings.fx) + " při modelovém kurzu"}
                />
                <Figure
                  label="Výsledek při dosažení cíle"
                  value={usd(result.win)}
                  detail={"Hrubý " + usd(result.grossWin) + " − náklady " + usd(result.costs)}
                  color={result.win >= 0 ? "text-success" : "text-destructive"}
                />
                <Figure
                  label="Ztráta na stopu"
                  value={usd(-result.loss)}
                  detail="Bez gapu a nečekaného skluzu. Skutečná ztráta může být vyšší."
                  color="text-destructive"
                />
                <Figure
                  label="Úspěšnost pro nulový výsledek"
                  value={pct(result.breakEvenPct)}
                  detail="Za předpokladu jen plných cílů a stopů, stále stejných nákladů."
                />
              </div>
              <div className="grid gap-6 rounded-xl bg-background/40 p-5 lg:grid-cols-2">
                <div>
                  <label htmlFor="success-probability" className="text-sm font-medium">
                    Tvoje předpokládaná úspěšnost:{" "}
                    <span className="num text-primary">{probability} %</span>
                  </label>
                  <input
                    id="success-probability"
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    value={probability}
                    onChange={(e) => setProbability(Number(e.target.value))}
                    className="my-4 w-full accent-cyan-400"
                  />
                  <p className="text-sm text-muted-foreground">
                    Tento posuvník je hypotéza. Úspěšnost nelze odvodit z počtu obchodů, které už
                    skončily ziskem, pokud ztrátové pozice dál čekají na prodej.
                  </p>
                </div>
                <div>
                  <span className="field-label">
                    Očekávaný výsledek jednoho obchodu podle hypotézy
                  </span>
                  <span
                    className={
                      "num text-3xl font-semibold " +
                      (result.expected >= 0 ? "text-success" : "text-destructive")
                    }
                  >
                    {usd(result.expected)}
                  </span>
                  <p className="mt-3 text-sm text-muted-foreground">
                    {result.winsToRecover == null
                      ? "Ziskový cíl nepokrývá náklady."
                      : "Jedna stop ztráta smaže přibližně " +
                        result.winsToRecover.toFixed(2) +
                        " úspěšného obchodu."}{" "}
                    Časové výstupy, změny trhu a dlouhé držení se mohou výrazně lišit.
                  </p>
                </div>
              </div>
              <details className="text-sm text-muted-foreground">
                <summary className="cursor-pointer">Jak počítáme</summary>
                <p className="mt-3">
                  Zisk = počet × (cíl − 2 × náklady). Ztráta = počet × (stop + 2 × náklady).
                  Potřebná úspěšnost = ztráta / (zisk + ztráta). Očekávaná hodnota = úspěšnost ×
                  zisk − neúspěšnost × ztráta. Bez daní a měnových změn.
                </p>
              </details>
            </>
          ) : (
            <p className="text-warning">
              Zadej platné kladné parametry. Při vypnutém stopu nelze odvodit poměr pevného cíle a
              pevné ztráty.
            </p>
          )}
        </div>
      </Card>
      <Card className="space-y-5 rounded-2xl p-5 sm:p-6">
        <div className="flex items-center gap-3">
          <TrendingDown className="size-5 text-warning" />
          <h2 className="text-xl font-semibold">Když cena neudělá to, co čekáš</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Model navrženého nákupu {qty} akcií při {validPrice ? usd(price) : "—"}. Tabulka ukazuje
          změnu hodnoty po modelových nákladech obou stran, nikoli předpověď.
        </p>
        {validPrice && Number.isInteger(qty) && qty > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="pb-3">Scénář</th>
                  <th className="pb-3 text-right">Cena</th>
                  <th className="pb-3 text-right">Výsledek USD</th>
                  <th className="pb-3 text-right">Výsledek Kč</th>
                </tr>
              </thead>
              <tbody>
                {[-0.05, -0.1, -0.2].map((drop) => {
                  const pnl = qty * (price * drop - 2 * fee);
                  return (
                    <tr key={drop} className="border-t border-border">
                      <td className="py-3">Pokles o {Math.abs(drop * 100)} %</td>
                      <td className="num text-right">{usd(price * (1 + drop))}</td>
                      <td className="num text-right text-destructive">{usd(pnl)}</td>
                      <td className="num text-right text-destructive">{czk(pnl * settings.fx)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
        <div className="flex gap-3 rounded-xl border border-border p-4">
          <Shield className="mt-0.5 size-5 shrink-0 text-primary" />
          <div>
            <p className="text-sm font-medium">Dlouhodobá pozice zůstává samostatná</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {core.qty > 0
                ? "Evidováno " +
                  core.qty.toLocaleString("cs-CZ", { maximumFractionDigits: 4 }) +
                  " akcií s průměrem " +
                  usd(core.avg) +
                  ". Změna ceny o 1 USD mění jejich hrubou hodnotu o " +
                  usd(core.qty) +
                  "."
                : "Zadej počet akcií a nákupní průměr v Nastavení. Plánovaný rozpočet " +
                  czk(settings.coreBudgetCzk) +
                  " není odhad současné hodnoty."}{" "}
              <Link to="/nastaveni" className="text-primary underline underline-offset-4">
                Upravit evidenci
              </Link>
            </p>
          </div>
        </div>
      </Card>
      <MarketContext />
    </div>
  );
}
