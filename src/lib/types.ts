export type TradingMode = "PAPER" | "LIVE";

export type StrategyStatus = "ACTIVE" | "COOLDOWN" | "PAUSED";

export type SellMode = "A" | "B" | "C";

/** Důvod prodejního signálu / pokynu. */
export type SellReason = "TAKE_PROFIT_6_25" | "EMERGENCY_STOP_20" | "MANUAL";

export type TrancheStatus = "OPEN" | "TARGET_HIT" | "STOP_HIT" | "SOLD";


export type ActionKind = "KUP" | "NEKUPOVAT" | "PRODAT_CAST" | "DRZET" | "PAUZA";

export type DataSourceKind = "MOCK" | "TRADING212" | "EXTERNAL";

export interface StrategyParams {
  /** Základní nákupní tranše v CZK (5 000 – 15 000). */
  trancheCzk: number;
  /** Maximální expozice do INTC v CZK. */
  maxExposureCzk: number;
  /** Pokles od referenční ceny cyklu, po kterém se zastaví další nákupy (%). */
  stopAddDropPct: number;
  /** Minimální cooldown ve kalendářních dnech. */
  cooldownDays: number;
  /** Rebound od minima v cooldownu potřebný pro restart nákupů (%). */
  reboundPct: number;
  /** Konstantní tranše během poklesu (bez navyšování). */
  constantTrancheOnDrawdown: boolean;
  /** Preferovaná obchodní měna. */
  preferredCurrency: "USD" | "CZK";
  /** Prodejní modul. */
  sellMode: SellMode;
  /** Cílový zisk pro prodej (%, 0,5 – 5). */
  sellTargetPct: number;
  /** Risk: maximální povolený drawdown od equity peaku (%). */
  maxDrawdownPct: number;
  /** Risk: počet po sobě jdoucích ztrátových prodejů, po kterém se strategie zamkne. */
  maxConsecutiveLosses: number;
  /** Kurz USD/CZK použitý pro přepočty. */
  fxUsdCzk: number;
}

export interface Tranche {
  id: string;
  openedAt: string;
  shares: number;
  priceUsd: number;
  mode: TradingMode;
}

export interface OrderRecord {
  id: string;
  createdAt: string;
  side: "BUY" | "SELL";
  shares: number;
  priceUsd: number;
  valueUsd: number;
  valueCzk: number;
  mode: TradingMode;
  status: "SIMULATED" | "SUBMITTED" | "REJECTED";
  note: string;
  /** Klíč pro zamezení duplicit. */
  idempotencyKey: string;
}

export interface SignalRecord {
  id: string;
  createdAt: string;
  action: ActionKind;
  reason: string;
  priceUsd: number;
}

export interface ParamChangeRecord {
  id: string;
  createdAt: string;
  field: string;
  from: string;
  to: string;
}

export interface AlertRecord {
  id: string;
  createdAt: string;
  kind: "BUY_ZONE" | "STOP_ADD" | "COOLDOWN" | "RESTART" | "SELL_TARGET" | "RISK";
  message: string;
  read: boolean;
}

export interface RealizedTrade {
  id: string;
  closedAt: string;
  pnlCzk: number;
}

export interface PortfolioState {
  cashCzk: number;
  tranches: Tranche[];
  /** Referenční cena prvního nákupu aktuálního cyklu (USD). */
  cycleReferencePriceUsd: number | null;
  cycleStartedAt: string | null;
  /** Lokální minimum dosažené během poklesu / cooldownu (USD). */
  cycleLowUsd: number | null;
  cooldownStartedAt: string | null;
  lastBuyAt: string | null;
  manualPause: boolean;
  equityPeakCzk: number;
  realizedTrades: RealizedTrade[];
}

export interface Quote {
  symbol: string;
  priceUsd: number;
  previousCloseUsd: number;
  changePct: number;
  currency: string;
  timestamp: string;
  source: DataSourceKind;
  sourceLabel: string;
  delayedMinutes: number;
}

export interface AppState {
  mode: TradingMode;
  params: StrategyParams;
  portfolio: PortfolioState;
  orders: OrderRecord[];
  signals: SignalRecord[];
  paramChanges: ParamChangeRecord[];
  alerts: AlertRecord[];
  riskLocked: boolean;
}
