import { createFileRoute } from "@tanstack/react-router";

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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ACTION_LABEL, fmtCzk, fmtDateTime, fmtNum, fmtUsd } from "@/lib/strategy";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/historie")({
  head: () => ({
    meta: [
      { title: "Historie signálů a pokynů | INTC Trading Pilot" },
      {
        name: "description",
        content:
          "Kompletní log signálů strategie, simulovaných i live pokynů a všech změn parametrů strategie na INTC.",
      },
      { property: "og:title", content: "Historie signálů a pokynů | INTC Trading Pilot" },
      {
        property: "og:description",
        content: "Audit trail: signály, PAPER/LIVE objednávky a změny parametrů.",
      },
    ],
  }),
  component: HistoryPage,
});

function HistoryPage() {
  const { state } = useStore();

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Historie</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Audit trail signálů, objednávek a změn parametrů. Data jsou uložena lokálně v prohlížeči —
          žádné secrety zde nejsou.
        </p>
      </div>

      <Tabs defaultValue="orders">
        <TabsList>
          <TabsTrigger value="orders">Objednávky</TabsTrigger>
          <TabsTrigger value="signals">Signály</TabsTrigger>
          <TabsTrigger value="params">Změny parametrů</TabsTrigger>
        </TabsList>

        <TabsContent value="orders">
          <Card className="bg-card p-2">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Čas</TableHead>
                  <TableHead>Strana</TableHead>
                  <TableHead className="text-right">Ks</TableHead>
                  <TableHead className="text-right">Cena</TableHead>
                  <TableHead className="text-right">Hodnota</TableHead>
                  <TableHead>Režim</TableHead>
                  <TableHead>Stav</TableHead>
                  <TableHead>Poznámka</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {state.orders.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="num text-xs">{fmtDateTime(o.createdAt)}</TableCell>
                    <TableCell
                      className={o.side === "BUY" ? "text-success" : "text-warning"}
                    >
                      {o.side === "BUY" ? "Nákup" : "Prodej"}
                    </TableCell>
                    <TableCell className="num text-right">{fmtNum(o.shares)}</TableCell>
                    <TableCell className="num text-right">{fmtUsd(o.priceUsd)}</TableCell>
                    <TableCell className="num text-right">{fmtCzk(o.valueCzk)}</TableCell>
                    <TableCell>
                      <Badge variant={o.mode === "LIVE" ? "destructive" : "secondary"}>
                        {o.mode}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">{o.status}</TableCell>
                    <TableCell className="max-w-[22rem] text-xs text-muted-foreground">
                      {o.note}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="signals">
          <Card className="bg-card p-2">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Čas</TableHead>
                  <TableHead>Signál</TableHead>
                  <TableHead className="text-right">Cena</TableHead>
                  <TableHead>Pravidlo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {state.signals.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="num text-xs">{fmtDateTime(s.createdAt)}</TableCell>
                    <TableCell className="num font-semibold">{ACTION_LABEL[s.action]}</TableCell>
                    <TableCell className="num text-right">{fmtUsd(s.priceUsd)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{s.reason}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="params">
          <Card className="bg-card p-2">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Čas</TableHead>
                  <TableHead>Parametr</TableHead>
                  <TableHead>Z</TableHead>
                  <TableHead>Na</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {state.paramChanges.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="num text-xs">{fmtDateTime(c.createdAt)}</TableCell>
                    <TableCell>{c.field}</TableCell>
                    <TableCell className="num text-muted-foreground">{c.from}</TableCell>
                    <TableCell className="num">{c.to}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
