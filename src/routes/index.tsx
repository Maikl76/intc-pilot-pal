import { createFileRoute } from "@tanstack/react-router";

import { ActionCard } from "@/components/ActionCard";
import { AlertsPanel } from "@/components/AlertsPanel";
import { OrderTicket } from "@/components/OrderTicket";
import { RiskPanel } from "@/components/RiskPanel";
import { StatTile } from "@/components/StatTile";
import { Badge } from "@/components/ui/badge";
import { fmtCzk, fmtNum, fmtPct, fmtUsd } from "@/lib/strategy";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard | INTC Trading Pilot" },
      {
        name: "description",
        content:
          "Decision-support dashboard pro mean-reversion strategii na akcii Intel (INTC) s PAPER režimem, risk panelem a signály.",
      },
      { property: "og:title", content: "Dashboard | INTC Trading Pilot" },
      {
        property: "og:description",
        content: "Řízení mean-reversion strategie na INTC: signály, expozice, risk limity, order ticket.",
      },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { state, quote, snapshot } = useStore();
  const p = state.portfolio;

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">INTC — přehled strategie</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Mean-reversion, konstantní tranše {fmtCzk(state.params.trancheCzk)}, cap{" "}
            {fmtCzk(state.params.maxExposureCzk)}.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">Data source: {quote.sourceLabel}</Badge>
          <Badge
            variant={
              snapshot.status === "ACTIVE"
                ? "default"
                : snapshot.status === "COOLDOWN"
                  ? "secondary"
                  : "destructive"
            }
          >
            {snapshot.status}
          </Badge>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Cena INTC"
          value={fmtUsd(quote.priceUsd)}
          hint={`Předchozí close ${fmtUsd(quote.previousCloseUsd)}`}
        />
        <StatTile
          label="Denní změna"
          value={fmtPct(quote.changePct)}
          tone={quote.changePct >= 0 ? "positive" : "negative"}
        />
        <StatTile
          label="Průměrná cena pozice"
          value={snapshot.shares > 0 ? fmtUsd(snapshot.avgPriceUsd) : "—"}
          hint={`${fmtNum(snapshot.shares)} ks`}
        />
        <StatTile
          label="Expozice"
          value={fmtCzk(snapshot.exposureCzk)}
          hint={`${snapshot.capUsedPct.toFixed(1)} % capu`}
        />
        <StatTile
          label="Nerealizovaný P/L"
          value={fmtCzk(snapshot.unrealizedPnlCzk)}
          hint={fmtPct(snapshot.unrealizedPnlPct)}
          tone={snapshot.unrealizedPnlCzk >= 0 ? "positive" : "negative"}
        />
        <StatTile label="Volná hotovost" value={fmtCzk(p.cashCzk)} />
        <StatTile
          label="Referenční cena cyklu"
          value={p.cycleReferencePriceUsd ? fmtUsd(p.cycleReferencePriceUsd) : "—"}
          hint={
            snapshot.dropFromReferencePct !== null
              ? `Pokles ${snapshot.dropFromReferencePct.toFixed(2)} %`
              : "Cyklus zatím neotevřen"
          }
        />
        <StatTile
          label="Lokální minimum"
          value={p.cycleLowUsd ? fmtUsd(p.cycleLowUsd) : "—"}
          hint={
            snapshot.reboundFromLowPct !== null
              ? `Rebound ${snapshot.reboundFromLowPct.toFixed(2)} % / potřeba ${state.params.reboundPct} %`
              : undefined
          }
        />
        <StatTile
          label="Do 8% stop-add hranice"
          value={
            snapshot.distanceToStopAddPct !== null
              ? `${snapshot.distanceToStopAddPct.toFixed(2)} p.b.`
              : "—"
          }
          tone={
            snapshot.distanceToStopAddPct !== null && snapshot.distanceToStopAddPct <= 0
              ? "negative"
              : "neutral"
          }
          hint={`Hranice ${state.params.stopAddDropPct} % od reference`}
        />
        <StatTile
          label="Do capu expozice"
          value={fmtCzk(snapshot.distanceToCapCzk)}
          hint={`Cap ${fmtCzk(state.params.maxExposureCzk)}`}
        />
        <StatTile
          label="Cooldown"
          value={
            snapshot.cooldownDaysRemaining !== null
              ? `${snapshot.cooldownDaysRemaining} dní zbývá`
              : "neaktivní"
          }
          hint={`Minimum ${state.params.cooldownDays} kalendářních dní`}
          tone={snapshot.cooldownDaysRemaining ? "warning" : "neutral"}
        />
        <StatTile
          label="Prodejní modul"
          value={
            state.params.sellMode === "A"
              ? "A — nad průměrem"
              : state.params.sellMode === "B"
                ? "B — nad tranší"
                : "C — ruční potvrzení"
          }
          hint={`Target ${state.params.sellTargetPct} %`}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <ActionCard />
          <RiskPanel />
        </div>
        <div className="space-y-6">
          <OrderTicket />
          <AlertsPanel />
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Aplikace je decision-support nástroj. Nejde o investiční doporučení; historické výsledky
        nejsou zárukou budoucích výnosů.
      </p>
    </div>
  );
}
