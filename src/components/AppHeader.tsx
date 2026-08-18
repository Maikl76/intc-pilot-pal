import { Link } from "@tanstack/react-router";
import { Activity, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { fmtPct, fmtUsd } from "@/lib/strategy";
import { useStore } from "@/lib/store";

const NAV = [
  { to: "/", label: "Dashboard" },
  { to: "/historie", label: "Historie" },
  { to: "/nastaveni", label: "Nastavení" },
  { to: "/backtest", label: "Backtest" },
] as const;

export function AppHeader() {
  const { state, quote, setMode, resetDemo } = useStore();
  const isLive = state.mode === "LIVE";

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur">
      {isLive ? (
        <div className="bg-live px-4 py-1.5 text-center text-xs font-semibold uppercase tracking-widest text-live-foreground">
          LIVE režim — pokyny mohou jít na reálný účet, každý vyžaduje druhé potvrzení
        </div>
      ) : null}
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-4 px-4 py-3">
        <Link to="/" className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-primary" />
          <span className="text-sm font-semibold tracking-tight">INTC Trading Pilot</span>
        </Link>

        <nav className="flex items-center gap-1 text-sm">
          {NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="rounded-md px-2.5 py-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              activeProps={{ className: "bg-secondary text-foreground" }}
              activeOptions={{ exact: item.to === "/" }}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-4">
          <div className="hidden text-right sm:block">
            <div className="num text-sm font-semibold">{fmtUsd(quote.priceUsd)}</div>
            <div
              className={`num text-xs ${quote.changePct >= 0 ? "text-success" : "text-destructive"}`}
            >
              {fmtPct(quote.changePct)}
            </div>
          </div>

          <div className="flex items-center gap-2 rounded-md border border-border px-3 py-1.5">
            <span
              className={`num text-xs font-bold ${isLive ? "text-destructive" : "text-paper"}`}
            >
              {state.mode}
            </span>
            <Switch
              checked={isLive}
              onCheckedChange={(v) => setMode(v ? "LIVE" : "PAPER")}
              aria-label="Přepnout LIVE režim"
            />
          </div>

          <Button size="sm" variant="ghost" onClick={resetDemo} title="Obnovit demo data">
            <RotateCcw className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </header>
  );
}
