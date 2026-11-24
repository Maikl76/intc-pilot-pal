import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { defaults, validate, type Settings } from "@/lib/pilot-engine.mjs";
import { Download, Upload, Settings2, ShieldCheck } from "lucide-react";
import { czk, usePilot } from "@/lib/pilot-store";

export function SettingsFields({
  value,
  onChange,
}: {
  value: Settings;
  onChange: (p: Settings) => void;
}) {
  type NumKey = Exclude<keyof Settings, "signal">;
  const field = (key: NumKey, label: string, step = 1, min = 0, max?: number) => (
    <label className="space-y-1 text-sm" key={key}>
      <span className="text-muted-foreground">{label}</span>
      <Input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value[key]}
        onChange={(e) => onChange({ ...value, [key]: Number(e.target.value) })}
      />
    </label>
  );
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {field("capitalCzk", "Obchodní kapitál (Kč)", 1000, 1000)}
      {field("slotCzk", "Max. kapitál na nákup (Kč)", 1000, 1000)}
      {field("reserveCzk", "Hotovostní rezerva (Kč)", 1000)}
      {field("fx", "Modelový kurz USD/CZK", 0.01, 0.01)}
      {field("maxSlots", "Max. otevřené pozice", 1, 1, 10)}
      <label className="space-y-1 text-sm">
        <span className="text-muted-foreground">Nákupní signál</span>
        <select
          className="h-9 w-full rounded-md border border-input bg-background px-2"
          value={value.signal}
          onChange={(e) => onChange({ ...value, signal: e.target.value as Settings["signal"] })}
        >
          <option value="dip1">Pokles v USD</option>
          <option value="dip2">Pokles o 2 USD</option>
          <option value="open">Otevření seance</option>
          <option value="dipPct">Procentuální pokles</option>
          <option value="rebound">Pokles + odraz (jen backtest)</option>
        </select>
      </label>
      {field("dipUsd", "Vstupní pokles (USD)", 0.05, 0.01)}
      {field("dipPct", "Vstupní pokles (%)", 0.1, 0.1, 99)}
      {field("reboundUsd", "Potvrzení odrazu (USD)", 0.05, 0.01)}
      {field("targetUsd", "Take-profit (USD na akcii)", 0.05, 0.01)}
      {field("stopUsd", "Stop-loss (USD; 0 = vypnuto)", 0.05)}
      {field("holdDays", "Max. další seance (−1 = čekat)", 1, -1)}
      {field("gapPct", "Filtr záporného gapu (%; 0 = vypnut)", 0.5)}
      <label className="space-y-1 text-sm">
        <span className="text-muted-foreground">Konec nákupního okna (New York)</span>
        <Input
          type="time"
          min="09:30"
          max="15:55"
          step={300}
          value={
            String(Math.floor(value.windowMinute / 60)).padStart(2, "0") +
            ":" +
            String(value.windowMinute % 60).padStart(2, "0")
          }
          onChange={(e) => {
            const [h, m] = e.target.value.split(":").map(Number);
            if (h !== undefined && m !== undefined && Number.isFinite(h + m))
              onChange({ ...value, windowMinute: h * 60 + m });
          }}
        />
      </label>
      {field("fee", "Náklady na akcii za jednu stranu (USD)", 0.01)}
      {field("drawdownLimitCzk", "PAPER risk lock při drawdownu (Kč)", 100, 100)}
    </div>
  );
}
export function PilotSettings() {
  const {
    settings,
    saveSettings,
    core,
    saveCore,
    resetPaper,
    hydrated,
    paper,
    mode,
    exportBackup,
    importBackup,
    persistenceWarning,
  } = usePilot();
  const [draft, setDraft] = useState(settings),
    [qty, setQty] = useState(core.qty),
    [avg, setAvg] = useState(core.avg),
    [message, setMessage] = useState("");
  const restoreInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setDraft(settings);
    setQty(core.qty);
    setAvg(core.avg);
  }, [settings, core]);
  function save() {
    try {
      validate(draft);
      if (
        !Number.isFinite(qty) ||
        !Number.isFinite(avg) ||
        qty < 0 ||
        avg < 0 ||
        (qty > 0 && avg === 0)
      )
        throw new Error("Zkontroluj dlouhodobou pozici.");
      saveSettings(draft);
      saveCore(qty, avg);
      setMessage(
        "Nastavení uloženo. Otevřené cvičné obchody zachovaly původní cíle, stopy a náklady.",
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    }
  }
  function downloadBackup() {
    const content = exportBackup(),
      url = URL.createObjectURL(new Blob([content], { type: "application/json" })),
      a = document.createElement("a");
    a.href = url;
    a.download = "Intel-Pilot-zaloha-" + new Date().toISOString().slice(0, 10) + ".json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMessage(
      "Záloha byla připravena ke stažení. Obsahuje oba cvičné účty, dlouhodobou evidenci a nastavení.",
    );
  }
  async function restore(file: File | undefined) {
    if (!file) return;
    try {
      if (file.size > 20 * 1024 * 1024) throw new Error("Vyber JSON zálohu do 20 MB.");
      const text = await file.text();
      if (
        !window.confirm(
          "Obnovit data ze souboru " +
            file.name +
            "? Tím nahradíš oba cvičné účty, dlouhodobou evidenci a nastavení v tomto prohlížeči. Nejprve si stáhni aktuální zálohu.",
        )
      )
        return;
      const result = importBackup(text);
      setMessage(result.message);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      if (restoreInput.current) restoreInput.current.value = "";
    }
  }
  return (
    <div className="page-wrap space-y-6">
      <div>
        <p className="eyebrow">TVŮJ PLÁN, TVOJE LIMITY</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Nastavení a záloha</h1>
        <p className="mt-3 max-w-3xl text-muted-foreground">
          Nastav kapitál, velikost obchodu a ochranu účtu. Výchozí hodnoty jsou experimentální
          pravidla, která můžeš testovat.
        </p>
      </div>
      {message ? (
        <div
          role="status"
          aria-live="polite"
          className="rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm"
        >
          {message}
        </div>
      ) : null}
      {persistenceWarning ? (
        <p
          role="alert"
          className="rounded-xl border border-warning/40 bg-warning/5 p-4 text-sm text-warning"
        >
          {persistenceWarning}
        </p>
      ) : null}
      <Card className="space-y-4 rounded-2xl p-5 sm:p-6">
        <h2 className="flex items-center gap-2 text-xl font-semibold">
          <ShieldCheck className="size-5 text-primary" />
          Dlouhodobá pozice
        </h2>
        <p className="text-sm text-muted-foreground">
          Samostatná evidence skutečné pozice. Není zdrojem cvičné hotovosti. Vyplň aktuální počet a
          průměr podle svého účtu Trading 212.
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          <label>
            <span className="field-label">Plánovaný rozpočet (Kč)</span>
            <Input
              type="number"
              min={0}
              step={1000}
              value={draft.coreBudgetCzk}
              onChange={(e) => setDraft({ ...draft, coreBudgetCzk: Number(e.target.value) })}
            />
          </label>
          <label>
            <span className="field-label">Počet akcií</span>
            <Input
              type="number"
              min={0}
              step="any"
              value={qty}
              onChange={(e) => setQty(Number(e.target.value))}
            />
          </label>
          <label>
            <span className="field-label">Průměrný nákup (USD)</span>
            <Input
              type="number"
              min={0}
              step=".01"
              value={avg}
              onChange={(e) => setAvg(Number(e.target.value))}
            />
          </label>
        </div>
      </Card>
      <Card className="space-y-5 rounded-2xl p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-xl font-semibold">
            <Settings2 className="size-5 text-primary" />
            Obchodní pravidla
          </h2>
          <Button variant="outline" onClick={() => setDraft({ ...defaults })}>
            Načíst výchozí parametry
          </Button>
        </div>
        <SettingsFields value={draft} onChange={setDraft} />
        <div className="rounded-xl bg-background/40 p-4 text-sm text-muted-foreground">
          <p>
            Náklady na akcii jsou tvůj model spreadu, skluzu a poplatků. Nejde o tvrzení, že Trading
            212 účtuje uvedenou částku. Při USD zůstatku se v této simulaci měna automaticky
            nesměňuje.
          </p>
          <p className="mt-3">
            Limit tranše a rezerva platí i při ručním nákupu. Přísný režim přidává filtr strategie a
            jeden vstup za den. Odraz a pevný vícedenní výstup lze ověřovat v Backtestu. Ochrana
            před dalším propadem v cvičném účtu není součástí historické optimalizace.
          </p>
        </div>
        <Button disabled={!hydrated} onClick={save}>
          Uložit pozici a pravidla
        </Button>
      </Card>
      <Card className="space-y-5 rounded-2xl p-5 sm:p-6">
        <h2 className="text-xl font-semibold">Přenes si cvičný účet</h2>
        <p className="text-sm text-muted-foreground">
          Data jsou uložená v tomto prohlížeči. Záloha JSON obsahuje tržní cvičení, vlastní scénáře,
          nastavení a dlouhodobou evidenci. Importované CSV a poznámky ke zprávám se zálohují
          samostatně.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" disabled={!hydrated} onClick={downloadBackup}>
            <Download className="size-4" />
            Stáhnout zálohu JSON
          </Button>
          <Button
            variant="outline"
            disabled={!hydrated}
            onClick={() => restoreInput.current?.click()}
          >
            <Upload className="size-4" />
            Obnovit ze zálohy
          </Button>
          <input
            ref={restoreInput}
            type="file"
            accept=".json,application/json"
            className="hidden"
            aria-label="JSON záloha Intel Pilot"
            onChange={(e) => void restore(e.target.files?.[0])}
          />
        </div>
        <p className="text-sm text-muted-foreground">
          Stejný soubor můžeš načíst na jiném zařízení. Záloha může obsahovat tvoje finanční údaje;
          ukládej ji pro sebe.
        </p>
      </Card>
      <Card className="space-y-4 rounded-2xl p-5 sm:p-6">
        <h2 className="text-xl font-semibold">
          Aktivní účet: {mode === "scenario" ? "Vlastní scénář" : "Tržní cvičení"}
        </h2>
        <p className="text-sm text-muted-foreground">
          Počáteční kapitál tohoto účtu: {czk(paper.startingUsd * settings.fx)} při nastaveném
          modelovém kurzu. Úprava rozpočtu sama nepřipíše hotovost. Nový účet vytvoří až reset.
        </p>
        <Button
          variant="outline"
          disabled={!hydrated}
          onClick={() => {
            if (
              window.confirm(
                "Smazat otevřené pozice a historii účtu " +
                  (mode === "scenario" ? "Vlastní scénář" : "Tržní cvičení") +
                  " a začít znovu? Druhý cvičný účet a dlouhodobá evidence zůstanou zachované.",
              )
            ) {
              const result = resetPaper();
              setMessage(result.message);
            }
          }}
        >
          Resetovat aktivní cvičný účet
        </Button>
      </Card>
      <Card className="space-y-3 rounded-2xl p-5 sm:p-6">
        <h2 className="text-xl font-semibold">Ceny a data</h2>
        <p className="text-sm text-muted-foreground">
          Cena se obnovuje při otevřené aplikaci přibližně po 15 sekundách. Automaticky zkouší Yahoo
          Finance a případně nakonfigurovaný Finnhub. Prodleva závisí na zdroji; u ceny vidíš
          skutečný čas pozorování. Při nedostupných datech lze dál trénovat ve vlastním scénáři.
        </p>
        <p className="text-sm text-muted-foreground">
          Importy CSV/ZIP se zpracovávají v tvém prohlížeči. Aplikace neposílá pokyny brokerovi.
          Veřejné zprávy se obnovují při otevřené stránce, nikoli jako služba upozornění na pozadí.
        </p>
        <details className="text-sm text-muted-foreground">
          <summary className="cursor-pointer">Provozní připojení zdrojů</summary>
          <p className="mt-3">
            Finnhub lze připojit serverovou proměnnou MARKET_DATA_API_KEY. Klíče patří do chráněného
            nastavení hostingu; nikdy do veřejného kódu, URL nebo lokálních záloh.
          </p>
        </details>
      </Card>
    </div>
  );
}
