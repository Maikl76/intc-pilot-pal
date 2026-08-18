import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { KeyRound, ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { getConnectionStatus } from "@/lib/market.functions";
import { PARAM_LIMITS, fmtCzk } from "@/lib/strategy";
import { useStore } from "@/lib/store";
import type { StrategyParams } from "@/lib/types";

export const Route = createFileRoute("/nastaveni")({
  head: () => ({
    meta: [
      { title: "Nastavení strategie a API | INTC Trading Pilot" },
      {
        name: "description",
        content:
          "Úprava parametrů mean-reversion strategie na INTC a bezpečné napojení Trading 212 API přes serverové secrety.",
      },
      { property: "og:title", content: "Nastavení strategie a API | INTC Trading Pilot" },
      {
        property: "og:description",
        content: "Tranše, stop-add, cooldown, rebound, prodejní modul a konfigurace API klíčů.",
      },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { state, updateParam } = useStore();
  const p = state.params;
  const conn = useQuery({ queryKey: ["conn"], queryFn: () => getConnectionStatus() });

  const num = <K extends keyof StrategyParams>(key: K, label: string, unit: string) => {
    const limits = PARAM_LIMITS[key as keyof typeof PARAM_LIMITS];
    const value = p[key] as number;
    return (
      <div key={String(key)} className="space-y-2">
        <div className="flex items-baseline justify-between">
          <Label>{label}</Label>
          <span className="num text-sm">
            {value} {unit}
          </span>
        </div>
        <Slider
          value={[value]}
          min={limits.min}
          max={limits.max}
          step={limits.step}
          onValueChange={([v]) =>
            updateParam(key, v as StrategyParams[K], label)
          }
        />
        <p className="text-xs text-muted-foreground">
          Rozsah {limits.min}–{limits.max} {unit}
        </p>
      </div>
    );
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Nastavení</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Všechny parametry lze měnit; každá změna se zapisuje do historie.
        </p>
      </div>

      <Card className="bg-card p-6">
        <h2 className="text-lg font-semibold">Parametry strategie</h2>
        <div className="mt-5 grid gap-6 sm:grid-cols-2">
          {num("trancheCzk", "Základní nákupní tranše", "Kč")}
          {num("maxExposureCzk", "Maximální expozice INTC", "Kč")}
          {num("stopAddDropPct", "Stop-add: pokles od reference cyklu", "%")}
          {num("cooldownDays", "Minimální cooldown", "dní")}
          {num("reboundPct", "Rebound od minima pro restart", "%")}
          {num("fxUsdCzk", "Kurz USD/CZK pro přepočty", "CZK")}
        </div>

        <Separator className="my-6" />

        <div className="grid gap-6 sm:grid-cols-2">
          <div className="flex items-center justify-between gap-4 rounded-md border border-border p-3">
            <div>
              <Label>Konstantní tranše při poklesu</Label>
              <p className="mt-1 text-xs text-muted-foreground">
                Velikost nových nákupů se během poklesu nenavyšuje (doporučeno).
              </p>
            </div>
            <Switch
              checked={p.constantTrancheOnDrawdown}
              onCheckedChange={(v) =>
                updateParam("constantTrancheOnDrawdown", v, "Konstantní tranše při poklesu")
              }
            />
          </div>
          <div className="rounded-md border border-border p-3">
            <Label>Preferovaná obchodní měna</Label>
            <RadioGroup
              className="mt-2 flex gap-4"
              value={p.preferredCurrency}
              onValueChange={(v) =>
                updateParam("preferredCurrency", v as "USD" | "CZK", "Obchodní měna")
              }
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="USD" id="cur-usd" />
                <Label htmlFor="cur-usd">USD</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="CZK" id="cur-czk" />
                <Label htmlFor="cur-czk">CZK</Label>
              </div>
            </RadioGroup>
            <p className="mt-2 text-xs text-muted-foreground">
              Mimo USD aplikace zobrazí upozornění na FX náklad konverze.
            </p>
          </div>
        </div>
      </Card>

      <Card className="bg-card p-6">
        <h2 className="text-lg font-semibold">Prodejní modul (per tranše)</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Výchozí režim podle posledního backtestu je B — každá tranše má vlastní take-profit
          {" "}+{p.sellTargetPct} % od své nákupní ceny. Targety se neslučují podle průměrné ceny
          celé pozice.
        </p>
        <RadioGroup
          className="mt-4 space-y-3"
          value={p.sellMode}
          onValueChange={(v) => updateParam("sellMode", v as "A" | "B" | "C", "Prodejní režim")}
        >
          {[
            { v: "B", t: "B — per-tranche target nad nákupní cenou dané tranše (default)" },
            { v: "A", t: "A — target % nad průměrnou cenou pozice" },
            { v: "C", t: "C — ruční potvrzení signálu" },
          ].map((o) => (
            <div key={o.v} className="flex items-start gap-3 rounded-md border border-border p-3">
              <RadioGroupItem value={o.v} id={`sell-${o.v}`} className="mt-0.5" />
              <Label htmlFor={`sell-${o.v}`} className="font-normal">
                {o.t}
              </Label>
            </div>
          ))}
        </RadioGroup>
        <div className="mt-5 grid gap-6 sm:grid-cols-2">
          {num("sellTargetPct", "Take-profit na tranši", "%")}
          {num("emergencyStopPct", "Nouzový ochranný stop na tranši", "%")}
        </div>
        <div className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs">
          <strong>Nouzový ochranný stop není běžný krátký stop-loss.</strong> Jde o krajní ochranu
          kapitálu při hlubokém propadu tranše (default −{p.emergencyStopPct} % od její nákupní
          ceny). Nikdy se neodesílá automaticky — vždy jde jen o návrh k potvrzení.
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Rozsahy: take-profit {PARAM_LIMITS.sellTargetPct.min}–{PARAM_LIMITS.sellTargetPct.max} %,
          nouzový stop {PARAM_LIMITS.emergencyStopPct.min}–{PARAM_LIMITS.emergencyStopPct.max} %.
          Historický backtest není garance budoucího výsledku.
        </p>
      </Card>


      <Card className="bg-card p-6">
        <h2 className="text-lg font-semibold">Risk limity</h2>
        <div className="mt-5 grid gap-6 sm:grid-cols-2">
          {num("maxDrawdownPct", "Max. drawdown od equity peaku", "%")}
          {num("maxConsecutiveLosses", "Max. ztrátových prodejů v řadě", "×")}
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          Aktuální cap expozice: {fmtCzk(p.maxExposureCzk)}.
        </p>
      </Card>

      <Card className="bg-card p-6">
        <div className="flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Napojení Trading 212 API</h2>
        </div>
        <div className="mt-3 flex items-start gap-2 rounded-md border border-primary/40 bg-primary/10 p-3 text-sm">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <p>
            API Key a Secret se ukládají výhradně na server (Project Settings → Secrets). Nikdy se
            nezapisují do localStorage ani do klientského bundlu; níže vidíš pouze maskovaný stav.
          </p>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <SecretRow
            name="TRADING212_API_KEY"
            configured={conn.data?.trading212Configured ?? false}
            masked={conn.data?.trading212KeyMasked ?? "—"}
          />
          <SecretRow
            name="TRADING212_API_SECRET"
            configured={conn.data?.trading212SecretConfigured ?? false}
            masked={conn.data?.trading212SecretMasked ?? "—"}
          />
          <SecretRow
            name="MARKET_DATA_API_KEY"
            configured={conn.data?.marketDataConfigured ?? false}
            masked={conn.data?.marketDataKeyMasked ?? "—"}
          />
          <div className="rounded-md border border-border p-3">
            <div className="label-xs">TRADING212_BASE_URL</div>
            <div className="num mt-1 text-sm">{conn.data?.baseUrl ?? "—"}</div>
          </div>
        </div>

        <div className="mt-5 space-y-2">
          <Label htmlFor="secret-placeholder">Vložení secretu</Label>
          <Input
            id="secret-placeholder"
            disabled
            placeholder="Secrety se zadávají v Project Settings → Secrets, ne zde"
          />
          <p className="text-xs text-muted-foreground">
            Postup: Project Settings → Secrets → přidej TRADING212_API_KEY, případně
            TRADING212_API_SECRET, TRADING212_BASE_URL a MARKET_DATA_API_KEY. Detailní kroky jsou v
            README projektu.
          </p>
        </div>
      </Card>

      <Card className="bg-card p-6">
        <h2 className="text-lg font-semibold">Datový zdroj</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Kotace prochází abstrakcí providerů: MOCK (demo, výchozí) → TRADING212 → EXTERNAL
          (Finnhub / Twelve Data). Trading 212 beta nemusí umět dodat cenu bez otevřené pozice,
          proto je fallback provider připraven jako samostatný adaptér v{" "}
          <span className="num">src/lib/market.functions.ts</span>.
        </p>
      </Card>
    </div>
  );
}

function SecretRow({
  name,
  configured,
  masked,
}: {
  name: string;
  configured: boolean;
  masked: string;
}) {
  return (
    <div className="rounded-md border border-border p-3">
      <div className="flex items-center justify-between">
        <span className="label-xs">{name}</span>
        <Badge variant={configured ? "default" : "secondary"}>
          {configured ? "nastaveno" : "chybí"}
        </Badge>
      </div>
      <div className="num mt-1 text-sm">{configured ? masked : "—"}</div>
    </div>
  );
}
