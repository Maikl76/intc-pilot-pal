import { createFileRoute } from "@tanstack/react-router";
import { Info } from "lucide-react";

import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DEFAULT_PARAMS, fmtCzk } from "@/lib/strategy";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/backtest")({
  head: () => ({
    meta: [
      { title: "Backtest reference | INTC Trading Pilot" },
      {
        name: "description",
        content:
          "Historický replay 2025–2026 pro mean-reversion pravidla na INTC — referenční údaj, nikoli garance budoucích výnosů.",
      },
      { property: "og:title", content: "Backtest reference | INTC Trading Pilot" },
      {
        property: "og:description",
        content: "Kandidátní pravidla 15k/8 %/5d/3 %/300k v historickém replay 2025+2026.",
      },
    ],
  }),
  component: BacktestPage,
});

function BacktestPage() {
  const { state } = useStore();
  const p = state.params;

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Backtest — historická reference</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Replay 2025 + 2026 nad historickými daty INTC.
        </p>
      </div>

      <Card className="border-warning/40 bg-warning/10 p-4">
        <div className="flex items-start gap-2 text-sm">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <p>
            Uvedené hodnoty jsou <strong>historický referenční údaj z replaye</strong>, nikoli
            garance ani projekce budoucích výnosů. Aplikace záměrně nezobrazuje žádné neověřené
            odhady budoucí výkonnosti.
          </p>
        </div>
      </Card>

      <Card className="bg-card p-6">
        <h2 className="text-lg font-semibold">Kandidátní sada pravidel</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          V historickém replay 2025+2026 kandidátní sada 15k / 8 % / 5 dní / 3 % / 300k zlepšila
          poměr zisku k drawdownu oproti základní variantě. Jde o kvalitativní závěr z replaye,
          proto zde nejsou dopočítávána žádná konkrétní výnosová čísla.
        </p>
        <Table className="mt-4">
          <TableHeader>
            <TableRow>
              <TableHead>Parametr</TableHead>
              <TableHead>Kandidátní sada (replay)</TableHead>
              <TableHead>Výchozí v aplikaci</TableHead>
              <TableHead>Aktuálně nastaveno</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <Row
              label="Nákupní tranše"
              backtest="15 000 Kč"
              def={fmtCzk(DEFAULT_PARAMS.trancheCzk)}
              current={fmtCzk(p.trancheCzk)}
            />
            <Row
              label="Stop-add pokles"
              backtest="8 %"
              def={`${DEFAULT_PARAMS.stopAddDropPct} %`}
              current={`${p.stopAddDropPct} %`}
            />
            <Row
              label="Cooldown"
              backtest="5 dní"
              def={`${DEFAULT_PARAMS.cooldownDays} dní`}
              current={`${p.cooldownDays} dní`}
            />
            <Row
              label="Rebound pro restart"
              backtest="3 %"
              def={`${DEFAULT_PARAMS.reboundPct} %`}
              current={`${p.reboundPct} %`}
            />
            <Row
              label="Cap expozice"
              backtest="300 000 Kč"
              def={fmtCzk(DEFAULT_PARAMS.maxExposureCzk)}
              current={fmtCzk(p.maxExposureCzk)}
            />
            <Row
              label="Prodejní pravidlo"
              backtest="netestováno — otevřená otázka"
              def="C — ruční potvrzení"
              current={
                p.sellMode === "A"
                  ? `A — ${p.sellTargetPct} % nad průměrem`
                  : p.sellMode === "B"
                    ? `B — ${p.sellTargetPct} % nad tranší`
                    : `C — ruční potvrzení (target ${p.sellTargetPct} %)`
              }
            />
          </TableBody>
        </Table>
      </Card>

      <Card className="bg-card p-6">
        <h2 className="text-lg font-semibold">Metodické poznámky</h2>
        <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
          <li>• Replay pracoval s konstantní tranší, bez navyšování během poklesu.</li>
          <li>• Cooldown se počítal v kalendářních, nikoli obchodních dnech.</li>
          <li>
            • Prodejní pravidlo nebylo v replay definitivně ověřeno — proto je v aplikaci jako
            konfigurovatelný modul s výchozím ručním potvrzením.
          </li>
          <li>• FX náklady CZK/USD a poplatky brokera nejsou v replay plně zahrnuty.</li>
          <li>• Slider targetu 0,5–5 % slouží k budoucímu testu, ne jako ověřený parametr.</li>
        </ul>
      </Card>
    </div>
  );
}

function Row({
  label,
  backtest,
  def,
  current,
}: {
  label: string;
  backtest: string;
  def: string;
  current: string;
}) {
  return (
    <TableRow>
      <TableCell>{label}</TableCell>
      <TableCell className="num text-muted-foreground">{backtest}</TableCell>
      <TableCell className="num text-muted-foreground">{def}</TableCell>
      <TableCell className="num">{current}</TableCell>
    </TableRow>
  );
}
