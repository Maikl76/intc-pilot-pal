import { Lock, LockOpen } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  consecutiveLosses,
  fmtCzk,
  fmtPct,
  realizedTodayCzk,
} from "@/lib/strategy";
import { useStore } from "@/lib/store";

export function RiskPanel() {
  const { state, snapshot, setRiskLocked, togglePause } = useStore();
  const losses = consecutiveLosses(state.portfolio);
  const today = realizedTodayCzk(state.portfolio);

  return (
    <Card className="bg-card p-5">
      <div className="flex items-center justify-between">
        <div className="label-xs">Risk panel</div>
        <span
          className={`num text-xs font-semibold ${state.riskLocked ? "text-destructive" : "text-success"}`}
        >
          {state.riskLocked ? "ZAMČENO" : "V LIMITU"}
        </span>
      </div>

      <div className="mt-4 space-y-4 text-sm">
        <Row
          label="Využití max. expozice"
          value={`${fmtCzk(snapshot.exposureCzk)} / ${fmtCzk(state.params.maxExposureCzk)}`}
          progress={snapshot.capUsedPct}
        />
        <Row
          label="Drawdown od equity peaku"
          value={`${snapshot.drawdownPct.toFixed(2)} % (limit ${state.params.maxDrawdownPct} %)`}
          progress={(snapshot.drawdownPct / state.params.maxDrawdownPct) * 100}
          danger
        />
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="label-xs">Denní realizovaný P/L</div>
            <div className={`num ${today >= 0 ? "text-success" : "text-destructive"}`}>
              {fmtCzk(today)}
            </div>
          </div>
          <div>
            <div className="label-xs">Ztrátové prodeje v řadě</div>
            <div className="num">
              {losses} / {state.params.maxConsecutiveLosses}
            </div>
          </div>
        </div>
        <div>
          <div className="label-xs">Equity celkem</div>
          <div className="num">
            {fmtCzk(snapshot.equityCzk)}{" "}
            <span className="text-xs text-muted-foreground">
              (peak {fmtCzk(state.portfolio.equityPeakCzk)})
            </span>
          </div>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2 border-t border-border pt-4">
        <Button
          size="sm"
          variant={state.riskLocked ? "destructive" : "outline"}
          onClick={() => setRiskLocked(!state.riskLocked)}
        >
          {state.riskLocked ? (
            <>
              <LockOpen className="mr-1.5 h-4 w-4" /> Odemknout risk lock
            </>
          ) : (
            <>
              <Lock className="mr-1.5 h-4 w-4" /> Zamknout obchodování
            </>
          )}
        </Button>
        <Button size="sm" variant="outline" onClick={togglePause}>
          {state.portfolio.manualPause ? "Obnovit strategii" : "Pozastavit strategii"}
        </Button>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Při překročení limitu drawdownu nebo série ztrát se lock zapne automaticky a nákupy jsou
        blokovány, dokud jej ručně neodemkneš.{" "}
        {snapshot.unrealizedPnlPct !== 0
          ? `Nerealizovaně ${fmtPct(snapshot.unrealizedPnlPct)}.`
          : null}
      </p>
    </Card>
  );
}

function Row({
  label,
  value,
  progress,
  danger,
}: {
  label: string;
  value: string;
  progress: number;
  danger?: boolean;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="label-xs">{label}</span>
        <span className="num text-xs">{value}</span>
      </div>
      <Progress
        value={Math.min(100, Math.max(0, progress))}
        className={`mt-1.5 h-1.5 ${danger && progress > 70 ? "[&>div]:bg-destructive" : ""}`}
      />
    </div>
  );
}
