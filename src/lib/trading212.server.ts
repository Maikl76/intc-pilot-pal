/**
 * Trading 212 Public API (Invest) — server-only adapter skeleton.
 *
 * Klíče se čtou VÝHRADNĚ zde, na serveru, uvnitř funkcí (nikdy na module scope,
 * nikdy v klientském bundlu, nikdy v localStorage).
 *
 * Secrety patří do Project Settings → Secrets:
 *   TRADING212_API_KEY     – API klíč (Invest účet)
 *   TRADING212_API_SECRET  – secret, pokud jej účet používá
 *   TRADING212_BASE_URL    – https://live.trading212.com nebo https://demo.trading212.com
 *
 * API je v BETA režimu: nízké rate limity, nestabilní odpovědi. Proto níže
 * jednoduchý token-bucket limiter, retry s exponenciálním backoffem a
 * idempotenční ochrana proti duplicitním pokynům.
 */

export interface T212Credentials {
  apiKey: string;
  apiSecret: string;
  baseUrl: string;
}

export function readCredentials(): T212Credentials | null {
  const apiKey = process.env["TRADING212_API_KEY"];
  if (!apiKey) return null;
  return {
    apiKey,
    apiSecret: process.env["TRADING212_API_SECRET"] ?? "",
    baseUrl: process.env["TRADING212_BASE_URL"] ?? "https://demo.trading212.com",
  };
}

export function maskSecret(value: string): string {
  if (!value) return "—";
  if (value.length <= 6) return "••••••";
  return `${value.slice(0, 3)}••••••${value.slice(-2)}`;
}

/** Token bucket: T212 beta má agresivní limity, držíme se hluboko pod nimi. */
const bucket = { tokens: 5, updatedAt: Date.now(), capacity: 5, refillPerSec: 0.5 };

async function takeToken(): Promise<void> {
  const now = Date.now();
  bucket.tokens = Math.min(
    bucket.capacity,
    bucket.tokens + ((now - bucket.updatedAt) / 1000) * bucket.refillPerSec,
  );
  bucket.updatedAt = now;
  if (bucket.tokens < 1) {
    const waitMs = ((1 - bucket.tokens) / bucket.refillPerSec) * 1000;
    await new Promise((r) => setTimeout(r, Math.min(waitMs, 5000)));
    bucket.tokens = 1;
  }
  bucket.tokens -= 1;
}

/** Idempotence: klíč → výsledek, aby se stejný pokyn neodeslal dvakrát. */
const submittedOrders = new Map<string, { at: number; result: unknown }>();

export function rememberOrder(key: string, result: unknown) {
  submittedOrders.set(key, { at: Date.now(), result });
}

export function recallOrder(key: string): unknown | undefined {
  const hit = submittedOrders.get(key);
  if (!hit) return undefined;
  if (Date.now() - hit.at > 10 * 60 * 1000) {
    submittedOrders.delete(key);
    return undefined;
  }
  return hit.result;
}

export interface T212Error {
  status: number;
  message: string;
  retryable: boolean;
}

/** Fetch s rate-limitem, retry a exponenciálním backoffem (jitter). */
export async function t212Fetch(
  path: string,
  init: RequestInit = {},
  attempts = 3,
): Promise<Response> {
  const creds = readCredentials();
  if (!creds) throw new Error("Trading 212 credentials nejsou nastaveny na serveru.");

  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    await takeToken();
    try {
      const res = await fetch(`${creds.baseUrl}${path}`, {
        ...init,
        headers: {
          Authorization: creds.apiKey,
          "Content-Type": "application/json",
          ...(init.headers ?? {}),
        },
      });
      if (res.status === 429 || res.status >= 500) {
        lastError = new Error(`T212 ${res.status}`);
        await backoff(i);
        continue;
      }
      return res;
    } catch (err) {
      lastError = err;
      await backoff(i);
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Trading 212 request selhal.");
}

async function backoff(attempt: number) {
  const base = 500 * Math.pow(2, attempt);
  await new Promise((r) => setTimeout(r, base + Math.floor(Math.random() * 250)));
}
