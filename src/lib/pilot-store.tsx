import { useQuery } from "@tanstack/react-query";
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import { defaults, ny, validate, type Settings, type Transaction } from "./pilot-engine.mjs";
import { getPilotQuote, type PilotQuote } from "./pilot-market.functions";
import { isUsable, isRegularFresh, marketCalendar } from "./pilot-quotes.mjs";
import {
  createPaper,
  validatePaper,
  paperEquity,
  paperCost,
  maxPaperQuantity,
  updatePaperRisk,
  setPaperLock,
  buyPaper,
  sellPaper,
  type PaperAccount,
  type PaperPosition,
  type PaperTrade,
  type FillEvidence,
} from "./pilot-paper.mjs";
import type { NamedMarket } from "./pilot-import";

const KEY = "intc-pilot-v2-private";
export const usd = (value: number) =>
  new Intl.NumberFormat("cs-CZ", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(value);
export const czk = (value: number) =>
  new Intl.NumberFormat("cs-CZ", {
    style: "currency",
    currency: "CZK",
    maximumFractionDigits: 0,
  }).format(value);
export const pct = (value: number) =>
  value.toLocaleString("cs-CZ", { maximumFractionDigits: 2 }) + " %";
export const dateTime = (timestamp: number) =>
  new Date(timestamp).toLocaleString("cs-CZ", {
    timeZone: "Europe/Prague",
    dateStyle: "short",
    timeStyle: "short",
  });
export type { PaperPosition, PaperTrade, PaperAccount };
export type PaperMode = "market" | "scenario";
export interface ActionResult {
  ok: boolean;
  message: string;
}
interface Persist {
  version: 3;
  revision: string;
  settings: Settings;
  paper: PaperAccount;
  scenario: PaperAccount;
  mode: PaperMode;
  scenarioPrice: number | null;
  core: { qty: number; avg: number };
}

const initial = (): Persist => ({
  version: 3,
  revision: "",
  settings: { ...defaults },
  paper: createPaper({ ...defaults }),
  scenario: createPaper({ ...defaults }),
  mode: "market",
  scenarioPrice: 57,
  core: { qty: 0, avg: 0 },
});
const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Záloha nemá správný formát.");
  return value as Record<string, unknown>;
}
function decode(value: unknown): Persist {
  const data = object(value);
  if (data["version"] !== undefined && data["version"] !== 3)
    throw new Error("Tato verze zálohy není podporovaná.");
  const settingsData = object(data["settings"]);
  const settings = Object.fromEntries(
    Object.keys(defaults).map((key) => [key, settingsData[key]]),
  ) as unknown as Settings;
  validate(settings);
  const core = object(data["core"]);
  const qty = core["qty"],
    avg = core["avg"];
  if (
    typeof qty !== "number" ||
    typeof avg !== "number" ||
    !Number.isFinite(qty) ||
    !Number.isFinite(avg) ||
    qty < 0 ||
    avg < 0 ||
    (qty > 0 && avg === 0)
  )
    throw new Error("Neplatná dlouhodobá pozice v záloze.");
  const legacy = data["version"] === undefined;
  const mode = legacy ? "market" : data["mode"];
  if (mode !== "market" && mode !== "scenario") throw new Error("Neplatný režim cvičení.");
  const scenarioPrice = legacy ? 57 : data["scenarioPrice"];
  if (
    scenarioPrice !== null &&
    (typeof scenarioPrice !== "number" || !Number.isFinite(scenarioPrice) || scenarioPrice <= 0)
  )
    throw new Error("Neplatná cena vlastního scénáře.");
  return {
    version: 3,
    revision: typeof data["revision"] === "string" ? data["revision"] : "",
    settings,
    paper: validatePaper(data["paper"], "MARKET"),
    scenario: legacy ? createPaper(settings) : validatePaper(data["scenario"], "SCENARIO"),
    mode,
    scenarioPrice,
    core: { qty, avg },
  };
}
const activePaper = (state: Persist) => (state.mode === "scenario" ? state.scenario : state.paper);
const withActivePaper = (state: Persist, account: PaperAccount): Persist =>
  state.mode === "scenario" ? { ...state, scenario: account } : { ...state, paper: account };

