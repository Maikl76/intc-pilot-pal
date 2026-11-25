import { useEffect, useRef, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { ExternalLink, ChartCandlestick, LineChart as LineIcon } from "lucide-react";

export interface ChartPoint {
  timestamp: number;
  price: number;
}
const time = (v: number) =>
  new Date(v).toLocaleTimeString("cs-CZ", {
    timeZone: "Europe/Prague",
    hour: "2-digit",
    minute: "2-digit",
  });

function AdvancedChart() {
  const container = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const host = container.current;
    if (!host) return;
    const widget = document.createElement("div");
    widget.className = "tradingview-widget-container__widget";
    widget.style.height = "100%";
    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.type = "text/javascript";
    script.async = true;
    script.textContent = JSON.stringify({
      autosize: true,
      symbol: "NASDAQ:INTC",
      interval: "5",
      timezone: "Europe/Prague",
      theme: "dark",
      style: "1",
      locale: "cs",
      allow_symbol_change: false,
      hide_side_toolbar: false,
      withdateranges: true,
      calendar: false,
      support_host: "https://www.tradingview.com",
    });
    script.onerror = () => setFailed(true);
    host.append(widget, script);
    return () => {
      script.onerror = null;
      host.replaceChildren();
    };
  }, []);
  return (
    <div className="space-y-3">
      <div className="h-[390px] overflow-hidden rounded-xl">
        <div ref={container} className="tradingview-widget-container h-full w-full" />
      </div>
      <p className="text-sm text-muted-foreground">
        {failed ? "Graf se nepodařilo načíst. " : ""}Samostatný graf od{" "}
        <a
          className="text-primary underline underline-offset-4"
          href="https://www.tradingview.com/symbols/NASDAQ-INTC/"
          target="_blank"
          rel="noopener noreferrer"
        >
          TradingView
        </a>
        . Jeho zdroj a zpoždění se mohou lišit od ceny v simulátoru.
      </p>
    </div>
  );
}

export function TradeChart({
  points,
  reference,
  source,
  date,
  synchronized=false,
}: {
  points: ChartPoint[];
  reference?: number | null;
  source: string;
  date?: string | undefined;
  synchronized?: boolean;
}) {
  const [advanced, setAdvanced] = useState(false);
  const latest=points.at(-1);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-medium">{advanced?"Nezávislý graf TradingView":synchronized?"Synchronizovaný průběh ceny":"Historický průběh ceny"}</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {advanced?"Nezávislý zdroj; není cenou pro cvičné obchody":(date ?? "Čekám na tržní data")+" · čas Praha · "+source}
          </p>
        </div>
        <div className="flex rounded-lg border border-border p-1">
          <Button
            size="sm"
            variant={advanced ? "ghost" : "secondary"}
            onClick={() => setAdvanced(false)}
            aria-pressed={!advanced}
          >
            <LineIcon className="size-4" />
            Stejná cena
          </Button>
          <Button
            size="sm"
            variant={advanced ? "secondary" : "ghost"}
            onClick={() => setAdvanced(true)}
            aria-pressed={advanced}
          >
            <ChartCandlestick className="size-4" />
            TradingView
          </Button>
        </div>
      </div>
      {!advanced && latest ? <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm"><span>{synchronized?"Shodná poslední cena grafu a obchodního panelu":"Poslední cena importované historie"}</span><strong className="num">{latest.price.toFixed(2)} USD · {time(latest.timestamp)}</strong></div>:null}
      {advanced ? (
        <AdvancedChart />
      ) : points.length > 1 ? (
        <div
          className="h-[300px] sm:h-[340px]"
          role="img"
          aria-label="Časový graf ceny Intelu v amerických dolarech"
        >
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={points} margin={{ top: 16, right: 8, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="intel-price-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#44d7cf" stopOpacity={0.22} />
                  <stop offset="100%" stopColor="#44d7cf" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 5" />
              <XAxis
                dataKey="timestamp"
                type="number"
                domain={["dataMin", "dataMax"]}
                tickFormatter={time}
                minTickGap={45}
                axisLine={false}
                tickLine={false}
                tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
                dy={8}
              />
              <YAxis
                domain={["auto", "auto"]}
                orientation="right"
                width={58}
                tickFormatter={(v: number) => v.toFixed(2)}
                axisLine={false}
                tickLine={false}
                tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
              />
              <Tooltip
                labelFormatter={(v) => time(Number(v))}
                formatter={(v: number) => [v.toFixed(2) + " USD", "Cena"]}
                contentStyle={{
                  background: "var(--popover)",
                  borderColor: "var(--border)",
                  borderRadius: 12,
                  color: "var(--foreground)",
                }}
              />
              {reference != null ? (
                <ReferenceLine y={reference} stroke="#8291aa" strokeDasharray="4 5" />
              ) : null}
              <Area
                dataKey="price"
                type="linear"
                stroke="#44d7cf"
                strokeWidth={2}
                fill="url(#intel-price-fill)"
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="flex h-[300px] flex-col items-center justify-center rounded-xl border border-dashed border-border bg-background/30 px-6 text-center">
          <ChartCandlestick className="mb-4 size-9 text-muted-foreground" />
          <p className="font-medium">{latest?"Čekám na další pozorování stejného zdroje":"Pro graf zatím nejsou dostupné svíčky"}</p>
          <p className="mt-2 max-w-sm text-sm text-muted-foreground">
            {latest?"Poslední pozorování je zobrazené nad grafem. Další skutečné ceny se přidají při obnově zdroje.":"Můžeš otevřít nezávislý graf TradingView nebo načíst historická data v Backtestu. Cenu nedoplňujeme odhadem."}
          </p>
          <a
            href="https://www.nasdaq.com/market-activity/stocks/intc"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex items-center gap-2 text-sm text-primary"
          >
            Intel na Nasdaq <ExternalLink className="size-3.5" />
          </a>
        </div>
      )}
    </div>
  );
}
