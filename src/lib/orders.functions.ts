import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const orderSchema = z.object({
  side: z.enum(["BUY", "SELL"]),
  shares: z.number().positive().max(10000),
  priceUsd: z.number().positive().max(100000),
  mode: z.enum(["PAPER", "LIVE"]),
  idempotencyKey: z.string().min(8).max(120),
  /** LIVE pokyn vyžaduje druhé, explicitní potvrzení konkrétní objednávky. */
  confirmed: z.boolean(),
});

export interface OrderResult {
  status: "SIMULATED" | "SUBMITTED" | "REJECTED";
  message: string;
  idempotencyKey: string;
  duplicate: boolean;
}

/**
 * Odeslání pokynu. PAPER = pouze simulace na serveru.
 * LIVE = vyžaduje (1) LIVE režim, (2) explicitní potvrzení konkrétní objednávky
 * a (3) nastavené serverové secrety. Jinak je pokyn odmítnut.
 */
export const submitOrder = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => orderSchema.parse(input))
  .handler(async ({ data }): Promise<OrderResult> => {
    const t212 = await import("./trading212.server");

    const cached = t212.recallOrder(data.idempotencyKey);
    if (cached) {
      return {
        status: "REJECTED",
        message: "Duplicitní pokyn se stejným idempotency klíčem byl zablokován.",
        idempotencyKey: data.idempotencyKey,
        duplicate: true,
      };
    }

    if (data.mode === "PAPER") {
      const result: OrderResult = {
        status: "SIMULATED",
        message: `PAPER: simulováno ${data.side === "BUY" ? "nákup" : "prodej"} ${data.shares} ks INTC @ ${data.priceUsd} USD. Na burzu nešlo nic.`,
        idempotencyKey: data.idempotencyKey,
        duplicate: false,
      };
      t212.rememberOrder(data.idempotencyKey, result);
      return result;
    }

    if (!data.confirmed) {
      return {
        status: "REJECTED",
        message: "LIVE pokyn bez druhého potvrzení nebude odeslán.",
        idempotencyKey: data.idempotencyKey,
        duplicate: false,
      };
    }

    const creds = t212.readCredentials();
    if (!creds) {
      return {
        status: "REJECTED",
        message:
          "LIVE režim: Trading 212 klíče nejsou nastaveny na serveru (Project Settings → Secrets). Pokyn nebyl odeslán.",
        idempotencyKey: data.idempotencyKey,
        duplicate: false,
      };
    }

    // Skutečné odeslání limitního pokynu — záměrně ponecháno jako explicitní
    // integrační bod, dokud uživatel nedokončí ověření beta API.
    // const res = await t212.t212Fetch("/api/v0/equity/orders/limit", {
    //   method: "POST",
    //   body: JSON.stringify({ ticker: "INTC_US_EQ", quantity: data.shares, limitPrice: data.priceUsd, timeValidity: "DAY" }),
    // })

    const result: OrderResult = {
      status: "REJECTED",
      message:
        "LIVE routing je zapnutý, ale odesílací volání Trading 212 je stále vypnuté (beta bezpečnostní pojistka). Odkomentuj integrační blok v orders.functions.ts po ověření účtu.",
      idempotencyKey: data.idempotencyKey,
      duplicate: false,
    };
    t212.rememberOrder(data.idempotencyKey, result);
    return result;
  });
