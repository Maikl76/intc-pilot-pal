import { DEFAULT_PARAMS } from "./strategy";
import type { AppState } from "./types";

const DAY = 86400000;

function iso(daysAgo: number, hour = 15): string {
  const d = new Date(Date.now() - daysAgo * DAY);
  d.setHours(hour, 30, 0, 0);
  return d.toISOString();
}

/**
 * Demo seed — aby dashboard vypadal funkčně i bez API klíčů.
 * Jde o smyšlená data označená jako DEMO, nikoli o reálné obchody.
 */
export function createSeedState(): AppState {
  const fx = DEFAULT_PARAMS.fxUsdCzk;
  const tranches = [
    { id: "t1", openedAt: iso(24), shares: 11.92, priceUsd: 36.8, mode: "PAPER" as const },
    { id: "t2", openedAt: iso(16), shares: 12.38, priceUsd: 35.42, mode: "PAPER" as const },
    { id: "t3", openedAt: iso(9), shares: 12.86, priceUsd: 34.1, mode: "PAPER" as const },
    // Demo tranše, která už je nad per-tranche targetem +6,25 %.
    { id: "t4", openedAt: iso(5), shares: 13.75, priceUsd: 31.9, mode: "PAPER" as const },
  ];

  const invested = tranches.reduce((s, t) => s + t.shares * t.priceUsd * fx, 0);

  return {
    mode: "PAPER",
    params: { ...DEFAULT_PARAMS },
    riskLocked: false,
    portfolio: {
      cashCzk: 268000,
      tranches,
      cycleReferencePriceUsd: 36.8,
      cycleStartedAt: iso(24),
      cycleLowUsd: 33.18,
      cooldownStartedAt: iso(3),
      lastBuyAt: iso(9),
      manualPause: false,
      equityPeakCzk: 268000 + invested * 1.04,
      realizedTrades: [
        { id: "r1", closedAt: iso(31), pnlCzk: 1840 },
        { id: "r2", closedAt: iso(19), pnlCzk: -620 },
      ],
    },
    orders: [
      {
        id: "o1",
        createdAt: iso(24),
        side: "BUY",
        shares: 11.92,
        priceUsd: 36.8,
        valueUsd: 438.66,
        valueCzk: 10001,
        mode: "PAPER",
        status: "SIMULATED",
        note: "DEMO: první tranše cyklu, referenční cena 36,80 USD.",
        idempotencyKey: "demo-o1",
      },
      {
        id: "o2",
        createdAt: iso(16),
        side: "BUY",
        shares: 12.38,
        priceUsd: 35.42,
        valueUsd: 438.5,
        valueCzk: 9998,
        mode: "PAPER",
        status: "SIMULATED",
        note: "DEMO: druhá tranše, pokles 3,75 % od reference.",
        idempotencyKey: "demo-o2",
      },
      {
        id: "o3",
        createdAt: iso(9),
        side: "BUY",
        shares: 12.86,
        priceUsd: 34.1,
        valueUsd: 438.53,
        valueCzk: 9999,
        mode: "PAPER",
        status: "SIMULATED",
        note: "DEMO: třetí tranše, pokles 7,34 % od reference.",
        idempotencyKey: "demo-o3",
      },
      {
        id: "o4",
        createdAt: iso(5),
        side: "BUY",
        shares: 13.75,
        priceUsd: 31.9,
        valueUsd: 438.63,
        valueCzk: 10001,
        mode: "PAPER",
        status: "SIMULATED",
        note: "DEMO: čtvrtá tranše, target +6,25 % = 33,89 USD, nouzový stop −20 % = 25,52 USD.",
        idempotencyKey: "demo-o4",
      },
    ],

    signals: [
      {
        id: "s1",
        createdAt: iso(3),
        action: "NEKUPOVAT",
        reason: "DEMO: pokles překročil 8 % od reference cyklu → stop-add a start cooldownu.",
        priceUsd: 33.6,
      },
      {
        id: "s2",
        createdAt: iso(9),
        action: "KUP",
        reason: "DEMO: podmínky splněny, konstantní tranše 10 000 Kč.",
        priceUsd: 34.1,
      },
    ],
    paramChanges: [
      {
        id: "p1",
        createdAt: iso(30),
        field: "Inicializace",
        from: "—",
        to: "Výchozí parametry backtestu 2025–2026",
      },
    ],
    alerts: [
      {
        id: "a1",
        createdAt: iso(3),
        kind: "STOP_ADD",
        message: "DEMO: dosažena 8% stop-add hranice, nákupy pozastaveny.",
        read: false,
      },
      {
        id: "a2",
        createdAt: iso(3, 16),
        kind: "COOLDOWN",
        message: "DEMO: spuštěn cooldown na 5 kalendářních dní.",
        read: false,
      },
    ],
  };
}
