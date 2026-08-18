import { useQuery } from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";

import { getQuote } from "./market.functions";
import { createSeedState } from "./seed";
import { consecutiveLosses, drawdownPct, evaluateStrategy, type StrategySnapshot } from "./strategy";
import type { AppState, Quote, StrategyParams, TradingMode } from "./types";

const STORAGE_KEY = "intc-trading-pilot-state-v1";

function loadState(): AppState {
  if (typeof window === "undefined") return createSeedState();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return createSeedState();
    return JSON.parse(raw) as AppState;
  } catch {
    return createSeedState();
  }
}

const FALLBACK_QUOTE: Quote = {
  symbol: "INTC",
  priceUsd: 34.4,
  previousCloseUsd: 34.86,
  changePct: -1.32,
  currency: "USD",
  timestamp: new Date(0).toISOString(),
  source: "MOCK",
  sourceLabel: "Demo mock adaptér (bez API klíče)",
  delayedMinutes: 0,
};

interface StoreValue {
  state: AppState;
  quote: Quote;
  quoteLoading: boolean;
  snapshot: StrategySnapshot;
  hydrated: boolean;
  setMode: (mode: TradingMode) => void;
  updateParam: <K extends keyof StrategyParams>(key: K, value: StrategyParams[K], label: string) => void;
  recordBuy: (shares: number, priceUsd: number, note: string, status: "SIMULATED" | "SUBMITTED") => void;
  recordSell: (shares: number, priceUsd: number, note: string, status: "SIMULATED" | "SUBMITTED") => void;
  recordRejected: (side: "BUY" | "SELL", shares: number, priceUsd: number, note: string) => void;
  togglePause: () => void;
  setRiskLocked: (locked: boolean) => void;
  markAlertsRead: () => void;
  resetDemo: () => void;
}

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(() => createSeedState());
  const [hydrated, setHydrated] = useState(false);
  const firedAlerts = useRef<Set<string>>(new Set());

  useEffect(() => {
    setState(loadState());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state, hydrated]);

  const quoteQuery = useQuery({
    queryKey: ["quote", "INTC"],
    queryFn: () => getQuote(),
    refetchInterval: 30000,
  });

  const quote = (quoteQuery.data as Quote | undefined) ?? FALLBACK_QUOTE;
  const snapshot = useMemo(() => evaluateStrategy(state, quote), [state, quote]);

  const pushAlert = useCallback(
    (kind: AppState["alerts"][number]["kind"], message: string, key: string) => {
      if (firedAlerts.current.has(key)) return;
      firedAlerts.current.add(key);
      setState((s) => ({
        ...s,
        alerts: [
          {
            id: crypto.randomUUID(),
            createdAt: new Date().toISOString(),
            kind,
            message,
            read: false,
          },
          ...s.alerts,
        ].slice(0, 100),
      }));
      toast.info(message);
    },
    [],
  );

  // Generátor in-app alertů (webhook/e-mail rozhraní je připraveno v README
  // jako budoucí rozšíření — bez závislosti na externí službě).
  useEffect(() => {
    if (!hydrated) return;
    const day = new Date().toISOString().slice(0, 10);
    if (snapshot.action === "KUP")
      pushAlert("BUY_ZONE", "Buy zone: podmínky pro novou tranši jsou splněny.", `buy-${day}`);
    if (
      snapshot.dropFromReferencePct !== null &&
      snapshot.dropFromReferencePct >= state.params.stopAddDropPct
    )
      pushAlert(
        "STOP_ADD",
        `Stop-add: pokles ${snapshot.dropFromReferencePct.toFixed(2)} % od reference cyklu.`,
        `stopadd-${day}`,
      );
    if (snapshot.cooldownDaysRemaining === 0 && state.portfolio.cooldownStartedAt)
      pushAlert("RESTART", "Cooldown vypršel — sleduj rebound pro restart nákupů.", `restart-${day}`);
    if (snapshot.action === "PRODAT_CAST")
      pushAlert("SELL_TARGET", "Sell target: pozice dosáhla cílového zisku.", `sell-${day}`);
    if (snapshot.drawdownPct >= state.params.maxDrawdownPct)
      pushAlert(
        "RISK",
        `Risk: drawdown ${snapshot.drawdownPct.toFixed(1)} % překročil limit ${state.params.maxDrawdownPct} %.`,
        `risk-${day}`,
      );
  }, [snapshot, hydrated, state.params, state.portfolio.cooldownStartedAt, pushAlert]);

  // Risk lock
  useEffect(() => {
    if (!hydrated || state.riskLocked) return;
    const dd = drawdownPct(state.portfolio, quote.priceUsd, state.params.fxUsdCzk);
    const losses = consecutiveLosses(state.portfolio);
    if (dd >= state.params.maxDrawdownPct || losses >= state.params.maxConsecutiveLosses) {
      setState((s) => ({ ...s, riskLocked: true }));
    }
  }, [hydrated, state.riskLocked, state.portfolio, state.params, quote.priceUsd]);

  const logSignal = useCallback((s: AppState, priceUsd: number, snap: StrategySnapshot): AppState => ({
    ...s,
    signals: [
      {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        action: snap.action,
        reason: snap.reason,
        priceUsd,
      },
      ...s.signals,
    ].slice(0, 200),
  }), []);

  const value: StoreValue = {
    state,
    quote,
    quoteLoading: quoteQuery.isLoading,
    snapshot,
    hydrated,
    setMode: (mode) =>
      setState((s) => ({
        ...s,
        mode,
        paramChanges: [
          {
            id: crypto.randomUUID(),
            createdAt: new Date().toISOString(),
            field: "Režim obchodování",
            from: s.mode,
            to: mode,
          },
          ...s.paramChanges,
        ],
      })),
    updateParam: (key, val, label) =>
      setState((s) => {
        if (s.params[key] === val) return s;
        return {
          ...s,
          params: { ...s.params, [key]: val },
          paramChanges: [
            {
              id: crypto.randomUUID(),
              createdAt: new Date().toISOString(),
              field: label,
              from: String(s.params[key]),
              to: String(val),
            },
            ...s.paramChanges,
          ].slice(0, 200),
        };
      }),
    recordBuy: (shares, priceUsd, note, status) =>
      setState((s) => {
        const fx = s.params.fxUsdCzk;
        const valueUsd = shares * priceUsd;
        const valueCzk = valueUsd * fx;
        const isFirst = s.portfolio.cycleReferencePriceUsd === null;
        const next: AppState = {
          ...s,
          portfolio: {
            ...s.portfolio,
            cashCzk: s.portfolio.cashCzk - valueCzk,
            tranches: [
              ...s.portfolio.tranches,
              {
                id: crypto.randomUUID(),
                openedAt: new Date().toISOString(),
                shares,
                priceUsd,
                mode: s.mode,
              },
            ],
            cycleReferencePriceUsd: isFirst ? priceUsd : s.portfolio.cycleReferencePriceUsd,
            cycleStartedAt: isFirst ? new Date().toISOString() : s.portfolio.cycleStartedAt,
            cycleLowUsd: Math.min(s.portfolio.cycleLowUsd ?? priceUsd, priceUsd),
            cooldownStartedAt: null,
            lastBuyAt: new Date().toISOString(),
          },
          orders: [
            {
              id: crypto.randomUUID(),
              createdAt: new Date().toISOString(),
              side: "BUY" as const,
              shares,
              priceUsd,
              valueUsd,
              valueCzk,
              mode: s.mode,
              status: status as "SIMULATED" | "SUBMITTED",
              note,
              idempotencyKey: crypto.randomUUID(),
            },
            ...s.orders,
          ].slice(0, 200),
        };
        return logSignal(next, priceUsd, snapshot);
      }),
    recordSell: (shares, priceUsd, note, status) =>
      setState((s) => {
        const fx = s.params.fxUsdCzk;
        let remaining = shares;
        const tranches = [...s.portfolio.tranches].sort((a, b) => a.priceUsd - b.priceUsd);
        let costUsd = 0;
        const kept: typeof tranches = [];
        for (const t of tranches) {
          if (remaining <= 0) {
            kept.push(t);
            continue;
          }
          const take = Math.min(t.shares, remaining);
          costUsd += take * t.priceUsd;
          remaining -= take;
          if (t.shares - take > 0.0001) kept.push({ ...t, shares: t.shares - take });
        }
        const soldShares = shares - Math.max(0, remaining);
        const proceedsUsd = soldShares * priceUsd;
        const pnlCzk = (proceedsUsd - costUsd) * fx;
        const next: AppState = {
          ...s,
          portfolio: {
            ...s.portfolio,
            cashCzk: s.portfolio.cashCzk + proceedsUsd * fx,
            tranches: kept,
            cycleReferencePriceUsd: kept.length ? s.portfolio.cycleReferencePriceUsd : null,
            cycleLowUsd: kept.length ? s.portfolio.cycleLowUsd : null,
            realizedTrades: [
              ...s.portfolio.realizedTrades,
              { id: crypto.randomUUID(), closedAt: new Date().toISOString(), pnlCzk },
            ],
          },
          orders: [
            {
              id: crypto.randomUUID(),
              createdAt: new Date().toISOString(),
              side: "SELL" as const,
              shares: soldShares,
              priceUsd,
              valueUsd: proceedsUsd,
              valueCzk: proceedsUsd * fx,
              mode: s.mode,
              status: status as "SIMULATED" | "SUBMITTED",
              note,
              idempotencyKey: crypto.randomUUID(),
            },
            ...s.orders,
          ].slice(0, 200),
        };
        return logSignal(next, priceUsd, snapshot);
      }),
    recordRejected: (side, shares, priceUsd, note) =>
      setState((s) => ({
        ...s,
        orders: [
          {
            id: crypto.randomUUID(),
            createdAt: new Date().toISOString(),
            side,
            shares,
            priceUsd,
            valueUsd: shares * priceUsd,
            valueCzk: shares * priceUsd * s.params.fxUsdCzk,
            mode: s.mode,
            status: "REJECTED" as const,
            note,
            idempotencyKey: crypto.randomUUID(),
          },
          ...s.orders,
        ].slice(0, 200),
      })),
    togglePause: () =>
      setState((s) => ({
        ...s,
        portfolio: { ...s.portfolio, manualPause: !s.portfolio.manualPause },
      })),
    setRiskLocked: (locked) => setState((s) => ({ ...s, riskLocked: locked })),
    markAlertsRead: () =>
      setState((s) => ({ ...s, alerts: s.alerts.map((a) => ({ ...a, read: true })) })),
    resetDemo: () => {
      firedAlerts.current.clear();
      setState(createSeedState());
      toast.success("Demo data obnovena.");
    },
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore musí být uvnitř StoreProvider.");
  return ctx;
}
