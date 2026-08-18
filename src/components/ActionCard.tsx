import { AlertTriangle, ArrowDownCircle, Ban, Hand, PauseCircle } from "lucide-react";

import { Card } from "@/components/ui/card";
import { ACTION_LABEL, fmtCzk, fmtNum, fmtUsd } from "@/lib/strategy";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

export function ActionCard() {
  const { snapshot, quote } = useStore();
  const a = snapshot.action;

  const style =
    a === "KUP"
      ? { ring: "border-success/50", text: "text-success", Icon: ArrowDownCircle }
      : a === "PRODAT_CAST"
        ? { ring: "border-warning/50", text: "text-warning", Icon: AlertTriangle }
        : a === "DRZET"
          ? { ring: "border-primary/40", text: "text-primary", Icon: Hand }
          : a === "PAUZA"
            ? { ring: "border-destructive/50", text: "text-destructive", Icon: PauseCircle }
            : { ring: "border-border", text: "text-muted-foreground", Icon: Ban };

  return (
    <Card className={cn("border-2 bg-card p-6", style.ring)}>
      <div className="label-xs">Co dělat teď</div>
      <div className="mt-2 flex items-center gap-3">
        <style.Icon className={cn("h-8 w-8", style.text)} />
        <div className={cn("num text-3xl font-bold tracking-tight", style.text)}>
          {ACTION_LABEL[a]}
        </div>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-foreground/90">{snapshot.reason}</p>

      {snapshot.sellCandidate ? (
        <div
          className={cn(
            "mt-3 rounded-md border p-3 text-xs",
            snapshot.emergencyStopHit
              ? "border-destructive/60 bg-destructive/10 text-destructive"
              : "border-success/40 bg-success/10 text-foreground/90",
          )}
        >
          <div className="font-semibold">
            {snapshot.emergencyStopHit
              ? "NOUZOVÝ OCHRANNÝ STOP — návrh na uzavření tranše"
              : "Návrh prodeje konkrétní tranše"}
          </div>
          <div className="num mt-1">
            {fmtNum(snapshot.sellCandidate.view.shares)} ks z tranše nakoupené za{" "}
            {fmtUsd(snapshot.sellCandidate.view.buyPriceUsd)} · target{" "}
            {fmtUsd(snapshot.sellCandidate.view.targetPriceUsd)} · nouzový stop{" "}
            {fmtUsd(snapshot.sellCandidate.view.stopPriceUsd)} · důvod{" "}
            {snapshot.sellCandidate.reason}
          </div>
        </div>
      ) : null}

      {snapshot.buyBlockedReasons.length > 1 ? (
        <ul className="mt-3 space-y-1 border-t border-border pt-3 text-xs text-muted-foreground">
          {snapshot.buyBlockedReasons.slice(1).map((r) => (
            <li key={r}>• {r}</li>
          ))}
        </ul>
      ) : null}


      <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 border-t border-border pt-3 text-xs text-muted-foreground">
        <span>
          Cena <span className="num text-foreground">{fmtUsd(quote.priceUsd)}</span>
        </span>
        <span>
          Návrh tranše{" "}
          <span className="num text-foreground">{fmtCzk(snapshot.suggestedValueCzk)}</span>
        </span>
        <span>
          Stav strategie <span className="num text-foreground">{snapshot.status}</span>
        </span>
      </div>
    </Card>
  );
}
