import { run,optimize,type Day,type Settings,type Result,type Optimization } from "./pilot-engine.mjs";
export type Request = {kind:"run";days:Day[];settings:Settings}|{kind:"optimize";days:Day[];settings:Settings;split:number};
export type Reply = {kind:"run";result:Result}|{kind:"optimize";result:Optimization}|{kind:"error";message:string};
const worker=globalThis as unknown as {onmessage:((e:MessageEvent<Request>)=>void)|null;postMessage:(value:Reply)=>void};
worker.onmessage=({data})=>{try{if(data.kind==="run")worker.postMessage({kind:"run",result:run(data.days,data.settings)});else worker.postMessage({kind:"optimize",result:optimize(data.days,data.settings,data.split)});}catch(e){worker.postMessage({kind:"error",message:e instanceof Error?e.message:String(e)});}};
