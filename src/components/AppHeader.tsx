import { Link } from "@tanstack/react-router";
import { Activity, ShieldCheck } from "lucide-react";
import { usePilot, usd, dateTime } from "@/lib/pilot-store";
import { ageMinutes, marketPhase } from "@/lib/pilot-quotes.mjs";
const NAV = [
  { to: "/", label: "Obchodní přehled" },
  { to: "/prognoza", label: "Prognóza" },
  { to: "/zpravy", label: "Zprávy a důkazy" },
  { to: "/riziko", label: "Riziko a scénáře" },
  { to: "/historie", label: "Historie" },
  { to: "/backtest", label: "Backtest" },
  { to: "/nastaveni", label: "Nastavení" },
] as const;
export function AppHeader() {
  const { quote,now } = usePilot();
  const age=ageMinutes(quote,now);
  const stale=age!==null && (age>20 || quote?.session!==marketPhase(now));
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
        <Link
          to="/"
          className="flex shrink-0 items-center gap-3"
          aria-label="Intel Pilot, obchodní přehled"
        >
          <span className="flex size-10 items-center justify-center rounded-xl bg-primary/15 text-primary ring-1 ring-primary/25">
            <Activity className="size-6" />
          </span>
          <div>
            <span className="block text-lg font-semibold tracking-tight">
              INTEL <span className="font-normal text-muted-foreground">PILOT</span>
            </span>
            <span className="block text-xs tracking-[0.15em] text-muted-foreground">
              DATA. PLÁN. DISCIPLÍNA.
            </span>
          </div>
        </Link>
        <div className="flex items-center gap-3 sm:gap-5">
          <div className="hidden text-right sm:block">
            <span className="text-xs text-muted-foreground">{stale?"INTC · poslední dostupná":"NASDAQ · INTC"}</span>
            <div className="num text-sm font-medium">
              {quote?.status === "OK" && quote.price != null ? usd(quote.price) : "Čekám na data"}
            </div>
            {quote?.timestamp!=null?<span className="text-[10px] text-muted-foreground">{dateTime(quote.timestamp)}</span>:null}
          </div>
          <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-2 text-xs font-medium text-primary">
            <ShieldCheck className="size-4" />
            CVIČNÝ ÚČET
          </span>
        </div>
      </div>
      <nav
        aria-label="Hlavní navigace"
        className="mx-auto flex max-w-[1440px] gap-1 overflow-x-auto px-4 sm:px-6 lg:px-8"
      >
        {NAV.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className="whitespace-nowrap border-b-2 border-transparent px-3 py-3 text-sm text-muted-foreground transition-colors hover:text-foreground"
            activeProps={{ className: "border-primary text-primary" }}
            activeOptions={{ exact: item.to === "/" }}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
