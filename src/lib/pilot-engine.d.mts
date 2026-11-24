export type Signal = "open" | "dip1" | "dip2" | "dipPct" | "rebound";
export interface Settings { capitalCzk:number; coreBudgetCzk:number; slotCzk:number; reserveCzk:number; fx:number; maxSlots:number; signal:Signal; dipUsd:number; dipPct:number; reboundUsd:number; targetUsd:number; stopUsd:number; holdDays:number; gapPct:number; windowMinute:number; fee:number; drawdownLimitCzk:number }
export interface Bar {ts:number;date:string;minute:number;o:number;h:number;l:number;c:number;v:number}
export interface MarketData {bars:Bar[];interval:number;rejected:number}
export interface Day {date:string;bars:Bar[];open:number;gap:number|null}
export interface Position {id:number;entry:number;qty:number;entryTs:number;entryDate:string;day:number}
export interface Trade extends Position {exit:number;exitTs:number;exitDate:string;reason:string;pnlUsd:number;pnlCzk:number;holdMinutes:number}
export interface OpenPosition extends Position {mark:number;pnlCzk:number}
export interface CurvePoint {date:string;equityCzk:number;cashCzk:number;open:number;committedCzk:number}
export interface Result {settings:Settings;days:number;entries:number;closed:number;targets:number;stops:number;times:number;wins:number;winRate:number|null;profitFactor:number|null;realizedCzk:number;unrealizedCzk:number;totalCzk:number;returnPct:number;maxDrawdownCzk:number;dailyDrawdownCzk:number;blocked:number;blockedGap:number;open:OpenPosition[];curve:CurvePoint[];trades:Trade[];medianHoldMinutes:number|null;meanHoldMinutes:number|null;maxHoldMinutes:number|null;finalCashCzk:number}
export interface Optimization {count:number;trainStart:string;trainEnd:string;testStart:string;testEnd:string;rank:{settings:Settings;entries:number;totalCzk:number;drawdownCzk:number;score:number}[];train:Result;test:Result;baselineTest:Result;full:Result}
export interface Transaction {id:string;ts:number;side:"BUY"|"SELL";qty:number;price:number;result:number|null;resultCurrency:string;fxFee:number;feeCurrency:string;date:string;minute:number}
export interface Summary {buys:number;sells:number;buyQty:number;sellQty:number;buyUsd:number;sellUsd:number;result:Record<string,number>;fees:Record<string,number>;pairs:{buy:Transaction;sell:Transaction;pnlUsd:number;holdMinutes:number}[];pairGrossUsd:number}
export interface ActualResult {results:{id:string;ts:number;price:number;qty:number;hit:number|null;firstDay:number|null;worst:number}[];unmatched:number;outside:number;censored:number;hits:number;sameDay:number;nextDay:number}
export const defaults:Readonly<Settings>;
export function ny(ts:number):{date:string;minute:number};
export function parseBars(s:string):MarketData;
export function sessions(d:MarketData):{days:Day[];excluded:string[]};
export function validate(p:Settings):Settings;
export function run(days:Day[],settings:Partial<Settings>,detail?:boolean):Result;
export function optimize(days:Day[],settings:Settings,split:number):Optimization;
export function parseTransactions(s:string):{transactions:Transaction[];skipped:number};
export function summarize(ts:Transaction[]):Summary;
export function actualTargets(ts:Transaction[],days:Day[],interval:number,delta?:number,horizon?:number):ActualResult;
