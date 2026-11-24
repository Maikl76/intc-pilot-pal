import { createServerFn } from "@tanstack/react-start";

export interface PilotQuote {
  status: "OK" | "UNAVAILABLE";
  price: number | null;
  open: number | null;
  previousClose: number | null;
  timestamp: number | null;
  receivedAt: number;
  message: string;
  source: string;
}
const unavailable = (message: string): PilotQuote => ({
  status:"UNAVAILABLE",price:null,open:null,previousClose:null,timestamp:null,
  receivedAt:Date.now(),message,source:"Finnhub",
});

// Never substitute a simulated quote for missing market data.
// Finnhub t is the market timestamp, not the time the API response arrived.
export const getPilotQuote = createServerFn({ method:"GET" }).handler(async ():Promise<PilotQuote> => {
  const key=process.env["MARKET_DATA_API_KEY"];
  if(!key)return unavailable("Chybí serverový MARKET_DATA_API_KEY. Import cen a backtest zůstávají dostupné.");
  try {
    const response=await fetch("https://finnhub.io/api/v1/quote?symbol=INTC&token="+encodeURIComponent(key),
      {cache:"no-store",signal:AbortSignal.timeout(8000)});
    if(!response.ok)return unavailable("Poskytovatel vrátil chybu "+response.status+". Signály jsou pozastavené.");
    const q=await response.json() as {c?:number;o?:number;pc?:number;t?:number};
    const price=Number(q.c),open=Number(q.o),previousClose=Number(q.pc),timestamp=Number(q.t)*1000;
    if(![price,open,previousClose,timestamp].every(Number.isFinite)||Math.min(price,open,previousClose,timestamp)<=0||timestamp>Date.now()+10000)
      return unavailable("Neúplná nebo neplatná kotace.");
    return {status:"OK",price,open,previousClose,timestamp,receivedAt:Date.now(),message:"Kotace od poskytovatele; rychlost aktualizace závisí na jeho tarifu.",source:"Finnhub"};
  }catch{return unavailable("Datový zdroj nedostupný. Žádná náhradní smyšlená cena.");}
});
