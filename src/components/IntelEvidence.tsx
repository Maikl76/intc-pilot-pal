import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, FileCheck2, RefreshCw, Search, BookOpen } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { getIntelIntelligence } from "@/lib/pilot-intelligence.functions";
import { TOPIC_LABELS, safeNewsUrl, type NewsTopic } from "@/lib/pilot-intelligence.mjs";

const PRIMARY_SOURCES = [
  {
    title: "Výsledky a výhled",
    detail: "Výsledkové zprávy, prezentace a 10-Q / 10-K",
    url: "https://www.intc.com/financial-info/financial-results",
  },
  {
    title: "Intel 18A",
    detail: "Technologie a tvrzení výrobce",
    url: "https://www.intel.com/content/www/us/en/foundry/process/18a.html",
  },
  {
    title: "14A a plán výroby",
    detail: "Oficiální přehled výrobních procesů",
    url: "https://www.intel.com/content/www/us/en/foundry/process.html",
  },
  {
    title: "Podání u SEC",
    detail: "Úplná podání společnosti v EDGAR",
    url: "https://www.sec.gov/edgar/browse/?CIK=50863&owner=exclude",
  },
  {
    title: "Kalendář Intelu",
    detail: "Výsledky, konference a webové přenosy",
    url: "https://www.intc.com/news-events/ir-calendar",
  },
  {
    title: "Kalendář Nasdaq",
    detail: "Sváteční uzavření a zkrácené seance",
    url: "https://www.nasdaq.com/market-activity/stock-market-holiday-schedule",
  },
];

