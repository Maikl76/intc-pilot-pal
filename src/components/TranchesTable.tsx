import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TRANCHE_STATUS_LABEL, fmtNum, fmtPct, fmtUsd } from "@/lib/strategy";
import { useStore } from "@/lib/store";

export function TranchesTable() {
  const { state, snapshot } = useStore();
  const views = snapshot.trancheViews;

  return (
    <Card className="bg-card p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">Otevřené tranše</h2>
        <p className="text-xs text-muted-foreground">
          Každá tranše má vlastní target +{state.params.sellTargetPct} % a nouzový ochranný stop −
          {state.params.emergencyStopPct} % od své nákupní ceny. Targety se neslučují podle průměrné
          ceny pozice.
        </p>
      </div>

      {views.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">Žádná otevřená tranše.</p>
      ) : (
        <Table className="mt-4">
          <TableHeader>
            <TableRow>
              <TableHead>Nákup</TableHead>
              <TableHead className="text-right">Ks</TableHead>
              <TableHead className="text-right">Aktuální</TableHead>
              <TableHead className="text-right">P/L %</TableHead>
              <TableHead className="text-right">Target</TableHead>
              <TableHead className="text-right">Nouzový stop</TableHead>
              <TableHead>Stav</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {views.map((v) => (
              <TableRow key={v.tranche.id}>
                <TableCell className="num">{fmtUsd(v.buyPriceUsd)}</TableCell>
                <TableCell className="num text-right">{fmtNum(v.shares)}</TableCell>
                <TableCell className="num text-right">{fmtUsd(v.currentPriceUsd)}</TableCell>
                <TableCell
                  className={`num text-right ${v.pnlPct >= 0 ? "text-success" : "text-destructive"}`}
                >
                  {fmtPct(v.pnlPct)}
                </TableCell>
                <TableCell className="num text-right text-muted-foreground">
                  {fmtUsd(v.targetPriceUsd)}
                </TableCell>
                <TableCell className="num text-right text-muted-foreground">
                  {fmtUsd(v.stopPriceUsd)}
                </TableCell>
                <TableCell>
                  <Badge
                    variant={
                      v.status === "STOP_HIT"
                        ? "destructive"
                        : v.status === "TARGET_HIT"
                          ? "default"
                          : "secondary"
                    }
                  >
                    {TRANCHE_STATUS_LABEL[v.status]}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Card>
  );
}
