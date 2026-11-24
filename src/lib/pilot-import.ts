import { parseBars, type MarketData } from "./pilot-engine.mjs";

export interface NamedMarket {name:string;data:MarketData}
const LIMIT=30*1024*1024;
function ensure(ok:unknown,message:string):asserts ok {if(!ok)throw new Error(message);}
async function expand(bytes:Uint8Array,method:number,expected:number):Promise<Uint8Array>{
  ensure(expected<=LIMIT,"ZIP obsahuje příliš velký soubor.");
  if(method===0){ensure(bytes.length===expected,"Neplatná délka ZIP položky.");return bytes;}
  ensure(method===8,"Podporované ZIP komprese: STORE a DEFLATE.");
  const stream=new Blob([bytes.slice().buffer as ArrayBuffer]).stream().pipeThrough(new DecompressionStream("deflate-raw" as CompressionFormat));
  const reader=stream.getReader(),chunks:Uint8Array[]=[];let size=0;
  try{while(true){const next=await reader.read();if(next.done)break;size+=next.value.byteLength;ensure(size<=expected&&size<=LIMIT,"Překročen limit rozbalených dat.");chunks.push(next.value);}}finally{await reader.cancel().catch(()=>undefined);reader.releaseLock();}
  ensure(size===expected,"Neplatná délka rozbalených dat.");const result=new Uint8Array(size);let off=0;
  for(const chunk of chunks){result.set(chunk,off);off+=chunk.length;}return result;
}
async function zipCsv(buffer:ArrayBuffer):Promise<{name:string;text:string}[]>{
  const bytes=new Uint8Array(buffer),d=new DataView(buffer);
  let e=-1;for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--){if(d.getUint32(i,true)===0x06054b50&&i+22+d.getUint16(i+20,true)===bytes.length){e=i;break;}}
  ensure(e>=0,"Neplatný nebo nepodporovaný ZIP.");
  ensure(d.getUint16(e+4,true)===0&&d.getUint16(e+6,true)===0,"Vícedílný ZIP není podporován.");
  const count=d.getUint16(e+10,true),dirSize=d.getUint32(e+12,true),dir=d.getUint32(e+16,true);
  ensure(count>0&&count<=100&&dir+dirSize<=e,"Neplatný adresář ZIP (ZIP64 není podporován).");
  let off=dir,total=0;const result:{name:string;text:string}[]=[];const decoder=new TextDecoder("utf-8",{fatal:true});
  for(let i=0;i<count;i++){ensure(off+46<=dir+dirSize&&d.getUint32(off,true)===0x02014b50,"Neplatná centrální hlavička ZIP.");
    const flags=d.getUint16(off+8,true),method=d.getUint16(off+10,true),compressed=d.getUint32(off+20,true),plain=d.getUint32(off+24,true),nl=d.getUint16(off+28,true),xl=d.getUint16(off+30,true),cl=d.getUint16(off+32,true),local=d.getUint32(off+42,true);
    ensure(off+46+nl+xl+cl<=dir+dirSize,"Poškozený adresář ZIP.");
    const name=decoder.decode(bytes.subarray(off+46,off+46+nl));off+=46+nl+xl+cl;
    if(!/\.csv$/i.test(name))continue;
    ensure(!(flags&1),"Šifrované ZIPy nejsou podporovány.");total+=plain;ensure(total<=LIMIT,"Součet rozbalených CSV překročil 30 MB.");
    ensure(local+30<=dir&&d.getUint32(local,true)===0x04034b50,"Chybí lokální hlavička ZIP.");
    const start=local+30+d.getUint16(local+26,true)+d.getUint16(local+28,true);ensure(start+compressed<=dir,"Poškozená ZIP položka.");
    const raw=await expand(bytes.slice(start,start+compressed),method,plain);
    result.push({name,text:decoder.decode(raw)});
  }
  ensure(result.length>0,"ZIP neobsahuje žádné CSV soubory.");return result;
}
export async function loadMarketFile(file:File):Promise<NamedMarket[]>{
  ensure(file.size>0&&file.size<=LIMIT,"Vyber soubor do 30 MB.");
  const raw=/\.zip$/i.test(file.name)?await zipCsv(await file.arrayBuffer()):[{name:file.name,text:await file.text()}];
  const out:NamedMarket[]=[];const errors:string[]=[];
  for(const item of raw){try{out.push({name:item.name,data:parseBars(item.text)});}catch(e){errors.push(item.name+": "+(e instanceof Error?e.message:String(e)));}}
  if(!out.length)throw new Error(errors.join("; "));
  if(errors.length)throw new Error("Některé cenové soubory nebylo možné načíst: "+errors.join("; "));
  return out.sort((a,b)=>b.data.bars.length-a.data.bars.length);
}
export function downloadCsv(name:string,rows:(string|number|null)[][]){
  const csv=rows.map(row=>row.map(v=>'"'+String(v??"").replace(/"/g,'""')+'"').join(",")).join("\r\n");
  const href=URL.createObjectURL(new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8"}));const a=document.createElement("a");a.href=href;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(href),1000);
}
