import { createFileRoute } from "@tanstack/react-router";
import { RiskWorkbench } from "@/components/RiskWorkbench";
export const Route = createFileRoute("/riziko")({
  component: RiskPage,
  head: () => ({ meta: [{ title: "Riziko a scénáře | Intel Pilot" }] }),
});
function RiskPage() {
  return (
    <div className="page-wrap space-y-6">
      <div>
        <p className="eyebrow">ROZHODNUTÍ PŘED NÁKUPEM</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Riziko, které vidíš dopředu</h1>
        <p className="mt-3 max-w-3xl text-muted-foreground">
          Ověř si velikost obchodu, potřebnou úspěšnost a dopad propadu. Historická volatilita
          dodává kontext; výsledek dalšího obchodu neslibuje.
        </p>
      </div>
      <RiskWorkbench />
    </div>
  );
}
