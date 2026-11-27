import { createFileRoute } from "@tanstack/react-router";
import { ForecastWorkbench } from "@/components/ForecastWorkbench";
export const Route = createFileRoute("/prognoza")({
  component: ForecastPage,
  head: () => ({ meta: [{ title: "Prognóza výdělku | Intel Pilot" }] }),
});
function ForecastPage() {
  return (
    <div className="page-wrap space-y-6">
      <div>
        <p className="eyebrow">PROGNÓZA VÝDĚLKU</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          Co lze čekat – a jak moc tomu věřit
        </h1>
        <p className="mt-3 max-w-3xl text-muted-foreground">
          Rozpětí možných výsledků pro dlouhodobou část i denní obchodování, ověřené na historii
          INTC. Aplikace neslibuje zisk: ukazuje pravděpodobnosti a to, jak spolehlivé byly v
          minulosti.
        </p>
      </div>
      <ForecastWorkbench />
    </div>
  );
}
