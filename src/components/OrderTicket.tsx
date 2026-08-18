import { useServerFn } from "@tanstack/react-start";
import { ShieldAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { submitOrder } from "@/lib/orders.functions";
import { fmtCzk, fmtNum, fmtUsd } from "@/lib/strategy";
import { useStore } from "@/lib/store";

export function OrderTicket() {
  const { state, quote, snapshot, recordBuy, recordSell, recordRejected } = useStore();
  const send = useServerFn(submitOrder);
  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
  const [shares, setShares] = useState<string>("0");
  const [prepared, setPrepared] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setShares(
      side === "BUY" ? String(snapshot.suggestedShares) : String(Number(snapshot.shares.toFixed(2))),
    );
    setPrepared(false);
  }, [side, snapshot.suggestedShares, snapshot.shares]);

  const qty = Number(shares) || 0;
  const valueUsd = qty * quote.priceUsd;
  const valueCzk = valueUsd * state.params.fxUsdCzk;
  const isLive = state.mode === "LIVE";

  async function execute(confirmed: boolean) {
    if (qty <= 0) {
      toast.error("Zadej kladné množství akcií.");
      return;
    }
    setBusy(true);
    try {
      const res = await send({
        data: {
          side,
          shares: qty,
          priceUsd: quote.priceUsd,
          mode: state.mode,
          idempotencyKey: `${side}-${qty}-${quote.priceUsd}-${Date.now()}`,
          confirmed,
        },
      });
      if (res.status === "REJECTED") {
        recordRejected(side, qty, quote.priceUsd, res.message);
        toast.error(res.message);
      } else {
        if (side === "BUY") recordBuy(qty, quote.priceUsd, res.message, res.status);
        else recordSell(qty, quote.priceUsd, res.message, res.status);
        toast.success(res.message);
      }
    } catch {
      toast.error("Pokyn se nepodařilo zpracovat. Zkus to znovu.");
    } finally {
      setBusy(false);
      setPrepared(false);
    }
  }

  return (
    <Card className="bg-card p-5">
      <div className="flex items-center justify-between">
        <div className="label-xs">Order ticket</div>
        <Badge variant={isLive ? "destructive" : "secondary"}>
          {isLive ? "LIVE — reálný pokyn" : "PAPER — simulace"}
        </Badge>
      </div>

      <div className="mt-4 flex gap-2">
        <Button
          size="sm"
          variant={side === "BUY" ? "default" : "outline"}
          onClick={() => setSide("BUY")}
        >
          Nákup
        </Button>
        <Button
          size="sm"
          variant={side === "SELL" ? "default" : "outline"}
          onClick={() => setSide("SELL")}
          disabled={snapshot.shares <= 0}
        >
          Prodej
        </Button>
      </div>

      <div className="mt-4 space-y-2">
        <Label htmlFor="qty">Množství akcií INTC</Label>
        <Input
          id="qty"
          className="num"
          value={shares}
          inputMode="decimal"
          onChange={(e) => {
            setShares(e.target.value);
            setPrepared(false);
          }}
        />
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-4 text-sm">
        <div>
          <dt className="label-xs">Odhad USD</dt>
          <dd className="num">{fmtUsd(valueUsd)}</dd>
        </div>
        <div>
          <dt className="label-xs">Odhad CZK</dt>
          <dd className="num">{fmtCzk(valueCzk)}</dd>
        </div>
        <div>
          <dt className="label-xs">Cena</dt>
          <dd className="num">{fmtUsd(quote.priceUsd)}</dd>
        </div>
        <div>
          <dt className="label-xs">Kurz USD/CZK</dt>
          <dd className="num">{fmtNum(state.params.fxUsdCzk)}</dd>
        </div>
      </dl>

      {snapshot.fxWarning ? (
        <p className="mt-3 rounded-md border border-warning/40 bg-warning/10 p-2 text-xs text-warning">
          Obchod neprobíhá v USD — počítej s FX nákladem na konverzi CZK/USD.
        </p>
      ) : null}

      <div className="mt-4 space-y-2">
        {!isLive ? (
          <Button className="w-full" disabled={busy} onClick={() => execute(false)}>
            Simulovat pokyn
          </Button>
        ) : !prepared ? (
          <Button
            className="w-full"
            variant="outline"
            disabled={busy}
            onClick={() => setPrepared(true)}
          >
            Připravit objednávku
          </Button>
        ) : (
          <div className="space-y-2 rounded-md border-2 border-destructive/60 bg-destructive/10 p-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-destructive">
              <ShieldAlert className="h-4 w-4" />
              Potvrzení LIVE objednávky
            </div>
            <p className="text-xs text-foreground/90">
              {side === "BUY" ? "Nákup" : "Prodej"} {fmtNum(qty)} ks INTC za {fmtUsd(quote.priceUsd)}{" "}
              (≈ {fmtCzk(valueCzk)}). Toto je reálný pokyn na účet Trading 212.
            </p>
            <div className="flex gap-2">
              <Button
                variant="destructive"
                className="flex-1"
                disabled={busy}
                onClick={() => execute(true)}
              >
                Odeslat reálný pokyn
              </Button>
              <Button variant="outline" onClick={() => setPrepared(false)}>
                Zrušit
              </Button>
            </div>
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          Nic se neodesílá automaticky. Každý pokyn vzniká jen po tvém kliknutí.
        </p>
      </div>
    </Card>
  );
}
