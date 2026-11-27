import { usd, czk } from "./pilot-store";

/** Text chyby pro uživatele. */
export const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : String(error);
/** Podíl 0–1 jako procenta („42 %“); neplatná hodnota = „—“. */
export const share = (value: number | null | undefined, digits = 0) =>
  value == null || !Number.isFinite(value)
    ? "—"
    : (value * 100).toLocaleString("cs-CZ", { maximumFractionDigits: digits }) + " %";
export const plusUsd = (value: number) => (value > 0 ? "+" : "") + usd(value);
export const plusCzk = (value: number) => (value > 0 ? "+" : "") + czk(value);
/** Barva textu podle znaménka. */
export const toneOf = (value: number) =>
  value > 0 ? "text-success" : value < 0 ? "text-destructive" : "";
export const number = (value: number, digits = 2) =>
  value.toLocaleString("cs-CZ", { maximumFractionDigits: digits });
