const DB_NAME='manhwa-card-album'; // Reads v1 data; missing ownerId is treated as guest.
const VERSION=3;
let db;
export const uid=()=>{
 if(globalThis.crypto?.randomUUID)return globalThis.crypto.randomUUID();
 if(globalThis.crypto?.getRandomValues){
  const b=new Uint8Array(16);globalThis.crypto.getRandomValues(b);
  b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;
  const s=Array.from(b,x=>x.toString(16).padStart(2,'0')).join('');
  return `${s.slice(0,8)}-${s.slice(8,12)}-${s.slice(12,16)}-${s.slice(16,20)}-${s.slice(20)}`;
 }
 throw Error('目前網址不支援安全隨機識別碼，請確認使用 http://localhost:8080 或 HTTPS 網址');
};
const integer=(v,fallback)=>v===''||v===null||v===undefined?fallback:Math.trunc(Number(v));
export function cleanWork(w){return {id:w.id||uid(),ownerId:w.ownerId||'guest',name:String(w.name||'未命名作品'),cover:w.cover||null,createdAt:Number(w.createdAt||Date.now()),updatedAt:Number(w.updatedAt||w.createdAt||Date.now()),deletedAt:w.deletedAt||null}}
export function cleanCard(c){let quantity=Math.max(1,integer(c.quantity,1)||1);return {id:c.id||uid(),ownerId:c.ownerId||'guest',workId:c.workId||'',name:String(c.name||''),character:String(c.character||''),series:String(c.series||''),quantity,tradeQuantity:Math.max(0,Math.min(quantity,integer(c.tradeQuantity,0)||0)),location:String(c.location||''),pageNumber:c.pageNumber===null||c.pageNumber===undefined?null:Math.max(1,integer(c.pageNumber,1)||1),slotNumber:c.slotNumber===null||c.slotNumber===undefined?null:Math.max(1,Math.min(9,integer(c.slotNumber,1)||1)),front:c.front||null,back:c.back||null,createdAt:Number(c.createdAt||c.created||Date.now()),updatedAt:Number(c.updatedAt||c.createdAt||c.created||Date.now()),deletedAt:c.deletedAt||null}}
export async function openDatabase(){db=await new Promise((resolve,reject)=>{const r=indexedDB.open(DB_NAME,VERSION);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains('works'))r.result.createObjectStore('works',{keyPath:'id'});if(!r.result.objectStoreNames.contains('cards'))r.result.createObjectStore('cards',{keyPath:'id'})};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.onblocked=()=>reject(new Error('資料庫被其他 Cardfolio 分頁占用，請先關閉其他分頁後重新整理'))});return db}
function transact(store,mode,callback){return new Promise((resolve,reject)=>{const tx=db.transaction(store,mode),r=callback(tx.objectStore(store));tx.oncomplete=()=>resolve(r?.result);tx.onerror=()=>reject(tx.error||new Error('IndexedDB failed'));tx.onabort=()=>reject(tx.error||new Error('IndexedDB aborted'))})}
const fetchAll=(store)=>transact(store,'readonly',s=>s.getAll());
export const readWorks=async(owner='guest')=>((await fetchAll('works'))||[]).map(cleanWork).filter(x=>x.ownerId===owner);
export const readCards=async(owner='guest')=>((await fetchAll('cards'))||[]).map(cleanCard).filter(x=>x.ownerId===owner);
export async function writeWork(w,{preserveTime=false}={}){const val=cleanWork(w);if(!preserveTime)val.updatedAt=Date.now();await transact('works','readwrite',s=>s.put(val));return val}
export async function writeCard(c,{preserveTime=false}={}){const val=cleanCard(c);if(!preserveTime)val.updatedAt=Date.now();await transact('cards','readwrite',s=>s.put(val));return val}
export async function removeCard(c){return writeCard({...c,deletedAt:Date.now()})}
export async function removeWork(w){return writeWork({...w,deletedAt:Date.now()})}
export async function restoreBackup(json,owner='guest'){if(!json||!Array.isArray(json.cards)||!Array.isArray(json.works))throw new Error('這不是支援的收藏備份 JSON');for(const w of json.works)await writeWork({...w,ownerId:owner,updatedAt:Date.now()},{preserveTime:true});for(const c of json.cards)await writeCard({...c,ownerId:owner,updatedAt:Date.now()},{preserveTime:true});return {works:json.works.length,cards:json.cards.length}}
export async function claimGuest(owner){if(!owner||owner==='guest')throw Error('帳號不正確');const works=active(await readWorks('guest')),cards=active(await readCards('guest'));const idMap=new Map();for(const w of works){const newId=uid();idMap.set(w.id,newId);await writeWork({...w,id:newId,ownerId:owner,updatedAt:Date.now()})}for(const c of cards){await writeCard({...c,id:uid(),ownerId:owner,workId:idMap.get(c.workId)||c.workId,updatedAt:Date.now()})}return {works:works.length,cards:cards.length}}
export const active=arr=>arr.filter(x=>!x.deletedAt);