const THESIS_ROWS = [
  {
    id: "18a",
    title: "18A: výroba a výtěžnost",
    question: "Jsou doložené objemy, náklady a zlepšení výtěžnosti? Zapiš období a přesný zdroj.",
  },
  {
    id: "14a",
    title: "14A: termíny a financování",
    question: "Co je plán a co už ověřený milník? Kdo financuje další investice?",
  },
  {
    id: "foundry",
    title: "Externí zákazníci Foundry",
    question:
      "Jde o test čipu, závaznou objednávku, pouzdření, nebo sériovou výrobu? Jaké jsou doložené tržby?",
  },
  {
    id: "cash",
    title: "Hospodaření a hotovost",
    question: "Jak se změnil výhled, provozní cash flow, investice a počet akcií?",
  },
] as const;
type ThesisId = (typeof THESIS_ROWS)[number]["id"];
type ThesisNote = { status: "unknown" | "supports" | "weakens"; note: string; url: string };
type EvidenceState = {
  version: 1;
  lastReviewedAt: number | null;
  notes: Record<ThesisId, ThesisNote>;
};
const STORE = "intc-pilot-evidence-v1";
const emptyState = (): EvidenceState => ({
  version: 1,
  lastReviewedAt: null,
  notes: Object.fromEntries(
    THESIS_ROWS.map((row) => [row.id, { status: "unknown", note: "", url: "" }]),
  ) as Record<ThesisId, ThesisNote>,
});
const dateTime = (timestamp: number) =>
  new Date(timestamp).toLocaleString("cs-CZ", {
    timeZone: "Europe/Prague",
    day: "numeric",
    month: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

export function IntelEvidence() {
  const query = useQuery({
    queryKey: ["intel-intelligence-v2"],
    queryFn: () => getIntelIntelligence(),
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
    retry: 1,
  });
  const [topic, setTopic] = useState<"all" | NewsTopic>("all");
  const [sourceScope, setSourceScope] = useState<"primary" | "media" | "all">("primary");
  const [search, setSearch] = useState("");
  const [evidence, setEvidence] = useState<EvidenceState>(emptyState);
  const [hydrated, setHydrated] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const [storageBlocked, setStorageBlocked] = useState(false);
  const [recoveryRaw, setRecoveryRaw] = useState<string | null>(null);
  const [showOnlyNew, setShowOnlyNew] = useState(false);

  useEffect(() => {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(STORE);
      if (raw) {
        if (raw.length > 30_000) throw Error("Příliš velká uložená poznámka");
        const parsed = JSON.parse(raw) as Partial<EvidenceState>;
        const restored = emptyState();
        if (parsed.version !== 1) throw Error("Nepodporovaná verze poznámek");
        if (
          parsed.lastReviewedAt !== null &&
          (typeof parsed.lastReviewedAt !== "number" ||
            !Number.isFinite(parsed.lastReviewedAt) ||
            parsed.lastReviewedAt <= 0)
        )
          throw Error("Neplatný čas kontroly");
        restored.lastReviewedAt = parsed.lastReviewedAt ?? null;
        for (const row of THESIS_ROWS) {
          const item = parsed.notes?.[row.id];
          if (
            !item ||
            typeof item.note !== "string" ||
            typeof item.url !== "string" ||
            item.note.length > 2000 ||
            item.url.length > 2048 ||
            !["unknown", "supports", "weakens"].includes(item.status)
          )
            throw Error("Neplatná uložená poznámka");
          restored.notes[row.id] = { status: item.status, note: item.note, url: item.url };
        }
        setEvidence(restored);
      }
    } catch {
      setStorageError(true);
      setStorageBlocked(true);
      setRecoveryRaw(raw);
    }
    setHydrated(true);
  }, []);

  function updateEvidence(next: EvidenceState) {
    setEvidence(next);
    if (storageBlocked) {
      setStorageError(true);
      return;
    }
    try {
      localStorage.setItem(STORE, JSON.stringify(next));
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  }

  function downloadNotes(content: string, filename: string) {
    const url = URL.createObjectURL(new Blob([content], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function replaceUnreadableNotes() {
    if (
      !window.confirm(
        "Nahradit původní nečitelný záznam aktuálními poznámkami z formuláře? Původní záznam si nejprve můžeš stáhnout.",
      )
    )
      return;
    try {
      localStorage.setItem(STORE, JSON.stringify(evidence));
      setStorageBlocked(false);
      setStorageError(false);
      setRecoveryRaw(null);
    } catch {
      setStorageError(true);
    }
  }

  const items = query.data?.items ?? [];
  const scopedItems = useMemo(
    () =>
      items.filter(
        (item) =>
          sourceScope === "all" ||
          (sourceScope === "primary" ? item.kind !== "news" : item.kind === "news"),
      ),
    [items, sourceScope],
  );
  const primaryCount = items.filter((item) => item.kind !== "news").length;
  const mediaCount = items.filter((item) => item.kind === "news").length;
  const newCount =
    evidence.lastReviewedAt === null
      ? null
      : scopedItems.filter((item) => item.publishedAt > evidence.lastReviewedAt!).length;
  const filtered = useMemo(
    () =>
      scopedItems.filter(
        (item) =>
          (topic === "all" || item.topic === topic) &&
          (!showOnlyNew ||
            evidence.lastReviewedAt === null ||
            item.publishedAt > evidence.lastReviewedAt) &&
          (!search.trim() ||
            (item.title + " " + item.source)
              .toLocaleLowerCase()
              .includes(search.trim().toLocaleLowerCase())),
      ),
    [scopedItems, topic, search, showOnlyNew, evidence.lastReviewedAt],
  );
  const latestPrimary = items.find((item) => item.kind !== "news");
  const primaryFailure = query.data?.providers.some(
    (provider) => provider.id !== "finnhub-news" && provider.status === "ERROR",
  );

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border p-5 sm:p-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-primary">
              <FileCheck2 className="h-5 w-5" aria-hidden="true" />
              <span className="text-sm font-medium">Dohledatelné podklady</span>
            </div>
            <h2 className="text-xl font-semibold">Co se změnilo u Intelu</h2>
            <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Výchozí přehled obsahuje tiskové zprávy Intelu a regulatorní podání. Doplňková média
              si můžeš zapnout ve filtru zdrojů. Každý záznam má původní titulek, čas a odkaz;
              význam události ověř v dokumentu.
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => void query.refetch()}
            disabled={query.isFetching}
            aria-label="Obnovit zprávy o Intelu"
          >
            <RefreshCw className={query.isFetching ? "animate-spin" : ""} aria-hidden="true" />
            {query.isFetching ? "Načítám" : "Obnovit"}
          </Button>
        </div>
        <div className="space-y-4 p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <div className="space-y-1 text-muted-foreground">
              <p>
                {query.data
                  ? "Kontrola zdrojů: " + dateTime(query.data.checkedAt) + " · Praha"
                  : "Čekám na první kontrolu zdrojů."}
              </p>
              <p>
                {latestPrimary
                  ? "Nejnovější načtený primární dokument: " + dateTime(latestPrimary.publishedAt)
                  : "Primární dokument zatím není načten."}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {newCount !== null && (
                <Badge variant={newCount ? "default" : "secondary"}>
                  {newCount} publikovaných od kontroly ve zvoleném zdroji
                </Badge>
              )}
              <Button
                variant="outline"
                disabled={!hydrated || !query.data}
                onClick={() => updateEvidence({ ...evidence, lastReviewedAt: Date.now() })}
              >
                Označit jako zkontrolované
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="min-w-56 flex-1 space-y-1.5 text-sm">
              <span>Zdroj zpráv</span>
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3"
                value={sourceScope}
                onChange={(event) =>
                  setSourceScope(event.target.value as "primary" | "media" | "all")
                }
              >
                <option value="primary">Primární · Intel IR a SEC ({primaryCount})</option>
                <option value="media">Doplňková média ({mediaCount})</option>
                <option value="all">Všechny zdroje ({items.length})</option>
              </select>
            </label>
            <label className="min-w-48 flex-1 space-y-1.5 text-sm">
              <span>Téma</span>
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3"
                value={topic}
                onChange={(event) => setTopic(event.target.value as "all" | NewsTopic)}
              >
                <option value="all">Všechny události</option>
                {Object.entries(TOPIC_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="min-w-48 flex-1 space-y-1.5 text-sm">
              <span>Hledat v titulcích</span>
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  className="h-10 pl-9"
                  placeholder="Např. 18A, revenue, customer"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
            </label>
            <label className="flex h-10 items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={showOnlyNew}
                disabled={evidence.lastReviewedAt === null}
                onChange={(event) => setShowOnlyNew(event.target.checked)}
              />
              Jen od poslední kontroly
            </label>
          </div>
          {sourceScope !== "primary" && (
            <p className="rounded-md border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
              Mediální titulky vybírá pro INTC poskytovatel Finnhub; mohou zahrnovat širší sektorový
              kontext. Nejde o nezávislé potvrzení události. Odkaz může vést přes přesměrování
              Finnhubu na původní článek.
            </p>
          )}
          {query.isError && (
            <div
              role="alert"
              className="rounded-md border border-warning/50 bg-warning/5 p-3 text-sm"
            >
              Přehled se nepodařilo načíst. Stav zpráv není známý. Primární zdroje můžeš otevřít
              níže.
            </div>
          )}
          {primaryFailure && (
            <div
              role="status"
              className="rounded-md border border-warning/50 bg-warning/5 p-3 text-sm"
            >
              Některý primární zdroj se nepodařilo obnovit. Přehled může obsahovat dříve načtené
              zprávy a není úplný. Dostupnost a čas posledního úspěchu najdeš níže.
            </div>
          )}
          {query.isPending ? (
            <p className="py-6 text-sm text-muted-foreground" role="status">
              Načítám tiskové zprávy a regulatorní podání…
            </p>
          ) : filtered.length ? (
            <ul className="divide-y divide-border">
              {filtered.map((item) => (
                <li key={item.id} className="py-4 first:pt-1">
                  <div className="mb-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                    <Badge variant="outline">
                      {item.kind === "issuer"
                        ? "Vyjádření firmy"
                        : item.kind === "filing"
                          ? "Regulatorní podání"
                          : "Zpravodajství"}
                    </Badge>
                    <span>{item.source}</span>
                    <time dateTime={new Date(item.publishedAt).toISOString()}>
                      {dateTime(item.publishedAt)}
                    </time>
                    {evidence.lastReviewedAt !== null &&
                    item.publishedAt > evidence.lastReviewedAt ? (
                      <Badge>Nově publikováno</Badge>
                    ) : null}
                  </div>
                  <a
                    className="group inline-flex items-start gap-2 font-medium leading-relaxed underline-offset-4 hover:text-primary hover:underline focus-visible:rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {item.title}
                    <ExternalLink className="mt-1 h-4 w-4 shrink-0" aria-hidden="true" />
                  </a>
                  <p className="mt-1.5 text-sm text-muted-foreground">
                    {TOPIC_LABELS[item.topic]}
                    {item.kind === "filing"
                      ? " · Dokument z přehledu Intelu; otevři a ověř obsah podání."
                      : ""}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-md bg-muted/50 p-4 text-sm text-muted-foreground">
              {scopedItems.length
                ? "Zvolenému filtru neodpovídá žádná načtená událost."
                : "Ve zvoleném zdroji nejsou načtené žádné ověřitelné položky. To neznamená, že se nic důležitého nestalo; zkontroluj dostupnost zdroje níže."}
            </p>
          )}
          <details className="rounded-md border border-border p-3 text-sm">
            <summary className="cursor-pointer font-medium">Dostupnost a rozsah zdrojů</summary>
            <div className="mt-3 space-y-3">
              {query.data?.providers.map((provider) => (
                <div key={provider.id}>
                  <p className="font-medium">
                    {provider.name} ·{" "}
                    {provider.status === "OK"
                      ? "načteno"
                      : provider.status === "EMPTY"
                        ? "prázdná odpověď"
                        : provider.status === "NOT_CONFIGURED"
                          ? "nepřipojeno"
                          : "výpadek"}
                  </p>
                  <p className="text-muted-foreground">
                    {provider.message}
                    {provider.lastSuccessAt
                      ? " Poslední úspěch: " + dateTime(provider.lastSuccessAt) + "."
                      : ""}
                  </p>
                </div>
              ))}
              <p className="text-muted-foreground">
                Primární RSS obsahují omezený počet posledních položek. Doplňková média jsou omezena
                na 60 nejnovějších načtených titulků; tento limit neomezuje primární zprávy ani
                podání. Témata se třídí podle titulku. Obnova nejvýše jednou za 5 minut při otevřené
                stránce. Tento přehled není úplný archiv ani služba upozornění na pozadí. Vyjádření
                firmy není nezávislé potvrzení a samotný cenový pohyb neprokazuje manipulaci.
              </p>
            </div>
          </details>
        </div>
      </Card>

      <section aria-labelledby="intel-primary-sources" className="space-y-3">
        <h2 id="intel-primary-sources" className="flex items-center gap-2 text-lg font-semibold">
          <BookOpen className="h-5 w-5 text-primary" aria-hidden="true" />
          Přímo k původním zdrojům
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {PRIMARY_SOURCES.map((source) => (
            <a
              key={source.url}
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/50 hover:bg-primary/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
            >
              <p className="flex items-center justify-between gap-2 font-medium">
                {source.title}
                <ExternalLink
                  className="h-4 w-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
              </p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{source.detail}</p>
            </a>
          ))}
        </div>
      </section>

      <Card className="space-y-5 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">Moje investiční teze</h2>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
              Zapiš důkaz pro držení i pro změnu názoru. Hodnocení níže je tvoje poznámka, není to
              automatický signál k nákupu. Změny se průběžně ukládají jen v tomto prohlížeči.
            </p>
          </div>
          <Button
            variant="outline"
            disabled={!hydrated}
            onClick={() =>
              downloadNotes(JSON.stringify(evidence, null, 2), "INTC-investicni-teze.json")
            }
          >
            Stáhnout poznámky
          </Button>
        </div>
        {storageError && (
          <div
            role="alert"
            className="space-y-3 rounded-md border border-warning/50 p-3 text-sm text-warning"
          >
            <p>
              {storageBlocked
                ? "Původní uložený záznam nelze bezpečně načíst a zůstal beze změny. Úpravy v tomto formuláři jsou zatím pouze v paměti. Před obnovením stránky si je stáhni, nebo výslovně nahraď původní záznam."
                : "Poznámky nebo čas kontroly se nepodařilo uložit. Nynější změny si stáhni; po obnovení mohou chybět."}
            </p>
            {storageBlocked && (
              <div className="flex flex-wrap gap-2">
                {recoveryRaw !== null && (
                  <Button
                    variant="outline"
                    onClick={() =>
                      downloadNotes(recoveryRaw, "INTC-investicni-teze-puvodni-zaznam.json")
                    }
                  >
                    Stáhnout původní záznam
                  </Button>
                )}
                <Button variant="outline" onClick={replaceUnreadableNotes}>
                  Nahradit původní záznam
                </Button>
              </div>
            )}
          </div>
        )}
        <div className="grid gap-4 lg:grid-cols-2">
          {THESIS_ROWS.map((row) => {
            const note = evidence.notes[row.id];
            const link = safeNewsUrl(note.url);
            function edit(patch: Partial<ThesisNote>) {
              updateEvidence({
                ...evidence,
                notes: { ...evidence.notes, [row.id]: { ...note, ...patch } },
              });
            }
            return (
              <section
                key={row.id}
                className="space-y-3 rounded-lg border border-border bg-background/30 p-4"
                aria-labelledby={"thesis-" + row.id}
              >
                <div className="space-y-1">
                  <h3 id={"thesis-" + row.id} className="font-semibold">
                    {row.title}
                  </h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">{row.question}</p>
                </div>
                <label className="block space-y-1.5 text-sm">
                  <span>Moje hodnocení</span>
                  <select
                    disabled={!hydrated}
                    value={note.status}
                    onChange={(event) =>
                      edit({ status: event.target.value as ThesisNote["status"] })
                    }
                    className="h-10 w-full rounded-md border border-input bg-background px-3"
                  >
                    <option value="unknown">Zatím neověřeno</option>
                    <option value="supports">Podporuje moji tezi</option>
                    <option value="weakens">Oslabuje moji tezi</option>
                  </select>
                </label>
                <label className="block space-y-1.5 text-sm">
                  <span>Důkaz a co by změnilo můj názor</span>
                  <Textarea
                    disabled={!hydrated}
                    value={note.note}
                    maxLength={2000}
                    rows={3}
                    placeholder="Datum, pozorování, omezení a podmínka pro přehodnocení…"
                    onChange={(event) => edit({ note: event.target.value })}
                  />
                </label>
                <label className="block space-y-1.5 text-sm">
                  <span>Odkaz na podklad</span>
                  <Input
                    disabled={!hydrated}
                    type="url"
                    value={note.url}
                    maxLength={2048}
                    placeholder="https://…"
                    onChange={(event) => edit({ url: event.target.value })}
                  />
                </label>
                {link ? (
                  <a
                    href={link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm text-primary underline underline-offset-4"
                  >
                    Otevřít uložený podklad
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                  </a>
                ) : note.url ? (
                  <p className="text-sm text-warning">
                    Pro otevření vlož úplný veřejný odkaz začínající https://.
                  </p>
                ) : null}
              </section>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