function scenarioQuote(price: number | null, now: number): PilotQuote {
  return {
    status: price === null ? "UNAVAILABLE" : "OK",
    price,
    open: null,
    previousClose: null,
    timestamp: now,
    receivedAt: now,
    source: "Vlastní scénář · ručně zadaná cena",
    session: "CLOSED",
    points: [],
    message:
      "Fiktivní cena zadaná uživatelem. Tento účet a jeho výsledky jsou oddělené od tržního cvičení.",
  };
}
const usableForMode = (
  quote: PilotQuote | undefined,
  mode: PaperMode,
  now: number,
): quote is PilotQuote & { price: number; timestamp: number } =>
  mode === "market"
    ? isUsable(quote, now)
    : quote?.status === "OK" &&
      typeof quote.price === "number" &&
      Number.isFinite(quote.price) &&
      quote.price > 0 &&
      typeof quote.timestamp === "number";
function closingMinute(now: number, quote?: PilotQuote) {
  if (quote?.schedule?.date === ny(now).date) return ny(quote.schedule.regularEnd).minute;
  return marketCalendar(now).closeMinute;
}
export const quoteIsFresh = isRegularFresh;
/** Advisory only. No trade is sent or filled automatically when a level is crossed. */
export function getExit(position: PaperPosition, price: number, now: number): string {
  if (position.stop !== null && price <= position.stop) return "STOP";
  if (price >= position.target) return "TARGET";
  if (position.fillKind === "SCENARIO") return "HOLD";
  const current = ny(now);
  if (
    position.holdDays === 0 &&
    (current.date > position.date || current.minute >= closingMinute(now) - 5)
  )
    return "TIME";
  return "HOLD";
}

function plan(state: Persist, quote: PilotQuote | undefined, now: number) {
  const settings = state.settings,
    account = activePaper(state),
    clock = ny(now);
  const fresh = state.mode === "market" && isRegularFresh(quote, now);
  const usable = usableForMode(quote, state.mode, now);
  const open = quote?.open ?? null,
    previous = quote?.previousClose ?? null;
  const drop =
    settings.signal === "dip2"
      ? 2
      : settings.signal === "dipPct" && open !== null
        ? (open * settings.dipPct) / 100
        : settings.dipUsd;
  const limit = open !== null ? (settings.signal === "open" ? open : open - drop) : null;
  const gap =
    open !== null && previous !== null && previous > 0 ? (open / previous - 1) * 100 : null;
  const committed = paperCost(account);
  const available = Math.max(
    0,
    Math.min(
      account.cashUsd - settings.reserveCzk / settings.fx,
      (settings.capitalCzk - settings.reserveCzk) / settings.fx - committed,
      settings.slotCzk / settings.fx,
    ),
  );
  const qty = usable ? maxPaperQuantity(account, settings, quote.price) : 0;
  const riskBreached =
    usable &&
    Math.max(
      0,
      Math.max(account.riskPeakUsd, paperEquity(account, quote.price)) -
        paperEquity(account, quote.price),
    ) *
      settings.fx +
      1e-7 >=
      settings.drawdownLimitCzk;
  const common: string[] = [];
  if (account.locked) common.push("Ochrana účtu blokuje nové nákupy. Otevřené pozice lze prodat.");
  if (riskBreached)
    common.push("Dosažen limit poklesu od posledního potvrzeného maxima ochrany účtu.");
  if (account.positions.length >= settings.maxSlots)
    common.push("Dosažen maximální počet otevřených pozic.");
  if (!qty) common.push("Pro další nákup není volný kapitál nebo použitelná cena.");
  if (usable && settings.stopUsd >= quote.price) common.push("Stop musí být menší než cena akcie.");
  const reasons = [...common];
  if (!fresh)
    reasons.push("Strategie vyžaduje ověřenou hlavní seanci a kotaci starou nejvýše 2 minuty.");
  if (state.mode === "scenario")
    reasons.push("Vlastní scénář používá fiktivní cenu a ruční vstupy; nevytváří tržní signály.");
  if (settings.signal === "rebound")
    reasons.push("Odraz vyžaduje uzavřené OHLC svíčky; je dostupný pouze v backtestu.");
  if (settings.holdDays > 0)
    reasons.push(
      "Vícedenní časový limit je dostupný v backtestu; zde použij denní výstup nebo ruční držení.",
    );
  if (clock.minute > Math.min(settings.windowMinute, closingMinute(now, quote) - 5))
    reasons.push("Nákupní okno skončilo.");
  if (settings.gapPct > 0 && gap !== null && gap <= -settings.gapPct)
    reasons.push("Filtr výprodeje: otevírací gap " + pct(gap) + ".");
  if (account.lastBuyDate === clock.date)
    reasons.push("Dnes už byl proveden jeden simulovaný nákup.");
  if (fresh && settings.signal === "open" && clock.minute >= 575)
    reasons.push("Nákup při otevření je povolen pouze do 09:35 New York.");
  if (
    fresh &&
    settings.signal !== "open" &&
    limit !== null &&
    quote &&
    quote.price !== null &&
    quote.price > limit
  )
    reasons.push("Cena zatím nedosáhla nákupní úrovně.");
  const manualReasons = [...common];
  if (!usable)
    manualReasons.unshift(
      state.mode === "scenario"
        ? "Zadej kladnou fiktivní cenu vlastního scénáře."
        : "Pro tržní cvičení je nutná kotace z právě probíhající seance, nejvýše 20 minut stará.",
    );
  return {
    fresh,
    usable,
    limit,
    gap,
    qty,
    reasons,
    ready: reasons.length === 0,
    manualReady: manualReasons.length === 0,
    manualReasons,
    availableUsd: available,
    committedUsd: committed,
  };
}

