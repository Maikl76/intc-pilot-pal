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

/** Legacy endpoint — version 2 has no broker submission path. */
export const submitOrder=createServerFn({method:"POST"}).inputValidator((input:unknown)=>orderSchema.parse(input)).handler(async({data}):Promise<OrderResult>=>({
  status:data.mode==="PAPER"?"SIMULATED":"REJECTED",
  message:data.mode==="PAPER"?"Starší simulace. Žádná objednávka neodešla na burzu.":"LIVE je ve verzi 2 zakázán; žádná reálná objednávka.",
  idempotencyKey:data.idempotencyKey,duplicate:false,
}));
