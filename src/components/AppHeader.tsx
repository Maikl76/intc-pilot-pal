import { Link } from "@tanstack/react-router";
import { Activity } from "lucide-react";
import { usePilot,usd } from "@/lib/pilot-store";
const NAV=[{to:"/",label:"Trading"},{to:"/historie",label:"Historie / import"},{to:"/nastaveni",label:"Nastavení"},{to:"/backtest",label:"Backtest"}] as const;
export function AppHeader(){const {quote}=usePilot();return <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur"><div className="mx-auto flex max-w-7xl flex-wrap items-center gap-4 px-4 py-3">
  <Link to="/" className="flex items-center gap-2"><Activity className="h-5 w-5 text-primary"/><span className="font-semibold">INTC Trading Pilot 2.0</span></Link>
  <nav className="flex flex-wrap items-center gap-1 text-sm">{NAV.map(item=><Link key={item.to} to={item.to} className="rounded-md px-2.5 py-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground" activeProps={{className:"bg-secondary text-foreground"}} activeOptions={{exact:item.to==="/"}}>{item.label}</Link>)}</nav>
  <div className="ml-auto text-right text-xs"><span className="font-semibold text-success">PAPER ONLY</span><div className="text-muted-foreground">{quote?.status==="OK"&&quote.price!=null?usd(quote.price):"Bez kotace"}</div></div>
  </div></header>;}
