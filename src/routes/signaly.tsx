import { createFileRoute } from "@tanstack/react-router";
import { EdgeWorkbench } from "@/components/EdgeWorkbench";
export const Route = createFileRoute("/signaly")({
  component: EdgePage,
  head: () => ({ meta: [{ title: "Plán a signály | Intel Pilot" }] }),
});
function EdgePage() {
  return (
    <div className="page-wrap space-y-6">
      <div>
        <p className="eyebrow">JAKO PROFESIONÁL</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          Plán obchodu a signály ověřené na datech
        </h1>
        <p className="mt-3 max-w-3xl text-muted-foreground">
          Postupy profesionálních obchodníků, které jsou dostupné i drobnému investorovi: velikost
          pozice podle rizika, signály přezkoušené na historii INTC a nízké náklady provedení.
        </p>
      </div>
      <EdgeWorkbench />
    </div>
  );
}
