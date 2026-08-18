import { Bell } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { fmtDateTime } from "@/lib/strategy";
import { useStore } from "@/lib/store";

const KIND_LABEL: Record<string, string> = {
  BUY_ZONE: "Buy zone",
  STOP_ADD: "Stop-add",
  COOLDOWN: "Cooldown",
  RESTART: "Restart",
  SELL_TARGET: "Sell target",
  RISK: "Risk",
};

export function AlertsPanel() {
  const { state, markAlertsRead } = useStore();
  const unread = state.alerts.filter((a) => !a.read).length;

  return (
    <Card className="bg-card p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-primary" />
          <span className="label-xs">Alerty</span>
          {unread > 0 ? <Badge variant="secondary">{unread} nových</Badge> : null}
        </div>
        <Button size="sm" variant="ghost" onClick={markAlertsRead}>
          Označit jako přečtené
        </Button>
      </div>

      <ScrollArea className="mt-3 h-52 pr-3">
        <ul className="space-y-2">
          {state.alerts.length === 0 ? (
            <li className="text-sm text-muted-foreground">Zatím žádné alerty.</li>
          ) : null}
          {state.alerts.map((a) => (
            <li
              key={a.id}
              className={`rounded-md border border-border p-2.5 text-sm ${a.read ? "opacity-60" : ""}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="label-xs text-primary">{KIND_LABEL[a.kind] ?? a.kind}</span>
                <span className="num text-[11px] text-muted-foreground">
                  {fmtDateTime(a.createdAt)}
                </span>
              </div>
              <p className="mt-1 text-foreground/90">{a.message}</p>
            </li>
          ))}
        </ul>
      </ScrollArea>

      <p className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">
        Alerty běží čistě v aplikaci. Rozhraní pro webhook/e-mail je připraveno v README jako budoucí
        rozšíření, bez závislosti na externí službě.
      </p>
    </Card>
  );
}