interface Value {
  settings: Settings;
  paper: PaperAccount;
  marketPaper: PaperAccount;
  scenarioPaper: PaperAccount;
  core: Persist["core"];
  mode: PaperMode;
  scenarioPrice: number | null;
  hydrated: boolean;
  storageError: boolean;
  persistenceWarning: string | null;
  quote: PilotQuote | undefined;
  executionQuote: PilotQuote | undefined;
  quoteLoading: boolean;
  now: number;
  entry: ReturnType<typeof plan>;
  markets: NamedMarket[];
  setMarkets: (value: NamedMarket[]) => void;
  transactions: Transaction[];
  setTransactions: (value: Transaction[]) => void;
  saveSettings: (value: Settings) => void;
  saveCore: (qty: number, avg: number) => void;
  buy: (qty: number, strict?: boolean) => ActionResult;
  sell: (id: string, qty?: number) => ActionResult;
  refreshQuote: () => void;
  resetPaper: () => ActionResult;
  toggleLock: () => ActionResult;
  setMode: (mode: PaperMode) => ActionResult;
  setScenarioPrice: (price: number | null) => ActionResult;
  exportBackup: () => string;
  importBackup: (text: string) => ActionResult;
}
const Context = createContext<Value | null>(null);
export function PilotProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Persist>(initial),
    [hydrated, setHydrated] = useState(false);
  const [storageError, setStorageError] = useState(false),
    [persistenceWarning, setPersistenceWarning] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now),
    [markets, setMarkets] = useState<NamedMarket[]>([]),
    [transactions, setTransactions] = useState<Transaction[]>([]);
  const stateRef = useRef(state),
    hydratedRef = useRef(false),
    savedRawRef = useRef<string | null>(null),
    corruptRawRef = useRef<string | null>(null);
  const actionRef = useRef({ key: "", at: 0 });
  const query = useQuery({
    queryKey: ["pilot-quote-v4"],
    queryFn: () => getPilotQuote(),
    refetchInterval: 15000,
    refetchIntervalInBackground: false,
    retry: 1,
    staleTime: 0,
  });
  const quote = query.data as PilotQuote | undefined;
  const quoteRef = useRef<PilotQuote | undefined>(quote);
  quoteRef.current = quote;

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      savedRawRef.current = raw;
      if (raw) {
        try {
          const loaded = decode(JSON.parse(raw));
          stateRef.current = loaded;
          setState(loaded);
        } catch (error) {
          corruptRawRef.current = raw;
          setStorageError(true);
          setPersistenceWarning(
            "Uložená data nelze bezpečně načíst: " +
              messageOf(error) +
              " Původní obsah je zachován. Stáhni zálohu a obnov platný soubor; další zápisy jsou pozastavené.",
          );
        }
      }
    } catch {
      setStorageError(true);
      setPersistenceWarning(
        "Prohlížeč nepovolil místní úložiště. Před zavřením stránky stáhni zálohu.",
      );
    }
    hydratedRef.current = true;
    setHydrated(true);
    const timer = window.setInterval(() => setNow(Date.now()), 5000);
    const onStorage = (event: StorageEvent) => {
      if (event.key !== KEY || event.newValue === savedRawRef.current) return;
      try {
        if (!event.newValue)
          throw new Error("Účet byl odstraněn v jiném okně. Obnov stránku před dalšími obchody.");
        const updated = decode(JSON.parse(event.newValue));
        savedRawRef.current = event.newValue;
        stateRef.current = updated;
        setState(updated);
        corruptRawRef.current = null;
        setStorageError(false);
        setPersistenceWarning(
          "Cvičný účet byl aktualizován v jiném okně. Před obchodem zkontroluj nový stav.",
        );
      } catch (error) {
        corruptRawRef.current = event.newValue ?? "";
        setStorageError(true);
        setPersistenceWarning(messageOf(error));
      }
    };
    window.addEventListener("storage", onStorage);
    return () => {
      clearInterval(timer);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  // Mutations use a synchronous ref, so a second click cannot execute against stale React state.
  // Compare the saved revision before every write to avoid silently overwriting another tab.
  function commit(next: Persist, replace = false) {
    if (!hydratedRef.current) throw new Error("Počkej na načtení uloženého účtu.");
    if (corruptRawRef.current !== null && !replace)
      throw new Error(
        "Zápis je pozastaven kvůli poškozeným uloženým datům. Nejprve obnov platnou zálohu.",
      );
    let currentRaw: string | null = null,
      canRead = true;
    try {
      currentRaw = localStorage.getItem(KEY);
    } catch {
      canRead = false;
    }
    if (canRead && !replace && currentRaw !== savedRawRef.current) {
      if (currentRaw) {
        try {
          const current = decode(JSON.parse(currentRaw));
          savedRawRef.current = currentRaw;
          stateRef.current = current;
          setState(current);
        } catch {
          corruptRawRef.current = currentRaw;
          setStorageError(true);
        }
      }
      throw new Error("Účet se změnil v jiném okně. Zkontroluj načtený stav a pokyn zopakuj.");
    }
    const changed = { ...next, revision: crypto.randomUUID() };
    const serialized = JSON.stringify(changed);
    try {
      localStorage.setItem(KEY, serialized);
      savedRawRef.current = serialized;
      corruptRawRef.current = null;
      setStorageError(false);
      setPersistenceWarning(null);
    } catch {
      setStorageError(true);
      setPersistenceWarning(
        "Změna je pouze v paměti tohoto okna. Místní úložiště není dostupné nebo je plné; stáhni zálohu před zavřením stránky.",
      );
    }
    if (replace) corruptRawRef.current = null;
    stateRef.current = changed;
    setState(changed);
  }
  function attempt(work: () => string): ActionResult {
    try {
      return { ok: true, message: work() };
    } catch (error) {
      return { ok: false, message: messageOf(error) };
    }
  }
  function currentQuote(current: Persist, timestamp: number) {
    return current.mode === "scenario"
      ? scenarioQuote(current.scenarioPrice, timestamp)
      : quoteRef.current;
  }
  function evidence(
    current: Persist,
    activeQuote: PilotQuote | undefined,
    timestamp: number,
  ): FillEvidence {
    if (!usableForMode(activeQuote, current.mode, timestamp))
      throw new Error(
        "Cena není použitelná pro toto cvičení. Obnov data nebo zvol vlastní scénář.",
      );
    return {
      price: activeQuote.price,
      timestamp: activeQuote.timestamp,
      source: activeQuote.source,
      kind: current.mode === "scenario" ? "SCENARIO" : "MARKET",
    };
  }
  function guardAction(key: string, timestamp: number) {
    if (actionRef.current.key === key && timestamp - actionRef.current.at < 800)
      throw new Error("Předchozí kliknutí už bylo zpracováno. Zkontroluj stav účtu.");
  }

  useEffect(() => {
    if (!hydrated || corruptRawRef.current !== null) return;
    const current = stateRef.current;
    let market = current.paper,
      scenario = current.scenario;
    if (isUsable(quote, now))
      market = updatePaperRisk(
        market,
        quote.price,
        current.settings.drawdownLimitCzk / current.settings.fx,
      );
    if (current.scenarioPrice !== null)
      scenario = updatePaperRisk(
        scenario,
        current.scenarioPrice,
        current.settings.drawdownLimitCzk / current.settings.fx,
      );
    if (market === current.paper && scenario === current.scenario) return;
    try {
      commit({ ...current, paper: market, scenario });
    } catch (error) {
      setPersistenceWarning(messageOf(error));
    }
  }, [quote, now, hydrated, state.settings, state.scenarioPrice]);

  const executionQuote = useMemo(
    () => (state.mode === "scenario" ? scenarioQuote(state.scenarioPrice, now) : quote),
    [state.mode, state.scenarioPrice, now, quote],
  );
  const entry = useMemo(() => plan(state, executionQuote, now), [state, executionQuote, now]);
  function buy(qty: number, strict = false) {
    return attempt(() => {
      const current = stateRef.current,
        time = Date.now(),
        activeQuote = currentQuote(current, time);
      const key = current.mode + ":buy:" + qty;
      guardAction(key, time);
      const check = plan(current, activeQuote, time);
      if (!(strict ? check.ready : check.manualReady))
        throw new Error((strict ? check.reasons : check.manualReasons).join(" "));
      const fill = evidence(current, activeQuote, time);
      const updated = buyPaper(activePaper(current), current.settings, fill, qty, {
        now: time,
        id: crypto.randomUUID(),
      });
      commit(withActivePaper(current, updated));
      actionRef.current = { key, at: time };
      return `Cvičně nakoupeno ${qty} akcií za ${usd(fill.price)}. ${current.mode === "scenario" ? "Použita fiktivní cena vlastního scénáře." : "Použita poslední dostupná kotace, nikoli potvrzení plnění brokera."}`;
    });
  }
  function sell(id: string, qty?: number) {
    return attempt(() => {
      const current = stateRef.current,
        time = Date.now(),
        activeQuote = currentQuote(current, time);
      const key = current.mode + ":sell:" + id;
      guardAction(key, time);
      const fill = evidence(current, activeQuote, time),
        account = activePaper(current);
      const position = account.positions.find((item) => item.id === id);
      if (!position) throw new Error("Tato pozice už není otevřená.");
      const reason = getExit(position, fill.price, time);
      const updated = sellPaper(account, fill, id, qty, {
        now: time,
        tradeId: crypto.randomUUID(),
        reason: reason === "HOLD" ? "MANUAL" : reason,
        limitUsd: current.settings.drawdownLimitCzk / current.settings.fx,
      });
      commit(withActivePaper(current, updated));
      actionRef.current = { key, at: time };
      return `Cvičně prodáno ${qty ?? position.qty} akcií za ${usd(fill.price)}. Výsledek zahrnuje zadané náklady na obě strany.`;
    });
  }
  const value: Value = {
    settings: state.settings,
    core: state.core,
    paper: activePaper(state),
    marketPaper: state.paper,
    scenarioPaper: state.scenario,
    mode: state.mode,
    scenarioPrice: state.scenarioPrice,
    hydrated,
    storageError,
    persistenceWarning,
    quote,
    executionQuote,
    quoteLoading: query.isFetching,
    now,
    entry,
    markets,
    setMarkets,
    transactions,
    setTransactions,
    saveSettings: (settings) => {
      validate(settings);
      commit({ ...stateRef.current, settings: { ...settings } });
    },
    saveCore: (qty, avg) => {
      if (
        !Number.isFinite(qty) ||
        !Number.isFinite(avg) ||
        qty < 0 ||
        avg < 0 ||
        (qty > 0 && avg === 0)
      )
        throw new Error("Neplatná dlouhodobá pozice.");
      commit({ ...stateRef.current, core: { qty, avg } });
    },
    buy,
    sell,
    refreshQuote: () => {
      void query.refetch();
    },
    resetPaper: () =>
      attempt(() => {
        commit(withActivePaper(stateRef.current, createPaper(stateRef.current.settings)));
        actionRef.current = { key: "", at: 0 };
        return "Aktivní cvičný účet byl resetován. Druhý účet a dlouhodobá pozice zůstaly zachovány.";
      }),
    toggleLock: () =>
      attempt(() => {
        const current = stateRef.current,
          time = Date.now(),
          account = activePaper(current),
          activeQuote = currentQuote(current, time);
        const price = !account.positions.length
          ? 1
          : usableForMode(activeQuote, current.mode, time)
            ? activeQuote.price
            : null;
        if (account.locked && price === null)
          throw new Error(
            "Pro obnovení rizikového limitu otevřených pozic je nutná použitelná cena.",
          );
        const updated = setPaperLock(account, !account.locked, price ?? 1, time);
        commit(withActivePaper(current, updated));
        return account.locked
          ? "Nákupy jsou odemčené. Nový limit poklesu se počítá od aktuální hodnoty účtu; historická ztráta ani drawdown se nemažou."
          : "Nové nákupy jsou zamčené. Prodeje otevřených pozic zůstávají dostupné.";
      }),
    setMode: (mode) =>
      attempt(() => {
        if (mode !== "market" && mode !== "scenario") throw new Error("Neplatný režim cvičení.");
        commit({ ...stateRef.current, mode });
        actionRef.current = { key: "", at: 0 };
        return mode === "scenario"
          ? "Otevřen samostatný účet pro fiktivní scénáře."
          : "Otevřen samostatný účet pro cvičení s tržními kotacemi.";
      }),
    setScenarioPrice: (price) =>
      attempt(() => {
        if (price !== null && (!Number.isFinite(price) || price <= 0))
          throw new Error("Fiktivní cena musí být větší než nula.");
        const current = stateRef.current;
        const account =
          price === null
            ? current.scenario
            : updatePaperRisk(
                current.scenario,
                price,
                current.settings.drawdownLimitCzk / current.settings.fx,
              );
        commit({ ...current, scenarioPrice: price, scenario: account });
        return "Fiktivní cena scénáře byla nastavena.";
      }),
    exportBackup: () =>
      corruptRawRef.current ??
      JSON.stringify(
        {
          format: "INTC-PILOT-BACKUP",
          instrument: "NASDAQ:INTC",
          exportedAt: new Date().toISOString(),
          state: stateRef.current,
        },
        null,
        2,
      ),
    importBackup: (raw) =>
      attempt(() => {
        if (!raw || raw.length > 20 * 1024 * 1024)
          throw new Error("Vyber platnou JSON zálohu do 20 MB.");
        const parsed = object(JSON.parse(raw));
        const restored =
          parsed["format"] === "INTC-PILOT-BACKUP"
            ? (() => {
                if (parsed["instrument"] !== "NASDAQ:INTC")
                  throw new Error("Záloha není určena pro INTC.");
                return decode(parsed["state"]);
              })()
            : decode(parsed);
        commit(restored, true);
        actionRef.current = { key: "", at: 0 };
        return "Oba cvičné účty, nastavení a dlouhodobá evidence byly obnoveny z validované zálohy.";
      }),
  };
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function usePilot() {
  const value = useContext(Context);
  if (!value) throw new Error("PilotProvider chybí.");
  return value;
}
