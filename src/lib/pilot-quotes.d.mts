export type Session="PRE"|"REGULAR"|"POST"|"CLOSED";
export interface Point{timestamp:number;price:number}
export interface PilotQuote{status:"OK"|"UNAVAILABLE";price:number|null;open:number|null;previousClose:number|null;timestamp:number|null;receivedAt:number;source:string;session:Session;points:Point[];message:string}
export function ny(t:number):{date:string;minute:number};
export function session(t:number):Session;
export function parseYahoo(payload:unknown,now:number):PilotQuote|null;
export function parseFinnhub(payload:unknown,now:number):PilotQuote|null;
export function selectQuote(quotes:(PilotQuote|null)[],now:number):PilotQuote|null;
export function ageMinutes(q:PilotQuote|undefined,now:number):number|null;
export function isUsable(q:PilotQuote|undefined,now:number):q is PilotQuote & {status:"OK";price:number;timestamp:number};
export function isRegularFresh(q:PilotQuote|undefined,now:number):q is PilotQuote & {status:"OK";price:number;timestamp:number;open:number;previousClose:number};
