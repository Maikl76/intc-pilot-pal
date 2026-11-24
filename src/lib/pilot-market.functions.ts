import { createServerFn } from "@tanstack/react-start";
import { parseYahoo,parseFinnhub,selectQuote,type PilotQuote } from "./pilot-quotes.mjs";
export type { PilotQuote } from "./pilot-quotes.mjs";

const unavailable=(message:string):PilotQuote=>({status:"UNAVAILABLE",price:null,open:null,previousClose:null,timestamp:null,receivedAt:Date.now(),message,source:"Yahoo Finance / Finnhub",session:"CLOSED",points:[]});
let cache:PilotQuote|null=null;
let fetchedAt=0;
let pending:Promise<PilotQuote>|null=null;
async function json(url:string,headers:Record<string,string>={}):Promise<unknown>{
  const r=await fetch(url,{headers:{Accept:"application/json",...headers},signal:AbortSignal.timeout(6500)});
  if(!r.ok)throw Error("HTTP "+r.status);
  return r.json();
}
async function loadQuote():Promise<PilotQuote>{
  const errors:string[]=[];
  const yahoo=async():Promise<PilotQuote|null>=>{
    // Unofficial public chart endpoint, no credentials. Subject to rate limits and terms.
    for(const host of ["query1.finance.yahoo.com","query2.finance.yahoo.com"]){
      try{
        const raw=await json("https://"+host+"/v8/finance/chart/INTC?range=1d&interval=1m&includePrePost=true",{"User-Agent":"Mozilla/5.0","Referer":"https://finance.yahoo.com/"});
        const result=parseYahoo(raw,Date.now());if(result)return result;
        errors.push(host+": neplatná odpověď");
      }catch(e){errors.push(host+": "+(e instanceof Error?e.message:"nedostupný"));}
    }
    return null;
  };
  const finnhub=async():Promise<PilotQuote|null>=>{
    const key=typeof process!=="undefined"?process.env["MARKET_DATA_API_KEY"]:undefined;
    if(!key)return null;
    try{
      const raw=await json("https://finnhub.io/api/v1/quote?symbol=INTC",{"X-Finnhub-Token":key});
      const result=parseFinnhub(raw,Date.now());if(result)return result;
      errors.push("Finnhub: neplatná odpověď");
    }catch{errors.push("Finnhub: nedostupný");}
    return null;
  };
  const quotes=await Promise.all([yahoo(),finnhub()]);
  const best=selectQuote(quotes,Date.now());
  if(best&&(!cache||cache.timestamp===null||best.timestamp!>=cache.timestamp)){cache=best;return best;}
  if(cache)return {...cache,message:"Zobrazuji poslední úspěšně načtenou cenu. Novější kotace není dostupná. "+errors.join(" · ")};
  return unavailable("Nepodařilo se načíst cenu INTC. "+errors.join(" · ")+" Zkontroluj poskytovatele; pro trénink lze zadat vlastní cenu.");
}
export const getPilotQuote=createServerFn({method:"GET"}).handler(async():Promise<PilotQuote>=>{
  if(pending)return pending;
  if(cache&&Date.now()-fetchedAt<12000)return cache;
  pending=loadQuote().finally(()=>{fetchedAt=Date.now();pending=null;});
  return pending;
});
