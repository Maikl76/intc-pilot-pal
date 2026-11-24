import { createFileRoute } from "@tanstack/react-router";
import { IntelEvidence } from "@/components/IntelEvidence";
export const Route = createFileRoute("/zpravy")({
  component: NewsPage,
  head: () => ({ meta: [{ title: "Zprávy a důkazy | Intel Pilot" }] }),
});
function NewsPage() {
  return (
    <div className="mx-auto max-w-[1440px] space-y-6 px-4 py-7 sm:px-6 lg:px-8">
      <div>
        <p className="eyebrow">INFORMAČNÍ PŘEVAHA ZAČÍNÁ U ZDROJŮ</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Zprávy a důkazy</h1>
        <p className="mt-3 max-w-3xl text-muted-foreground">
          Sleduj, co mění výhled Intelu. Oznámení, podání a vlastní investiční tezi posuzuj podle
          původního zdroje a data.
        </p>
      </div>
      <IntelEvidence />
    </div>
  );
}
